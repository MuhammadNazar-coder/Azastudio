// POST { password } -> cek ke ADMIN_PASSWORD (Environment Variable Vercel).
// Kalau benar, set cookie sesi admin ter-signature.
const crypto = require("crypto");
const { createSessionCookie } = require("./_adminAuth");
const { checkRateLimit, resetRateLimit } = require("./_rateLimit");

const RATE_KEY = "admin_login";
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 menit

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { allowed, retryAfterMs } = await checkRateLimit(RATE_KEY, MAX_ATTEMPTS, WINDOW_MS);
    if (!allowed) {
      const minutes = Math.ceil(retryAfterMs / 60000);
      return res.status(429).json({ error: `Terlalu banyak percobaan. Coba lagi dalam ${minutes} menit.` });
    }

    const { password } = req.body || {};
    const correct = process.env.ADMIN_PASSWORD || "";
    const given = String(password || "");

    if (!correct) {
      return res.status(500).json({ error: "ADMIN_PASSWORD belum diatur di Environment Variables Vercel." });
    }

    const a = Buffer.from(given);
    const b = Buffer.from(correct);
    const valid = a.length === b.length && crypto.timingSafeEqual(a, b);

    if (!valid) {
      return res.status(401).json({ error: "Password salah." });
    }

    await resetRateLimit(RATE_KEY);
    res.setHeader("Set-Cookie", createSessionCookie());
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Gagal login." });
  }
};
