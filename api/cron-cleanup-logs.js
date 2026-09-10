// Dipanggil OTOMATIS oleh Vercel Cron setiap hari (lihat "crons" di
// vercel.json) — bukan endpoint publik. Vercel mengirim header
// "Authorization: Bearer <CRON_SECRET>" secara otomatis saat memicu cron
// ini; endpoint menolak request apa pun yang tidak membawa header itu,
// jadi tidak bisa dipicu orang luar meski tahu URL-nya.
//
// Fungsinya: buang log scan (koleksi scanLogs) yang lebih tua dari 180
// hari. Ini HANYA log historis per-scan (dipakai grafik tren 7 hari) —
// counter ringkasan di meta/counters dan totalScans per kartu TIDAK ikut
// terhapus/berkurang, jadi statistik dasbor tetap akurat.
//
// SETUP: tambahkan Environment Variable CRON_SECRET di Vercel (string
// acak minimal 16 karakter). Vercel otomatis mengirim nilai itu sebagai
// header Authorization setiap cron ini dijalankan.
const { db } = require("./_firebaseAdmin");

const RETENTION_DAYS = 180;
const BATCH_SIZE = 400; // di bawah batas 500 write/batch Firestore
const MAX_BATCHES_PER_RUN = 10; // jaga-jaga supaya tidak timeout di Hobby plan (10 detik)

module.exports = async function handler(req, res) {
  const authHeader = req.headers["authorization"] || "";
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
    const cutoffIso = cutoff.toISOString();

    let deleted = 0;
    let hasMore = true;
    let iterations = 0;

    while (hasMore && iterations < MAX_BATCHES_PER_RUN) {
      const snap = await db.collection("scanLogs").where("scannedAt", "<", cutoffIso).limit(BATCH_SIZE).get();
      if (snap.empty) break;

      const batch = db.batch();
      snap.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();

      deleted += snap.size;
      iterations++;
      if (snap.size < BATCH_SIZE) hasMore = false;
    }

    return res.status(200).json({ success: true, deleted, reachedBatchLimit: hasMore });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Gagal membersihkan log lama." });
  }
};
