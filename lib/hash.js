// Helper internal — mengubah PIN 4-angka menjadi hash, tidak bisa dibalik.
// cardId dipakai sebagai "salt" (supaya PIN sama di kartu berbeda hasil hash-nya
// beda), dan PIN_PEPPER (dari Environment Variable) menambah lapisan rahasia
// tambahan yang hanya diketahui server.
const crypto = require("crypto");

function hashPin(pin, cardId) {
  const pepper = process.env.PIN_PEPPER || "ganti-pepper-ini-di-env-vercel";
  return crypto.createHash("sha256").update(`${pin}:${cardId}:${pepper}`).digest("hex");
}

module.exports = { hashPin };
