# Product Requirement Document (PRD)
# StockWise: Aplikasi Prediksi Stok dan Potensi Barang Terbuang untuk UMKM F&B

---

## Informasi Dokumen
* **Nama Produk:** StockWise
* **Tagline:** *"Know what and how much to stock before it becomes waste"*
* **Versi Dokumen:** 1.0.0
* **Status:** Final Product Requirements
* **Penyusun:** Adriano Deshon, Heru Purnomo, Melvyn Benaya Wijaya, Mika Valentino, Adidtiya Kurniawan
* **Fokus Dokumen:** Definisi Produk, Kebutuhan Bisnis, Alur Pengguna, dan Spesifikasi Fungsional (Pure PRD)

---

## 1. Ringkasan Produk dan Latar Belakang

StockWise adalah aplikasi berbasis web yang memprediksi kebutuhan stok bahan baku dan potensi barang terbuang bagi UMKM *food & beverage* (F&B). Sesuai *tagline* aplikasi ini, yaitu *"Know what and how much to stock before it becomes waste"*, StockWise membantu pemilik usaha mengetahui bahan apa dan berapa banyak yang perlu dibeli sebelum stok berlebih berubah menjadi sampah. Bisnis ini dipilih karena Bappenas (2021) memperkirakan *food loss and waste* di Indonesia sepanjang 2000–2019 mencapai 23–48 juta ton per tahun, dengan potensi kerugian Rp213–551 triliun per tahun, di mana sebagian sisa tersebut muncul ketika usaha kecil membeli bahan melebihi kebutuhan. Kehadiran StockWise memberikan manfaat yang berjalan dua arah, yaitu UMKM dapat menghemat modal dan makanan yang terbuang berkurang.

Banyak UMKM F&B masih berbelanja bahan berdasarkan perkiraan pemilik dan catatan manual. Permintaan pada hari tertentu, seperti menjelang Lebaran atau setelah tanggal gajian, sulit ditebak, sementara usaha kecil tidak memiliki tim peramalan. Akibatnya, bahan rusak sebelum diolah, makanan yang tidak laku terbuang, dan modal kerja tertahan dalam bentuk stok.

Untuk menyelesaikan masalah tersebut, StockWise mengolah riwayat penjualan, baik dari input manual, impor Excel, maupun API, menjadi rekomendasi pembelian. Model *time-series* mempelajari pola harian, mingguan, dan hari khusus untuk menghasilkan perkiraan seperti "kebutuhan ayam hari Jumat sekitar 18–22 kg". Jika stok berpotensi berlebih, sistem menampilkan *Waste Risk Score* berkategori rendah, sedang, atau tinggi, sehingga pengguna dapat mengetahui risiko terjadinya pembuangan bahan dan mencegahnya.

---

## 2. Tujuan dan Metrik Keberhasilan

Tujuan produk StockWise adalah membantu UMKM F&B mengoptimalkan pengadaan stok bahan baku, menghindari modal tertahan, dan mencegah terjadinya pembuangan makanan. Metrik keberhasilan produk diukur melalui indikator kunci yang tercantum pada *Lean Canvas* (*Key Metrics*) serta dua metrik utama pada evaluasi model bisnis (akurasi peramalan dan pengurangan *waste*):

| Tujuan | Metrik | Cara Mengukur | Target |
|---|---|---|---|
| Memastikan adopsi dan keaktifan penggunaan aplikasi dalam operasional harian UMKM F&B. | Pengguna aktif | Menghitung jumlah akun UMKM F&B yang aktif menginput data penjualan/stok dan mengakses rekomendasi pembelian. | Target perlu ditentukan |
| Mengukur keberhasilan monetisasi saat transaksi UMKM bertumbuh atau beralih ke otomatisasi. | Konversi Freemium ke Pro | Menghitung persentase pengguna paket Freemium yang meningkatkan paket ke Pro (Rp100.000/bulan). | Target perlu ditentukan |
| Memastikan loyalitas pengguna jangka panjang dan meminimalkan pengguna yang berhenti memakai aplikasi. | Retention dan churn | Menghitung persentase pengguna yang tetap aktif menggunakan aplikasi (*retention*) serta persentase pengguna yang berhenti memakai layanan (*churn*). | Target perlu ditentukan |
| Menghasilkan prediksi kebutuhan stok yang andal agar pemilik usaha tidak lagi berbelanja berdasarkan tebak-tebakan. | Akurasi forecast | Membandingkan selisih antara penjualan aktual dengan hasil peramalan pada periode berikutnya. | Target perlu ditentukan |
| Membantu UMKM menghemat modal usaha dan menekan volume bahan makanan yang terbuang. | Pengurangan waste | Membandingkan tingkat bahan baku yang terbuang/rusak sebelum dan sesudah menerapkan rekomendasi pembelian berbasis *Waste Risk Score*. | Target perlu ditentukan |
| Memantau pertumbuhan pendapatan berulang yang menjadi sumber pemasukan utama bisnis. | Monthly Recurring Revenue (MRR) | Menghitung total akumulasi pendapatan rutin bulanan dari biaya langganan aktif paket Pro. | Target perlu ditentukan |

---

## 3. Target Pengguna dan Persona

Sesuai Bab 1 Bagian B.1 pada makalah, StockWise menyasar UMKM *food & beverage* (F&B) yang bergantung pada bahan baku mudah rusak (seperti sayuran, daging, dan bumbu), tetapi tidak memiliki tim inventaris maupun tim IT. Sasaran pengguna dibagi ke dalam dua segmen utama serta kelompok pengguna awal (*early adopter*).

### 3.1 Segmen Pengguna
1. **Usaha Katering:**
   * Memiliki jumlah pesanan yang naik turun mengikuti jadwal acara dan musim.
   * Kesalahan dalam menghitung porsi dapat menyisakan bahan segar dalam jumlah besar yang cepat rusak, atau sebaliknya membuat bahan baku kurang ketika pesanan melonjak.
2. **Warung dan Rumah Makan:**
   * Membeli bahan segar hampir setiap hari dengan tingkat penjualan yang berubah dari hari ke hari (misalnya lebih ramai pada akhir pekan atau setelah tanggal gajian).
   * Pengelolaan operasional dan pengadaan bahan umumnya dipegang langsung oleh pemilik yang masih berbelanja berdasarkan perkiraan.

