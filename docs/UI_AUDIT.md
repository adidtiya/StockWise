# Laporan Audit Visual Frontend StockWise (UI Audit)

Dokumen ini merupakan laporan hasil audit visual menyeluruh antarmuka web SPA/PWA StockWise (`src/frontend/`) yang dilaksanakan pada tugas **T-9.1** dalam rangka persiapan perbaikan tampilan dan konsistensi visual frontend (Fase 9).

Audit dilakukan tanpa mengubah berkas apa pun di `src/frontend/`, menggunakan browser Google Chrome headless dengan protokol DevTools (CDP) pada tiga ukuran viewport standar: **1280 px** (Desktop), **768 px** (Tablet), dan **390 px** (Ponsel/Mobile).

---

## 1. Lingkungan & Arsitektur Penyajian Frontend

### 1.1 Cara Frontend Disajikan
* **Server Web Statis:** Berkas frontend di `src/frontend/` disajikan melalui server HTTP statis lokal pada alamat `http://localhost:5173`. Pada lingkungan pengujian digunakan skrip `node tests/e2e/serve_frontend.mjs` (atau perintah setara `python3 -m http.server 5173`).
* **Koneksi Backend & CORS:** Frontend berinteraksi secara asinkron dengan API backend FastAPI pada `http://localhost:8000/api/v1` menggunakan `credentials: 'include'` (sesi autentikasi berbasis cookie HttpOnly `access_token` dan `refresh_token`). Variabel `CORS_ORIGINS` pada backend disetel ke `http://localhost:5173`.
* **PWA & Service Worker:** 
  * Aplikasi memiliki berkas `manifest.webmanifest` yang mendefinisikan nama, warna tema (`#0F766E`), dan ikon.
  * **Service Worker:** Saat ini **tidak ada service worker yang aktif atau terdaftar** di codebase (`navigator.serviceWorker` tidak dipanggil di `index.html` maupun `src/frontend/js/`). Aset dilayani langsung oleh server HTTP statis dengan header caching normal browser.

### 1.2 Daftar Berkas CSS
Aplikasi menggunakan satu lembar gaya CSS terpusat:
* **`src/frontend/css/style.css`** (608 baris) — memuat seluruh aturan CSS global, variabel CSS warna token (`--brand`, `--surface`, `--text`, dll.), tipografi (*Plus Jakarta Sans*), tata letak grid/flex (`.app`, `.sidebar`, `.main`, `.topbar`, `.bottom-nav`), kartu (`.card`), tabel (`.table`), tombol (`.btn`), badge (`.badge`), formulir (`.input`, `.field`), toast, dan modal dialog.

### 1.3 Komponen UI Bersama & Lokasi Kodenya
Seluruh komponen antarmuka bersama didefinisikan secara modular di **`src/frontend/js/ui.js`**:
* **Templating & Sanitasi:** `html`, `raw`, `esc` (baris 3–23).
* **Ikon SVG:** `icon(name, cls)` (baris 25–76) — menyediakan 45+ simbol ikon vektor inline.
* **Format & Lokalisasi (ID):** `rupiah`, `rupiahShort`, `number`, `qty`, `pct`, `signedPct`, `dateLong`, `dateFull`, `dateMed` (baris 78–143).
* **Notifikasi Toast:** `toast(message, type)` (baris 145–156).
* **Modal Dialog & Konfirmasi:** `modal({ title, body, actions, wide, onMount })` dan `confirmDialog(...)` (baris 158–213).
* **Indikator Keadaan (States):** `loading(lines)` dan `emptyState(ico, title, desc, action)` (baris 215–256).
* **Grafik Visualisasi SVG:** `sparkline(values, labels, W, H)` dan `barChart(data, W, H)` (baris 258–357).
* **Shell Navigasi:** Diimplementasikan di `src/frontend/js/app.js` (`renderShell()`, `.sidebar`, `.topbar`, `.bottom-nav`, dan floating action button `#fab`).

---

## 2. Metodologi Audit & Skrip Pengujian

