// POST /api/activate
// body: { id, storeName, reviewLink, waNumber, pin }
// Membuat dokumen baru di Firestore. Menolak jika ID sudah dipakai
// (mencegah orang lain menimpa kartu yang sudah aktif).
const { db } = require("./_firebaseAdmin");
const { hashPin } = require("./_hash");
const { formatPhoneToIntl } = require("./_phone");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { id, storeName, reviewLink, waNumber, pin } = req.body || {};
    const cardId = (id || "").toString().trim();

    if (!cardId) {
      return res.status(400).json({ error: "ID kartu tidak valid" });
    }
    if (!storeName || !reviewLink || !waNumber) {
      return res.status(400).json({ error: "Semua field wajib diisi" });
    }
    if (!/^\d{4}$/.test(String(pin || ""))) {
      return res.status(400).json({ error: "PIN harus terdiri dari 4 angka" });
    }

    const ref = db.collection("cards").doc(cardId);
    const existing = await ref.get();
    if (existing.exists) {
      return res.status(409).json({ error: "Kartu ini sudah aktif" });
    }

    const normalizedWa = formatPhoneToIntl(waNumber);
    const pinHash = hashPin(pin, cardId);

    await ref.set({
      storeName: String(storeName).trim(),
      reviewLink: String(reviewLink).trim(),
      waNumber: normalizedWa,
      pinHash,
      createdAt: new Date().toISOString(),
    });

    return res.status(200).json({
      success: true,
      storeName: String(storeName).trim(),
      reviewLink: String(reviewLink).trim(),
      waNumber: normalizedWa,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Gagal mengaktifkan kartu" });
  }
};
