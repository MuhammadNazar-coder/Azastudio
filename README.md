# Kartu Review Akrilik

Sistem kartu QR/NFC untuk usaha kecil: pelanggan scan kartu → diarahkan ke
Google Review (kalau puas) atau form komplain langsung ke WhatsApp owner
(kalau kurang puas). Dilengkapi dasbor admin untuk produksi QR massal dan
pemantauan stok.

## Struktur

```
index.html          -> halaman kartu yang dilihat pelanggan (?id=KODE)
admin.html          -> dasbor admin (generate stok, QR studio, daftar kartu)

api/                -> HANYA endpoint asli (tiap file = 1 Vercel Function,
                        dibatasi 12 function di paket Hobby/gratis)
  card.js             GET data publik kartu (tanpa PIN, tanpa nomor WA)
  card-contact.js     POST ambil nomor WA (khusus alur komplain)
  activate.js         aktivasi kartu baru / isi stok READY
  verify-pin.js       verifikasi PIN pemilik toko
  update-card.js      edit data kartu (perlu PIN)
  track-scan.js       catat 1 scan (dipanggil otomatis dari index.html)
  admin.js            SEMUA endpoint dasbor admin jadi satu function,
                       dipilih lewat ?action=login|logout|stats|list|
                       generate|delete|export (lihat komentar di file ini)
  cron-cleanup-logs.js  cron harian: buang log scan > 180 hari

lib/                -> kode bersama (BUKAN endpoint, tidak dihitung ke
                        batas 12 function karena di luar folder api/)
  firebaseAdmin.js    koneksi Firestore (Admin SDK, server-only)
  hash.js             hash PIN (SHA-256 + salt + pepper)
  phone.js            normalisasi nomor WA ke format internasional
  adminAuth.js        sesi login admin (cookie ter-signature)
  rateLimit.js        rate limit berbasis Firestore (transaksi, aman dari
                       serangan paralel)
  requestIp.js         ambil IP klien untuk rate limit
  counters.js         counter agregat (statistik O(1), tanpa full scan)
  validate.js         validasi format ID kartu, nama toko, & link review
```

> **Kenapa dipisah `api/` dan `lib/`**: Vercel menghitung SETIAP file yang
> ada langsung di dalam folder `api/` sebagai 1 serverless function
> tersendiri — termasuk file "helper" sekalipun namanya diawali underscore
> (`_hash.js` dst tetap dihitung, awalan `_` cuma konvensi penamaan, bukan
> instruksi ke Vercel). Paket Hobby (gratis) dibatasi maksimal 12 function
> per deployment. Kalau semua helper ikut ditaruh di `api/`, jumlahnya bisa
> lewat 12 dan **deployment langsung gagal** sebelum sempat dites. Taruh
> semua kode yang cuma di-`require()` (bukan endpoint) di `lib/` supaya
> tidak ikut dihitung.

## Setup

### 1. Firebase / Firestore