Audit dilakukan dengan dua akun pengujian:
1. **Akun A (Akun Berisi Data Uji Lengkap):**
   * Didaftarkan dengan profil usaha Katering (`akuna_xxx@stockwise.id`).
   * 5 Master bahan baku dengan stok batch aktif: Daging Ayam Broiler (50 kg), Cabai Rawit Merah (15 kg), Bawang Merah (20 kg), Beras Putih Premium (100 kg), Minyak Goreng (50 liter).
   * 3 Menu produk dengan takaran resep komposit: *Ayam Geprek Sambal Korek E2E*, *Nasi Ayam Bakar*, *Nasi Goreng Spesial*.
   * 2 Event hari khusus: *Tanggal Gajian* (multiplier 1.3) dan *Promo Akhir Pekan* (multiplier 1.2).
   * Riwayat penjualan 28 hari berturut-turut berhasil diimpor melalui berkas Excel template (`tests/e2e/fixtures/valid_sales_28d.xlsx`).
   * Model evaluasi peramalan telah dilatih aktif via `/api/v1/evaluation/train`.
2. **Akun B (Akun Kosong / Empty State):**
   * Didaftarkan tanpa data contoh (*seed demo: false*) untuk mengaudit tampilan *empty state* dan alur orientasi pengguna baru (*onboarding checklist*).

### Skrip Pemeriksa UI (`tests/e2e/ui_check.js`)
Skrip pemeriksa mengevaluasi empat aturan utama:
* **(a) Elemen SVG > 64 px:** Menangkap ikon SVG yang tidak memiliki pembatasan ukuran CSS sehingga membesar tidak wajar (grafik analitik `.chart` dan ilustrasi onboarding `.onb-art` dikecualikan secara terarah).
* **(b) Overflow Horizontal:** Mendeteksi jika `scrollWidth > innerWidth` pada level dokumen atau body.
* **(c) Elemen Teks Sempit:** Mendeteksi elemen dengan lebar `< 120 px` yang memuat teks panjang `> 30 karakter` (mengidentifikasi kolom teks yang terjepit/meluber).
* **(d) Kegagalan Aset:** Memeriksa `img` yang gagal dimuat, font error pada `document.fonts`, dan respons 4xx pada aset berkas statis (CSS/font/gambar).

---

## 3. Matriks Hasil Audit 14 Halaman × 3 Ukuran Layar

Setiap kombinasi halaman dan viewport telah ditinjau dan disimpan ke dalam direktori `tests/e2e/artifacts/`:

