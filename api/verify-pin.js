// POST /api/verify-pin
// body: { id, pin }
// Hanya mengembalikan { valid: true/false } — PIN asli / hash-nya
// tidak pernah dikirim balik ke browser.
const { db } = require("./_firebaseAdmin");
const { hashPin } = require("./_hash");

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

    const snap = await db.collection("cards").doc(cardId).get();
    if (!snap.exists) {
      return res.status(200).json({ valid: false });
    }

    const data = snap.data();
    const candidateHash = hashPin(pin, cardId);
    return res.status(200).json({ valid: candidateHash === data.pinHash });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ valid: false });
  }
};
