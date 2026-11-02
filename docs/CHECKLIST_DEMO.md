# Checklist Demonstrasi 13 Use Case StockWise (PRD UC-01 s/d UC-13)

Dokumen ini mencatat hasil pengujian interaktif menyeluruh melalui antarmuka web (browser Google Chrome via CDP) dan endpoint FastAPI untuk membuktikan kepatuhan fungsional seluruh 13 *Use Case* sesuai [PRD.md](PRD.md) dan kriteria tugas **T-10.5** pada [TASK_BREAKDOWN.md](TASK_BREAKDOWN.md).

---

## 1. Tabel Status Pengujian 13 Use Case

| UC | Nama Fitur | Langkah Pengujian | Hasil yang Diharapkan | Hasil Aktual | Status | Bukti (Screenshot / Keluaran) |
|---|---|---|---|---|:---:|---|
| **UC-01** | Register dan Sign In | 1. Buka `http://localhost:5173/#/login`<br>2. Masukkan email `demo@stockwise.id` & sandi `Demo1234!`<br>3. Klik "Masuk"<br>4. Periksa cookie sesi dan sidebar | Login sukses, diarahkan ke dashboard, sidebar menampilkan nama usaha, cookie `access_token` berstatus `HttpOnly` | Login sukses, sidebar menampilkan `SW \| Dapur Katering Berkah \| Freemium`, cookie `access_token` berstatus HttpOnly `true`. | **PASS** | `demo_uc01_login.png` |
| **UC-02** | Atur profil usaha dan bahan | 1. Buka `#/bahan`<br>2. Periksa daftar master 5 bahan baku, kategori (segar/tahan lama), stok minimal, dan harga<br>3. Buka `#/menu` untuk resep produk | Master data tersimpan terisolasi per akun, klasifikasi bahan segar dan tahan lama valid, resep per porsi terdaftar | Master 5 bahan (Daging Ayam, Beras, Minyak Goreng, Bawang Merah, Cabai Merah) tampil lengkap dengan umur simpan dan resep menu Ayam Bakar & Nasi Goreng. | **PASS** | `demo_uc02_bahan_menu.png` |
| **UC-03** | Input penjualan dan stok | 1. Buka `#/stok-masuk`, input pembelian 5 kg Daging Ayam @ Rp38.000, submit form<br>2. Buka `#/penjualan`, input manual 3 porsi Ayam Bakar, klik simpan | Stok masuk menambah batch aktif baru; penjualan manual memotong batch stok terlama berdasarkan prinsip FEFO | Pembelian 5 kg ayam tercatat di batch aktif, penjualan 3 porsi ayam tercatat dan memotong stok via FEFO. Diarahkan ke riwayat transaksi dengan toast konfirmasi. | **PASS** | `demo_uc03_input_penjualan_stok.png` |
| **UC-04** | Import data Excel | 1. Buka `#/import`<br>2. Klik tombol "Unduh templat (.xlsx)"<br>3. Unggah file Excel `/tmp/sales_import_demo.xlsx`<br>4. Periksa hasil parsing in-memory | Template resmi berhasil diunduh dari `/api/v1/sales/template`. File diunggah dan diparsing in-memory via openpyxl tanpa external storage | Template Excel berhasil diunduh, berkas `.xlsx` diparsing in-memory, badge hijau "1 baris berhasil diimpor" tampil di kartu Hasil Impor. | **PASS** | `demo_uc04_import_excel.png` |
| **UC-05** | Lihat forecast kebutuhan | 1. Buka `#/forecast`<br>2. Periksa periode peramalan 7 hari ke depan<br>3. Periksa rentang nilai `need_lo` s/d `need_hi` untuk tiap bahan baku | Menampilkan proyeksi kebutuhan bahan baku dalam interval kepercayaan minimal s/d maksimal | Proyeksi 7 hari tampil dalam rentang: Daging Ayam 146,45 kg (142,66–150,24 kg), Beras 143,72 kg (140,64–146,79 kg), dsb. Cocok 100% dengan respons API `/forecast`. | **PASS** | `demo_uc05_forecast.png` |
| **UC-06** | Lihat rekomendasi pembelian | 1. Buka `#/rekomendasi`<br>2. Periksa kartu Daging Ayam pada status data awal makalah | Rekomendasi beli bersih = kebutuhan forecast besok dikurangi stok layak pakai. Kasus acuan makalah: kebutuhan 18–22 kg, stok 5 kg menghasilkan beli 13–17 kg | Kebutuhan besok 19,81 kg (18,45–21,16 kg), stok layak pakai 5,0 kg, menghasilkan rekomendasi beli 15,0 kg (13,5–16,5 kg) dengan estimasi biaya Rp570.000. | **PASS** | `demo_uc06_rekomendasi_ayam.png` |
| **UC-07** | Waste Risk Score | 1. Buka `#/rekomendasi`<br>2. Klik filter chip "Waste Risk"<br>3. Periksa kartu peringatan Cabai Merah | Forward simulation FEFO 60 hari mendeteksi potensi limbah dan menampilkan kategori risiko (rendah/sedang/tinggi) serta saran tindakan | Cabai Merah terdeteksi memiliki Waste Risk Score "Sedang" (13% berpotensi terbuang, potensi rugi Rp32.004) disertai saran "Dahulukan pemakaian Cabai Merah". | **PASS** | `demo_uc07_waste_risk_score.png` |
| **UC-08** | Hitung forecast | 1. Buka `#/event`<br>2. Periksa daftar event "Tanggal Gajian" (+20%) dan "Libur Nasional" (+30%)<br>3. Periksa tab Mendatang & Sudah lewat | Model time-series exponential smoothing memperhitungkan faktor hari dan event multiplier yang dipelajari dari riwayat | Event berulang terdaftar dengan dampak pengali (+20% gajian, +30% hari besar). Algoritma menghitung level smoothing dan faktor musiman secara adaptif. | **PASS** | `demo_uc08_event_forecast.png` |
| **UC-09** | Pantau dashboard inventory | 1. Buka `#/dashboard`<br>2. Periksa 4 kartu KPI, grafik tren penjualan SVG, dan kartu kapasitas porsi produk | Dashboard menyajikan metrik master data, kebutuhan belanja, limbah bulan ini, tren penjualan, dan porsi menu yang dapat dibuat | Dashboard menyajikan 4 kartu KPI (Master Data: 2 menu, 5 bahan; Perlu Dibeli; Waste Risk; Limbah Bulan Ini), grafik SVG tren penjualan, dan kapasitas porsi (142 porsi ayam, 449 porsi nasgor). | **PASS** | `demo_uc09_dashboard.png` |
| **UC-10** | Lihat riwayat transaksi | 1. Buka `#/riwayat` untuk melihat riwayat penjualan historis 90+ hari<br>2. Buka `#/evaluasi` untuk memeriksa metrik akurasi WAPE | Transaksi historis bersih tampil dengan pagination dan filter; model terbukti akurat dengan WAPE rendah pada data latih | Riwayat penjualan 90+ hari (63+ transaksi terkelompok) tersaji rapi. Halaman evaluasi menunjukkan Akurasi Model 97,5% (WAPE 2,5%, parameter alpha 0.2). | **PASS** | `demo_uc10_riwayat_transaksi.png`, `demo_uc10_evaluasi_wape.png` |
| **UC-11** | Berlangganan paket Pro | 1. Buka `#/langganan`<br>2. Klik tombol "Tingkatkan ke Pro (Simulasi)"<br>3. Konfirmasi modal checkout simulasi | Paket akun langsung aktif menjadi StockWise Pro tanpa payment gateway eksternal, badge PRO muncul, kuota unlimited | Akun berhasil di-upgrade ke StockWise Pro (Rp100.000/bulan) via simulasi, badge PRO aktif di header & navigasi, riwayat pembayaran tercatat Lunas (Simulasi). | **PASS (simulasi)** | `demo_uc11_upgrade_pro.png` |
| **UC-12** | Kelola akun dan feedback | 1. Buka `#/feedback`, beri rating 5 bintang, isi pesan masukan, klik kirim<br>2. Registrasi akun sekali pakai (`disposable_*@stockwise.id`)<br>3. Buka `#/hapus-akun`, masukkan sandi & konfirmasi "HAPUS", klik hapus akun | (a) Pesan feedback tersimpan di basis data (simulasi feedback).<br>(b) Hapus akun mandiri menghapus user beserta seluruh data relasional via CASCADE dan mengakhiri sesi | (a) Feedback 5 bintang berhasil terkirim ke database.<br>(b) Akun disposable berhasil dihapus permanen via endpoint `DELETE /users/me`, sesi langsung diarahkan kembali ke login. | **PASS (simulasi feedback)** | `demo_uc12_kelola_akun_feedback.png`, `demo_uc12_hapus_akun_form.png`, `demo_uc12_hapus_akun_disposable.png` |
| **UC-13** | Sinkronisasi data via API | 1. Login akun Pro, buka `#/integrasi`<br>2. Hubungkan penyedia MokaPOS<br>3. Klik "Sinkronkan Sekarang" | Pengguna Pro dapat menghubungkan POS pihak ketiga dan generator mock menyuntikkan pesanan secara otomatis | Kanal MokaPOS berhasil terhubung; sinkronisasi menyuntikkan 8 transaksi baru ke riwayat penjualan dengan toast "8 pesanan berhasil disinkronkan dari mokapos". | **PASS (simulasi)** | `demo_uc13_sinkronisasi_mokapos.png` |

