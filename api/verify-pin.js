// POST /api/verify-pin
// body: { id, pin }
// Hanya mengembalikan { valid: true/false } — PIN asli / hash-nya
// tidak pernah dikirim balik ke browser. Percobaan dibatasi per kartu
// supaya PIN 4-angka (10.000 kombinasi) tidak bisa ditebak dengan mudah.
const { db } = require("../lib/firebaseAdmin");
const { hashPin } = require("../lib/hash");
const { checkRateLimit, resetRateLimit } = require("../lib/rateLimit");

const MAX_ATTEMPTS = 8;
const WINDOW_MS = 10 * 60 * 1000; // 10 menit

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { id, pin } = req.body || {};
    const cardId = (id || "").toString().trim();

    if (!cardId || !pin) {
      return res.status(200).json({ valid: false });
    }

    const rateKey = `pin_${cardId}`;
    const { allowed } = await checkRateLimit(rateKey, MAX_ATTEMPTS, WINDOW_MS);
    if (!allowed) {
      return res.status(429).json({ valid: false, error: "Terlalu banyak percobaan. Coba lagi beberapa menit lagi." });
    }

    const snap = await db.collection("cards").doc(cardId).get();
    if (!snap.exists) {
      return res.status(200).json({ valid: false });
    }

    const data = snap.data();
    const candidateHash = hashPin(pin, cardId);
    const valid = candidateHash === data.pinHash;
    if (valid) await resetRateLimit(rateKey);

    return res.status(200).json({ valid });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ valid: false });
  }
};
