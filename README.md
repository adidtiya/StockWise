# StockWise — Prototype MVP

> *Know what and how much to stock before it becomes waste.*

Aplikasi web (mobile-first, bisa di-install sebagai PWA) untuk UMKM F&B: memprediksi kebutuhan bahan baku,
memberi rekomendasi belanja, dan menampilkan **Waste Risk Score** sebelum bahan terbuang.

## Menjalankan di komputer sendiri

Prasyarat: **Node.js 22.13 atau lebih baru** (database memakai modul bawaan `node:sqlite`, jadi tidak perlu install database terpisah).

```bash
npm install
```

```bash
npm start
```

Buka http://localhost:3000. Database `data/stockwise.db` dibuat otomatis saat server pertama kali jalan.

### Akun demo (dibuat otomatis, berisi riwayat 90 hari)

| Tipe user | Email | Kata sandi | Usaha |
|---|---|---|---|
| Pemilik UMKM (Freemium) | `demo@stockwise.id` | `demo12345` | Warung Makan Bu Sari |
| Pemilik UMKM Pro | `pro@stockwise.id` | `demo12345` | Dapur Katering Berkah |

Akun demo juga bisa dipilih langsung dengan satu klik di halaman **Masuk**. Datanya otomatis dibuat ulang bila sudah basi
(tidak ada penjualan kemarin) atau bila akun demo dihapus.

## Pemenuhan ketentuan BAB 2 (Prototyping)

| Ketentuan dosen | Halaman di aplikasi | Rute |
|---|---|---|
| Onboarding 3–5 screen | 4 slide: belanja tanpa menebak, forecast pola hari/event, Waste Risk Score, Freemium vs Pro | `#/onboarding` |
| Sign In | Email + kata sandi, tombol akun demo | `#/login` |
| Register (beberapa tipe user) | 3 langkah: data pemilik → profil usaha (warung / rumah makan / katering) → tipe akun **Freemium** atau **Pro** (+ simulasi pembayaran) | `#/register` |
| Main screen | Beranda: penjualan hari ini vs forecast, bahan perlu dibeli, Waste Risk, akurasi, grafik, porsi yang masih bisa dibuat, event mendatang, tren waste | `#/dashboard` |
| Business process | lihat tabel berikut | |
| Profile | Ubah data pemilik & usaha, ganti kata sandi | `#/profil` |
| Delete my account | Konfirmasi kata sandi + ketik `HAPUS`, seluruh data usaha terhapus (cascade) | `#/hapus-akun` |
| Feedback | Rating bintang, kategori, pesan, riwayat feedback | `#/feedback` |

### Business process StockWise (sesuai use case & alur di makalah Bab 1)

| Tahap / Use case | Implementasi | Rute |
|---|---|---|
| Tahap 1 · UC-02 Atur profil & bahan | Bahan baku (satuan, kategori segar/tahan lama, umur simpan, harga), menu + komposisi resep per porsi, HPP & margin | `#/bahan`, `#/menu` |
| Tahap 2 · UC-03 Input penjualan | Stepper per menu, kuota Freemium 300 transaksi/bulan | `#/penjualan` |
| Tahap 2 · UC-04 Import Excel | Unggah .xlsx/.csv, unduh templat, **validasi** tanggal/nama/satuan/jumlah sebelum disimpan, konversi gram→kg & ml→liter | `#/import` |
| Tahap 3 · Event tagging | Natal, Lebaran, Imlek, tanggal gajian, + event usaha sendiri; dampak yang **dipelajari** dari data ditampilkan | `#/event` |
| Tahap 4 · UC-05/UC-08 Forecast | Per menu & per bahan, ditampilkan sebagai **rentang**; 7 hari (Freemium) / 14 & 30 hari (Pro); pola hari Senin–Minggu | `#/forecast` |
| Tahap 5 · UC-06 Rekomendasi + UC-07 Waste Risk Score | Kebutuhan − stok layak pakai; periode harian (segar) / mingguan / bulanan (tahan lama); skor rendah/sedang/tinggi + saran tindakan & jumlah beli aman | `#/rekomendasi` |
| Tahap 6 · Beli bahan, catat stok masuk · UC-09 Dashboard | "Tandai sudah dibeli" dari rekomendasi, catat stok masuk / bahan terbuang, stok per batch (FEFO) & tanggal kedaluwarsa | `#/rekomendasi`, `#/stok-masuk`, `#/bahan` |
| Tahap 7 · Evaluasi & latih ulang | Akurasi (1 − WAPE) aktual vs forecast, akurasi per menu, tren nilai waste per minggu, tombol **Latih ulang model** | `#/evaluasi` |
| UC-10 Riwayat transaksi | Penjualan (dengan label event & sumber), stok masuk, bahan terbuang | `#/riwayat` |
| Tahap 8 · UC-11 Berlangganan Pro | Perbandingan paket, checkout Rp100.000/bulan (simulasi), perpanjang, berhenti | `#/langganan` |
| UC-13 Sinkronisasi API (Pro) | Hubungkan MokaPOS, GoFood, GrabFood, ShopeeFood; tombol sinkron | `#/integrasi` |

