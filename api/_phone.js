// Helper internal — normalisasi nomor HP ke format internasional '62xxxx'.
// Dijalankan di server supaya jadi satu-satunya sumber kebenaran format nomor,
// tidak bergantung pada validasi di browser yang bisa saja dilewati.
function formatPhoneToIntl(raw) {
  let v = String(raw || "").trim().replace(/[\s\-().]/g, "");
  v = v.replace(/^\+/, "");
  if (v.startsWith("0")) {
    v = "62" + v.slice(1);
  } else if (v.startsWith("62")) {
    // sudah format internasional, biarkan
  } else {
    v = "62" + v;
  }
  return v.replace(/\D/g, "");
}

module.exports = { formatPhoneToIntl };
