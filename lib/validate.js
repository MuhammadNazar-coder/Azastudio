// Helper internal — validasi input yang dipakai bersama oleh activate.js
// dan update-card.js. Dipisah supaya aturannya konsisten di kedua tempat
// (sebelumnya reviewLink/storeName cuma divalidasi di satu file, bikin
// celah XSS bisa masuk lewat activate.js yang lolos validasi).
const CARD_ID_REGEX = /^[a-zA-Z0-9_-]{3,40}$/;
const MAX_STORE_NAME_LEN = 80;
const MAX_LINK_LEN = 300;

function isValidCardId(id) {
  return typeof id === "string" && CARD_ID_REGEX.test(id);
}

function isValidHttpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

module.exports = { isValidCardId, isValidHttpUrl, MAX_STORE_NAME_LEN, MAX_LINK_LEN };
