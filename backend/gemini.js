const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const API_KEY = process.env.GEMINI_API_KEY;
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const CATEGORIES = [
  "Pothole",
  "Streetlight",
  "Graffiti",
  "Flooding",
  "Fallen Tree",
  "Trash / Illegal Dumping",
  "Sidewalk Damage",
  "Traffic Hazard",
  "Water Leak",
  "Other",
];

const SEVERITIES = ["low", "medium", "high", "critical"];

const CATEGORY_EMOJI = {
  "Pothole": "🕳️",
  "Streetlight": "💡",
  "Graffiti": "🎨",
  "Flooding": "🌊",
  "Fallen Tree": "🌳",
  "Trash / Illegal Dumping": "🗑️",
  "Sidewalk Damage": "🚧",
  "Traffic Hazard": "🚦",
  "Water Leak": "💧",
  "Other": "❗",
};

const EMOJI_PICKER_OPTIONS = Object.values(CATEGORY_EMOJI);

function deriveRepairAdvice(severity, category, department) {
  const baseHours = {
    critical: 2,
    high: 8,
    medium: 16,
    low: 24,
  }[severity] || 16;

  const categoryBonus = {
    Flooding: 8,
    "Fallen Tree": 4,
    "Traffic Hazard": 2,
    Pothole: 2,
    "Streetlight": 2,
  }[category] || 0;

  const estimatedRepairHours = Math.max(2, baseHours + categoryBonus);
  const priorityTag = severity === "critical" ? "Immediate" : severity === "high" ? "High" : severity === "medium" ? "Medium" : "Low";
  const aiConfidence = severity === "critical" || category === "Flooding" || category === "Traffic Hazard" ? "High" : "Medium";

  return {
    estimatedRepairHours,
    priorityTag,
    aiConfidence,
    repairEstimate: `${estimatedRepairHours} hrs`,
  };
}

function buildPrompt(title, description) {
  return `You are the AI triage assistant for "Community Hero", a civic hazard-reporting app.
A resident just submitted a report. First decide if it is a genuine description of a real-world
civic issue (a pothole, broken light, hazard, etc.) — reject keyboard mashing, gibberish,
test text, jokes, or anything with no real informational content.

Respond with ONLY a single raw JSON object (no markdown fences, no commentary) with exactly
these fields:

{
  "isValidIssue": boolean — false if the title/description is gibberish, spam, nonsense, or not a real civic issue,
  "correctedTitle": the title rewritten with correct spelling and grammar, otherwise unchanged (use the original if isValidIssue is false),
  "correctedDescription": the description rewritten with correct spelling and grammar, otherwise unchanged (use the original if isValidIssue is false),
  "category": one of ${JSON.stringify(CATEGORIES)} (use "Other" if isValidIssue is false),
  "severity": one of ${JSON.stringify(SEVERITIES)} (use "low" if isValidIssue is false),
  "department": the real-world city department best suited to handle this, e.g. "Public Works", "Parks & Recreation", "Water Utility", "Traffic Safety", "Sanitation",
  "summary": a single plain-language sentence (max 22 words) for a public dispatch log, written for residents not officials. If isValidIssue is false, explain briefly why it was rejected instead.
  "emoji": a single emoji that best represents this issue category,
  "isDuplicateRisk": boolean, true if this is a very common recurring issue type prone to duplicate reports nearby
}

Severity guide:
- "critical": immediate danger to life/safety (e.g. exposed wiring, major gas smell, deep flooding on a road, collapsed structure)
- "high": real safety risk if unaddressed soon (e.g. large pothole on a busy road, broken traffic light, large fallen tree blocking a lane)
- "medium": a real problem but not urgent (e.g. cracked sidewalk, dim streetlight, minor leak)
- "low": cosmetic or low-impact (e.g. graffiti, litter, faded paint)

Report title: "${title}"
Report description: "${description}"`;
}