1. Buat project di [Firebase Console](https://console.firebase.google.com).
   Pilih lokasi Firestore **sedekat mungkin dengan pengguna** (mis.
   `asia-southeast2` untuk Jakarta) — lokasi ini **tidak bisa diganti**
   setelah dibuat.
2. Project Settings > Service Accounts > **Generate new private key**.
   File JSON yang terunduh berisi `project_id`, `client_email`,
   `private_key`.
3. Firestore Database > Rules, isi dengan:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /cards/{cardId} { allow read, write: if false; }
       match /scanLogs/{logId} { allow read, write: if false; }
       match /meta/{docId} { allow read, write: if false; }
       match /rateLimits/{docId} { allow read, write: if false; }
     }
   }
   ```

   Semua akses HANYA lewat Firebase Admin SDK di server (`/api`), tidak
   pernah langsung dari browser.

### 2. Environment Variables (Vercel > Project Settings > Environment Variables)

| Variable | Isi |
|---|---|
| `FIREBASE_PROJECT_ID` | dari file JSON service account |
| `FIREBASE_CLIENT_EMAIL` | dari file JSON service account |
| `FIREBASE_PRIVATE_KEY` | dari file JSON, apa adanya termasuk baris `-----BEGIN PRIVATE KEY-----` |
| `PIN_PEPPER` | string acak rahasia (bukan PIN, ini "bumbu rahasia" tambahan di hash) |
| `ADMIN_PASSWORD` | password untuk masuk `/admin.html` |
| `ADMIN_SESSION_SECRET` | string acak rahasia lain, **beda** dari `PIN_PEPPER` |
| `CRON_SECRET` | string acak min. 16 karakter, untuk otentikasi cron pembersih log (Vercel otomatis mengirim ini sebagai header saat cron jalan) |

Semua nilai "string acak rahasia" sebaiknya dibuat lewat generator seperti
[1Password](https://1password.com) atau `openssl rand -base64 32`, dan
**jangan pernah** disimpan di kode / git.

### 3. Cloudinary (upload foto bukti komplain)

1. Daftar gratis di [cloudinary.com](https://cloudinary.com).
2. Salin **Cloud name** dari Dashboard.
3. Settings > Upload > Upload presets > tambah preset baru:
   - Signing Mode: **Unsigned** (wajib, supaya bisa dipanggil dari browser)
   - Folder: `complaints`
   - Batasi **Allowed formats**: jpg, jpeg, png, webp
4. Isi `CLOUDINARY_CLOUD_NAME` dan `CLOUDINARY_UPLOAD_PRESET` di bagian
   atas `<script>` pada `index.html`.

### 4. Deploy

1. Push folder ini ke GitHub.
2. Import ke [Vercel](https://vercel.com) — akan otomatis mendeteksi
   folder `/api` sebagai serverless functions dan menjalankan
   `npm install` untuk `firebase-admin`.
3. Setelah deploy pertama, buka **Vercel Dashboard > Project > Cron Jobs**
   dan pastikan cron `cron-cleanup-logs` aktif (terdaftar otomatis dari
   `vercel.json`).

### 5. Akses

- Kartu pelanggan: `https://domain-anda.vercel.app/?id=AKR0001`
- Dasbor admin: `https://domain-anda.vercel.app/admin.html`

## Catatan keamanan

- PIN pemilik toko tidak pernah disimpan/terkirim dalam bentuk asli —
  hanya hash SHA-256 (salt = ID kartu, pepper = `PIN_PEPPER`).
- Nomor WhatsApp pemilik TIDAK dikembalikan lewat `GET /api/card` (data
  publik yang dipanggil browser siapa saja) — hanya lewat
  `POST /api/card-contact` saat pelanggan benar-benar mengirim komplain,
  dan endpoint itu dibatasi per-IP.
- Login admin & verifikasi PIN dibatasi rate limit (lihat `_rateLimit.js`)
  supaya tidak bisa ditebak (brute-force) berulang-ulang.
- Statistik & daftar kartu di dasbor admin dibaca dari counter (`meta/counters`)
  dan query bertahap, BUKAN scan seluruh database — tetap cepat & hemat
  kuota walau jumlah kartu sudah ribuan.

## Saran pengembangan lanjutan (belum diimplementasikan)

- **TypeScript** untuk seluruh `/api` — menangkap salah tipe data sebelum
  deploy, bukan saat runtime.
- **Unit test** (mis. Jest) untuk helper murni (`_hash.js`, `_phone.js`,
  `_counters.js`) — logikanya deterministik, mudah dites, dan sering jadi
  sumber bug halus (contoh: kalau nanti format nomor WA negara lain mau
  didukung).
- **Error tracking** (Sentry / Vercel Observability) — saat ini error di
  server cuma masuk `console.error`, hanya terlihat kalau Anda buka log
  Vercel manual.
- **Audit log admin** — koleksi Firestore kecil yang mencatat "siapa
  hapus/generate apa, kapan" (berguna kalau nanti ada lebih dari 1 admin).
- **Multi-admin dengan akun terpisah** — saat ini 1 password dipakai
  bersama semua yang tahu; kalau tim bertambah, lebih baik tiap orang
  punya kredensial sendiri (bisa pakai Firebase Auth) supaya aksi bisa
  dilacak per orang dan akses bisa dicabut individual tanpa ganti
  password bersama.
- **Firestore scheduled export/backup** ke Cloud Storage — proteksi kalau
  ada penghapusan tidak sengaja.