### Yang masih berupa simulasi (sebutkan di makalah)

- **Pembayaran Pro**: tidak terhubung payment gateway; checkout langsung berstatus lunas.
- **Sinkronisasi API pihak ketiga**: integrasi resmi butuh kemitraan dengan MokaPOS/GoBiz/GrabMerchant/Shopee Partner.
  Tombol sinkron membangkitkan pesanan contoh dari pola forecast hari ini.

## Cara kerja forecast (UC-08)

Per menu: **level** penjualan (exponential smoothing, α dipilih otomatis dari 0,05–0,5 dengan error terkecil)
× **faktor hari** dalam seminggu (8 minggu terakhir, hari event dikecualikan) × **faktor event** (dipelajari dari
penjualan aktual pada hari berlabel yang sama; sebelum ada riwayat dipakai dampak default). Prediksi menu dikalikan
komposisi resep menjadi kebutuhan bahan. Rentang ketidakpastian berasal dari error prediksi 28 hari terakhir.

**Waste Risk Score**: stok disimpan per batch dengan tanggal kedaluwarsa. Sistem mensimulasikan pemakaian harian
(FEFO, bahan yang paling cepat kedaluwarsa dipakai dulu) sampai 60 hari ke depan; bahan yang belum terpakai saat
kedaluwarsa dihitung sebagai potensi waste. Rasio waste terhadap stok + rencana beli: < 10% rendah, 10–30% sedang, > 30% tinggi.
Model dilatih ulang otomatis setiap 24 jam atau lewat tombol di halaman Evaluasi.

## Tech stack (bahan Bab 2 D)

| Komponen | Teknologi | Alasan singkat |
|---|---|---|
| Back-end | Node.js 22+ dengan Express 5 | Satu bahasa (JavaScript) untuk front-end dan back-end sehingga tim kecil cepat bergerak; Express ringan dan mudah di-deploy di layanan gratis/murah. |
| Front-end | HTML, CSS, JavaScript (ES Modules), SPA tanpa framework, grafik SVG buatan sendiri, PWA manifest | Tanpa proses build, ukuran kecil, cepat di ponsel kelas menengah yang dipakai pemilik UMKM; tampilan mobile-first dengan navigasi bawah. |
| Database | SQLite (`node:sqlite` bawaan Node) | Tanpa server database terpisah, cukup satu file; relasi & `ON DELETE CASCADE` untuk hapus akun. Saat pengguna bertambah dapat dimigrasi ke PostgreSQL karena skemanya relasional standar. |
| 3rd party services | SheetJS (baca/tulis Excel di browser), Google Fonts (Plus Jakarta Sans); rencana produksi: Midtrans/Xendit (pembayaran), API MokaPOS, GoBiz, GrabMerchant, Shopee Partner | Import Excel tanpa membebani server; integrasi kanal penjualan sebagai pembeda paket Pro. |
| Other tools | Git & GitHub, VS Code, Render (hosting), Figma (desain), Claude Code (bantuan pengembangan) | |

Keamanan: kata sandi di-hash dengan **scrypt** + salt, sesi memakai cookie `httpOnly` bertanda tangan HMAC,
semua query memakai prepared statement, dan setiap data dicek kepemilikannya per pengguna.

## Deploy agar bisa diakses lewat internet (Render.com, gratis)

1. Unggah folder ini ke repository GitHub (folder `node_modules` dan `data` tidak perlu, sudah ada di `.gitignore`).
2. Di https://render.com → **New → Blueprint**, pilih repository tersebut. File `render.yaml` sudah menyiapkan
   build `npm install`, start `npm start`, Node 22, dan `SESSION_SECRET` acak.
3. Setelah selesai, URL berbentuk `https://stockwise-xxxx.onrender.com` bisa dicantumkan sebagai **URL Prototyping**.

Catatan paket gratis Render: server tidur setelah ±15 menit tanpa pengunjung (akses pertama butuh ±30–60 detik) dan
disk tidak permanen, sehingga akun baru yang didaftarkan bisa hilang saat server restart. **Akun demo selalu dibuat
ulang otomatis**, jadi aman untuk presentasi. Untuk data permanen gunakan paket berbayar dengan persistent disk
(set `DATA_DIR` ke lokasi disk) atau Railway dengan volume.

## Struktur folder

```
server/
  server.js        Express app, routing, static files
  db.js            Skema SQLite
  auth.js          Hash kata sandi, sesi cookie, middleware
  forecast.js      UC-08 model forecast & latih ulang
  inventory.js     Stok per batch (FEFO), kedaluwarsa, waste
  analytics.js     Dashboard, rekomendasi + Waste Risk Score, evaluasi
  seed.js          Event default & data contoh 90 hari, akun demo
  routes/          auth.js, data.js (bahan, menu, stok, penjualan, import, event, riwayat), account.js (forecast, langganan, API, feedback)
public/
  index.html, css/style.css, img/logo.svg, manifest.webmanifest
  js/app.js        Router & layout (sidebar desktop, bottom nav ponsel)
  js/ui.js         Komponen UI, format, grafik SVG
  js/pages/        Satu file per halaman
```
