// GET /api/card?id=XXXX
// Mengembalikan data publik kartu (storeName, reviewLink) TANPA pin dan
// TANPA nomor WhatsApp. Nomor WA sengaja TIDAK dikembalikan di sini,
// karena endpoint ini publik dan ID kartu berurutan (AKR0001, AKR0002,
// dst) — kalau waNumber ikut dikembalikan, siapa pun bisa "enumerasi" ID
// satu-satu dan mengumpulkan nomor WA semua pemilik toko. Nomor WA baru
// diambil lewat /api/card-contact, hanya saat pelanggan benar-benar
// mengirim keluhan (lihat file itu untuk rate limit-nya).
//
// Kalau kartu belum ada, exists:false — frontend akan menampilkan form
// aktivasi. Endpoint ini juga dibatasi per-IP supaya scan/enumerasi massal
// ID kartu tetap kena rate limit walau ID yang dicoba selalu berbeda.
const { db } = require("./_firebaseAdmin");
const { checkRateLimit } = require("./_rateLimit");
const { getClientIp } = require("./_requestIp");

const MAX_ATTEMPTS = 60;
const WINDOW_MS = 10 * 60 * 1000; // 10 menit

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const id = (req.query.id || "").toString().trim();
  if (!id) {
    return res.status(400).json({ error: "ID kartu wajib diisi" });
  }

  try {
    const ip = getClientIp(req);
    const { allowed } = await checkRateLimit(`card_ip_${ip}`, MAX_ATTEMPTS, WINDOW_MS);
    if (!allowed) {
      return res.status(429).json({ error: "Terlalu banyak permintaan. Coba lagi beberapa menit lagi." });
    }

    const snap = await db.collection("cards").doc(id).get();
    if (!snap.exists) {
      return res.status(200).json({ exists: false });
    }
    const data = snap.data();

    const isActive = data.status === "ACTIVE" || (!data.status && data.pinHash);
    if (!isActive) {
      return res.status(200).json({ exists: false });
    }

    return res.status(200).json({
      exists: true,
      storeName: data.storeName || "",
      reviewLink: data.reviewLink || "",
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Gagal mengambil data kartu" });
  }
};
