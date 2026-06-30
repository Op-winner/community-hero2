const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const db = require("./db");

const ADMIN_SIGNUP_CODE = process.env.ADMIN_SIGNUP_CODE || "MAYOR2026";

async function findAccountByUsername(username) {
  return db.getAccountByUsername(username.toLowerCase());
}

async function findAccountByUserId(userId) {
  return db.getAccountByUserId(userId);
}

async function roleForUserId(userId) {
  const account = await findAccountByUserId(userId);
  return account ? account.role : null;
}

async function register({ username, password, role, adminCode }) {
  if (!username || !password) throw httpError(400, "Username and password are required");
  if (password.length < 4) throw httpError(400, "Password must be at least 4 characters");

  const normalizedUsername = username.toLowerCase();
  const existing = await db.getAccountByUsername(normalizedUsername);
  if (existing) throw httpError(409, "That username is already taken — try logging in instead");

  const finalRole = role === "admin" ? "admin" : "public";
  if (finalRole === "admin" && adminCode !== ADMIN_SIGNUP_CODE) {
    throw httpError(403, "Incorrect admin passcode");
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const userId = crypto.randomUUID();

  await db.createAccount({
    userId,
    username: normalizedUsername,
    displayName: username,
    passwordHash,
    role: finalRole,
  });
  await db.upsertUserProfile({ userId, name: username });

  return { userId, username, role: finalRole };
}

async function login({ username, password }) {
  if (!username || !password) throw httpError(400, "Username and password are required");

  const account = await db.getAccountByUsername(username);
  if (!account) throw httpError(401, "No account found with that username — try registering as a new user");

  const ok = await bcrypt.compare(password, account.password_hash);
  if (!ok) throw httpError(401, "Incorrect password");

  return {
    userId: account.user_id,
    username: account.display_name || account.username,
    role: account.role,
  };
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

module.exports = { register, login, roleForUserId, findAccountByUserId, httpError };
