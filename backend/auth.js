const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const ADMIN_SIGNUP_CODE = process.env.ADMIN_SIGNUP_CODE || "MAYOR2026";

function findAccountByUsername(store, username) {
  return store.accounts[username.toLowerCase()] || null;
}

function findAccountByUserId(store, userId) {
  return Object.values(store.accounts).find((a) => a.userId === userId) || null;
}

function roleForUserId(store, userId) {
  const account = findAccountByUserId(store, userId);
  return account ? account.role : null;
}

async function register(store, { username, password, role, adminCode }) {
  if (!username || !password) throw httpError(400, "Username and password are required");
  if (password.length < 4) throw httpError(400, "Password must be at least 4 characters");

  const key = username.toLowerCase();
  if (store.accounts[key]) throw httpError(409, "That username is already taken — try logging in instead");

  const finalRole = role === "admin" ? "admin" : "public";
  if (finalRole === "admin" && adminCode !== ADMIN_SIGNUP_CODE) {
    throw httpError(403, "Incorrect admin passcode");
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const userId = crypto.randomUUID();

  store.accounts[key] = { username, passwordHash, role: finalRole, userId };
  if (!store.users[userId]) {
    store.users[userId] = { id: userId, name: username, totalPoints: 0, reportCount: 0, criticalCount: 0 };
  }

  return { userId, username, role: finalRole };
}

async function login(store, { username, password }) {
  if (!username || !password) throw httpError(400, "Username and password are required");

  const account = findAccountByUsername(store, username);
  if (!account) throw httpError(401, "No account found with that username — try registering as a new user");

  const ok = await bcrypt.compare(password, account.passwordHash);
  if (!ok) throw httpError(401, "Incorrect password");

  return { userId: account.userId, username: account.username, role: account.role };
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

module.exports = { register, login, roleForUserId, findAccountByUserId, httpError };
