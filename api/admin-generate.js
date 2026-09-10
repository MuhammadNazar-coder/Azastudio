// POST { qty, prefix } -> buat N kartu stok baru (status READY, belum
// diaktivasi pemilik toko). Nomor urut dialokasikan lewat allocateSequence
// (O(1), tanpa scan seluruh koleksi cards).
const { db } = require("./_firebaseAdmin");
const { requireAuth } = require("./_adminAuth");
const { allocateSequence, bumpCounters } = require("./_counters");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!requireAuth(req, res)) return;

  try {
    const { qty, prefix } = req.body || {};
    const count = Math.min(200, Math.max(1, parseInt(qty, 10) || 1));
    const pfx = String(prefix || "AKR").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) || "AKR";

    const startNum = await allocateSequence(pfx, count);

    const created = [];
    for (let i = 1; i <= count; i++) {
      created.push(`${pfx}${String(startNum + i).padStart(4, "0")}`);
    }

    const now = new Date().toISOString();
    const batch = db.batch();
    created.forEach((id) => {
      batch.set(db.collection("cards").doc(id), {
        status: "READY",
        storeName: "",
        storeNameLower: "",
        reviewLink: "",
        waNumber: "",
        pinHash: "",
        totalScans: 0,
        lastScanned: null,
        createdAt: now,
      });
    });
    await batch.commit();
    await bumpCounters({ ready: count });

    return res.status(200).json({ success: true, created });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Gagal membuat stok baru." });
  }
};
