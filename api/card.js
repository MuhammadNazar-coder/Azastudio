// GET /api/card?id=XXXX
// Mengembalikan data publik kartu (storeName, reviewLink, waNumber) TANPA pin.
// Kalau kartu belum ada, exists:false — frontend akan menampilkan form aktivasi.
const { db } = require("./_firebaseAdmin");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const id = (req.query.id || "").toString().trim();
  if (!id) {
    return res.status(400).json({ error: "ID kartu wajib diisi" });
  }

  try {
    const snap = await db.collection("cards").doc(id).get();
    if (!snap.exists) {
      return res.status(200).json({ exists: false });
    }
    const data = snap.data();
    return res.status(200).json({
      exists: true,
      storeName: data.storeName || "",
      reviewLink: data.reviewLink || "",
      waNumber: data.waNumber || "",
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Gagal mengambil data kartu" });
  }
};
