// If already logged in, skip straight to the right app.
const existing = JSON.parse(localStorage.getItem("ch_auth") || "null");
if (existing?.userId) {
  window.location.href = existing.role === "admin" ? "mayor.html" : "index.html";
}

let role = "public"; // 'public' | 'admin'
let mode = "login"; // 'login' | 'register'

const tabPublic = document.getElementById("tabPublic");
const tabAdmin = document.getElementById("tabAdmin");
const tabExisting = document.getElementById("tabExisting");
const tabNew = document.getElementById("tabNew");
const adminCodeField = document.getElementById("adminCodeField");
const authSubmit = document.getElementById("authSubmit");
const authFootnote = document.getElementById("authFootnote");
const authError = document.getElementById("authError");
const form = document.getElementById("authForm");

function updateUI() {
  tabPublic.classList.toggle("active", role === "public");
  tabAdmin.classList.toggle("active", role === "admin");
  tabExisting.classList.toggle("active", mode === "login");
  tabNew.classList.toggle("active", mode === "register");

  adminCodeField.hidden = !(role === "admin" && mode === "register");

  authSubmit.textContent = mode === "login" ? "Log in" : "Create account";
  authFootnote.innerHTML =
    mode === "login"
      ? `New to Community Hero? Switch to <strong>New user</strong> above to create an account.`
      : role === "admin"
      ? `Registering a Mayor's Office account requires the office passcode.`
      : `Already have an account? Switch to <strong>Existing user</strong> above to log in.`;

  authError.hidden = true;
}

tabPublic.addEventListener("click", () => { role = "public"; updateUI(); });
tabAdmin.addEventListener("click", () => { role = "admin"; updateUI(); });
tabExisting.addEventListener("click", () => { mode = "login"; updateUI(); });
tabNew.addEventListener("click", () => { mode = "register"; updateUI(); });

updateUI();

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  authError.hidden = true;

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;
  const adminCode = document.getElementById("adminCode").value;

  authSubmit.disabled = true;
  authSubmit.textContent = mode === "login" ? "Logging in…" : "Creating account…";

  try {
    const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
    const body = mode === "login" ? { username, password } : { username, password, role, adminCode };

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || "Something went wrong");

    localStorage.setItem("ch_auth", JSON.stringify(data));
    window.location.href = data.role === "admin" ? "mayor.html" : "index.html";
  } catch (err) {
    authError.textContent = err.message;
    authError.hidden = false;
  } finally {
    authSubmit.disabled = false;
    updateUI();
  }
});
