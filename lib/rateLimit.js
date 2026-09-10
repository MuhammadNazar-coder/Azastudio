// Helper internal — rate limit ringan berbasis 1 dokumen Firestore per key.
// Dipakai supaya tidak ada yang bisa brute-force password admin atau PIN
// kartu dengan mencoba ribuan kali tanpa batas. Footprint storage kecil:
// hanya 1 dokumen kecil per key, otomatis "reset" sendiri setelah window
// waktunya lewat (tidak perlu cron job pembersih).
const { db } = require("./firebaseAdmin");

const COLLECTION = "rateLimits";

/**
 * @param {string} key       identitas yang dibatasi, misal "admin_login" atau `pin_${cardId}`
 * @param {number} maxAttempts  batas percobaan dalam 1 window
 * @param {number} windowMs     panjang window dalam milidetik
 * @returns {Promise<{allowed: boolean, retryAfterMs: number}>}
 */
async function checkRateLimit(key, maxAttempts, windowMs) {
  const ref = db.collection(COLLECTION).doc(key);
  const now = Date.now();

  // Baca + cek + tulis dibungkus 1 transaksi Firestore, supaya atomik.
  // Sebelumnya ini "baca dulu baru tulis" biasa (bukan transaksi) — kalau
  // ada beberapa request datang bersamaan (mis. script brute-force yang
  // menembak banyak percobaan sekaligus, bukan satu-satu), semuanya bisa
  // "membaca" count yang sama sebelum ada yang sempat menyimpan hasil
  // tambah 1-nya, jadi sebagian percobaan tidak ikut terhitung dan batas
  // maxAttempts bisa ditembus. Transaksi membuat Firestore otomatis
  // mengurutkan/mengulang percobaan yang bentrok, jadi hitungannya selalu
  // akurat walau diserang paralel.
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : null;

    if (!data || now > data.windowResetAt) {
      // Window baru / belum pernah ada -> mulai hitung dari 1
      tx.set(ref, { count: 1, windowResetAt: now + windowMs });
      return { allowed: true, retryAfterMs: 0 };
    }

    if (data.count >= maxAttempts) {
      return { allowed: false, retryAfterMs: data.windowResetAt - now };
    }

    tx.update(ref, { count: data.count + 1 });
    return { allowed: true, retryAfterMs: 0 };
  });
}

// Panggil setelah percobaan BERHASIL (login benar / PIN benar) supaya
// counter langsung bersih, tidak menghukum percobaan sah berikutnya.
async function resetRateLimit(key) {
  await db.collection(COLLECTION).doc(key).delete().catch(() => {});
}

module.exports = { checkRateLimit, resetRateLimit };
