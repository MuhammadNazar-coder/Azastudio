// /api/admin.js
// =============================================================================
// SATU function ini menggabungkan 7 endpoint admin (login, logout, stats,
// list, generate, delete, export) yang SEBELUMNYA masing-masing file
// terpisah. Digabung supaya jumlah total serverless function di project ini
// tidak melebihi batas 12 milik paket Vercel Hobby (gratis).
//
// Dipilih lewat query parameter ?action=..., logika di dalam masing-masing
// "case" PERSIS sama dengan file aslinya sebelum digabung — tidak ada
// perubahan perilaku, cuma cara Vercel menghitung jumlah function-nya.
//
//   GET  /api/admin?action=stats
//   GET  /api/admin?action=list&q=&cursor=
//   GET  /api/admin?action=export
//   POST /api/admin?action=login   { password }
//   POST /api/admin?action=logout
//   POST /api/admin?action=generate { qty, prefix }
//   POST /api/admin?action=delete   { id }
// =============================================================================
const crypto = require("crypto");
const { db } = require("./_firebaseAdmin");
const { requireAuth, createSessionCookie, clearSessionCookie } = require("./_adminAuth");
const { checkRateLimit, resetRateLimit } = require("./_rateLimit");
const { getCounters, allocateSequence, bumpCounters } = require("./_counters");

module.exports = async function handler(req, res) {
  const action = String(req.query.action || "").trim();

  switch (action) {
    case "login":
      return handleLogin(req, res);
    case "logout":
      return handleLogout(req, res);
    case "stats":
      return handleStats(req, res);
    case "list":
      return handleList(req, res);
    case "generate":
      return handleGenerate(req, res);
    case "delete":
      return handleDelete(req, res);
    case "export":
      return handleExport(req, res);
    default:
      return res.status(400).json({ error: "Parameter 'action' tidak dikenali." });
  }
};

// =============================================================================
// LOGIN
// =============================================================================
const LOGIN_RATE_KEY = "admin_login";
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 menit

async function handleLogin(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { allowed, retryAfterMs } = await checkRateLimit(LOGIN_RATE_KEY, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS);
    if (!allowed) {
      const minutes = Math.ceil(retryAfterMs / 60000);
      return res.status(429).json({ error: `Terlalu banyak percobaan. Coba lagi dalam ${minutes} menit.` });
    }

    const { password } = req.body || {};
    const correct = process.env.ADMIN_PASSWORD || "";
    const given = String(password || "");

    if (!correct) {
      return res.status(500).json({ error: "ADMIN_PASSWORD belum diatur di Environment Variables Vercel." });
    }

    const a = Buffer.from(given);
    const b = Buffer.from(correct);
    const valid = a.length === b.length && crypto.timingSafeEqual(a, b);

    if (!valid) {
      return res.status(401).json({ error: "Password salah." });
    }

    await resetRateLimit(LOGIN_RATE_KEY);
    res.setHeader("Set-Cookie", createSessionCookie());
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Gagal login." });
  }
}

// =============================================================================
// LOGOUT
// =============================================================================
async function handleLogout(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  res.setHeader("Set-Cookie", clearSessionCookie());
  return res.status(200).json({ success: true });
}

// =============================================================================
// STATS
// =============================================================================
async function handleStats(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!requireAuth(req, res)) return;

  try {
    const { ready, active, totalScans } = await getCounters();

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
}

// =============================================================================
// LIST (cursor pagination + search)
// =============================================================================
const PAGE_SIZE = 20;

async function handleList(req, res) {
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
}

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

// =============================================================================
// GENERATE
// =============================================================================
async function handleGenerate(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!requireAuth(req, res)) return;

  try {
    const { qty, prefix } = req.body || {};
    const count = Math.min(200, Math.max(1, parseInt(qty, 10) || 1));
    const pfx = String(prefix || "AKR").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) || "AKR";

    const startNum = await allocateSequence(pfx, count);

    const created = [];
    for (let i = 1; i <= count; i++) {
      created.push(`${pfx}${String(startNum + i).padStart(4, "0")}`);
    }

    const now = new Date().toISOString();
    const batch = db.batch();
    created.forEach((id) => {
      batch.set(db.collection("cards").doc(id), {
        status: "READY",
        storeName: "",
        storeNameLower: "",
        reviewLink: "",
        waNumber: "",
        pinHash: "",
        totalScans: 0,
        lastScanned: null,
        createdAt: now,
      });
    });
    await batch.commit();
    await bumpCounters({ ready: count });

    return res.status(200).json({ success: true, created });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Gagal membuat stok baru." });
  }
}

// =============================================================================
// DELETE
// =============================================================================
async function handleDelete(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!requireAuth(req, res)) return;

  try {
    const cardId = String((req.body || {}).id || "").trim();
    if (!cardId) {
      return res.status(400).json({ error: "ID kartu tidak valid." });
    }

    const ref = db.collection("cards").doc(cardId);
    const snap = await ref.get();
    if (!snap.exists) {
      return res.status(200).json({ success: true });
    }

    const d = snap.data();
    const isActive = d.status === "ACTIVE" || (!d.status && d.pinHash);

    await ref.delete();
    await bumpCounters(isActive ? { active: -1 } : { ready: -1 });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Gagal menghapus kartu." });
  }
}

// =============================================================================
// EXPORT (CSV)
// =============================================================================
function csvEscape(value) {
  const s = String(value ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function handleExport(req, res) {
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
}
