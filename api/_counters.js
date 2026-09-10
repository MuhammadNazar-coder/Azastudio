// Helper internal — statistik agregat & nomor urut kode kartu, TANPA scan
// seluruh koleksi "cards" tiap kali (mahal & lambat kalau kartu sudah
// ribuan). Disimpan di 2 dokumen kecil:
//   meta/counters   -> { ready, active, totalScans }
//   meta/sequences  -> { [PREFIX]: nomor_urut_terakhir }
// Kedua dokumen ini "self-seeding": kalau belum ada, dihitung SEKALI dari
// data lama yang sudah ada (migrasi otomatis), setelah itu update-nya
// selalu O(1) lewat FieldValue.increment.
const { db, admin } = require("./_firebaseAdmin");

async function getCounters() {
  const ref = db.collection("meta").doc("counters");
  const snap = await ref.get();
  if (snap.exists) {
    const d = snap.data();
    return {
      ready: Number(d.ready || 0),
      active: Number(d.active || 0),
      totalScans: Number(d.totalScans || 0),
    };
  }

  // Migrasi sekali saja: hitung dari data yang sudah ada.
  const cardsSnap = await db.collection("cards").get();
  let ready = 0, active = 0, totalScans = 0;
  cardsSnap.forEach((doc) => {
    const d = doc.data();
    const isActive = d.status === "ACTIVE" || (!d.status && d.pinHash);
    if (isActive) active++; else ready++;
    totalScans += Number(d.totalScans || 0);
  });

  const counters = { ready, active, totalScans };
  await ref.set(counters);
  return counters;
}

async function bumpCounters(deltas) {
  const payload = {};
  Object.keys(deltas).forEach((k) => {
    if (deltas[k]) payload[k] = admin.firestore.FieldValue.increment(deltas[k]);
  });
  if (Object.keys(payload).length === 0) return;
  await db.collection("meta").doc("counters").set(payload, { merge: true });
}

// Alokasikan `count` nomor urut berikutnya untuk sebuah prefix, atomik
// (aman dipanggil bersamaan). Prefix yang belum pernah dipakai akan
// dicek sekali ke koleksi cards (supaya tidak bertabrakan dengan kartu
// lama yang prefix-nya sama), setelah itu selalu O(1).
async function allocateSequence(prefix, count) {
  const ref = db.collection("meta").doc("sequences");

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : {};
    let current = data[prefix];

    if (current === undefined) {
      const rangeSnap = await db
        .collection("cards")
        .orderBy(admin.firestore.FieldPath.documentId())
        .startAt(prefix)
        .endAt(prefix + "\uf8ff")
        .get();
      let maxNum = 0;
      rangeSnap.forEach((doc) => {
        const n = parseInt(doc.id.slice(prefix.length), 10);
        if (!isNaN(n) && n > maxNum) maxNum = n;
      });
      current = maxNum;
    }

    tx.set(ref, { [prefix]: current + count }, { merge: true });
    return current; // nomor sebelum batch ini; ID baru mulai dari current+1
  });
}

module.exports = { getCounters, bumpCounters, allocateSequence };