### 3.2 Karakter Early Adopter
Pengguna awal (*early adopter*) yang dituju adalah UMKM dengan kriteria berikut:
* Memiliki volume transaksi harian yang cukup tinggi.
* Masih mencatat stok secara manual di buku atau menggunakan spreadsheet Excel.
* Sering mengalami kelebihan stok (*overstock*).
* **Alasan Pemilihan:** Kelompok ini paling merasakan kerugian akibat bahan terbuang sehingga kebutuhan solusi terasa mendesak; volume transaksinya memadai untuk dijadikan data historis agar hasil peramalan lebih cepat akurat; dan kebiasaan mencatat yang sudah ada memudahkan mereka beralih ke StockWise.

### 3.3 Persona Pengguna dan User Stories

#### Persona 1: Usaha Katering
* **Nama Persona:** Bu Dewi (Pemilik Usaha Katering)
* **Segmen:** Usaha Katering
* **Kebiasaan:**
  * Menerima pesanan katering porsi besar untuk acara keluarga, hajatan, atau konsumsi kantor musiman.
  * Berbelanja bahan baku dalam jumlah banyak beberapa hari menjelang acara.
  * Mencatat pesanan menu dan perkiraan belanja di buku catatan atau spreadsheet Excel sederhana.
* **Kendala:**
  * Sulit menakar porsi belanja secara presisi karena pesanan naik turun mengikuti musim acara.
  * Sering menyisakan bahan segar (sayur, daging, bumbu) dalam jumlah banyak yang membusuk jika acara sepi, atau kekurangan bahan saat pesanan mendadak naik.
  * Tidak memiliki tim IT maupun tim inventaris tersendiri.
* **Kebutuhan:**
  * Estimasi kebutuhan bahan baku per menu dalam bentuk rentang agar fleksibel menghadapi dinamika pesanan.
  * Jadwal belanja yang membedakan bahan segar (periode pendek/harian) dan bahan tahan lama (mingguan/bulanan).
  * Peringatan dini potensi bahan terbuang (*Waste Risk Score*) untuk mendahulukan pemakaian bahan sisa sebelum kedaluwarsa.
* **User Stories:**
  1. *Sebagai pemilik usaha katering, saya ingin melihat perkiraan kebutuhan bahan baku per menu dalam bentuk rentang agar saya tidak salah memperhitungkan porsi saat volume pesanan katering sedang naik atau turun.*
  2. *Sebagai pemilik usaha katering, saya ingin sistem membedakan rekomendasi pembelian bahan segar (harian) dan bahan tahan lama (mingguan/bulanan) agar jadwal belanja lebih efisien dan bahan segar tidak membusuk di gudang.*
  3. *Sebagai pemilik usaha katering, saya ingin melihat Waste Risk Score saat stok bahan berpotensi berlebih agar saya dapat segera mendahulukan pemakaian bahan yang berisiko rusak sebelum tanggal kedaluwarsa.*

#### Persona 2: Warung dan Rumah Makan
* **Nama Persona:** Pak Budi (Pemilik Warung Makan)
* **Segmen:** Warung dan Rumah Makan
* **Kebiasaan:**
  * Berbelanja bahan baku segar ke pasar subuh hampir setiap hari secara langsung.
  * Menentukan jumlah barang yang dibeli hanya mengandalkan perkiraan pribadi dan ingatan.
  * Mencatat penjualan dan pengeluaran secara manual pada buku nota kasir atau kertas harian.
* **Kendala:**
  * Penjualan harian berubah-ubah (lebih ramai pada akhir pekan atau setelah tanggal gajian) sehingga tebakan belanja sering meleset.
  * Kerap mengalami kelebihan stok bahan segar yang rusak sebelum sempat diolah, sehingga makanan tidak laku terbuang dan modal tertahan dalam bentuk stok.
  * Tidak memiliki waktu luang maupun keahlian analisis peramalan data yang rumit.
* **Kebutuhan:**
  * Kemudahan mencatat penjualan harian secara manual atau mengimpor data lewat file Excel.
  * Sistem cerdas yang mampu mengenali pola hari ramai (akhir pekan dan tanggal gajian) serta momen hari khusus (seperti menjelang Lebaran).
  * Rekomendasi jumlah pembelian bersih yang otomatis memperhitungkan sisa stok layak pakai yang masih ada di warung.
* **User Stories:**
  1. *Sebagai pemilik warung makan, saya ingin mencatat penjualan harian secara manual atau mengimpor file Excel agar riwayat penjualan saya dapat dipelajari oleh model peramalan sistem.*
  2. *Sebagai pemilik warung makan, saya ingin sistem membaca pola hari ramai (akhir pekan dan tanggal gajian) serta hari khusus (seperti menjelang Lebaran) agar stok bahan tidak habis saat penjualan ramai.*
  3. *Sebagai pemilik warung makan, saya ingin melihat rekomendasi jumlah bahan yang perlu dibeli berdasarkan selisih kebutuhan ramalan dengan sisa stok layak pakai agar modal usaha tidak tertahan dalam bentuk stok berlebih.*

---

## 4. Ruang Lingkup (Scope)

Ruang lingkup produk StockWise didefinisikan berdasarkan *Use Case Diagram* (UC-01 s/d UC-13) dan tahapan *Business Process* utama pada makalah:

### 4.1 In Scope (Fitur yang Dikerjakan)
1. **Registrasi dan Pengaturan Awal Usaha (UC-01, UC-02, UC-12):**
   * Pendaftaran akun baru dan login (*sign in*).
   * Pengaturan profil usaha (pilihan jenis usaha: katering, warung, rumah makan).
   * Pengaturan master bahan baku, satuan (kilogram, liter, buah, dll.), dan pengelompokan kategori (segar atau tahan lama).
   * Pengaturan komposisi bahan (resep) untuk setiap menu produk.
   * Pengelolaan profil akun, penghapusan akun, dan pengiriman umpan balik (*feedback*) *(disimulasikan pada versi tugas: form sederhana yang menyimpan teks)*.
