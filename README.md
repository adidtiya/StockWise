# StockWise — Sistem Prediksi Kebutuhan Stok & Pencegahan Limbah UMKM F&B

> *Know what and how much to stock before it becomes waste.*

StockWise adalah aplikasi web (*mobile-first* / Progressive Web App) yang dirancang khusus untuk membantu pemilik usaha kuliner UMKM (katering, warung makan, dan rumah makan) mengelola inventaris bahan baku. Sistem menggunakan model *time-series exponential smoothing* terbobot pola hari dan hari khusus (event) untuk memprediksi kebutuhan bahan, memberikan rekomendasi belanja cerdas, serta menghitung **Waste Risk Score** melalui simulasi maju FEFO (*First-Expired, First-Out*) 60 hari guna mencegah bahan baku kedaluwarsa dan terbuang sia-sia.

---

## 1. Prasyarat Sistem

Sebelum menjalankan aplikasi, pastikan perangkat Anda telah terpasang:
- **Docker** (versi 24.0 atau lebih baru) dan **Docker Compose** (v2).
- **Python 3.11+** (opsional pada host, digunakan untuk menjalankan server statis frontend dan pengujian lokal).
- **Peramban Web Modern** (Google Chrome, Mozilla Firefox, Safari, atau Microsoft Edge).

---

## 2. Daftar Port yang Digunakan

| Port | Layanan | Keterangan |
|---|---|---|
| **5173** | Frontend Web App (PWA) | Server HTTP statis Vanilla JS (`http://localhost:5173`) |
| **8000** | Backend API (FastAPI) | Layanan REST API & Swagger UI (`http://localhost:8000/docs`) |
| **5432** | Database PostgreSQL 16 | Basis data relasional penyimpanan transaksi dan inventaris |

---

## 3. Panduan Langkah demi Langkah Menjalankan Aplikasi

Ikuti langkah-langkah di bawah ini untuk mengklon, menyiapkan, dan menyalakan aplikasi dari awal:

### Langkah 1: Siapkan File Environment Backend
Salin berkas templat environment `env.example` ke file konfigurasi development:
```bash
cp src/backend/app/config/env/env.example src/backend/app/config/env/development.env
```

### Langkah 2: Bangun Image Kontainer Backend
Bangun image Docker backend berbasis Python 3.11:
```bash
docker compose -f deploy/compose/docker-compose.dev.yml build
```

### Langkah 3: Jalankan Layanan Basis Data PostgreSQL
Nyalakan kontainer PostgreSQL 16 dan tunggu hingga berstatus sehat (*healthy*):
```bash
docker compose -f deploy/compose/docker-compose.dev.yml up -d db
```

### Langkah 4: Jalankan Migrasi Basis Data (Alembic)
Terapkan seluruh skema tabel ke database PostgreSQL menggunakan Alembic:
```bash
docker compose -f deploy/compose/docker-compose.dev.yml run --rm api alembic upgrade head
```

### Langkah 5: Suntikkan Data Awal Realistis (Seed Data)
Isi basis data dengan akun demo UMKM Katering, master data 5 bahan baku, 2 menu produk, batch persediaan, event, dan riwayat penjualan 90 hari terakhir:
```bash
docker compose -f deploy/compose/docker-compose.dev.yml run --rm api python -m app.seed
```

### Langkah 6: Jalankan Layanan Backend API
Nyalakan kontainer backend FastAPI:
```bash
docker compose -f deploy/compose/docker-compose.dev.yml up -d api
```
Pastikan kontainer berjalan normal dan sehat:
```bash
docker compose -f deploy/compose/docker-compose.dev.yml ps
```
Pemeriksaan kesehatan API dapat diverifikasi melalui:
```bash
curl -s http://localhost:8000/api/v1/health
```

### Langkah 7: Jalankan Frontend Web App
Pada terminal terpisah, masuk ke direktori frontend dan jalankan server statis HTTP lokal pada port 5173:
```bash
python3 -m http.server 5173 --directory src/frontend
```
Buka peramban web dan akses: **`http://localhost:5173`**.

---

## 4. Kredensial Akun Demo & Dokumentasi API

Untuk menguji seluruh fitur aplikasi, gunakan akun demo siap pakai:

| Parameter | Keterangan Akun Demo |
|---|---|
| **Email** | `demo@stockwise.id` |
| **Kata Sandi** | `Demo1234!` |
| **Nama Usaha** | Dapur Katering Berkah |
| **Tipe Usaha** | Katering |
| **Paket Awal** | Freemium |

