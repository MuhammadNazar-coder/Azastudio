// POST /api/update-card
// body: { id, pin, storeName, reviewLink, waNumber }
// PIN diverifikasi ULANG di sini (bukan cuma percaya hasil /api/verify-pin),
// supaya tidak ada celah orang langsung panggil endpoint ini tanpa PIN benar.
// Dibatasi rate limit yang SAMA dengan verify-pin.js — endpoint ini juga
// mengecek PIN, jadi kalau tidak dibatasi di sini juga, batasan di
// verify-pin bisa dilewati begitu saja dengan menebak PIN lewat endpoint
// ini langsung.
const { db } = require("../lib/firebaseAdmin");
const { hashPin } = require("../lib/hash");
const { formatPhoneToIntl } = require("../lib/phone");
const { checkRateLimit, resetRateLimit } = require("../lib/rateLimit");
const { isValidCardId, isValidHttpUrl, MAX_STORE_NAME_LEN, MAX_LINK_LEN } = require("../lib/validate");

const MAX_ATTEMPTS = 8;
const WINDOW_MS = 10 * 60 * 1000; // 10 menit, sama dengan verify-pin.js

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { id, pin, storeName, reviewLink, waNumber } = req.body || {};
    const cardId = (id || "").toString().trim();

    if (!isValidCardId(cardId) || !pin) {
      return res.status(400).json({ error: "Data tidak lengkap" });
    }

    const rateKey = `pin_${cardId}`;
    const { allowed, retryAfterMs } = await checkRateLimit(rateKey, MAX_ATTEMPTS, WINDOW_MS);
    if (!allowed) {
      const minutes = Math.ceil(retryAfterMs / 60000);
      return res.status(429).json({ error: `Terlalu banyak percobaan. Coba lagi dalam ${minutes} menit.` });
    }

    const ref = db.collection("cards").doc(cardId);
    const snap = await ref.get();
    if (!snap.exists) {
      return res.status(404).json({ error: "Kartu tidak ditemukan" });
    }

    const data = snap.data();
    const candidateHash = hashPin(pin, cardId);
    if (candidateHash !== data.pinHash) {
      return res.status(403).json({ error: "PIN salah" });
    }
    await resetRateLimit(rateKey);

    const updates = {};
    if (storeName) {
      const trimmed = String(storeName).trim();
      if (trimmed.length > MAX_STORE_NAME_LEN) {
        return res.status(400).json({ error: `Nama toko maksimal ${MAX_STORE_NAME_LEN} karakter` });
      }
      updates.storeName = trimmed;
      updates.storeNameLower = trimmed.toLowerCase();
    }
    if (reviewLink) {
      const trimmed = String(reviewLink).trim();
      if (trimmed.length > MAX_LINK_LEN || !isValidHttpUrl(trimmed)) {
        return res.status(400).json({ error: "Link review tidak valid" });
      }
      updates.reviewLink = trimmed;
    }
    if (waNumber) {
      const normalized = formatPhoneToIntl(waNumber);
      if (normalized.length < 8 || normalized.length > 15) {
        return res.status(400).json({ error: "Nomor WA tidak valid" });
      }
      updates.waNumber = normalized;
    }

    await ref.update(updates);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Gagal menyimpan perubahan" });
  }
};