2. **Pencatatan dan Pengumpulan Data Transaksi (UC-03, UC-04, UC-10):**
   * Input manual penjualan harian dan stok bahan baku.
   * Unggah riwayat penjualan dan persediaan menggunakan template Excel StockWise.
   * Validasi format tanggal, satuan, dan kelengkapan data sebelum disimpan.
   * Penyimpanan dan penayangan riwayat transaksi bersih yang sekaligus berfungsi sebagai data latih model.
3. **Peramalan Kebutuhan Stok (UC-05, UC-08):**
   * Perhitungan kebutuhan bahan menggunakan model *time-series* berdasarkan riwayat penjualan, pola harian dan mingguan, serta label hari khusus.
   * Konversi hasil prediksi penjualan produk menjadi kebutuhan bahan berdasarkan komposisi resep.
   * Peramalan adaptif sesuai kategori bahan: harian untuk bahan segar, mingguan atau bulanan untuk bahan tahan lama.
   * Penyajian hasil ramalan dalam bentuk rentang nilai (misalnya: estimasi kebutuhan ayam hari Jumat: 18–22 kg).
4. **Rekomendasi Pembelian dan Penilaian Risiko Limbah (UC-06, UC-07):**
   * Rekomendasi kuantitas pembelian bahan bersih (estimasi kebutuhan dikurangi stok yang masih layak pakai).
   * Penilaian *Waste Risk Score* berkategori rendah, sedang, atau tinggi yang muncul saat stok berpotensi berlebih sebelum kedaluwarsa.
   * Informasi saran untuk mengurangi kuantitas pembelian atau mendahulukan pemakaian bahan yang berisiko.
5. **Pemantauan Dashboard Inventaris (UC-09):**
   * Grafik visual pergerakan stok dan tren penjualan.
   * Perhitungan otomatis jumlah porsi produk yang masih dapat dibuat dari persediaan stok saat ini.
6. **Evaluasi dan Pembelajaran Model (Tahap 6):**
   * Evaluasi selisih penjualan aktual terhadap hasil ramalan untuk mengukur akurasi *forecasting* dan tingkat pengurangan *waste*.
   * Pelatihan ulang (*retrain*) parameter model secara berkala menggunakan data aktual terbaru.
7. **Paket Langganan dan Integrasi API (UC-11, UC-13):**
   * Peningkatan paket dari Freemium (kuota 300 transaksi/bulan) ke paket Pro (Rp100.000/bulan) tanpa batasan transaksi *(disimulasikan pada versi tugas: tombol upgrade Pro hanya mengubah status paket, tanpa gateway pembayaran)*.
   * Penarikan data transaksi otomatis via API dari sistem POS (MokaPOS) dan platform pesan antar *merchant* (GoFood, Grab, Shopee Partner) khusus untuk pengguna paket Pro *(disimulasikan pada versi tugas: memakai data contoh/mock, bukan koneksi API sungguhan)*.

### 4.2 Out of Scope (Di Luar Ruang Lingkup Rilis Awal)
Beberapa hal yang wajar tidak dikerjakan di rilis awal (MVP) dan diusulkan untuk fase lanjutan:
1. **Integrasi Gerbang Pembayaran Otomatis Riil (Payment Gateway):** Pembayaran langganan paket Pro (UC-11) disimulasikan pada versi tugas, di mana tombol upgrade Pro hanya mengubah status paket menjadi Pro tanpa gateway pembayaran perbankan riil (seperti Midtrans atau Xendit).
2. **Koneksi API Eksternal Riil:** Sinkronisasi API (UC-13) disimulasikan pada versi tugas dengan memakai data contoh (*mock*), bukan koneksi API sungguhan ke server penyedia pihak ketiga (MokaPOS, GoFood, Grab, dan Shopee Partner).
3. **Modul Kasir (Point of Sale) & Cetak Struk Belanja:** Sistem tidak berfungsi sebagai mesin kasir di meja pembayaran dan tidak mendukung pencetakan fisik struk kasir melalui printer thermal `[usulan, perlu dikonfirmasi tim]`.
4. **Pengelolaan Multi-Cabang / Multi-Outlet:** Sistem belum mendukung konsolidasi persediaan bahan terpusat untuk pemilik yang memiliki banyak cabang usaha; setiap akun diasumsikan mengelola satu gerai/dapur `[usulan, perlu dikonfirmasi tim]`.
5. **Pemesanan Otomatis ke Pemasok Bahan Baku (Supplier Procurement):** Pengiriman purchase order otomatis langsung ke distributor atau platform e-commerce pangan grosir belum didukung `[usulan, perlu dikonfirmasi tim]`.
6. **Notifikasi Pesan Otomatis (WhatsApp / SMS Gateway):** Pengiriman pesan notifikasi belanja atau peringatan kedaluwarsa otomatis via WhatsApp/SMS belum tersedia; pengguna memantau langsung melalui antarmuka web PWA `[usulan, perlu dikonfirmasi tim]`.
7. **Sistem Tiket / Notifikasi Feedback Eksternal:** Form feedback (UC-12) disimulasikan pada versi tugas sebagai form sederhana yang langsung menyimpan teks ke basis data tanpa integrasi layanan helpdesk eksternal.

---

## 5. Kebutuhan Fungsional

