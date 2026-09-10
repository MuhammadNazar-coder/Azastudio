// Helper internal — rate limit ringan berbasis 1 dokumen Firestore per key.
// Dipakai supaya tidak ada yang bisa brute-force password admin atau PIN
// kartu dengan mencoba ribuan kali tanpa batas. Footprint storage kecil:
// hanya 1 dokumen kecil per key, otomatis "reset" sendiri setelah window
// waktunya lewat (tidak perlu cron job pembersih).
const { db } = require("./_firebaseAdmin");

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

  const snap = await ref.get();
  const data = snap.exists ? snap.data() : null;

  if (!data || now > data.windowResetAt) {
    // Window baru / belum pernah ada -> mulai hitung dari 1
    await ref.set({ count: 1, windowResetAt: now + windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (data.count >= maxAttempts) {
    return { allowed: false, retryAfterMs: data.windowResetAt - now };
  }

  await ref.update({ count: data.count + 1 });
  return { allowed: true, retryAfterMs: 0 };
}

// Panggil setelah percobaan BERHASIL (login benar / PIN benar) supaya
// counter langsung bersih, tidak menghukum percobaan sah berikutnya.
async function resetRateLimit(key) {
  await db.collection(COLLECTION).doc(key).delete().catch(() => {});
}

module.exports = { checkRateLimit, resetRateLimit };
