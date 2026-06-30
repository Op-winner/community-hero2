const API_BASE_URL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
  ? ""
  : "https://YOUR_PROJECT_URL.vercel.app";

// ---------- auth gate ----------
const auth = JSON.parse(localStorage.getItem("ch_auth") || "null");
if (!auth?.userId) {
  window.location.href = "login.html";
}

const userId = auth.userId;
document.getElementById("myName").textContent = auth.username;
document.getElementById("logoutBtn").addEventListener("click", () => {
  localStorage.removeItem("ch_auth");
  window.location.href = "login.html";
});

// ---------- map setup ----------
const DEFAULT_CENTER = [12.9716, 77.5946]; // Bangalore
const map = L.map("map", { zoomControl: true }).setView(DEFAULT_CENTER, 12);

L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
  attribution: "&copy; OpenStreetMap &copy; CARTO",
  maxZoom: 19,
}).addTo(map);

const SEVERITY_COLOR = {
  critical: "#e63946",
  high: "#ff9f1c",
  medium: "#ffd23f",
  low: "#2ec4b6",
};

let pendingLatLng = null;
let selectedEmoji = null;
let selectedImageFile = null;
let currentSearchTerm = "";
let currentSeverityFilter = "";
const markers = {};
const imageInput = document.getElementById("reportImage");
const previewImage = document.getElementById("previewImage");

if (imageInput) {
  imageInput.addEventListener("change", () => {
    const file = imageInput.files[0];

    if (!file) {
      selectedImageFile = null;
      previewImage.src = "";
      previewImage.style.display = "none";
      return;
    }

    selectedImageFile = file;
    previewImage.src = URL.createObjectURL(file);
    previewImage.style.display = "block";
  });
}
map.on("click", (e) => {
  pendingLatLng = e.latlng;
  document.getElementById("reportCoords").textContent =
    `(${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)})`;
  document.getElementById("reportFormBlock").hidden = false;
  document.getElementById("title").focus();
});

document.getElementById("cancelReport").addEventListener("click", () => {
  document.getElementById("reportFormBlock").hidden = true;
  document.getElementById("reportForm").reset();
  pendingLatLng = null;
  selectedEmoji = null;
  renderEmojiPicker();
});

function severityMarker(report) {
  const imageHtml = report.image
    ? `<br/><img src="${report.image}" alt="Report evidence" class="popup-image" />`
    : "";

  return L.circleMarker([report.lat, report.lng], {
    radius: 9,
    color: SEVERITY_COLOR[report.severity] || "#999",
    fillColor: SEVERITY_COLOR[report.severity] || "#999",
    fillOpacity: 0.85,
    weight: 2,
  }).bindPopup(
    `<strong>${report.emoji || ""} ${escapeHtml(report.title)}</strong><br/>
     <span class="mono">${report.category} · ${report.severity.toUpperCase()}</span><br/>
     ${escapeHtml(report.aiSummary || "")}${imageHtml}`
  );
}

function escapeHtml(str = "") {
  return str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function toast(message) {
  const t = document.getElementById("toast");
  document.getElementById("toastText").innerText = message;
  t.style.display = "block";

  setTimeout(() => {
    t.style.display = "none";
  }, 2500);
}

function tryGeolocate() {
  if (!navigator.geolocation) return;

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      map.setView([pos.coords.latitude, pos.coords.longitude], 14);
      toast("Showing your current location");
    },
    () => {
      // Fall back silently to the default city view.
    },
    { enableHighAccuracy: true, timeout: 8000 }
  );
}
// ---------- emoji picker ----------
let emojiOptions = ["🕳️", "💡", "🎨", "🌊", "🌳", "🗑️", "🚧", "🚦", "💧", "❗"];

