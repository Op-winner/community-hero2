const supabase = require("./supabaseClient");

function isNotFound(error) {
  return error && error.code === "PGRST116";
}

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

async function getAccountByUsername(username) {
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .eq("username", username.toLowerCase())
    .maybeSingle();
  if (error && !isNotFound(error)) throw error;
  return data;
}

async function getAccountByUserId(userId) {
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error && !isNotFound(error)) throw error;
  return data;
}

async function createAccount({ userId, username, passwordHash, role }) {
  const { data, error } = await supabase
    .from("accounts")
    .insert([{ user_id: userId, username: username.toLowerCase(), display_name: username, password_hash: passwordHash, role }])
    .single();
  if (error) throw error;
  return data;
}

async function getUserProfile(userId) {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error && !isNotFound(error)) throw error;
  return data;
}

async function createUserProfile({ userId, name }) {
  const { data, error } = await supabase
    .from("users")
    .insert([{ user_id: userId, name, total_points: 0, report_count: 0, critical_count: 0 }])
    .single();
  if (error) throw error;
  return data;
}

async function upsertUserProfile({ userId, name }) {
  const existing = await getUserProfile(userId);
  if (existing) return existing;
  return createUserProfile({ userId, name });
}

async function addUserPoints(userId, points, isCritical) {
  const profile = await getUserProfile(userId);
  if (!profile) throw new Error("User profile not found");

  const updates = {
    total_points: (profile.total_points || 0) + points,
    report_count: (profile.report_count || 0) + 1,
  };
  if (isCritical) {
    updates.critical_count = (profile.critical_count || 0) + 1;
  }

  const { data, error } = await supabase
    .from("users")
    .update(updates)
    .eq("user_id", userId)
    .single();
  if (error) throw error;
  return data;
}

async function listReports() {
  const { data, error } = await supabase
    .from("reports")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return camelizeRows(data);
}

async function getReportById(reportId) {
  const { data, error } = await supabase
    .from("reports")
    .select("*")
    .eq("id", reportId)
    .maybeSingle();
  if (error && !isNotFound(error)) throw error;
  return camelizeObject(data);
}

async function addReport(report) {
  const { data, error } = await supabase.from("reports").insert([report]).single();
  if (error) throw error;
  return camelizeObject(data);
}

async function updateReportStatus(reportId, status, timeline) {
  const { data, error } = await supabase
    .from("reports")
    .update({ status, timeline })
    .eq("id", reportId)
    .single();
  if (error) throw error;
  return camelizeObject(data);
}

async function addReportUpvote(reportId, userId) {
  const report = await getReportById(reportId);
  if (!report) throw new Error("Report not found");

  const upvotedBy = Array.isArray(report.upvotedBy) ? report.upvotedBy : [];
  if (upvotedBy.includes(userId)) {
    return report;
  }

  upvotedBy.push(userId);
  const { data, error } = await supabase
    .from("reports")
    .update({ upvotes: report.upvotes + 1, upvoted_by: upvotedBy })
    .eq("id", reportId)
    .single();
  if (error) throw error;
  return camelizeObject(data);
}

async function listNotifications() {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(12);
  if (error) throw error;
  return camelizeRows(data);
}

async function addNotification({ message, type = "info", reportId = null }) {
  const { data, error } = await supabase
    .from("notifications")
    .insert([{ message, type, report_id: reportId }])
    .single();
  if (error) throw error;
  return camelizeObject(data);
}

async function getAnalytics() {
  const reports = await listReports();
  const total = reports.length;
  const open = reports.filter((r) => r.status === "open").length;
  const progress = reports.filter((r) => r.status === "in_progress").length;
  const resolved = reports.filter((r) => r.status === "resolved").length;
  const critical = reports.filter((r) => r.severity === "critical").length;
  const departments = {};
  reports.forEach((r) => {
    departments[r.department] = (departments[r.department] || 0) + 1;
  });
  return { total, open, progress, resolved, critical, departments };
}

async function getLeaderboard() {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .order("total_points", { ascending: false })
    .limit(20);
  if (error) throw error;
  return camelizeRows(data);
}

module.exports = {
  getAccountByUsername,
  getAccountByUserId,
  createAccount,
  getUserProfile,
  upsertUserProfile,
  addUserPoints,
  listReports,
  getReportById,
  addReport,
  updateReportStatus,
  addReportUpvote,
  listNotifications,
  addNotification,
  getAnalytics,
  getLeaderboard,
};
