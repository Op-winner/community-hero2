# Community Hero — Civic Dispatch 🛡️

A hazard-reporting web app for your Vibe2Ship entry: residents click a map to report a civic
issue, Gemini triages it (category, severity, which city department it routes to), and a
gamification layer hands out points, ranks, and badges to keep people reporting.

## Stack
- **Backend:** Node.js + Express, single process, serves both the API and the frontend
- **Frontend:** Plain HTML/CSS/JS + Leaflet.js for the map (no build step, no framework)
- **AI:** Google Gemini API for triage, with an offline heuristic fallback so the app still
  works before you've added a key

## Run it

```bash
cd backend
npm install
cp .env.example .env       # then paste in your Gemini key
npm start
```

Open **http://localhost:3000** — that's it, frontend and API are served from the same place.

> ⚠️ **Don't open `frontend/index.html` directly as a file.** The page calls `/api/reports`
> as a relative path, which only resolves correctly when the page is served by the Express
> server above. Opening the HTML file straight from disk (`file://...`) gives a
> `Failed to fetch` error on submit, since there's no server to talk to.

### Get a Gemini API key
Free key in under a minute: https://aistudio.google.com/apikey. Paste it into
`backend/.env` as `GEMINI_API_KEY`. Until you do, the app still runs end-to-end using a
simple keyword-based fallback (you'll see an "offline triage" note on the dispatch ticket),
so you can build/demo the rest of the app without blocking on the key.

## How it works

1. **Sign in first.** Open `/login.html` (you'll land here automatically if you're not logged
   in). Choose **Public** or **Mayor's Office**, then **New user** or **Existing user**.
   Registering a Mayor's Office account requires the passcode in `ADMIN_SIGNUP_CODE`
   (`.env`, defaults to `MAYOR2026` — change it before sharing the app with anyone).
2. As a citizen, click anywhere on the map → a report form opens at that location. Pick an
   emoji if you want (optional — AI suggests one based on category if you skip it).
3. On submit, the backend sends the title/description to Gemini and asks for **strict JSON**
   back: whether it's a real issue at all (gibberish/spam gets rejected with no points
   awarded), a spelling-corrected title/description, category, severity, the department to
   route to, and a one-line summary.
4. Severity drives points (low=5 → critical=40), which roll up into rank and badges — see
   `backend/gamification.js`.
5. Every valid report lands on the map (color-coded by severity, emoji in the popup) and the
   Dispatch Log. Each person can confirm ("upvote") a given report **once** — the button
   disables itself after you've used it.
6. Admins log into `/mayor.html` instead — a dashboard with open/in-progress/resolved counts,
   a sortable table of every report, and a dropdown to move each report through its
   lifecycle. Status changes are checked server-side against the account's role, not just
   hidden in the UI.

## Spam / gibberish filtering & spelling correction
With a Gemini key configured, the AI itself judges whether a submission is a genuine issue
(`isValidIssue`) and returns corrected spelling for both fields. Without a key, there's a
crude offline fallback (vowel-ratio heuristic) that catches obvious keyboard-mashing like
"fhbdsjhvb" but does **not** do spelling correction — that part is Gemini-only. Don't rely on
the offline heuristic for a real deployment; it's there so the rest of the app is testable
before you've added a key.

## Where to extend next
- `backend/server.js` currently persists to a flat JSON file (`backend/data/store.json`) —
  swap in SQLite/Postgres before a real deploy.
- Auth is intentionally minimal: username/password with bcrypt hashing, no sessions/JWTs —
  the logged-in `userId` is just trusted from the client on each request. Fine for a
  hackathon demo; add real session tokens before this touches real user data.
- Photo upload isn't wired up — would be a natural next step (Gemini can also triage from an
  image, not just text).
- `DEFAULT_CENTER` in `frontend/app.js` is set to Bangalore — change it to a different city,
  or wire up `navigator.geolocation` to center on the user automatically.