### Dokumentasi Interaktif & Health Check
- **Swagger UI (OpenAPI):** [http://localhost:8000/docs](http://localhost:8000/docs)
- **ReDoc:** [http://localhost:8000/redoc](http://localhost:8000/redoc)
- **Health Check Endpoint:** [http://localhost:8000/api/v1/health](http://localhost:8000/api/v1/health)

---

## 5. Cara Menjalankan Pengujian Otomatis (Pytest)

Test suite StockWise mencakup pengujian unit algoritma inti (*pure math & FEFO simulation*) serta pengujian integrasi endpoint API (*authentication, authorization, session cookies, rate limiting, forecast horizons, dan data isolation*).

### Menjalankan Seluruh Rangkaian Pengujian
```bash
docker compose -f deploy/compose/docker-compose.dev.yml run --rm api pytest
```

### Menjalankan Pengujian Unit Algoritma Saja
```bash
docker compose -f deploy/compose/docker-compose.dev.yml run --rm api pytest tests/unit/lib
```

### Menjalankan Pengujian Integrasi API Saja
```bash
docker compose -f deploy/compose/docker-compose.dev.yml run --rm api pytest tests/api
```

---

## 6. Prosedur Reset Data Demo (Idempoten)

Jika selama pengujian demo Anda melakukan perubahan data (misalnya menambah transaksi, mengubah stok, atau melakukan upgrade paket ke Pro) dan ingin mengembalikan kondisi data demo ke kondisi awal yang bersih:

Jalankan perintah berikut:
```bash
docker compose -f deploy/compose/docker-compose.dev.yml run --rm api python -m app.seed
```

> **Perilaku Idempotensi:** Skrip `app.seed` mendeteksi keberadaan akun `demo@stockwise.id`. Jika akun sudah ada, skrip akan menghapus data lama akun tersebut beserta seluruh rekaman relasionalnya secara bersih via cascade, lalu menyuntikkan ulang data awal yang terkalibrasi relatif terhadap tanggal hari ini secara deterministik.

*(Opsional: Untuk menghapus volume seluruh database PostgreSQL stack development dan mengulang dari nol, gunakan perintah `docker compose -f deploy/compose/docker-compose.dev.yml down -v` lalu ulangi Langkah 3 sampai 6 di atas).*

---

## 7. Catatan Fitur Simulasi (Tugas Akademik)

Sesuai rancangan pada dokumen spesifikasi kebutuhan, beberapa integrasi eksternal disimulasikan secara lokal untuk kebutuhan pengujian fungsional:
1. **Pembayaran Langganan Pro (UC-11):** Tombol checkout simulasi langsung mengaktifkan status paket pengguna menjadi Pro (`role: pro`, perpanjangan 30 hari) dan mencatat bukti pembayaran tanpa integrasi ke *payment gateway* pihak ketiga (Midtrans/Xendit).
2. **Sinkronisasi Kanal Penjualan (UC-13):** Tombol sinkronisasi MokaPOS, GoFood, GrabFood, dan Shopee Partner membangkitkan pesanan mock secara otomatis untuk pengguna Pro guna mensimulasikan penarikan pesanan tanpa ketergantungan API pihak ketiga.
3. **Formulir Feedback (UC-12):** Formulir umpan balik menyimpan pesan dan rating bintang (1–5) langsung ke tabel database `feedback` tanpa mengirimkan email/notifikasi eksternal.

---

## 8. Ringkasan Arsitektur & Logika Inti

- **Time-Series Exponential Smoothing (UC-08):** Mengoptimasi parameter smoothing $\alpha \in [0.05, 0.5]$ berdasarkan error historis (WAPE) terendah pada 28 hari terakhir, mengisolasi efek musiman hari dalam seminggu (*day-of-week*), dan memperhitungkan dampak hari khusus (*event multiplier*).
- **Rekomendasi Belanja & Simulasi FEFO (UC-06 & UC-07):** Mengonversi kebutuhan menu menjadi kebutuhan bahan mentah via tabel komposisi resep. Sistem mensimulasikan pergerakan inventaris harian hingga 60 hari ke depan dengan aturan konsumsi bahan yang paling mendekati tanggal kedaluwarsa terlebih dahulu. Jika rasio potensi limbah melebihi ambang batas, sistem menampilkan **Waste Risk Score** (*rendah* $<10\%$, *sedang* $10\%–30\%$, *tinggi* $>30\%$) dan memberikan rekomendasi penurunan jumlah pembelian aman (*safe-buy*).
- **Keamanan & Manajemen Sesi (UC-01):** Autentikasi berbasis JWT yang disimpan di dalam cookie peramban dengan atribut `HttpOnly` dan `SameSite=Lax`. Endpoint login dan registrasi dilindungi pembatas laju request (*rate limiting*) 5 request per menit.
