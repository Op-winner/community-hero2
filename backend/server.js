const multer = require("multer");
const { getDistance } = require("geolib");
require("dotenv").config();
const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const { triageReport, EMOJI_PICKER_OPTIONS } = require("./gemini");
const { pointsForSeverity, rankForPoints, badgesForUser } = require("./gamification");
const authLib = require("./auth");

const app = express();
// app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "data", "store.json");
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
// --- tiny file-backed store (good enough for a hackathon MVP; swap for a real DB later) ---
function loadStore() {
  if (!fs.existsSync(DATA_FILE)) {
    return { reports: [], users: {}, accounts: {}, notifications: [] };
  }
  const store = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  if (!store.accounts) store.accounts = {};
  if (!store.notifications) store.notifications = [];
  return store;
}

function saveStore(store) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
}

function addNotification(store, message, type = "info", reportId = null) {
  const list = Array.isArray(store.notifications) ? store.notifications : [];
  list.unshift({
    id: crypto.randomUUID(),
    message,
    type,
    reportId,
    createdAt: new Date().toISOString(),
  });
  store.notifications = list.slice(0, 12);
}

function getOrCreateUser(store, userId, userName) {
  if (!store.users[userId]) {
    store.users[userId] = {
      id: userId,
      name: userName || "Anonymous Hero",
      totalPoints: 0,
      reportCount: 0,
      criticalCount: 0,
    };
  }
  return store.users[userId];
}

function handleAuthError(res, err) {
  const status = err.status || 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: err.message || "Something went wrong" });
}

// ---------- auth ----------

app.post("/api/auth/register", async (req, res) => {
  try {
    const store = loadStore();
    const result = await authLib.register(store, req.body);
    saveStore(store);
    res.status(201).json(result);
  } catch (err) {
    handleAuthError(res, err);
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const store = loadStore();
    const result = await authLib.login(store, req.body);
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

app.get("/api/reports", (req, res) => {
  const store = loadStore();
  res.json(store.reports);
});

app.get("/api/meta/emoji-options", (req, res) => {
  res.json(EMOJI_PICKER_OPTIONS);
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "community-hero" });
});

app.get("/api/notifications", (req, res) => {
  const store = loadStore();
  res.json(store.notifications || []);
});

app.post("/api/reports", async (req, res) => {
  try {
    const { title, description, lat, lng, userId, emoji } = req.body;

    if (!title || !description || lat == null || lng == null || !userId) {
      return res.status(400).json({ error: "title, description, lat, lng, and userId are required" });
    }

    const store = loadStore();
    const account = authLib.findAccountByUserId(store, userId);
    if (!account) return res.status(401).json({ error: "Please log in before submitting a report" });

    const triage = await triageReport(title, description);

    if (!triage.isValidIssue) {
      return res.status(422).json({
        error: triage.summary || "This doesn't look like a real issue report. Please describe an actual hazard.",
        rejected: true,
      });
    }

    const points = pointsForSeverity(triage.severity);
    const user = getOrCreateUser(store, userId, account.username);

    user.totalPoints += points;
    user.reportCount += 1;
    if (triage.severity === "critical") user.criticalCount += 1;

    const duplicate = store.reports.find(r => {

        const distance = getDistance(

            {
                latitude: Number(lat),
                longitude: Number(lng)
            },

            {
                latitude: Number(r.lat),
                longitude: Number(r.lng)
            }

        );

        return distance < 100 &&
              r.category === triage.category &&
              r.status !== "resolved";

    });

    if (duplicate){

        return res.status(409).json({

            duplicate: true,

            message: "Similar issue already exists.",

            report: duplicate

        });

    }
    const report = {
      id: crypto.randomUUID(),
      title: triage.correctedTitle || title,
      description: triage.correctedDescription || description,
      originalTitle: title,
      lat,
      lng,
      category: triage.category,
      severity: triage.severity,
      department: triage.department,
      aiSummary: triage.summary,
      priorityTag: triage.priorityTag,
      estimatedRepairHours: triage.estimatedRepairHours,
      aiConfidence: triage.aiConfidence,
      emoji: emoji || triage.emoji,
      isDuplicateRisk: !!triage.isDuplicateRisk,
      offlineTriage: !!triage.offline,
      status:"open",

      timeline:[

      {

      status:"Reported",

      time:new Date().toISOString()

      }

      ],
      upvotes: 0,
      upvotedBy: [],
      pointsAwarded: points,
      reporterId: userId,
      reporterName: account.username,
      createdAt: new Date().toISOString(),
      image: req.body.image || null,
    };

    store.reports.unshift(report);
    addNotification(store, `New ${triage.severity} report filed: ${triage.correctedTitle || title}`, "report", report.id);
    saveStore(store);

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

app.post("/api/reports/:id/upvote", (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: "userId is required" });

  const store = loadStore();
  const report = store.reports.find((r) => r.id === req.params.id);
  if (!report) return res.status(404).json({ error: "Report not found" });

  if (!report.upvotedBy) report.upvotedBy = [];
  if (report.upvotedBy.includes(userId)) {
    return res.status(409).json({ error: "You've already confirmed this report", report });
  }

  report.upvotedBy.push(userId);
  report.upvotes += 1;
  saveStore(store);
  res.json(report);
});

// Admin-only: move a report through its lifecycle
app.patch("/api/reports/:id/status", (req, res) => {
  const { userId, status } = req.body;
  if (!REPORT_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of ${REPORT_STATUSES.join(", ")}` });
  }

  const store = loadStore();
  if (authLib.roleForUserId(store, userId) !== "admin") {
    return res.status(403).json({ error: "Only the Mayor's Office can update report status" });
  }

  const report = store.reports.find((r) => r.id === req.params.id);
  if (!report) return res.status(404).json({ error: "Report not found" });

  report.status=status;
  addNotification(store, `Report "${report.title}" moved to ${status.replace("_", " ")}`, "status", report.id);

  if(!report.timeline){

  report.timeline=[];

  }

  report.timeline.push({

  status,

  time:new Date().toISOString()

  });
  saveStore(store);
  res.json(report);
});

app.get("/api/analytics", (req, res) => {

  const store = loadStore();

  const total = store.reports.length;
  const open = store.reports.filter(r => r.status === "open").length;
  const progress = store.reports.filter(r => r.status === "in_progress").length;
  const resolved = store.reports.filter(r => r.status === "resolved").length;
  const critical = store.reports.filter(r => r.severity === "critical").length;

  const departments = {};

  store.reports.forEach(r => {
    departments[r.department] = (departments[r.department] || 0) + 1;
  });

  res.json({
    total,
    open,
    progress,
    resolved,
    critical,
    departments
  });

});

// ---------- gamification ----------
// ---------- gamification ----------

app.get("/api/leaderboard", (req, res) => {
  const store = loadStore();
  const leaderboard = Object.values(store.users)
    .map((u) => ({ ...u, rank: rankForPoints(u.totalPoints), badges: badgesForUser(u) }))
    .sort((a, b) => b.totalPoints - a.totalPoints)
    .slice(0, 20);
  res.json(leaderboard);
});

app.get("/api/me/:userId", (req, res) => {
  const store = loadStore();
  const user = store.users[req.params.userId];
  if (!user) return res.json(null);
  res.json({ ...user, rank: rankForPoints(user.totalPoints), badges: badgesForUser(user) });
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
