// Helper internal — koneksi ke Firestore lewat Firebase Admin SDK.
// HANYA berjalan di server (Vercel Function), TIDAK PERNAH dikirim ke browser.
// Kredensialnya diambil dari Environment Variables di Vercel, bukan dari kode.
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    }),
  });
}

const db = admin.firestore();

module.exports = { admin, db };
