// GET -> unduh semua data kartu sebagai file CSV.
const { db } = require("./_firebaseAdmin");
const { requireAuth } = require("./_adminAuth");

function csvEscape(value) {
  const s = String(value ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!requireAuth(req, res)) return;

  try {
    const snap = await db.collection("cards").get();
    const rows = [
      ["ID Kartu", "Status", "Nama Toko", "Link Review", "No WhatsApp", "Total Scan", "Terakhir Discan", "Dibuat"],
    ];

    snap.forEach((doc) => {
      const d = doc.data();
      const isActive = d.status === "ACTIVE" || (!d.status && d.pinHash);
      rows.push([
        doc.id,
        isActive ? "ACTIVE" : "READY",
        d.storeName || "",
        d.reviewLink || "",
        d.waNumber || "",
        String(d.totalScans || 0),
        d.lastScanned || "",
        d.createdAt || "",
      ]);
    });

    const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=kartu-review-${new Date().toISOString().slice(0, 10)}.csv`
    );
    return res.status(200).send(csv);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Gagal export CSV." });
  }
};