async function loadEmojiOptions() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/meta/emoji-options`);
    if (res.ok) emojiOptions = await res.json();
  } catch {
    // fall back to the hardcoded defaults above
  }
  renderEmojiPicker();
}

function renderEmojiPicker() {
  const el = document.getElementById("emojiPicker");
  el.innerHTML = emojiOptions
    .map(
      (e) =>
        `<button type="button" class="emoji-option ${e === selectedEmoji ? "selected" : ""}" data-emoji="${e}">${e}</button>`
    )
    .join("");
  el.querySelectorAll(".emoji-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedEmoji = selectedEmoji === btn.dataset.emoji ? null : btn.dataset.emoji;
      renderEmojiPicker();
    });
  });
}

// ---------- API calls ----------
async function fetchReports() {
  const res = await fetch(`${API_BASE_URL}/api/reports`);
  return res.json();
}

async function fetchLeaderboard() {
  const res = await fetch(`${API_BASE_URL}/api/leaderboard`);
  return res.json();
}

async function fetchMe() {
  const res = await fetch(`${API_BASE_URL}/api/me/${userId}`);
  return res.json();
}

async function uploadImage(file) {
  const formData = new FormData();
  formData.append("image", file);

  const res = await fetch(`${API_BASE_URL}/api/upload`, {
    method: "POST",
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "Image upload failed");
  }
  return data.imageUrl;
}

async function submitReport({ title, description, lat, lng, emoji, image }) {
  const res = await fetch(`${API_BASE_URL}/api/reports`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, description, lat, lng, userId, emoji, image }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || "Failed to submit report");
    err.rejected = !!data.rejected;
    err.duplicate = !!data.duplicate;
    err.report = data.report || null;
    throw err;
  }
  return data;
}

async function upvoteReport(id) {
  const res = await fetch(`${API_BASE_URL}/api/reports/${id}/upvote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || "Failed to confirm report");
    err.alreadyVoted = res.status === 409;
    throw err;
  }
  return data;
}

// ---------- rendering ----------
function renderTicket(report, rejected = false, message = "") {
  const block = document.getElementById("lastTriageBlock");
  const content = document.getElementById("ticketContent");
  block.hidden = false;

  if (rejected) {
    content.innerHTML = `TICKET REJECTED ⚠️

${escapeHtml(message)}

No points awarded. Try describing a real, specific issue.`;
    return;
  }

  content.innerHTML = `TICKET #${report.id.slice(0, 8)}  ${report.emoji || ""}
CATEGORY  ${report.category}
SEVERITY  <span class="sev-${report.severity}">${report.severity.toUpperCase()}</span>
PRIORITY  ${report.priorityTag || "Medium"}
ETA       ${report.estimatedRepairHours ? `${report.estimatedRepairHours} hrs` : "TBD"}
ROUTE TO  ${report.department}
POINTS    +${report.pointsAwarded}
${report.offlineTriage ? "\n(offline heuristic — add a GEMINI_API_KEY for real AI triage)" : ""}

${escapeHtml(report.aiSummary)}`;
}

function getFilteredReports(reports) {
  const term = currentSearchTerm.trim().toLowerCase();
  const severity = currentSeverityFilter;

  return reports.filter((r) => {
    const text = `${r.title} ${r.category} ${r.department} ${r.reporterName} ${r.aiSummary || ""}`.toLowerCase();
    const matchesSearch = !term || text.includes(term);
    const matchesSeverity = !severity || r.severity === severity;
    return matchesSearch && matchesSeverity;
  });
}

function renderLog(reports) {
  const list = document.getElementById("logList");
  const filteredReports = getFilteredReports(reports);
  document.getElementById("reportCount").textContent = `${filteredReports.length} report${filteredReports.length === 1 ? "" : "s"}`;

  if (filteredReports.length === 0) {
    list.innerHTML = `<p class="empty-state">No reports match your current filters.</p>`;
    return;
  }

  list.innerHTML = "";
  for (const r of filteredReports) {
    const alreadyVoted = (r.upvotedBy || []).includes(userId);
    const timelineEntries = Array.isArray(r.timeline) ? r.timeline : [];
    const el = document.createElement("div");
    el.className = "log-item";
    el.innerHTML = `
      <span class="sev-tag ${r.severity}">${r.emoji || ""} ${r.severity}</span>
      <div class="log-item-body">
        <p class="log-item-title">${escapeHtml(r.title)}</p>
        <p class="log-item-meta">${r.category} · ${escapeHtml(r.reporterName)} · ${new Date(r.createdAt).toLocaleTimeString()} · <span class="status-pill status-${r.status}">${r.status.replace("_", " ")}</span></p>
        <p class="log-item-summary">${escapeHtml(r.aiSummary || "")}</p>
        <p class="log-item-meta">Priority: ${escapeHtml(r.priorityTag || "Medium")} · ETA: ${r.estimatedRepairHours ? `${r.estimatedRepairHours} hrs` : "TBD"}</p>
        ${r.image ? `<img src="${r.image}" alt="Report evidence" class="report-image-thumb" />` : ""}
        ${timelineEntries.length ? `
          <details class="timeline-box">
            <summary>View timeline (${timelineEntries.length})</summary>
            <ul class="timeline-list">
              ${timelineEntries.map((entry) => `<li><span>${escapeHtml(entry.status)}</span><small>${new Date(entry.time).toLocaleString()}</small></li>`).join("")}
            </ul>
          </details>` : ""}
        <button class="upvote-btn" data-id="${r.id}" ${alreadyVoted ? "disabled" : ""}>
          ${alreadyVoted ? "✓ Confirmed" : "▲"} ${r.upvotes} confirm${r.upvotes === 1 ? "" : "s"}
        </button>
      </div>`;
    list.appendChild(el);
  }

  list.querySelectorAll(".upvote-btn:not(:disabled)").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        await upvoteReport(btn.dataset.id);
        await refreshAll();
      } catch (err) {
        alert(err.message);
        if (!err.alreadyVoted) btn.disabled = false;
        else await refreshAll();
      }
    });
  });
}