// Crude offline gibberish check: real words have a reasonable mix of vowels/consonants.
// Used only when no Gemini key is configured yet.
function looksLikeGibberish(text) {
  const words = text.toLowerCase().match(/[a-z]{3,}/g) || [];
  if (words.length === 0) return true;

  let suspicious = 0;
  for (const w of words) {
    const vowels = (w.match(/[aeiou]/g) || []).length;
    const ratio = vowels / w.length;
    if (ratio < 0.2 || ratio > 0.85) suspicious++;
  }
  return suspicious / words.length > 0.4;
}

function fallbackHeuristic(title, description) {
  // Used only if no API key is configured yet, so the app still works end-to-end during setup.
  const text = `${title} ${description}`.toLowerCase();

  if (looksLikeGibberish(`${title} ${description}`)) {
    return {
      isValidIssue: false,
      correctedTitle: title,
      correctedDescription: description,
      category: "Other",
      severity: "low",
      department: "Public Works",
      summary: "This doesn't look like a real issue description (offline triage, no Gemini key configured).",
      emoji: CATEGORY_EMOJI.Other,
      isDuplicateRisk: false,
      offline: true,
      ...deriveRepairAdvice("low", "Other", "Public Works"),
    };
  }

  let category = "Other";
  let severity = "medium";

  if (/pothole|road surface|crack in the road/.test(text)) category = "Pothole";
  else if (/light|lamp|dark street/.test(text)) category = "Streetlight";
  else if (/graffiti|tag(ged)?\b/.test(text)) category = "Graffiti";
  else if (/flood|standing water/.test(text)) category = "Flooding";
  else if (/tree|branch/.test(text)) category = "Fallen Tree";
  else if (/trash|dump|litter/.test(text)) category = "Trash / Illegal Dumping";
  else if (/sidewalk|pavement/.test(text)) category = "Sidewalk Damage";
  else if (/traffic|signal|stop sign|intersection/.test(text)) category = "Traffic Hazard";
  else if (/leak|burst pipe|water main/.test(text)) category = "Water Leak";

  if (/danger|gas smell|wire|collapse|exposed|fire|live wire/.test(text)) severity = "critical";
  else if (/large|busy road|blocking|broken|major/.test(text)) severity = "high";
  else if (/small|minor|faded|cosmetic/.test(text)) severity = "low";

  return {
    isValidIssue: true,
    correctedTitle: title,
    correctedDescription: description,
    category,
    severity,
    department: "Public Works",
    summary: `${category} reported — needs review (offline triage, no Gemini key configured).`,
    emoji: CATEGORY_EMOJI[category] || CATEGORY_EMOJI.Other,
    isDuplicateRisk: false,
    offline: true,
    ...deriveRepairAdvice(severity, category, "Public Works"),
  };
}

async function triageReport(title, description) {
  if (!API_KEY) {
    return fallbackHeuristic(title, description);
  }

  const body = {
    contents: [{ parts: [{ text: buildPrompt(title, description) }] }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.2,
    },
  };

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": API_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error("Gemini returned no usable content");

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error("Gemini response was not valid JSON");
  }

  if (!SEVERITIES.includes(parsed.severity)) parsed.severity = "medium";
  if (!CATEGORIES.includes(parsed.category)) parsed.category = "Other";
  if (typeof parsed.isValidIssue !== "boolean") parsed.isValidIssue = true;
  if (!parsed.correctedTitle) parsed.correctedTitle = title;
  if (!parsed.correctedDescription) parsed.correctedDescription = description;
  if (!parsed.emoji) parsed.emoji = CATEGORY_EMOJI[parsed.category] || CATEGORY_EMOJI.Other;

  return {
    ...parsed,
    ...deriveRepairAdvice(parsed.severity, parsed.category, parsed.department),
  };
}

module.exports = { triageReport, CATEGORIES, SEVERITIES, CATEGORY_EMOJI, EMOJI_PICKER_OPTIONS, deriveRepairAdvice };
