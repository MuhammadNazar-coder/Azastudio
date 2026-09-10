// Helper internal — sesi login admin dasbor (BUKAN PIN pemilik kartu).
// Memakai cookie ter-signature (HMAC), tanpa perlu tabel session di Firestore.
// ADMIN_SESSION_SECRET diambil dari Environment Variable di Vercel.
const crypto = require("crypto");

const COOKIE_NAME = "aza_admin_session";
const SESSION_MS = 7 * 24 * 60 * 60 * 1000; // 7 hari

function getSecret() {
  return process.env.ADMIN_SESSION_SECRET || "ganti-secret-ini-di-env-vercel";
}

function sign(expiresAt) {
  return crypto.createHmac("sha256", getSecret()).update(String(expiresAt)).digest("hex");
}

function createSessionCookie() {
  const expiresAt = Date.now() + SESSION_MS;
  const value = `${expiresAt}.${sign(expiresAt)}`;
  // Secure selalu aktif: Vercel selalu menyajikan lewat HTTPS (termasuk
  // preview deployment), jadi tidak perlu bergantung pada NODE_ENV yang
  // kadang tidak diset sesuai harapan.
  return `${COOKIE_NAME}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_MS / 1000}`;
}

function clearSessionCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  header.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx === -1) return;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

function isAuthenticated(req) {
  const raw = parseCookies(req)[COOKIE_NAME];
  if (!raw) return false;

  const [expiresAtStr, sig] = raw.split(".");
  if (!expiresAtStr || !sig) return false;

  const expiresAt = Number(expiresAtStr);
  if (!expiresAt || Date.now() > expiresAt) return false;

  const expected = sign(expiresAt);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;

  return crypto.timingSafeEqual(a, b);
}

// Panggil di awal setiap endpoint admin. Kalau belum login, langsung
// kirim response 401 dan return false (endpoint tinggal `return;`).
function requireAuth(req, res) {
  if (!isAuthenticated(req)) {
    res.status(401).json({ error: "Sesi admin tidak valid. Silakan login kembali." });
    return false;
  }
  return true;
}

module.exports = { createSessionCookie, clearSessionCookie, isAuthenticated, requireAuth };