Kebutuhan fungsional StockWise diturunkan dari 13 *use case* pada Tabel 2 dan model operasional bisnis pada Bab 1 makalah. Prioritas setiap kebutuhan dikelompokkan menggunakan metode MoSCoW (*Must Have, Should Have, Could Have, Won't Have* untuk rilis awal).

### 5.1 Matriks Kebutuhan Fungsional (UC-01 sampai UC-13)

| Kode | Nama Fitur | Deskripsi | Aktor | Prioritas (MoSCoW) | Acceptance Criteria (Dapat Diuji) |
|:---|:---|:---|:---|:---|:---|
| **UC-01** | Register dan Sign In | Membuat akun baru dan masuk ke aplikasi. | Pemilik UMKM | **Must Have** | 1. Pengguna dapat mendaftarkan akun baru dengan data yang valid.<br>2. Pengguna terdaftar dapat masuk menggunakan kredensial email dan kata sandi yang sesuai.<br>3. Sistem menampilkan pesan kesalahan jika data tidak sesuai dan sesi login tersimpan aman via cookie `HttpOnly` (access token 15 menit, refresh token 7 hari).<br>4. Endpoint dilindungi rate limiting maksimal 5 request per 1 menit per alamat IP. |
| **UC-02** | Atur profil usaha dan bahan | Mengisi jenis usaha, daftar bahan baku beserta satuannya, kategori bahan (segar atau tahan lama), serta komposisi bahan untuk setiap produk. | Pemilik UMKM | **Must Have** | 1. Pengguna dapat memilih jenis usaha (`katering`, `warung`, atau `rumah_makan`).<br>2. Pengguna dapat mendaftarkan bahan baku beserta satuan ukurnya (misal: kilogram, liter, buah).<br>3. Pengguna dapat menetapkan kategori bahan (`segar` atau `tahan_lama`).<br>4. Pengguna dapat mengisi takaran komposisi bahan baku (resep) yang dibutuhkan untuk setiap porsi menu produk. |
| **UC-03** | Input penjualan dan stok | Mencatat penjualan harian dan stok bahan secara manual. | Pemilik UMKM | **Must Have** | 1. Pengguna dapat memasukkan jumlah porsi penjualan menu harian secara manual.<br>2. Pengguna dapat mencatat stok bahan yang masuk (pembelian) maupun bahan yang rusak/terbuang.<br>3. Data tersimpan sesuai tanggal transaksi dan memperbarui sisa stok persediaan. |
| **UC-04** | Import data Excel | Mengunggah riwayat penjualan dan persediaan menggunakan templat Excel StockWise. | Pemilik UMKM | **Must Have** | 1. Pengguna dapat mengunduh templat resmi Excel StockWise.<br>2. Pengguna dapat mengunggah berkas Excel yang sudah terisi.<br>3. Sistem secara otomatis memvalidasi format tanggal, konsistensi satuan, dan kelengkapan kolom sebelum menyimpan data transaksi secara massal. |
| **UC-05** | Lihat forecast kebutuhan | Melihat perkiraan kebutuhan setiap bahan untuk periode berikutnya. Mencakup (*include*) UC-08. | Pemilik UMKM | **Must Have** | 1. Sistem menampilkan proyeksi kebutuhan setiap bahan untuk periode berikutnya.<br>2. Periode peramalan adaptif sesuai kategori: harian untuk bahan segar, serta mingguan atau bulanan untuk bahan tahan lama.<br>3. Hasil peramalan disajikan dalam bentuk **rentang nilai** (contoh: "estimasi kebutuhan ayam hari Jumat: 18–22 kg") agar pengguna melihat tingkat ketidakpastiannya. |
| **UC-06** | Lihat rekomendasi pembelian | Melihat jumlah bahan yang perlu dibeli. Mencakup (*include*) UC-08. | Pemilik UMKM | **Must Have** | 1. Sistem menghitung rekomendasi jumlah pembelian bersih berdasarkan estimasi kebutuhan ramalan dikurangi stok yang masih layak pakai.<br>2. **Uji Kasus Makalah:** Apabila kebutuhan ayam hari Jumat diperkirakan **18–22 kg** dan stok layak pakai yang tersisa adalah **5 kg**, maka sistem wajib menampilkan rekomendasi pembelian sebanyak **13–17 kg**. |
| **UC-07** | Waste Risk Score | Memperluas (*extend*) UC-06. Ditampilkan hanya jika stok berpotensi berlebih, dengan tingkat rendah, sedang, atau tinggi. | Sistem | **Must Have** | 1. Sistem membandingkan stok yang ada beserta rencana pembelian dengan perkiraan pemakaian sebelum bahan kedaluwarsa.<br>2. Jika terdeteksi potensi kelebihan stok, sistem menampilkan indikator *Waste Risk Score* berkategori **rendah**, **sedang**, atau **tinggi**.<br>3. Sistem menampilkan informasi saran tindakan agar pengguna dapat mengurangi jumlah pembelian atau mendahulukan pemakaian bahan yang berisiko. |
| **UC-08** | Hitung forecast | Menghitung kebutuhan bahan dengan model *time-series* berdasarkan riwayat penjualan, pola harian dan mingguan, serta label hari khusus. | Sistem | **Must Have** | 1. Algoritma *time-series* menghitung proyeksi penjualan produk berdasarkan riwayat data penjualan.<br>2. Perhitungan memperhitungkan pola harian dalam seminggu dan label hari khusus (misal: hari libur, tanggal gajian, atau menjelang Lebaran).<br>3. Sistem mengonversi hasil proyeksi penjualan produk menjadi kebutuhan bahan mentah berdasarkan komposisi resep pada UC-02. |
| **UC-09** | Pantau dashboard inventory | Melihat grafik penjualan, pergerakan stok, dan jumlah produk yang masih dapat dibuat dari stok saat ini. | Pemilik UMKM | **Must Have** | 1. Dashboard menampilkan grafik visual pergerakan stok persediaan bahan dan riwayat penjualan.<br>2. Sistem secara otomatis menghitung dan menampilkan jumlah porsi produk/menu yang masih dapat dibuat dari persediaan bahan saat ini tanpa perlu perhitungan manual. |
| **UC-10** | Lihat riwayat transaksi | Melihat transaksi yang sudah tercatat dan sekaligus menjadi data latih model. | Pemilik UMKM | **Must Have** | 1. Pengguna dapat membuka dan melihat daftar transaksi historis yang telah tervalidasi bersih.<br>2. Data transaksi tersimpan terhubung sebagai data latih (*training dataset*) untuk melatih ulang model peramalan pada periode berikutnya. |
| **UC-11** | Berlangganan paket Pro | Meningkatkan paket dari Freemium ke Pro dengan biaya Rp100.000 per bulan *(disimulasikan pada versi tugas: tombol upgrade Pro hanya mengubah status paket, tanpa gateway pembayaran)*. | Pemilik UMKM | **Should Have** | 1. Pengguna dapat memilih opsi upgrade ke paket Pro seharga Rp100.000 per bulan.<br>2. Tombol upgrade Pro memproses peningkatan status akun menjadi Pro secara simulasi tanpa gateway pembayaran.<br>3. Status Pro aktif menghapus batasan transaksi bulanan dan membuka akses modul sinkronisasi API mock. |
| **UC-12** | Kelola akun dan feedback | Mengubah profil, menghapus akun, dan mengirim umpan balik *(disimulasikan pada versi tugas: form feedback sederhana yang menyimpan teks)*. | Pemilik UMKM | **Could Have** | 1. Pengguna dapat memperbarui data profil akun usaha.<br>2. Pengguna dapat menghapus akun secara mandiri.<br>3. Pengguna dapat mengirimkan teks umpan balik (*feedback*) melalui form sederhana yang langsung disimpan ke basis data. |
| **UC-13** | Sinkronisasi data via API | Menarik data transaksi secara otomatis dari POS dan platform *merchant* tanpa input manual *(disimulasikan pada versi tugas: sinkronisasi MokaPOS, GoFood, Grab, dan Shopee Partner memakai data contoh/mock, bukan koneksi API sungguhan)*. | Pemilik UMKM Pro, API Pihak Ketiga | **Should Have** | 1. Pengguna paket Pro dapat menghubungkan akun ke modul integrasi POS (MokaPOS) dan aplikasi pesan antar online (GoFood, Grab, Shopee Partner).<br>2. Sistem menarik dan mencatat data transaksi dari generator data contoh (*mock*) secara otomatis tanpa koneksi API sungguhan dan tanpa perlu input manual. |

### 5.2 Perbandingan Fitur Paket Freemium dan Pro

Berdasarkan model pendapatan pada *Lean Canvas* dan alur proses bisnis di makalah, berikut adalah perbandingan antara paket Freemium dan Pro:

| Fitur / Parameter | Paket Freemium (Gratis) | Paket Pro (Rp100.000 per bulan) |
|:---|:---|:---|
| **Biaya Langganan** | Gratis (Rp0) | Rp100.000 per bulan |
| **Batasan Transaksi** | Dibatasi kuota transaksi per bulan (*angka kuota: perlu ditentukan*) | Tanpa batasan transaksi (*unlimited*) |
| **Metode Input Transaksi** | Input manual harian dan impor berkas Excel | Input manual, impor berkas Excel, dan sinkronisasi otomatis via API |
| **Sinkronisasi Otomatis API** | Tidak tersedia | Tersedia (MokaPOS, GoFood, Grab, Shopee Partner) |
| **Horizon Peramalan Kebutuhan** | Periode standar (misal: 7 hari ke depan) | Periode jangka lebih panjang (hingga 30 hari ke depan) |
| **Rekomendasi Belanja & Waste Risk Score** | Tersedia (kategori rendah, sedang, tinggi) | Tersedia (kategori rendah, sedang, tinggi) |
| **Dashboard Inventory & Sisa Porsi Produk** | Tersedia (grafik stok, penjualan, sisa porsi) | Tersedia (grafik stok, penjualan, sisa porsi) |
| **Evaluasi Akurasi & Pengurangan Waste** | Tersedia | Tersedia |
| **Dukungan Multi-Cabang** | Tidak tersedia | Potensi paket bisnis multi-cabang (rencana ekspansi) |

---

## 6. Kebutuhan Non-Fungsional

Kebutuhan non-fungsional disusun untuk memastikan sistem StockWise dapat beroperasi dengan andal, aman, dan mudah digunakan oleh pelaku UMKM:

1. **Akurasi Forecast:**
   * Model *time-series* harus menghasilkan perkiraan kebutuhan stok yang dapat diandalkan oleh pemilik usaha agar tidak lagi berbelanja berdasarkan tebakan manual.
   * *Ukuran yang dapat diuji:* Akurasi diuji dari selisih antara data penjualan aktual dengan hasil peramalan pada periode berikutnya; tingkat akurasi minimum: **target perlu ditentukan**.
2. **Validasi Data:**
   * Sistem wajib memverifikasi kualitas dan konsistensi data transaksi penjualan serta persediaan sebelum disimpan ke basis data, baik yang berasal dari input manual maupun impor Excel.
   * *Ukuran yang dapat diuji:* Sistem secara otomatis memeriksa format tanggal, keseragaman satuan (misal: kg, liter, butir), dan kelengkapan kolom; data yang tidak konsisten atau tidak lengkap wajib ditandai error 100% dan dicegah masuk ke sistem hingga diperbaiki oleh pemilik usaha.
3. **Keamanan Data Usaha:**
   * Informasi resep, riwayat penjualan, dan persediaan inventaris milik masing-masing UMKM harus terlindungi secara aman dari akses pihak lain atau usaha pesaing.
   * *Ukuran yang dapat diuji:* Penerapan isolasi data antar-akun sebesar 100% (tidak ada kebocoran data antar-pengguna); penyimpanan kata sandi akun wajib menggunakan enkripsi kriptografi aman (**bcrypt** via `passlib`; lihat TRD Bagian 3.2); manajemen sesi aman berbasis JWT pada cookie `HttpOnly` dengan masa berlaku access token **15 menit** dan refresh token **7 hari** (lihat TRD Bagian 3.2); serta proteksi pembatasan laju request (*rate limiting*) **5 request per 1 menit per alamat IP** pada login/registrasi dan **60 request per 1 menit per pengguna** pada endpoint lainnya (lihat TRD Bagian 10.1).
4. **Kemudahan Penggunaan bagi Pemilik Non-Teknis:**
   * Antarmuka aplikasi harus dirancang sederhana dan mudah dipahami oleh pemilik warung, rumah makan, atau katering yang tidak memiliki tim IT atau latar belakang teknis.
   * *Ukuran yang dapat diuji:* Pengguna baru dapat menyelesaikan proses pendaftaran awal, memasukkan bahan baku, dan melihat rekomendasi belanja pertama kali dalam waktu maksimal: **target waktu perlu ditentukan**; penggunaan istilah kuliner yang lugas dan bebas dari jargon statistik teknis.
5. **Ketersediaan Sistem (Availability):**
   * Aplikasi web harus dapat diakses secara stabil setiap saat, terutama pada jam operasional pengadaan bahan (misalnya subuh saat berbelanja di pasar) maupun jam operasional dapur.
   * *Ukuran yang dapat diuji:* Persentase waktu aktif sistem (*uptime*): **target perlu ditentukan**; batas waktu respons sistem saat memuat halaman dashboard, forecast, dan rekomendasi pembelian: **target perlu ditentukan**.
6. **Keandalan Integrasi API (MokaPOS, GoFood, Grab, Shopee Partner):**
   * Proses penarikan data transaksi otomatis dari platform POS dan pesan antar online pada paket Pro harus berjalan stabil tanpa kehilangan data atau pencatatan ganda.
   * *Ukuran yang dapat diuji:* Tingkat keberhasilan penarikan transaksi API tanpa data hilang (*zero transaction loss*): **target perlu ditentukan**; tingkat pencegahan duplikasi data transaksi masuk: 100%; batas toleransi waktu keterlambatan sinkronisasi data transaksi: **target perlu ditentukan**.

---

## 7. Alur Pengguna dan Desain Antarmuka

### 7.1 Alur Pengguna (User Flow 7 Tahap Business Process)
Berdasarkan Bab 1 Bagian C.2 pada makalah, alur bisnis StockWise berjalan dalam siklus berurutan 7 tahap yang saling terhubung:

```
[Tahap 1: Registrasi & Pengaturan Awal] (UC-01, UC-02)
   │
   ▼
[Tahap 2: Pengumpulan & Validasi Data Transaksi] (UC-03, UC-04, UC-13, UC-10)
   │
   ▼
[Tahap 3: Peramalan Kebutuhan Stok] (UC-05, UC-08)
   │
   ▼
[Tahap 4: Rekomendasi Pembelian & Waste Risk Score] (UC-06, UC-07)
   │
   ▼
[Tahap 5: Pembelian & Pemantauan Stok] (UC-09)
   │
   ▼
[Tahap 6: Evaluasi & Pembelajaran Model] (UC-10, Tahap 6)
   │  └──> Data aktual kembali menjadi input perbaikan (loop kembali ke Tahap 2)
   ▼
[Tahap 7: Peningkatan Paket dari Freemium ke Pro] (UC-11, UC-13)
```

1. **Tahap 1 — Registrasi dan Pengaturan Awal Usaha (UC-01, UC-02):**
   * Pemilik UMKM membuat akun baru (UC-01) dan mengisi profil usaha (katering, warung, rumah makan).
   * Pemilik mendaftarkan daftar bahan baku, menentukan satuan (kg, liter, buah, dll.), dan mengelompokkan bahan ke dalam kategori **segar** atau **tahan lama**.
   * Pemilik mengisi komposisi takaran bahan (resep) untuk setiap menu produk sebagai data induk (*master data*).
2. **Tahap 2 — Pengumpulan dan Validasi Data Transaksi (UC-03, UC-04, UC-13, UC-10):**
   * Pengguna Freemium memasukkan penjualan dan stok secara manual (UC-03) atau mengimpor templat Excel (UC-04) dengan batas kuota transaksi per bulan. Pengguna Pro menarik data otomatis dari MokaPOS, GoFood, Grab, dan Shopee Partner (UC-13; disimulasikan pada versi tugas memakai data contoh/mock, bukan koneksi API sungguhan) tanpa batas transaksi.
   * Sistem memeriksa format tanggal, satuan, dan kelengkapan data. Data yang tidak konsisten ditandai agar diperbaiki oleh pemilik.
   * Riwayat transaksi yang sudah bersih disimpan dan dapat dilihat kembali melalui UC-10 sebagai data latih model.
3. **Tahap 3 — Peramalan Kebutuhan Stok (UC-05, UC-08):**
   * Setelah data penjualan terkumpul beberapa minggu, model *time-series* dijalankan (UC-08) untuk mempelajari pola penjualan produk (harian, mingguan, dan label hari khusus).
   * Hasil prediksi penjualan produk dikonversi menjadi kebutuhan bahan baku mentah berdasarkan komposisi resep.
   * Periode peramalan disesuaikan secara adaptif: harian untuk bahan segar, serta mingguan atau bulanan untuk bahan tahan lama.
   * Hasil peramalan ditampilkan di halaman forecast (UC-05) dalam bentuk rentang nilai (misal: "estimasi kebutuhan ayam untuk hari Jumat: 18–22 kg").
4. **Tahap 4 — Rekomendasi Pembelian dan Waste Risk Score (UC-06, UC-07):**
   * Sistem menghitung rekomendasi pembelian (UC-06) dengan mengurangkan estimasi kebutuhan terhadap stok layak pakai di dapur (misal: kebutuhan 18–22 kg dikurangi stok 5 kg menghasilkan saran beli 13–17 kg).
   * Sistem membandingkan stok persediaan dan rencana pembelian dengan perkiraan pemakaian sebelum bahan kedaluwarsa.
   * Jika ada potensi kelebihan, *Waste Risk Score* (UC-07) ditampilkan dengan tingkat **rendah**, **sedang**, atau **tinggi** agar pemilik dapat mengurangi jumlah pembelian atau mendahulukan pemakaian bahan berisiko.
5. **Tahap 5 — Pembelian dan Pemantauan Stok (UC-09):**
   * Pemilik membeli bahan sesuai rekomendasi, lalu mencatat stok masuk di aplikasi.
   * Melalui dashboard (UC-09), pemilik memantau grafik pergerakan stok, tren penjualan, serta jumlah produk yang masih dapat dibuat dari persediaan saat itu tanpa perlu menghitung manual.
6. **Tahap 6 — Evaluasi dan Pembelajaran Model (UC-10, Tahap 6):**
   * Pada periode berikutnya, penjualan aktual dibandingkan dengan hasil peramalan terdahulu untuk mengukur akurasi *forecasting* dan tingkat pengurangan *waste*.
   * Data aktual digunakan untuk melatih ulang (*retrain*) parameter model agar prediksi semakin tepat seiring lamanya penggunaan, lalu siklus kembali ke pengumpulan data.
7. **Tahap 7 — Peningkatan Paket dari Freemium ke Pro (UC-11, UC-13):**
   * Ketika volume transaksi melampaui kuota Freemium atau pencatatan manual mulai merepotkan, pemilik beralih ke paket Pro seharga Rp100.000 per bulan (UC-11; disimulasikan pada versi tugas di mana tombol upgrade Pro hanya mengubah status paket tanpa gateway pembayaran).
   * Sistem mengaktifkan sinkronisasi otomatis via API (UC-13; disimulasikan pada versi tugas memakai data contoh/mock), sehingga peramalan berjalan tanpa input manual dan menjadi sumber pendapatan utama StockWise.

### 7.2 Kebutuhan Tampilan Antarmuka (Dasar Pembuatan Wireframe)

1. **Halaman Dashboard Inventory (UC-09):**
   * **Elemen Tampilan:**
     * Visualisasi grafik tren penjualan historis produk.
     * Visualisasi grafik pergerakan stok persediaan bahan baku.
     * Kartu metrik ringkasan: jumlah porsi menu produk yang masih dapat dibuat dari stok persediaan aktif saat ini.
     * Peringatan ringkas (*quick alerts*) mengenai bahan baku yang menipis atau memerlukan perhatian segera.
2. **Halaman Forecast Kebutuhan (UC-05):**
   * **Elemen Tampilan:**
     * Tab/menu navigasi pemilih sudut pandang: proyeksi per menu produk vs kebutuhan bahan baku mentah.
     * Selektor periode peramalan adaptif: harian (untuk bahan segar), mingguan, atau bulanan (untuk bahan tahan lama).
     * Area penyajian angka peramalan dalam format rentang nilai (misal: "18–22 kg").
     * Label/penanda hari khusus (*event badge*) yang sedang aktif dalam horizon waktu tersebut (misal: "Menjelang Lebaran", "Tanggal Gajian").
3. **Halaman Rekomendasi Pembelian (UC-06):**
   * **Elemen Tampilan:**
     * Tabel daftar bahan baku yang direkomendasikan untuk dibeli.
     * Kolom estimasi kebutuhan periode mendatang.
     * Kolom sisa stok layak pakai saat ini.
     * Kolom rekomendasi jumlah bersih yang perlu dibeli (hasil pengurangan kebutuhan dengan sisa stok).
     * Tombol aksi konfirmasi "Tandai Sudah Dibeli" untuk mencatat stok masuk ke inventaris secara instan.
4. **Komponen / Tampilan Waste Risk Score (UC-07):**
   * **Elemen Tampilan:**
     * Muncul menyertai rekomendasi pembelian saat sistem mendeteksi stok berpotensi berlebih.
     * Lencana status tingkat risiko dengan kategori visual: **Rendah**, **Sedang**, atau **Tinggi**.
     * Daftar nama bahan baku yang teridentifikasi berisiko kedaluwarsa sebelum habis terpakai.
     * Kotak teks saran tindakan korektif (misal: instruksi mengurangi kuantitas pembelian atau saran mendahulukan pemakaian bahan).

---

## 8. Asumsi, Dependensi, dan Risiko

### 8.1 Asumsi
1. Pelaku UMKM F&B bersedia secara konsisten memasukkan data penjualan harian dan stok persediaan (baik secara manual maupun berkala melalui impor Excel).
2. Komposisi resep menu (takaran bahan per porsi) relatif stabil dan tidak mengalami perubahan drastis setiap hari tanpa pembaruan di sistem.
3. Pengelompokan kategori bahan baku (segar vs tahan lama) yang dimasukkan pemilik usaha mencerminkan daya tahan simpan riil bahan di dapur.
4. Pola hari tertentu (akhir pekan, hari gajian) dan hari-hari khusus (seperti Lebaran) memiliki pengaruh yang konsisten terhadap fluktuasi permintaan konsumen.

### 8.2 Dependensi
1. Ketergantungan pada kelengkapan riwayat transaksi minimal beberapa minggu dari pengguna sebelum model *time-series* dapat menghasilkan peramalan yang akurat.
2. Ketergantungan pada ketersediaan koneksi internet pemilik usaha untuk mengakses antarmuka aplikasi berbasis web.
3. Ketergantungan pada kestabilan antarmuka API pihak ketiga (MokaPOS, GoFood, Grab, dan Shopee Partner) untuk kelancaran penarikan data transaksi otomatis pada paket Pro.
4. Ketergantungan pada dukungan peramban web modern di perangkat ponsel/komputer pengguna untuk memproses file Excel dan menampilkan grafik visual.

### 8.3 Tabel Analisis Risiko, Dampak, dan Mitigasi

| Risiko | Dampak | Mitigasi |
|:---|:---|:---|
| **Kualitas data catatan UMKM tidak rapi** (format tanggal salah, satuan bahan tidak konsisten, atau kolom data kosong). | Data transaksi yang rusak dapat menghasilkan peramalan yang bias dan rekomendasi belanja yang menyesatkan. | Sistem menerapkan mekanisme validasi data otomatis sebelum disimpan; data yang tidak konsisten langsung ditandai dengan pesan error yang jelas agar pemilik usaha dapat langsung memperbaikinya (sesuai Bab 1 C.2 Tahap 2). |
| **Riwayat data transaksi awal belum mencukupi** (pengguna baru belum memiliki data penjualan selama beberapa minggu). | Model *time-series* belum memiliki data historis yang memadai sehingga peramalan belum dapat dijalankan. | Menyediakan fasilitas impor data masa lalu via templat Excel StockWise (UC-04); sistem menahan eksekusi peramalan hingga data transaksi terkumpul selama beberapa minggu yang disyaratkan. |
| **Ketergantungan pada API pihak ketiga** (perubahan antarmuka API, gangguan server mitra, atau belum adanya izin kemitraan resmi). | Aliran data transaksi otomatis pada paket Pro terhambat, sehingga perhitungan stok menjadi tertunda. | Menyediakan opsi cadangan input manual dan impor Excel darurat; menerapkan penanganan error sinkronisasi berkala; pada rilis awal menyimulasikan data transaksi dari pola peramalan. |
| **Kesalahan penafsiran angka peramalan oleh pemilik usaha** (menganggap angka ramalan adalah angka pasti mutlak). | Pemilik usaha menyalahkan sistem apabila terjadi selisih kecil antara penjualan aktual dan angka estimasi. | Hasil peramalan wajib disajikan dalam bentuk **rentang nilai** (misalnya "18–22 kg") bukan angka tunggal, sehingga pemilik secara intuitif memahami adanya tingkat ketidakpastian. |
| **Lonjakan sisa bahan segar akibat penurunan pesanan mendadak.** | Bahan segar yang sudah terlanjur dibeli berisiko membusuk dan modal usaha terbuang. | Sistem mengaktifkan fitur *Waste Risk Score* berkategori rendah, sedang, atau tinggi untuk memberi peringatan dini agar pemilik segera mengurangi pembelian berikutnya dan mendahulukan pengolahan bahan yang berisiko. |

---

## 9. Rencana Rilis

Rencana pengembangan dan peluncuran produk StockWise disusun secara bertahap berdasarkan kesiapan fitur dan model paket langganan pada makalah:

### 9.1 Fase 1: Minimum Viable Product (MVP) — Paket Freemium
* **Tujuan:** Membuktikan proposisi nilai inti produk kepada kelompok pengguna awal (*early adopter*) katering, warung, dan rumah makan dengan fitur peramalan stok mandiri dan evaluasi pengurangan pemborosan modal.
* **Fitur yang Dirilis:**
  * Registrasi akun dan login aman (UC-01).
  * Pengaturan profil usaha, master bahan baku (segar vs tahan lama), dan komposisi resep per produk (UC-02).
  * Input manual penjualan harian dan mutasi stok bahan (UC-03).
  * Unggah data riwayat penjualan dan persediaan massal via templat Excel StockWise beserta validasi kelengkapannya (UC-04).
  * Mesin peramalan *time-series* adaptif yang menyajikan estimasi kebutuhan dalam bentuk rentang nilai (UC-05, UC-08).
  * Rekomendasi pembelian bahan bersih dan penilaian *Waste Risk Score* (rendah, sedang, tinggi) saat stok berlebih (UC-06, UC-07).
  * Dashboard inventaris pemantauan pergerakan stok, tren penjualan, dan estimasi porsi produk yang masih dapat dibuat (UC-09).
  * Penayangan riwayat transaksi dan evaluasi akurasi forecast serta tingkat pengurangan waste (UC-10, Tahap 6).
  * Pengelolaan akun dan pengiriman umpan balik sederhana (UC-12; disimulasikan pada versi tugas sebagai form teks sederhana).
  * Penegakan batasan kuota transaksi per bulan untuk pengguna paket Freemium.
* **Estimasi Waktu Rilis:** **Target waktu perlu ditentukan**.

### 9.2 Fase 2: Rilis Paket Pro — Sinkronisasi API & Otomatisasi
* **Tujuan:** Menyediakan otomatisasi operasional penuh tanpa input manual bagi UMKM dengan skala transaksi tinggi yang sudah menggunakan aplikasi POS kasir dan platform pesan antar online.
* **Fitur yang Dirilis:**
  * Modul pendaftaran dan peningkatan paket Pro seharga Rp100.000 per bulan (UC-11; disimulasikan pada versi tugas: tombol upgrade langsung mengubah status paket tanpa gateway pembayaran).
  * Penghapusan batasan kuota transaksi bulanan (*unlimited transactions*).
  * Modul sinkronisasi data transaksi via API dari MokaPOS, GoFood, Grab, dan Shopee Partner (UC-13; disimulasikan pada versi tugas memakai generator data contoh/mock).
  * Perluasan horizon waktu peramalan kebutuhan stok bahan hingga 30 hari ke depan.
  * Persiapan arsitektur pendukung paket bisnis multi-cabang (rencana ekspansi lanjutan).
* **Estimasi Waktu Rilis:** **Target waktu perlu ditentukan**.

---

## 10. Pertanyaan Terbuka

Berikut adalah daftar aspek penting yang belum ditetapkan atau dirinci secara numerik pada makalah dan memerlukan keputusan lebih lanjut:

| No | Pertanyaan Terbuka / Aspek Belum Ditetapkan | Konteks dan Catatan dari Makalah | Pihak Pengambil Keputusan yang Disarankan |
|:---|:---|:---|:---|
| 1 | **Berapa angka pasti batas transaksi per bulan untuk pengguna paket Freemium?** | Makalah menyebutkan bahwa pengguna Freemium memiliki "batas jumlah transaksi per bulan", namun angka kuota numeriknya belum ditentukan. | Product Manager & Business Owner |
| 2 | **Berapa jumlah minggu minimal riwayat data penjualan yang dipersyaratkan sebelum peramalan pertama kali dapat dijalankan?** | Makalah menyebutkan "peramalan baru dijalankan setelah data penjualan terkumpul selama beberapa minggu", namun batas durasi minimalnya belum dirinci. | Data Scientist / Lead Engineer & Product Manager |
| 3 | **Apa formula statistik matematis yang digunakan untuk mengukur akurasi forecasting?** | Makalah menyebutkan selisih antara penjualan aktual dan peramalan menjadi dasar pengukuran akurasi, namun formula baku perhitungannya (misal: WAPE, MAPE, atau MAE) belum dituliskan secara spesifik. | Data Scientist / AI Engineer |
| 4 | **Bagaimana formula matematis dan batasan rasio persentase untuk klasifikasi Waste Risk Score (rendah, sedang, dan tinggi)?** | Makalah menetapkan tiga kategori tingkat risiko (rendah, sedang, tinggi) saat stok berpotensi berlebih sebelum kedaluwarsa, tetapi ambang batas numerik persentasenya belum didefinisikan. | Data Scientist / AI Engineer & Product Manager |
| 5 | **Bagaimana arsitektur teknis koneksi API pihak ketiga (MokaPOS, GoFood, Grab, Shopee) sebelum ada kemitraan korporat resmi?** | Makalah menyebutkan integrasi API resmi membutuhkan kemitraan korporat; pada versi tugas disimulasikan dengan generator data contoh (mock), sedangkan mekanisme integrasi riil perlu disepakati saat implementasi lanjutan. | Lead Backend Engineer & Business Development |
| 6 | **Metode pembayaran dan gerbang pembayaran apa saja yang akan didukung pada saat pembayaran paket Pro diaktifkan secara riil?** | Makalah menetapkan biaya Rp100.000 per bulan untuk paket Pro; pada versi tugas pembayaran disimulasikan (tombol upgrade langsung mengubah status paket), sedangkan kanal pembayaran dan vendor payment gateway resminya belum ditentukan. | Product Manager & Finance / Operations |
