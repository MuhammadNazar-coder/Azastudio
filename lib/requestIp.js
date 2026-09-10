// Helper internal — ambil alamat IP klien dari header yang di-set jaringan
// edge Vercel. Dipakai untuk rate limit berbasis IP (bukan cuma per-ID),
// supaya percobaan enumerasi ID kartu berurutan (AKR0001, AKR0002, dst)
// tetap kena batas walau ID yang dicoba selalu berbeda-beda.
function getClientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (fwd) return String(fwd).split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

module.exports = { getClientIp };