function renderLeaderboard(users) {
  const el = document.getElementById("leaderboard");
  if (users.length === 0) {
    el.innerHTML = `<p class="empty-state">Leaderboard fills in as reports come in.</p>`;
    return;
  }
  el.innerHTML = users
    .map(
      (u, i) => `
      <div class="leaderboard-row">
        <span class="leaderboard-rank">${i + 1}</span>
        <span class="leaderboard-name">${escapeHtml(u.name)} <span class="mono">${u.rank}</span></span>
        <span class="leaderboard-points">${u.totalPoints} pts</span>
      </div>`
    )
    .join("");
}

function renderMyStats(me) {
  document.getElementById("myRank").textContent = me?.rank || "Rookie Reporter";
  document.getElementById("myPoints").textContent = me?.totalPoints || 0;
}

function renderMarkers(reports) {
  for (const id in markers) {
    map.removeLayer(markers[id]);
    delete markers[id];
  }
  for (const r of reports) {
    const m = severityMarker(r).addTo(map);
    markers[r.id] = m;
  }
}

async function refreshAll() {
  const [reports, leaderboard, me] = await Promise.all([fetchReports(), fetchLeaderboard(), fetchMe()]);
  renderLog(reports);
  renderLeaderboard(leaderboard);
  renderMyStats(me);
  renderMarkers(reports);
}

// ---------- form submit ----------
document.getElementById("reportForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!pendingLatLng) return;

  const title = document.getElementById("title").value.trim();
  const description = document.getElementById("description").value.trim();

  const submitBtn = document.getElementById("submitReport");
  submitBtn.disabled = true;
  submitBtn.textContent = "Triaging with AI…";

  try {
    let imageUrl = null;
    if (selectedImageFile) {
      imageUrl = await uploadImage(selectedImageFile);
    }

    const { report } = await submitReport({
      title,
      description,
      lat: pendingLatLng.lat,
      lng: pendingLatLng.lng,
      emoji: selectedEmoji,
      image: imageUrl,
    });
    renderTicket(report);
    document.getElementById("reportForm").reset();
    document.getElementById("reportFormBlock").hidden = true;
    pendingLatLng = null;
    selectedEmoji = null;
    selectedImageFile = null;
    previewImage.src = "";
    previewImage.style.display = "none";
    renderEmojiPicker();
    await refreshAll();
  } catch (err) {
    if (err.rejected) {
      renderTicket(null, true, err.message);
    } else if (err.duplicate && err.report) {
      toast(err.message || "A similar report already exists.");
      map.setView([err.report.lat, err.report.lng], 15);
      await refreshAll();
    } else {
      alert(err.message);
    }
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Submit for triage";
  }
});

// ---------- boot ----------
document.getElementById("searchBox").addEventListener("input", (e) => {
  currentSearchTerm = e.target.value;
  refreshAll();
});

document.getElementById("severityFilter").addEventListener("change", (e) => {
  currentSeverityFilter = e.target.value;
  refreshAll();
});

loadEmojiOptions();
refreshAll();
tryGeolocate();
