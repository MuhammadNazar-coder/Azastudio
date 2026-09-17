// POST /api/activate
// body: { id, storeName, reviewLink, waNumber, pin }
// Mengisi data toko ke kartu stok yang statusnya READY (sudah digenerate
// lewat dasbor admin). TIDAK membuat dokumen baru dari ID sembarangan —
// kalau ID belum pernah digenerate admin, ditolak 404. Ini sengaja,
// supaya orang tidak bisa "membuat produk sendiri" cuma dengan
// menebak/mengarang ID kartu.
//
// Semua input divalidasi ketat di sini (bukan cuma di browser), karena
// endpoint ini PUBLIK (siapa saja bisa panggil tanpa login) dan hasilnya
// (storeName, id, reviewLink) nanti ditampilkan di dasbor admin — kalau
// tidak dibatasi karakternya, bisa jadi celah XSS ke sesi admin.
const { db } = require("../lib/firebaseAdmin");
const { hashPin } = require("../lib/hash");
const { formatPhoneToIntl } = require("../lib/phone");
const { bumpCounters } = require("../lib/counters");
const { isValidCardId, isValidHttpUrl, MAX_STORE_NAME_LEN, MAX_LINK_LEN } = require("../lib/validate");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { id, storeName, reviewLink, waNumber, pin } = req.body || {};
    const cardId = (id || "").toString().trim();

    if (!isValidCardId(cardId)) {
      return res.status(400).json({
        error: "ID kartu tidak valid (3-40 karakter, hanya huruf/angka/dash/underscore)",
      });
    }
    if (!storeName || !reviewLink || !waNumber) {
      return res.status(400).json({ error: "Semua field wajib diisi" });
    }
    if (!/^\d{4}$/.test(String(pin || ""))) {
      return res.status(400).json({ error: "PIN harus terdiri dari 4 angka" });
    }

    const trimmedName = String(storeName).trim();
    const trimmedLink = String(reviewLink).trim();
    if (trimmedName.length > MAX_STORE_NAME_LEN) {
      return res.status(400).json({ error: `Nama toko maksimal ${MAX_STORE_NAME_LEN} karakter` });
    }
    if (trimmedLink.length > MAX_LINK_LEN || !isValidHttpUrl(trimmedLink)) {
      return res.status(400).json({ error: "Link review tidak valid (harus URL lengkap, contoh: https://...)" });
    }

    const normalizedWa = formatPhoneToIntl(waNumber);
    if (normalizedWa.length < 8 || normalizedWa.length > 15) {
      return res.status(400).json({ error: "Nomor WA tidak valid" });
    }

    const ref = db.collection("cards").doc(cardId);
    const existing = await ref.get();

    // ID harus sudah digenerate lebih dulu lewat dasbor admin (status
    // READY). Kalau dokumennya sama sekali tidak ada di Firestore, artinya
    // ID ini cuma tebakan/karangan bebas -> tolak. Ini yang menutup celah
    // "orang bisa bikin produk sendiri" cuma dengan menebak/mengarang ID.
    if (!existing.exists) {
      return res.status(404).json({
        error: "Kartu ini belum terdaftar. Aktivasi hanya bisa lewat kartu asli dari toko.",
      });
    }

    const existingData = existing.data();
    const alreadyActive = existingData.status === "ACTIVE" || (!existingData.status && existingData.pinHash);
    if (alreadyActive) {
      return res.status(409).json({ error: "Kartu ini sudah aktif" });
    }
    if (existingData.status && existingData.status !== "READY") {
      // Status lain (mis. ditandai nonaktif/diblokir admin) -> tolak juga.
      return res.status(403).json({ error: "Kartu ini tidak bisa diaktivasi." });
    }

    const pinHash = hashPin(pin, cardId);

    await ref.set(
      {
        status: "ACTIVE",
        storeName: trimmedName,
        storeNameLower: trimmedName.toLowerCase(),
        reviewLink: trimmedLink,
        waNumber: normalizedWa,
        pinHash,
        totalScans: Number(existingData.totalScans || 0),
        lastScanned: existingData.lastScanned || null,
        createdAt: existingData.createdAt || new Date().toISOString(),
        activatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    // Sekarang existingData sudah pasti ada (kita tolak di atas kalau
    // dokumennya tidak ditemukan), jadi ini selalu geser dari stok READY.
    await bumpCounters({ ready: -1, active: 1 });

    return res.status(200).json({
      success: true,
      storeName: trimmedName,
      reviewLink: trimmedLink,
      waNumber: normalizedWa,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Gagal mengaktifkan kartu" });
  }
};
