// POST { id } -> catat 1 scan untuk kartu aktif: naikkan totalScans,
// update lastScanned, dan tambah baris log ke koleksi scanLogs (dipakai
// untuk grafik tren di dasbor admin). Endpoint publik (dipanggil browser
// pelanggan), jadi selalu balas 200 walau gagal — jangan pernah mengganggu
// pengalaman pelanggan hanya karena tracking gagal.
const { db, admin } = require("../lib/firebaseAdmin");
const { bumpCounters } = require("../lib/counters");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const cardId = String((req.body || {}).id || "").trim();
    if (!cardId) return res.status(200).json({ success: false });

    const ref = db.collection("cards").doc(cardId);
    const snap = await ref.get();
    if (!snap.exists) return res.status(200).json({ success: false });

    const now = new Date().toISOString();
    await ref.update({
      totalScans: admin.firestore.FieldValue.increment(1),
      lastScanned: now,
    });
    await db.collection("scanLogs").add({ cardId, scannedAt: now });
    await bumpCounters({ totalScans: 1 });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(200).json({ success: false });
  }
};