| No | Halaman | Rute Hash | Lebar 1280 px | Lebar 768 px | Lebar 390 px | Deskripsi Visual & Status Temuan |
|:--:|---|---|---|---|---|---|
| 1 | **Onboarding** | `#/onboarding` | `t91_onboarding_1280.png` (0) | `t91_onboarding_768.png` (0) | `t91_onboarding_390.png` (0) | Kartu slide pengenalan di tengah, ilustrasi SVG proporsional, indikator titik dan tombol "Lanjut >" rapi. |
| 2 | **Login** | `#/login` | `t91_login_1280.png` (0) | `t91_login_768.png` (0) | `t91_login_390.png` (0) | Kartu masuk terpusat, input email dan password dengan tombol "Lihat", tombol "Masuk", dan tautan pendaftaran. |
| 3 | **Register** | `#/register` | `t91_register_1280.png` (0) | `t91_register_768.png` (0) | `t91_register_390.png` (0) | Wizard registrasi 3 langkah dengan bilah progres atas, form input teratur dan responsif. |
| 4 | **Beranda (Isi)** | `#/dashboard` | `t91_dashboard_1280.png` (0) | `t91_dashboard_768.png` (0) | `t91_dashboard_390.png` (0) | Banner sambutan hijau, 4 kartu KPI, grafik tren penjualan 14 hari, dan 3 kartu kapasitas porsi menu. |
| 5 | **Stok & Bahan** | `#/bahan` | `t91_bahan_1280.png` (0) | `t91_bahan_768.png` (0) | `t91_bahan_390.png` (**1**) | Tabel master bahan rapi di desktop/tablet. Pada 390 px, kolom bahan tertekan sehingga subtitle harga/simpan sempit (84 px). |
| 6 | **Menu & Resep** | `#/menu` | `t91_menu_1280.png` (0) | `t91_menu_768.png` (0) | `t91_menu_390.png` (0) | Grid kartu menu 2 kolom di desktop, 1 kolom di mobile. Rincian komposisi resep dan estimasi margin tampil jelas. |
| 7 | **Event** | `#/event` | `t91_event_1280.png` (0) | `t91_event_768.png` (0) | `t91_event_390.png` (0) | Callout edukasi, tab mendatang/riwayat, daftar event dengan multiplier persentase dan tanggal jelas. |
| 8 | **Penjualan** | `#/penjualan` | `t91_penjualan_1280.png` (0) | `t91_penjualan_768.png` (0) | `t91_penjualan_390.png` (0) | Kartu kuota transaksi Freemium (0/300), input tanggal, daftar menu dengan kontrol stepper kuantitas (- 0 +), bilah total porsi di bawah. |
| 9 | **Import Excel** | `#/import` | `t91_import_1280.png` (0) | `t91_import_768.png` (0) | `t91_import_390.png` (0) | Area *drag-and-drop* file Excel dengan ikon unggah, kartu panduan format kolom dan tombol unduh templat .xlsx. |
| 10 | **Riwayat** | `#/riwayat` | `t91_riwayat_1280.png` (0) | `t91_riwayat_768.png` (0) | `t91_riwayat_390.png` (0) | Filter tanggal/sumber, ringkasan transaksi (640 porsi, Rp16 jt, 28 transaksi), daftar riwayat harian berurutan tanggal. |
| 11 | **Forecast** | `#/forecast` | `t91_forecast_1280.png` (0) | `t91_forecast_768.png` (0) | `t91_forecast_390.png` (0) | Pilihan horizon (7 hari aktif, 14 & 30 hari terkunci Pro), banner deteksi event, tabel estimasi rentang kebutuhan min-max. |
| 12 | **Rekomendasi** | `#/rekomendasi` | `t91_rekomendasi_1280.png` (0) | `t91_rekomendasi_768.png` (0) | `t91_rekomendasi_390.png` (0) | 3 Kartu ringkasan belanja & risiko, kartu saran belanja per bahan dengan badge Waste Risk Score hijau ("Aman"). |
| 13 | **Evaluasi** | `#/evaluasi` | `t91_evaluasi_1280.png` (0) | `t91_evaluasi_768.png` (0) | `t91_evaluasi_390.png` (0) | 4 KPI analitik (Akurasi 84,7%, WAPE 15,3%, 28 hari data, waktu latih), kartu aksi latih ulang, dan tabel akurasi per menu produk. |
| 14 | **Langganan** | `#/langganan` | `t91_langganan_1280.png` (0) | `t91_langganan_768.png` (0) | `t91_langganan_390.png` (0) | Kartu status paket Freemium, perbandingan paket Freemium vs Pro berdampingan dengan checklist fitur dan tombol upgrade. |
| 15 | **Akun** | `#/akun` | `t91_akun_1280.png` (0) | `t91_akun_768.png` (0) | `t91_akun_390.png` (0) | Kartu avatar pengguna dan nama bisnis, kelompok navigasi akun dengan panah chevron, tombol keluar. |

---

## 4. Tinjauan Visual Modal Dialog & Empty State

### 4.1 Dialog Modal (Lebar 1280 px)
1. **Modal Quick Actions (FAB):** `t91_modal_quickactions_1280.png` (0 temuan)
   * Dialog pop-up terpusat menampilkan 4 kartu pintasan aksi: *Input penjualan*, *Stok masuk*, *Bahan terbuang*, dan *Import Excel*. Tombol tutup `X` berada di kanan atas.
2. **Modal Tambah Bahan Baku:** `t91_modal_add_bahan_1280.png` (0 temuan)
   * Formulir input terstruktur rapi: nama bahan, satuan, harga satuan, pilihan kartu kategori (*Bahan segar* / *Tahan lama*), umur simpan (hari), stok minimum, dan tombol *Batal* / *Simpan*.
3. **Modal Tambah Menu & Resep:** `t91_modal_add_menu_1280.png` (0 temuan)
   * Formulir nama menu, harga jual, dan baris dinamis komposisi resep dengan dropdown bahan baku, input kuantitas angka, satuan, dan tombol hapus baris `X`.
4. **Modal Tambah Event:** `t91_modal_add_event_1280.png` (0 temuan)
   * Formulir nama event, pemilihan tanggal, dan slider interaktif persentase dampak penjualan (-80% s/d +200%) dengan indikator nilai real-time.
5. **Modal Feedback Pengguna:** `t91_modal_feedback_1280.png` (0 temuan)
   * Input rating bintang (1–5), dropdown kategori masalah, area teks catatan masukan, dan tombol submit *Kirim Feedback*.

