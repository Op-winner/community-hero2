const auth = JSON.parse(localStorage.getItem("ch_auth") || "null");
if (!auth?.userId || auth.role !== "admin") {
  window.location.href = "login.html";
}

document.getElementById("adminName").textContent = auth.username;
document.getElementById("logoutBtn").addEventListener("click", () => {
  localStorage.removeItem("ch_auth");
  window.location.href = "login.html";
});

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

function escapeHtml(str = "") {
  return str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const API_BASE_URL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
  ? ""
  : "https://YOUR_PROJECT_URL.vercel.app";

async function fetchReports() {
  const res = await fetch(`${API_BASE_URL}/api/reports`);
  return res.json();
}

async function fetchLeaderboard() {
  const res = await fetch(`${API_BASE_URL}/api/leaderboard`);
  return res.json();
}

async function fetchNotifications() {
  const res = await fetch(`${API_BASE_URL}/api/notifications`);
  return res.json();
}

async function fetchAnalytics() {
  const res = await fetch(`${API_BASE_URL}/api/analytics`);
  return res.json();
}

async function updateStatus(id, status) {
  const res = await fetch(`${API_BASE_URL}/api/reports/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: auth.userId, status }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to update status");
  }
  return res.json();
}

function renderStatCards(reports) {
  const open = reports.filter((r) => r.status === "open").length;
  const inProgress = reports.filter((r) => r.status === "in_progress").length;
  const resolved = reports.filter((r) => r.status === "resolved").length;
  const critical = reports.filter((r) => r.severity === "critical" && r.status !== "resolved").length;

  const cards = [
    { label: "OPEN", value: open, tone: "amber" },
    { label: "IN PROGRESS", value: inProgress, tone: "yellow" },
    { label: "RESOLVED", value: resolved, tone: "teal" },
    { label: "UNRESOLVED CRITICAL", value: critical, tone: "red" },
  ];

  document.getElementById("statCards").innerHTML = cards
    .map(
      (c) => `
      <div class="stat-card stat-card--${c.tone}">
        <span class="stat-card-value">${c.value}</span>
        <span class="stat-card-label">${c.label}</span>
      </div>`
    )
    .join("");
}

function renderTable(reports) {
  document.getElementById("reportTotal").textContent = `${reports.length} report${reports.length === 1 ? "" : "s"}`;

  const sorted = [...reports].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  const tbody = document.getElementById("reportTableBody");

  if (sorted.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state">No reports yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = sorted
    .map(
      (r) => `
      <tr>
        <td class="emoji-cell">${r.emoji || "❗"}</td>
        <td>${escapeHtml(r.title)}</td>
        <td>${escapeHtml(r.category)}</td>
        <td><span class="sev-tag ${r.severity}">${r.severity}</span></td>
        <td class="mono">${escapeHtml(r.department || "—")}</td>
        <td class="mono">${escapeHtml(r.priorityTag || "Medium")}</td>
        <td class="mono">${r.estimatedRepairHours ? `${r.estimatedRepairHours} hrs` : "TBD"}</td>
        <td class="mono">▲ ${r.upvotes}</td>
        <td>${escapeHtml(r.reporterName)}</td>
        <td>
          <select class="status-select" data-id="${r.id}">
            <option value="open" ${r.status === "open" ? "selected" : ""}>Open</option>
            <option value="in_progress" ${r.status === "in_progress" ? "selected" : ""}>In progress</option>
            <option value="resolved" ${r.status === "resolved" ? "selected" : ""}>Resolved</option>
          </select>
        </td>
      </tr>`
    )
    .join("");

  tbody.querySelectorAll(".status-select").forEach((select) => {
    select.addEventListener("change", async () => {
      select.disabled = true;
      try {
        await updateStatus(select.dataset.id, select.value);
        await refreshAll();
      } catch (err) {
        alert(err.message);
        select.disabled = false;
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

function renderNotifications(notifications) {
  const el = document.getElementById("notifications");
  if (!notifications.length) {
    el.innerHTML = `<p class="empty-state">No recent activity.</p>`;
    return;
  }

  el.innerHTML = notifications
    .map(
      (item) => `
      <div class="notification-item notification-item--${item.type || "info"}">
        <strong>${escapeHtml(item.message)}</strong>
        <span>${new Date(item.createdAt).toLocaleString()}</span>
      </div>`
    )
    .join("");
}

function renderAnalytics(analytics) {
  document.getElementById("analyticsSummary").innerHTML = `
    <div class="summary-pill">Critical: ${analytics.critical}</div>
    <div class="summary-pill">Open: ${analytics.open}</div>
    <div class="summary-pill">Resolved: ${analytics.resolved}</div>
    <div class="summary-pill">Departments: ${Object.keys(analytics.departments || {}).length}</div>
  `;
}

async function refreshAll() {
  const [reports, leaderboard, notifications, analytics] = await Promise.all([
    fetchReports(),
    fetchLeaderboard(),
    fetchNotifications(),
    fetchAnalytics(),
  ]);
  renderStatCards(reports);
  renderTable(reports);
  renderLeaderboard(leaderboard);
  renderNotifications(notifications);
  renderAnalytics(analytics);
}

refreshAll();
setInterval(refreshAll, 15000);
