// POST { id } -> hapus kartu (stok maupun aktif) dari Firestore, dan
// sesuaikan counter agregat (ready/active) supaya statistik tetap akurat
// tanpa perlu hitung ulang seluruh koleksi.
const { db } = require("./_firebaseAdmin");
const { requireAuth } = require("./_adminAuth");
const { bumpCounters } = require("./_counters");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!requireAuth(req, res)) return;

  try {
    const cardId = String((req.body || {}).id || "").trim();
    if (!cardId) {
      return res.status(400).json({ error: "ID kartu tidak valid." });
    }

    const ref = db.collection("cards").doc(cardId);
    const snap = await ref.get();
    if (!snap.exists) {
      return res.status(200).json({ success: true });
    }

    const d = snap.data();
    const isActive = d.status === "ACTIVE" || (!d.status && d.pinHash);

    await ref.delete();
    await bumpCounters(isActive ? { active: -1 } : { ready: -1 });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Gagal menghapus kartu." });
  }
};