### 4.2 Tampilan Kondisi Kosong (Empty State - Akun B)
1. **Beranda Pengguna Baru (`#/dashboard`):** `t91_empty_dashboard_1280.png`, `t91_empty_dashboard_768.png`, `t91_empty_dashboard_390.png` (**3 temuan kritis per lebar**)
   * **Masalah Kritis Terdeteksi:** Pada kartu checklist panduan langkah orientasi, ikon panah chevron membesar secara tidak wajar hingga ukuran **870×870 px** (1280 px), **634×634 px** (768 px), dan **256×256 px** (390 px). Akibatnya, teks deskripsi di sisi kiri tertekan menjadi kolom sempit vertikal (lebar 0–50 px) dan judul langkah terpotong habis.
2. **Stok & Bahan Baku (`#/bahan`):** `t91_empty_bahan_1280.png` (0 temuan)
   * Kartu empty state rapi dengan ikon kotak, judul *"Belum ada bahan baku"*, deskripsi panduan, dan tombol CTA hijau *"+ Tambah bahan"*.
3. **Menu & Resep (`#/menu`):** `t91_empty_menu_1280.png` (0 temuan)
   * Kartu empty state dengan ikon sendok garpu, judul *"Belum ada menu"*, teks *"Daftarkan bahan baku dulu, lalu tambahkan menu"*, dan tombol pengarah *"Ke bahan baku"*.
4. **Riwayat Transaksi (`#/riwayat`):** `t91_empty_riwayat_1280.png` (0 temuan)
   * Tampilan bersih dengan ikon jam riwayat, judul *"Belum ada transaksi"*, dan keterangan *"Tidak ada data pada rentang tanggal ini"*.
5. **Forecast Kebutuhan (`#/forecast`):** `t91_empty_forecast_1280.png` (0 temuan)
   * Kartu ramah dengan ikon peringatan segitiga, judul *"Riwayat Belum Cukup"*, penjelasan bahwa model peramalan membutuhkan minimal 14 hari transaksi aktif, dan tombol CTA *"Impor Riwayat Penjualan"*.
6. **Rekomendasi Belanja (`#/rekomendasi`):** `t91_empty_rekomendasi_1280.png` (0 temuan)
   * Menampilkan komponen empty state serupa forecast yang secara elegan meminta pengguna mengimpor atau mencatat riwayat penjualan terlebih dahulu.
7. **Evaluasi Akurasi (`#/evaluasi`):** `t91_empty_evaluasi_1280.png` (0 temuan)
   * Kartu KPI menampilkan tanda strip placeholder (*Akurasi: —*, *WAPE: —*, *Data Latih: 0 hari*, *Waktu: Belum dilatih*) dan tabel menampilkan pesan *"Belum ada evaluasi per menu"*.

---

## 5. Tabel Temuan Audit (Daftar Masalah Tampilan)

