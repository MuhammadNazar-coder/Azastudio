// GET -> jumlah stok siap, kartu aktif, total scan, dan data tren scan 7 hari
// terakhir (dari koleksi scanLogs) untuk grafik di dasbor admin.
// Angka ready/active/totalScans dibaca dari counter (meta/counters), BUKAN
// scan seluruh koleksi cards -> cepat & hemat read berapa pun jumlah kartu.
const { db } = require("./_firebaseAdmin");
const { requireAuth } = require("./_adminAuth");
const { getCounters } = require("./_counters");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!requireAuth(req, res)) return;

  try {
    const { ready, active, totalScans } = await getCounters();

    // Siapkan 7 ember tanggal (hari ini mundur 6 hari), lalu isi dari scanLogs.
    const buckets = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      buckets[d.toISOString().slice(0, 10)] = 0;
    }

    const earliestKey = Object.keys(buckets)[0];
    const logsSnap = await db
      .collection("scanLogs")
      .where("scannedAt", ">=", `${earliestKey}T00:00:00.000Z`)
      .get();

    logsSnap.forEach((doc) => {
      const scannedAt = doc.data().scannedAt || "";
      const key = scannedAt.slice(0, 10);
      if (key in buckets) buckets[key]++;
    });

    const chartLabels = Object.keys(buckets).map((k) =>
      new Date(`${k}T00:00:00`).toLocaleDateString("id-ID", { day: "2-digit", month: "short" })
    );
    const chartData = Object.values(buckets);

    return res.status(200).json({
      ready,
      active,
      total: ready + active,
      totalScans,
      chartLabels,
      chartData,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Gagal mengambil statistik." });
  }
};
