// GET ?q=&cursor= -> daftar kartu, dengan CURSOR-BASED pagination (bukan
// ambil semua dokumen lalu potong di memori). Query Firestore hanya
// mengambil PAGE_SIZE dokumen yang benar-benar dibutuhkan.
//
// Pencarian tanpa full-text search di Firestore: dilakukan lewat 2 range
// query terbatas (prefix ID kartu, dan prefix nama toko via field
// storeNameLower) lalu digabung. Kartu lama yang diaktivasi sebelum field
// storeNameLower ada tidak akan kena hasil pencarian nama (tetap muncul
// normal di listing biasa).
//
// CATATAN: query orderBy("createdAt").orderBy("__name__") di bawah bisa
// memicu Firestore minta dibuatkan composite index saat pertama kali
// dipanggil -- kalau muncul error berisi link "create it here", klik saja
// link tersebut sekali di Firebase Console.
const { db } = require("./_firebaseAdmin");
const { requireAuth } = require("./_adminAuth");

const PAGE_SIZE = 20;

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!requireAuth(req, res)) return;

  try {
    const search = String(req.query.q || "").trim();

    if (search) {
      const items = await runSearch(search);
      return res.status(200).json({ items, nextCursor: null });
    }

    let query = db.collection("cards").orderBy("createdAt", "desc").orderBy("__name__", "desc").limit(PAGE_SIZE);

    const cursorRaw = String(req.query.cursor || "").trim();
    if (cursorRaw) {
      const sepIdx = cursorRaw.lastIndexOf("|");
      if (sepIdx > -1) {
        const createdAt = cursorRaw.slice(0, sepIdx);
        const id = cursorRaw.slice(sepIdx + 1);
        query = query.startAfter(createdAt, id);
      }
    }

    const snap = await query.get();
    const items = snap.docs.map(toItem);
    const last = snap.docs[snap.docs.length - 1];
    const nextCursor = items.length === PAGE_SIZE && last ? `${last.get("createdAt")}|${last.id}` : null;

    return res.status(200).json({ items, nextCursor });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Gagal mengambil daftar kartu." });
  }
};

function toItem(doc) {
  const d = doc.data();
  const isActive = d.status === "ACTIVE" || (!d.status && d.pinHash);
  return {
    id: doc.id,
    status: isActive ? "ACTIVE" : "READY",
    storeName: d.storeName || "",
    reviewLink: d.reviewLink || "",
    totalScans: Number(d.totalScans || 0),
    lastScanned: d.lastScanned || null,
    createdAt: d.createdAt || "",
  };
}

async function runSearch(search) {
  const upperQ = search.toUpperCase();
  const lowerQ = search.toLowerCase();

  const [byId, byName] = await Promise.all([
    db.collection("cards").orderBy("__name__").startAt(upperQ).endAt(upperQ + "\uf8ff").limit(20).get(),
    db
      .collection("cards")
      .where("storeNameLower", ">=", lowerQ)
      .where("storeNameLower", "<=", lowerQ + "\uf8ff")
      .orderBy("storeNameLower")
      .limit(20)
      .get(),
  ]);

  const map = new Map();
  byId.docs.forEach((doc) => map.set(doc.id, toItem(doc)));
  byName.docs.forEach((doc) => map.set(doc.id, toItem(doc)));

  return Array.from(map.values()).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}