| ID | Halaman | Lebar Layar | Tingkat | Deskripsi Temuan yang Terlihat | Bukti Tangkapan Layar | Dugaan Akar Masalah |
|---|---|---|---|---|---|---|
| **U-01** | Beranda (Akun Kosong / Onboarding Checklist) | 1280, 768, 390 px | **Kritis** | **Ikon chevron raksasa:** Ikon `chevronRight` pada kartu checklist onboarding membesar raksasa hingga 870 px di desktop, 634 px di tablet, dan 256 px di ponsel, menutupi kartu. | `t91_empty_dashboard_1280.png`<br>`t91_empty_dashboard_768.png`<br>`t91_empty_dashboard_390.png` | `src/frontend/css/style.css:54`<br>`src/frontend/css/style.css:235-242`<br>`src/frontend/js/ui.js:72-76` |
| **U-02** | Beranda (Akun Kosong / Onboarding Checklist) | 1280, 768, 390 px | **Kritis** | **Teks deskripsi terjepit & judul hilang:** Teks deskripsi langkah orientasi ("Nama, satuan, kategori segar / tahan lama, dan umur simpan.") tertekan menjadi kolom vertikal sempit (lebar 0–50 px), huruf/kata bertumpuk ke bawah, dan judul langkah ("Daftarkan bahan baku") tidak terlihat karena terpotong `overflow: hidden`. | `t91_empty_dashboard_1280.png`<br>`t91_empty_dashboard_768.png`<br>`t91_empty_dashboard_390.png`<br>Data inspeksi `checklistDetail` di `audit_data.json` | `src/frontend/css/style.css:143`<br>`src/frontend/css/style.css:235-240`<br>(Berakar sama dengan **U-01**) |
| **U-03** | Stok & Bahan Baku (Tabel Master) | 390 px | **Tinggi** | **Teks panjang pada sel tabel sempit:** Kolom bahan baku terhimpit oleh 5 kolom lain pada layar ponsel (lebar sel 84 px < 120 px) sehingga teks subtitle `div.xs.muted` ("Rp18.000/liter · simpan 180 hari", 32 karakter) terpotong/terlalu padat. | `t91_bahan_390.png`<br>Hasil `ui_check.js`: `td > div.xs.muted` (width: 84 px) | `src/frontend/css/style.css:244-250`<br>`src/frontend/js/pages/bahan.js:145-165` |
| **U-04** | Global (Elemen Ikon SVG) | Semua Halaman | **Tinggi** | **Ketiadaan ukuran dasar bawaan SVG:** Fungsi `icon()` menghasilkan elemen `<svg>` inline tanpa atribut `width` dan `height`. Pada CSS, aturan global untuk SVG hanya `img, svg { display: block; }` tanpa dimensi default (`width` / `height` / `flex-shrink`). Setiap SVG yang tidak memiliki selector CSS spesifik akan melar bebas mengikuti flexbox container. | Kode `src/frontend/js/ui.js:74`<br>`src/frontend/css/style.css:54` | `src/frontend/css/style.css:54`<br>`src/frontend/js/ui.js:72-76` |
| **U-05** | Global (Pola Flex Baris Berisi Ikon) | Semua Halaman | **Sedang** | **Pola flex `.list-item` tidak mengunci ukuran ikon samping:** Selector `.list-item > svg` tidak didefinisikan dengan `width: 20px; height: 20px; flex: none;`, sehingga elemen saudaranya (`.grow { flex: 1; min-width: 0; }`) kehilangan ruang fleksibelnya saat berdampingan dengan SVG bebas. | `src/frontend/css/style.css:235-242` | `src/frontend/css/style.css:235` |

---

## 6. Analisis Mendalam Akar Masalah Masalah Onboarding Checklist

### 6.1 Apakah Ikon Raksasa dan Teks Terjepit Berakar Sama?
**Jawaban Tegas: YA, KEDUANYA BERAKAR PADA SATU AKAR MASALAH CSS YANG PERSIS SAMA.**

Berikut adalah pembuktian teknis mekanismenya berdasarkan inspeksi DevTools dan komputasi style browser:

1. **Struktur Markup HTML (`src/frontend/js/pages/dashboard.js:44-48`):**
   ```html
   <a class="list-item clickable" href="${href}">
     <div class="avatar">${icon(ico)}</div>
     <div class="grow"><div class="title">${t}</div><div class="meta">${s}</div></div>
     ${icon('chevronRight')}
   </a>
   ```
2. **Aturan CSS yang Berlaku di `src/frontend/css/style.css`:**
   * Baris 54: `img, svg { display: block; }` *(hanya display, TIDAK ADA width/height default!)*
   * Baris 143: `.grow { flex: 1; min-width: 0; }`
   * Baris 235: `.list-item { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--border); min-width: 0; }`
   * Baris 237: `.list-item .avatar { width: 40px; height: 40px; flex: none; }`
   * Baris 238: `.list-item .avatar svg { width: 20px; height: 20px; }` *(hanya svg di dalam .avatar yang dibatasi ukurannya!)*
   * Baris 239: `.list-item .title { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }`
   * Baris 240: `.list-item .meta { font-size: 12.5px; color: var(--muted); }`