---

## 2. Perbandingan Angka di Layar vs Respons API (UC-05 & UC-06)

### A. Peramalan Kebutuhan Bahan (UC-05) - Horizon 7 Hari
| Bahan Baku | Satuan | Respons API `GET /api/v1/forecast?days=7` | Nilai di Layar UI (`#/forecast`) | Kesesuaian |
|---|:---:|---|---|:---:|
| **Daging Ayam** | kg | `total_need`: 146.4529, `need_lo`: 142.6623, `need_hi`: 150.2436 | Estimasi: **146,45 kg**, Rentang: **142,66 – 150,24 kg** | **IDENTIK** |
| **Beras** | kg | `total_need`: 143.7151, `need_lo`: 140.6411, `need_hi`: 146.7891 | Estimasi: **143,72 kg**, Rentang: **140,64 – 146,79 kg** | **IDENTIK** |
| **Cabai Merah** | kg | `total_need`: 13.1397, `need_lo`: 12.8582, `need_hi`: 13.4211 | Estimasi: **13,14 kg**, Rentang: **12,86 – 13,42 kg** | **IDENTIK** |
| **Bawang Merah** | kg | `total_need`: 18.5461, `need_lo`: 18.1496, `need_hi`: 18.9426 | Estimasi: **18,55 kg**, Rentang: **18,15 – 18,94 kg** | **IDENTIK** |
| **Minyak Goreng** | liter | `total_need`: 26.2793, `need_lo`: 25.7163, `need_hi`: 26.8423 | Estimasi: **26,28 liter**, Rentang: **25,72 – 26,84 liter** | **IDENTIK** |

