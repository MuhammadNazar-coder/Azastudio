// POST /api/update-card
// body: { id, pin, storeName, reviewLink, waNumber }
// PIN diverifikasi ULANG di sini (bukan cuma percaya hasil /api/verify-pin),
// supaya tidak ada celah orang langsung panggil endpoint ini tanpa PIN benar.
const { db } = require("./_firebaseAdmin");
const { hashPin } = require("./_hash");
const { formatPhoneToIntl } = require("./_phone");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { id, pin, storeName, reviewLink, waNumber } = req.body || {};
    const cardId = (id || "").toString().trim();

    if (!cardId || !pin) {
      return res.status(400).json({ error: "Data tidak lengkap" });
    }

    const ref = db.collection("cards").doc(cardId);
    const snap = await ref.get();
    if (!snap.exists) {
      return res.status(404).json({ error: "Kartu tidak ditemukan" });
    }

    const data = snap.data();
    const candidateHash = hashPin(pin, cardId);
    if (candidateHash !== data.pinHash) {
      return res.status(403).json({ error: "PIN salah" });
    }

    const updates = {};
    if (storeName) {
      updates.storeName = String(storeName).trim();
      updates.storeNameLower = updates.storeName.toLowerCase();
    }
    if (reviewLink) updates.reviewLink = String(reviewLink).trim();
    if (waNumber) updates.waNumber = formatPhoneToIntl(waNumber);

    await ref.update(updates);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Gagal menyimpan perubahan" });
  }
};
