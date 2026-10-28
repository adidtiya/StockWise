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

## Tech stack 

| Komponen | Teknologi | Alasan singkat |
|---|---|---|
| Back-end | Node.js 22+ dengan Express 5 | Satu bahasa (JavaScript) untuk front-end dan back-end sehingga tim kecil cepat bergerak; Express ringan dan mudah di-deploy di layanan gratis/murah. |
| Front-end | HTML, CSS, JavaScript (ES Modules), SPA tanpa framework, grafik SVG buatan sendiri, PWA manifest | Tanpa proses build, ukuran kecil, cepat di ponsel kelas menengah yang dipakai pemilik UMKM; tampilan mobile-first dengan navigasi bawah. |
| Database | SQLite (`node:sqlite` bawaan Node) | Tanpa server database terpisah, cukup satu file; relasi & `ON DELETE CASCADE` untuk hapus akun. Saat pengguna bertambah dapat dimigrasi ke PostgreSQL karena skemanya relasional standar. |
| 3rd party services | SheetJS (baca/tulis Excel di browser), Google Fonts (Plus Jakarta Sans); rencana produksi: Midtrans/Xendit (pembayaran), API MokaPOS, GoBiz, GrabMerchant, Shopee Partner | Import Excel tanpa membebani server; integrasi kanal penjualan sebagai pembeda paket Pro. |
| Other tools | Git & GitHub, VS Code, Render (hosting), Figma (desain), Claude Code (bantuan pengembangan) | |

Keamanan: kata sandi di-hash dengan **scrypt** + salt, sesi memakai cookie `httpOnly` bertanda tangan HMAC,
semua query memakai prepared statement, dan setiap data dicek kepemilikannya per pengguna.



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
