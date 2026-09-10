// POST /api/card-contact  { id }
// Mengembalikan { waNumber } SATU-SATUNYA lewat endpoint ini, dipanggil
// frontend hanya di detik terakhir sebelum mengirim keluhan (bukan saat
// halaman kartu pertama kali dibuka). Dibatasi per-IP supaya tetap tidak
// bisa dipakai untuk mengumpulkan nomor WA secara massal walau seseorang
// tahu pola ID kartunya.
const { db } = require("./_firebaseAdmin");
const { checkRateLimit } = require("./_rateLimit");
const { getClientIp } = require("./_requestIp");

const MAX_ATTEMPTS = 20;
const WINDOW_MS = 10 * 60 * 1000; // 10 menit

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const cardId = String((req.body || {}).id || "").trim();
    if (!cardId) {
      return res.status(400).json({ error: "ID kartu wajib diisi" });
    }

    const ip = getClientIp(req);
    const { allowed } = await checkRateLimit(`contact_ip_${ip}`, MAX_ATTEMPTS, WINDOW_MS);
    if (!allowed) {
      return res.status(429).json({ error: "Terlalu banyak permintaan. Coba lagi beberapa menit lagi." });
    }

    const snap = await db.collection("cards").doc(cardId).get();
    if (!snap.exists) {
      return res.status(404).json({ error: "Kartu tidak ditemukan" });
    }

    const data = snap.data();
    const isActive = data.status === "ACTIVE" || (!data.status && data.pinHash);
    if (!isActive) {
      return res.status(404).json({ error: "Kartu belum aktif" });
    }

    return res.status(200).json({ waNumber: data.waNumber || "" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Gagal mengambil data kontak" });
  }
};
