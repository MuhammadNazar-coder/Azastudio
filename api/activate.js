// POST /api/activate
// body: { id, storeName, reviewLink, waNumber, pin }
// Membuat dokumen baru di Firestore (atau mengisi stok READY yang sudah
// digenerate lewat dasbor admin). Menolak jika ID sudah aktif.
const { db } = require("./_firebaseAdmin");
const { hashPin } = require("./_hash");
const { formatPhoneToIntl } = require("./_phone");
const { bumpCounters } = require("./_counters");

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
    const existingData = existing.exists ? existing.data() : null;
    const alreadyActive = existingData && (existingData.status === "ACTIVE" || (!existingData.status && existingData.pinHash));
    if (alreadyActive) {
      return res.status(409).json({ error: "Kartu ini sudah aktif" });
    }
    const wasReadyStock = existingData && existingData.status === "READY";

    const normalizedWa = formatPhoneToIntl(waNumber);
    const pinHash = hashPin(pin, cardId);
    const trimmedName = String(storeName).trim();

    await ref.set(
      {
        status: "ACTIVE",
        storeName: trimmedName,
        storeNameLower: trimmedName.toLowerCase(),
        reviewLink: String(reviewLink).trim(),
        waNumber: normalizedWa,
        pinHash,
        totalScans: existingData ? Number(existingData.totalScans || 0) : 0,
        lastScanned: existingData ? existingData.lastScanned || null : null,
        createdAt: existingData ? existingData.createdAt || new Date().toISOString() : new Date().toISOString(),
        activatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    // Kartu yang tadinya stok READY -> geser ke active. Kartu yang dibuat
    // spontan (tidak lewat dasbor) -> langsung tambah active saja.
    await bumpCounters(wasReadyStock ? { ready: -1, active: 1 } : { active: 1 });

    return res.status(200).json({
      success: true,
      storeName: trimmedName,
      reviewLink: String(reviewLink).trim(),
      waNumber: normalizedWa,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Gagal mengaktifkan kartu" });
  }
};