### B. Rekomendasi Pembelian Kasus Makalah Daging Ayam (UC-06)
| Parameter Kasus Makalah | Target Ilustrasi Makalah | Respons API `GET /api/v1/recommendations` (Data Awal Seed) | Nilai di Layar UI (`#/rekomendasi`) | Kesesuaian |
|---|---|---|---|:---:|
| **Kebutuhan Besok ($T+1$)** | 18 – 22 kg | `need`: 19.81 kg (`need_lo`: 18.45 kg, `need_hi`: 21.16 kg) | **18,5 – 21,2 kg** | **MEMENUHI TARGET** |
| **Stok Layak Pakai** | 5 kg | `stock_start`: 5.0 kg | **5 kg** | **IDENTIK** |
| **Rekomendasi Beli Bersih** | 13 – 17 kg | `buy`: 15.0 kg (`buy_lo`: 13.5 kg, `buy_hi`: 16.5 kg) | **13,5 – 16,5 kg** (input beli: **15 kg**) | **MEMENUHI TARGET** |
| **Estimasi Biaya Beli** | Sesuai harga satuan | `buy_cost`: Rp570.000 (15 kg × Rp38.000) | **Rp570.000** | **IDENTIK** |

---

## 3. Catatan Integritas dan Keamanan Demo
1. **Pengujian Hapus Akun (UC-12):** Dilakukan menggunakan akun sekali pakai (`disposable_*@stockwise.id`), sehingga akun utama demonstrasi `demo@stockwise.id` tetap aman dan aktif.
2. **Fitur Simulasi:** Pembayaran Pro (UC-11), feedback (UC-12), dan sinkronisasi MokaPOS (UC-13) berstatus `PASS (simulasi)` sesuai ketentuan TRD dan PRD tanpa integrasi ke sistem eksternal berbayar.
3. **Reset Data Demo:** Untuk mengembalikan data akun demo ke kondisi awal bersih sebelum pengujian interaktif berikutnya, jalankan perintah:
   ```bash
   docker compose -f deploy/compose/docker-compose.dev.yml run --rm api python -m app.seed
   ```