3. **Mekanisme Kegagalan Flexbox:**
   * Elemen `${icon('chevronRight')}` dirender sebagai `<svg class="" viewBox="0 0 24 24" ...>`. Elemen ini merupakan anak langsung (*direct child*) dari kontainer flex `.list-item`.
   * Karena tidak ada kelas CSS khusus untuk chevron pada baris tersebut dan tidak ada aturan `.list-item > svg`, browser Blink/WebKit memperlakukan SVG sebagai item flex dengan `flex-grow: 0`, `flex-shrink: 1`, dan `flex-basis: auto`.
   * Berdasarkan spesifikasi W3C CSS Flexible Box Layout dan SVG viewBox aspect ratio (1:1), SVG tanpa batasan `width` dalam container flex akan meregang (*stretch*) dan menggunakan tinggi/lebar container yang tersedia untuk mempertahankan rasio 1:1.
   * Karena `.grow` memiliki aturan `min-width: 0; flex: 1;`, flex layout engine browser mempersempit `.grow` hingga titik minimalnya (**lebar 0 px**, terkonfirmasi pada log `audit_data.json: growRect.width: 0px`) demi memberi ruang bagi SVG yang tidak dibatasi.
   * Akibatnya:
     * Elemen SVG chevron meregang maksimal hingga mengisi ruang kartu (**870×870 px** di desktop 1280 px).
     * Elemen `.title` ("Daftarkan bahan baku") yang memiliki `white-space: nowrap; overflow: hidden` terpotong habis menjadi 0 px sehingga judul langkah lenyap dari pandangan.
     * Elemen `.meta` ("Nama, satuan, kategori...") yang tidak memakai nowrap terpaksa memecah kata per baris membentuk kolom vertikal tipis.

---

## 7. Rekomendasi Solusi Teknis untuk Tugas Berikutnya (T-9.2 s/d T-9.5)

### 7.1 Solusi Global Ikon dan Tata Letak (T-9.2)
Perbaikan harus dilakukan di **lapisan inti CSS terpusat (`src/frontend/css/style.css`)**, BUKAN menambal per halaman:
1. **Aturan Global Ukuran Bawaan SVG (`style.css:54`):**
   Tambahkan aturan default untuk seluruh ikon SVG aplikasi:
   ```css
   svg {
     display: block;
     width: 1.25rem;  /* 20px */
     height: 1.25rem;
     flex-shrink: 0;
   }
   ```
2. **Aturan Spesifik `.list-item > svg`:**
   Pastikan ikon panah penunjuk (chevron) pada komponen daftar selalu terkunci:
   ```css
   .list-item > svg {
     width: 20px;
     height: 20px;
     color: var(--muted);
     flex: none;
   }
   ```
3. **Pola Flex Kontainer Teks (`.grow`):**
   Pertahankan `.grow { flex: 1; min-width: 0; }` agar judul dan teks panjang dapat terpotong ellipsis secara rapi tanpa merusak tata letak.

### 7.2 Solusi Komponen Bersama & Responsivitas Tabel (T-9.3 & T-9.5)
* Pada kontainer tabel (`.table-wrap`), pastikan `overflow-x: auto; -webkit-overflow-scrolling: touch; display: block; width: 100%;` aktif dengan lebar minimum tabel pada kolom agar di layar 390 px tabel dapat digulir horizontal secara mandiri tanpa menekan kolom teks di bawah batas minimal 120 px.
* Modal: pastikan event listener Escape dan tombol `[data-close]` konsisten menutup backdrop.

---

## 8. Verifikasi Kriteria Selesai T-9.1

1. [x] Berkas `tests/e2e/ui_check.js` telah dibuat dan teruji berfungsi di konsol browser.
2. [x] Seluruh 14 halaman telah dikunjungi dan ditangkap tangkapan layarnya pada 3 ukuran lebar (1280, 768, 390 px) menggunakan Akun A yang terisi data lengkap (42 screenshot utama).
3. [x] Tampilan *empty state* pada halaman yang bergantung data (Beranda, Bahan, Menu, Riwayat, Forecast, Rekomendasi, Evaluasi) telah diperiksa pada Akun B kosong (termasuk 3 variasi lebar layar pada checklist onboarding).
4. [x] Seluruh dialog modal utama (Quick Actions FAB, Tambah Bahan, Tambah Menu, Tambah Event, Feedback) telah dibuka dan ditinjau tangkapan layarnya.
5. [x] Analisis akar masalah teknis untuk chevron raksasa dan teks terjepit telah dibuktikan secara mekanis (berakar sama).
6. [x] Dokumen `docs/UI_AUDIT.md` telah memuat seluruh data temuan, bukti screenshot, dan rujukan file/baris kode.
7. [x] **Lapisan frontend `src/frontend/` sama sekali tidak disentuh atau diubah** selama pengerjaan T-9.1.
