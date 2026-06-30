const POINTS_BY_SEVERITY = {
  low: 5,
  medium: 12,
  high: 25,
  critical: 40,
};

const RANKS = [
  { name: "Rookie Reporter", minPoints: 0 },
  { name: "Block Watcher", minPoints: 50 },
  { name: "Hazard Hunter", minPoints: 150 },
  { name: "City Guardian", minPoints: 350 },
  { name: "Community Hero", minPoints: 700 },
];

function pointsForSeverity(severity) {
  return POINTS_BY_SEVERITY[severity] ?? POINTS_BY_SEVERITY.medium;
}

function rankForPoints(points) {
  let current = RANKS[0];
  for (const rank of RANKS) {
    if (points >= rank.minPoints) current = rank;
  }
  return current.name;
}

function badgesForUser(user) {
  const badges = [];
  if (user.reportCount >= 1) badges.push({ id: "first_report", label: "First Responder", icon: "🚨" });
  if (user.reportCount >= 5) badges.push({ id: "five_reports", label: "Hazard Hunter", icon: "🔍" });
  if (user.reportCount >= 15) badges.push({ id: "fifteen_reports", label: "City Guardian", icon: "🛡️" });
  if (user.criticalCount >= 1) badges.push({ id: "critical_eye", label: "Sharp Eye", icon: "⚡" });
  if (user.criticalCount >= 3) badges.push({ id: "critical_eye_3", label: "Crisis Spotter", icon: "🔥" });
  if (user.totalPoints >= 700) badges.push({ id: "legend", label: "Neighborhood Legend", icon: "🏆" });
  return badges;
}

module.exports = { pointsForSeverity, rankForPoints, badgesForUser, RANKS };
