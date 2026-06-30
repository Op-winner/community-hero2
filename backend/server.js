const multer = require("multer");
const { getDistance } = require("geolib");
require("dotenv").config();
const express = require("express");
const path = require("path");
const crypto = require("crypto");

const db = require("./db");
const { triageReport, EMOJI_PICKER_OPTIONS } = require("./gemini");
const { pointsForSeverity, rankForPoints, badgesForUser } = require("./gamification");
const authLib = require("./auth");

const app = express();
// app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const PORT = process.env.PORT || 3000;
const REPORT_STATUSES = ["open", "in_progress", "resolved"];

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "..", "frontend")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "uploads"));
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage });

function camelizeKey(key) {
  return key.replace(/_([a-z])/g, (_, value) => value.toUpperCase());
}

function camelizeObject(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return row;
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [camelizeKey(key), value])
  );
}

function camelizeRows(rows) {
  return Array.isArray(rows) ? rows.map(camelizeObject) : rows;
}

function handleAuthError(res, err) {
  const status = err.status || 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: err.message || "Something went wrong" });
}

// ---------- auth ----------

app.post("/api/auth/register", async (req, res) => {
  try {
    const result = await authLib.register(req.body);
    res.status(201).json(result);
  } catch (err) {
    handleAuthError(res, err);
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const result = await authLib.login(req.body);
    res.json(result);
  } catch (err) {
    handleAuthError(res, err);
  }
});
app.post("/api/upload", upload.single("image"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      error: "No image uploaded",
    });
  }

  res.json({
    imageUrl: `/uploads/${req.file.filename}`,
  });
});
// ---------- reports ----------

app.get("/api/reports", async (req, res) => {
  try {
    const reports = await db.listReports();
    res.json(reports);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Unable to load reports" });
  }
});

app.get("/api/meta/emoji-options", (req, res) => {
  res.json(EMOJI_PICKER_OPTIONS);
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "community-hero" });
});

app.get("/api/notifications", async (req, res) => {
  try {
    const notifications = await db.listNotifications();
    res.json(notifications);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Unable to load notifications" });
  }
});

app.post("/api/reports", async (req, res) => {
  try {
    const { title, description, lat, lng, userId, emoji } = req.body;

    if (!title || !description || lat == null || lng == null || !userId) {
      return res.status(400).json({ error: "title, description, lat, lng, and userId are required" });
    }

    const account = await authLib.findAccountByUserId(userId);
    if (!account) return res.status(401).json({ error: "Please log in before submitting a report" });

    const triage = await triageReport(title, description);

    if (!triage.isValidIssue) {
      return res.status(422).json({
        error: triage.summary || "This doesn't look like a real issue report. Please describe an actual hazard.",
        rejected: true,
      });
    }

    const points = pointsForSeverity(triage.severity);
    await db.upsertUserProfile({ userId, name: account.username });

    const reports = await db.listReports();
    const duplicate = reports.find((r) => {
      const distance = getDistance(
        {
          latitude: Number(lat),
          longitude: Number(lng),
        },
        {
          latitude: Number(r.lat),
          longitude: Number(r.lng),
        }
      );

      return distance < 100 && r.category === triage.category && r.status !== "resolved";
    });

    if (duplicate) {
      return res.status(409).json({
        duplicate: true,
        message: "Similar issue already exists.",
        report: duplicate,
      });
    }

    const reportData = {
      id: crypto.randomUUID(),
      title: triage.correctedTitle || title,
      description: triage.correctedDescription || description,
      original_title: title,
      lat,
      lng,
      category: triage.category,
      severity: triage.severity,
      department: triage.department,
      ai_summary: triage.summary,
      priority_tag: triage.priorityTag,
      estimated_repair_hours: triage.estimatedRepairHours,
      ai_confidence: triage.aiConfidence,
      emoji: emoji || triage.emoji,
      is_duplicate_risk: !!triage.isDuplicateRisk,
      offline_triage: !!triage.offline,
      status: "open",
      timeline: [
        {
          status: "Reported",
          time: new Date().toISOString(),
        },
      ],
      upvotes: 0,
      upvoted_by: [],
      points_awarded: points,
      reporter_id: userId,
      reporter_name: account.username,
      created_at: new Date().toISOString(),
      image: req.body.image || null,
    };

    const report = await db.addReport(reportData);
    await db.addUserPoints(userId, points, triage.severity === "critical");
    await db.addNotification({
      message: `New ${triage.severity} report filed: ${triage.correctedTitle || title}`,
      type: "report",
      reportId: report.id,
    });

    const rawUser = await db.getUserProfile(userId);
    const user = camelizeObject(rawUser);
    res.status(201).json({
      report,
      user: {
        ...user,
        rank: rankForPoints(user.totalPoints),
        badges: badgesForUser(user),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Triage failed" });
  }
});

app.post("/api/reports/:id/upvote", async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: "userId is required" });

  try {
    const report = await db.getReportById(req.params.id);
    if (!report) return res.status(404).json({ error: "Report not found" });

    const upvotedBy = Array.isArray(report.upvotedBy) ? report.upvotedBy : [];
    if (upvotedBy.includes(userId)) {
      return res.status(409).json({ error: "You've already confirmed this report", report });
    }

    const updated = await db.addReportUpvote(req.params.id, userId);
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Unable to upvote report" });
  }
});

// Admin-only: move a report through its lifecycle
app.patch("/api/reports/:id/status", async (req, res) => {
  const { userId, status } = req.body;
  if (!REPORT_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of ${REPORT_STATUSES.join(", ")}` });
  }

  try {
    if ((await authLib.roleForUserId(userId)) !== "admin") {
      return res.status(403).json({ error: "Only the Mayor's Office can update report status" });
    }

    const report = await db.getReportById(req.params.id);
    if (!report) return res.status(404).json({ error: "Report not found" });

    const timeline = Array.isArray(report.timeline) ? report.timeline.slice() : [];
    timeline.push({ status, time: new Date().toISOString() });

    const updated = await db.updateReportStatus(req.params.id, status, timeline);
    await db.addNotification({
      message: `Report \"${updated.title}\" moved to ${status.replace("_", " ")}`,
      type: "status",
      reportId: updated.id,
    });

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Unable to update report status" });
  }
});

app.get("/api/analytics", async (req, res) => {
  try {
    const analytics = await db.getAnalytics();
    res.json(analytics);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Unable to load analytics" });
  }
});

// ---------- gamification ----------
// ---------- gamification ----------

app.get("/api/leaderboard", async (req, res) => {
  try {
    const leaderboard = await db.getLeaderboard();
    res.json(
      leaderboard.map((rawUser) => {
        const user = camelizeObject(rawUser);
        return {
          ...user,
          rank: rankForPoints(user.totalPoints),
          badges: badgesForUser(user),
        };
      })
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Unable to load leaderboard" });
  }
});

app.get("/api/me/:userId", async (req, res) => {
  try {
    const rawUser = await db.getUserProfile(req.params.userId);
    if (!rawUser) return res.json(null);
    const user = camelizeObject(rawUser);
    res.json({
      ...user,
      rank: rankForPoints(user.totalPoints),
      badges: badgesForUser(user),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Unable to load user profile" });
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Community Hero backend running at http://localhost:${PORT}`);
    if (!process.env.GEMINI_API_KEY) {
      console.warn("⚠️  No GEMINI_API_KEY set — using offline heuristic triage. Add a key to .env for real AI triage.");
    }
  });
}

module.exports = app;
