# Audit Migrasi Prototipe Node.js/SQLite ke Target FastAPI/PostgreSQL

Dokumen ini merupakan hasil audit teknis kode prototipe lama (`server/*.js`) terhadap arsitektur target berbasis **FastAPI**, **SQLAlchemy 2.0 (Asyncio)**, dan **PostgreSQL 16** sesuai spesifikasi pada `docs/TRD.md` dan `docs/PRD.md`.

---

## 1. Analisis Modul Autentikasi & Sesi (`server/auth.js`, `server/routes/auth.js`)

### Kondisi Prototipe Lama
1. **Hashing Kata Sandi:** Menggunakan `crypto.scryptSync` dengan format penyimpanan `${salt}:${hash}`.
2. **Manajemen Sesi & Token:**
   * Menggunakan token kustom berbasis HMAC-SHA256 (`sign`/`unsign`) yang disimpan dalam satu cookie tunggal `sw_session` (`HttpOnly`, `SameSite=lax`, masa aktif 7 hari).
   * Belum memisahkan *access token* dan *refresh token*.
3. **Middleware Otorisasi:**
   * `requireAuth(req, res, next)`: Membaca cookie `sw_session`, memverifikasi tanda tangan HMAC, memuat user dari SQLite, dan mengecek kedaluwarsa paket Pro secara malas (*lazy check* via `expireProIfNeeded`).
   * `requirePro(req, res, next)`: Memeriksa `req.user.role === 'pro'`.
4. **Proteksi Keamanan:** Belum memiliki mekanisme *rate limiting* maupun header pelacakan `X-Request-ID`.

### Target Arsitektur Baru (FastAPI)
1. **Hashing Kata Sandi (`app/lib/jwt_utils.py`):** Beralih ke algoritma **bcrypt** melalui `passlib[bcrypt]`.
2. **Manajemen Sesi JWT (`app/lib/jwt_utils.py`):**
   * Menerbitkan dua token JWT standar (`python-jose`) dalam cookie `HttpOnly` (`SameSite=Lax`):
     * `access_token`: masa berlaku **15 menit** (`Max-Age=900`).
     * `refresh_token`: masa berlaku **7 hari** (`Max-Age=604800`) untuk pembaruan sesi di `/api/v1/auth/refresh`.
3. **Dependency Injection (`app/api/depedencies.py`):**
   * `get_current_user`: Membaca `access_token`, memvalidasi klaim `sub`, memuat user via async session PostgreSQL, dan melempar `NotAuthenticatedException` jika gagal.
   * `require_pro_plan`: Memvalidasi status paket Pro dan melempar `ProPlanRequiredException` (HTTP 403).
4. **Rate Limiting (`app/middleware/rate_limit.py`):** Membatasi `/api/v1/auth/login` dan `/api/v1/auth/register` maksimal **5 request/menit per IP**, dan endpoint lainnya **60 request/menit**.

---

## 2. Analisis Kueri SQL Transaksi & Mutasi Inventaris (`server/db.js`, `server/inventory.js`, `server/routes/data.js`)

### Kondisi Prototipe Lama
1. **Koneksi & Transaksi Database (`server/db.js`):**
   * Menggunakan driver sinkron `node:sqlite` (`DatabaseSync`) dengan helper `tx(fn)` yang mengeksekusi `BEGIN ... COMMIT/ROLLBACK` secara blocking.
   * Mendefinisikan 12 tabel utama: `users`, `ingredients`, `products`, `recipes`, `batches`, `sales`, `waste_logs`, `events`, `model_state`, `integrations`, `payments`, dan `feedback`.
2. **Model Inventaris & FEFO (`server/inventory.js`):**
   * Menggunakan pola *event-sourcing/chronological replay* (`replay(userId, until)`) yang memutar ulang seluruh histori `batches`, `sales` (dikalikan takaran `recipes`), dan `waste_logs` dari tanggal transaksi paling awal hingga `until`.
   * Kelas `Inventory` mengurutkan batch berdasarkan `expiry_date ASC` (**FEFO** - *First-Expired, First-Out*), memotong stok saat konsumsi (`consume`), serta menandai batch yang melewati `expiry_date < date` sebagai limbah otomatis (`expire`).
3. **Validasi & Impor Data (`server/routes/data.js`):**
   * Validasi input dilakukan secara manual melalui fungsi helper `num()`, `str()`, `owned()`, dan `checkDate()`.
   * Kuota Freemium dibatasi konstanta `FREE_QUOTA = 300` transaksi per bulan (`assertQuota`).
   * Impor Excel (`POST /import/:type`) menerima array JSON yang sudah di-parse atau mengonversi serial tanggal Excel dan konversi satuan (`gram <-> kg`, `ml <-> liter`).

### Target Arsitektur Baru (FastAPI & PostgreSQL)
1. **Koneksi & ORM Asinkron (`app/connections/postgres.py`, `app/models/*_model.py`):**
   * Menggunakan `create_async_engine` (`asyncpg`) dengan connection pool (`pool_size=20`, `max_overflow=10`) dan `AsyncSession`.
   * Skema 12 tabel dikelola secara deklaratif menggunakan SQLAlchemy 2.0 dan dimigrasikan melalui **Alembic** (`db_migrations/`).
   * Menambahkan indeks komposit strategis: `idx_batches_user_expiry ON batches(user_id, ingredient_id, expiry_date)` untuk akselerasi FEFO.
2. **Isolasi Multi-Tenant & Mutasi Stok:**
   * Setiap metode di `repository.py` wajib menyertakan filter `WHERE user_id = current_user.id`.
   * Pencatatan penjualan (`sale/use_cases.py`) dan pemotongan batch FEFO dieksekusi dalam transaksi ACID PostgreSQL serta didukung pustaka `app/lib/fefo.py` untuk replay dan simulasi.
3. **Impor Excel In-Memory (`sale/use_cases.py`):**
   * Mendukung pembacaan stream byte berkas `.xlsx` di memori menggunakan `openpyxl` maupun payload terstruktur dengan validasi ketat Pydantic v2.

---

## 3. Analisis Algoritma Time-Series & Simulasi Safe-Buy (`server/forecast.js`, `server/analytics.js`)

### Kondisi Prototipe Lama
1. **Algoritma Peramalan (`server/forecast.js`):**
   * **Rentang Histori:** Memuat penjualan 120 hari terakhir (`HISTORY_DAYS = 120`).
   * **Faktor Hari dalam Minggu (`dowFactors`):** Menghitung rasio rata-rata penjualan per hari dalam jendela 56 hari terakhir (`DOW_WINDOW = 56`, mengecualikan hari event) dengan *shrinkage* $\frac{c_w}{c_w + 2}$ dan batas $[0.2, 3.0]$.
   * **Faktor Event (`eventFactor`):** Mempelajari dampak hari khusus dari histori aktual terhadap ekspektasi normal menggunakan bobot kredibilitas $w = \frac{n}{n + 1}$, dibatasi pada $[0.3, 3.0]$.
   * **Exponential Smoothing (`fitModel`):** Melakukan *one-step-ahead prediction* tanpa kebocoran data (*no data leakage*):
     * Warm-up level awal $L$ dari rata-rata 7 hari non-event pertama.
     * Pembaruan level pada hari non-event: $L_t = \alpha \left(\frac{Y_t}{F_{\text{dow}}}\right) + (1 - \alpha) L_{t-1}$.
     * Estimasi simpangan baku error relatif $\sigma$ pada 28 hari evaluasi terakhir (`EVAL_DAYS = 28`), dibatasi pada $[0.08, 0.6]$.
   * **Grid-Search Training (`train`):** Menguji $\alpha \in [0.05, 0.1, 0.2, 0.3, 0.5]$ dan memilih nilai $\alpha$ dengan **WAPE** terkecil pada 28 hari terakhir, lalu menyimpan ke tabel `model_state`.
   * **Konversi Resep (`ingredientNeeds`):** Mengonversi prediksi menu ke kebutuhan bahan mentah beserta propagasi rentang ketidakpastian ($\text{sd} = \sqrt{\sum (\text{half}_p \cdot \text{qty}_{p,i})^2}$).
2. **Simulasi FEFO 60 Hari & Safe-Buy (`server/analytics.js`):**
   * **Horizon Adaptif (`horizonFor`):** Bahan `segar` = 1 hari (harian); bahan `tahan_lama` dengan umur simpan $\ge 90$ hari = 30 hari (bulanan), selain itu = 7 hari (mingguan).
   * **Rekomendasi Beli Bersih:** $\text{buy} = \text{ceilTo}(\max(0, \text{need} - \text{stockStart}), \text{step})$.
   * **Forward Simulation (`simulateWaste`):** Mensimulasikan konsumsi harian selama 60 hari ke depan (`PROJECTION_DAYS = 60`). Batch dengan $\text{expiry} < d$ dihitung sebagai *waste*.
   * **Optimasi Safe-Buy:** Jika pembelian `buy` menambah volume limbah dibanding baseline (`withPlan.waste > base.waste + step / 2`), kuantitas diturunkan bertahap (`q -= step`) hingga tidak ada tambahan limbah (*Zero Incremental Waste*).
   * **Klasifikasi Waste Risk Score:** Menghitung $\text{ratio} = \frac{\text{waste}}{\text{stockStart} + \text{buy}}$ dengan kategori:
     * `rendah`: $\text{ratio} < 0.10$ ($< 10\%$)
     * `sedang`: $0.10 \le \text{ratio} < 0.30$ ($10\% - 30\%$)
     * `tinggi`: $\text{ratio} \ge 0.30$ ($\ge 30\%$)

### Target Arsitektur Baru (FastAPI)
* Memisahkan logika matematis murni ke `src/backend/app/lib/forecast_math.py` dan `src/backend/app/lib/fefo.py` agar bebas dari ketergantungan I/O database dan dapat diuji secara terisolasi melalui unit test Pytest (`tests/unit/lib/`).

---

## 4. Matriks Pemetaan Use Case (Node.js Lama $\rightarrow$ FastAPI Baru)

Berikut adalah pemetaan komprehensif seluruh **13 Use Case utama** (beserta modul pendukung) dari kode prototipe lama ke modul *vertical slice* FastAPI target:

| Kode UC | Nama Fitur / Use Case | File & Fungsi Prototipe Lama (Node.js) | Endpoint Lama | Modul & Use Case Target (FastAPI Python) | Endpoint Baru (`/api/v1`) |
|---|---|---|---|---|---|
| **UC-01** | **Register dan Sign In** | `server/routes/auth.js` (`POST /register`, `POST /login`, `POST /logout`, `GET /me`) & `server/auth.js` (`hashPassword`, `verifyPassword`, `setSession`, `requireAuth`) | `POST /api/auth/register`<br>`POST /api/auth/login`<br>`POST /api/auth/logout`<br>`GET /api/auth/me` | `app/api/auth/use_cases.py`:<br>• `register_user_use_case`<br>• `login_user_use_case`<br>• `refresh_token_use_case`<br>• `logout_user_use_case`<br>• `get_current_user_profile_use_case`<br>Didukung `app/lib/jwt_utils.py` & `app/api/depedencies.py` | `POST /api/v1/auth/register`<br>`POST /api/v1/auth/login`<br>`POST /api/v1/auth/refresh`<br>`POST /api/v1/auth/logout`<br>`GET /api/v1/auth/me` |
| **UC-02** | **Atur Profil Usaha, Bahan Baku, & Resep Menu** | `server/routes/data.js`:<br>• `ingredientInput`, CRUD `/ingredients`<br>• `productsWithRecipes`, `saveRecipe`, CRUD `/products` | `GET/POST/PUT/DELETE /api/ingredients`<br>`GET/POST/PUT/DELETE /api/products` | `app/api/ingredient/use_cases.py`:<br>• `list_ingredients_use_case`<br>• `create_ingredient_use_case`<br>• `update_ingredient_use_case`<br>• `delete_ingredient_use_case`<br>`app/api/product/use_cases.py`:<br>• `list_products_use_case`<br>• `create_product_with_recipe_use_case`<br>• `update_product_with_recipe_use_case`<br>• `delete_product_use_case` | `GET/POST/PUT/DELETE /api/v1/ingredients`<br>`GET/POST/PUT/DELETE /api/v1/products` |
| **UC-03** | **Input Penjualan Harian, Stok Masuk (Batch), & Limbah** | `server/routes/data.js`:<br>• `POST /stock/in`, `DELETE /stock/batches/:id`<br>• `POST /stock/waste`, `DELETE /stock/waste/:id`<br>• `POST /sales`, `DELETE /sales/:id`, `assertQuota` | `GET /api/stock`<br>`POST /api/stock/in`<br>`POST /api/stock/waste`<br>`POST /api/sales` | `app/api/batch/use_cases.py`:<br>• `list_batches_use_case`<br>• `create_batch_use_case`<br>• `delete_batch_use_case`<br>`app/api/waste_log/use_cases.py`:<br>• `list_waste_logs_use_case`<br>• `create_waste_log_use_case`<br>`app/api/sale/use_cases.py`:<br>• `create_manual_sale_use_case` | `GET/POST/DELETE /api/v1/batches`<br>`GET/POST /api/v1/waste-logs`<br>`GET/POST /api/v1/sales` |
| **UC-04** | **Import Data Excel** | `server/routes/data.js`:<br>• `parseDate`, `convertUnit`, `POST /import/:type` | `POST /api/import/sales`<br>`POST /api/import/stock` | `app/api/sale/use_cases.py`:<br>• `import_sales_excel_use_case` (in-memory `openpyxl` / JSON rows)<br>• `generate_sales_template_use_case` | `POST /api/v1/sales/import-excel`<br>`POST /api/v1/sales/import`<br>`GET /api/v1/sales/template` |
| **UC-05** | **Lihat Forecast Kebutuhan** | `server/routes/account.js` (`GET /forecast`) & `server/analytics.js` (`forecastView`, `horizonFor`) | `GET /api/forecast?days=7` | `app/api/forecast/use_cases.py`:<br>• `get_forecast_use_case` (validasi horizon Freemium 7 hari vs Pro 14/30 hari) | `GET /api/v1/forecast` |
| **UC-06** | **Lihat Rekomendasi Pembelian** | `server/routes/account.js` (`GET /recommendations`) & `server/analytics.js` (`recommendations`, `dailyUsage`) | `GET /api/recommendations` | `app/api/recommendation/use_cases.py`:<br>• `get_purchase_recommendations_use_case` (kalkulasi $\text{kebutuhan} - \text{stok layak pakai}$) | `GET /api/v1/recommendations` |
| **UC-07** | **Waste Risk Score & Simulasi Safe-Buy** | `server/analytics.js` (`simulateWaste`, loop optimasi `safeBuy`, rasio risiko `rendah`/`sedang`/`tinggi`) & `server/inventory.js` (`Inventory`, `replay`) | Bagian dari respons `GET /api/recommendations` | `app/lib/fefo.py`:<br>• `simulate_fefo_60_days`<br>• `calculate_waste_risk_score`<br>• `optimize_safe_buy`<br>Dipanggil oleh `app/api/recommendation/use_cases.py` | Bagian dari respons `GET /api/v1/recommendations` |
| **UC-08** | **Hitung Forecast (Model Time-Series & Event)** | `server/forecast.js` (`loadSalesContext`, `dowFactors`, `eventFactor`, `fitModel`, `predict`, `productRange`, `ingredientNeeds`) & `server/routes/data.js` (`/events`) | Internal engine + `GET/POST/PUT/DELETE /api/events` | `app/lib/forecast_math.py`:<br>• `compute_dow_factors`<br>• `compute_event_factor`<br>• `fit_exponential_smoothing`<br>• `convert_product_forecast_to_ingredients`<br>`app/api/event/use_cases.py`:<br>• `list_events_use_case`, `create_event_use_case`, `delete_event_use_case` | Internal engine + `GET/POST/DELETE /api/v1/events` |
| **UC-09** | **Pantau Dashboard Inventory** | `server/routes/account.js` (`GET /dashboard`) & `server/analytics.js` (`dashboard`, `portionsLeft`) | `GET /api/dashboard` | `app/api/dashboard/use_cases.py`:<br>• `get_dashboard_summary_use_case` (agregasi tren penjualan, stok kritis, dan sisa porsi menu `portions_available`) | `GET /api/v1/dashboard` |
| **UC-10** | **Lihat Riwayat Transaksi & Evaluasi Model (Tahap 6)** | `server/routes/data.js` (`GET /history`), `server/routes/account.js` (`GET /evaluation`, `POST /model/train`), `server/analytics.js` (`evaluation`), `server/forecast.js` (`wape`, `train`) | `GET /api/history`<br>`GET /api/evaluation`<br>`POST /api/model/train` | `app/api/sale/use_cases.py`:<br>• `get_transaction_history_use_case`<br>`app/api/evaluation/use_cases.py`:<br>• `get_model_evaluation_use_case`<br>• `retrain_forecast_model_use_case` | `GET /api/v1/sales/history`<br>`GET /api/v1/evaluation`<br>`POST /api/v1/evaluation/retrain` |
| **UC-11** | **Berlangganan Paket Pro (Simulasi)** | `server/routes/account.js` (`GET /subscription`, `POST /subscription/checkout`, `POST /subscription/cancel`) | `GET /api/subscription`<br>`POST /api/subscription/checkout`<br>`POST /api/subscription/cancel` | `app/api/subscription/use_cases.py`:<br>• `get_subscription_status_use_case`<br>• `checkout_pro_simulation_use_case`<br>• `cancel_pro_subscription_use_case` | `GET /api/v1/subscription`<br>`POST /api/v1/subscription/checkout`<br>`POST /api/v1/subscription/cancel` |
| **UC-12** | **Kelola Akun dan Feedback** | `server/routes/auth.js` (`PUT /me`, `PUT /me/password`, `DELETE /me`) & `server/routes/account.js` (`GET /feedback`, `POST /feedback`) | `PUT /api/auth/me`<br>`PUT /api/auth/me/password`<br>`DELETE /api/auth/me`<br>`POST /api/feedback` | `app/api/user/use_cases.py`:<br>• `update_user_profile_use_case`<br>• `change_password_use_case`<br>• `delete_user_account_use_case`<br>`app/api/feedback/use_cases.py`:<br>• `create_feedback_use_case` | `PATCH /api/v1/users/me`<br>`PATCH /api/v1/users/me/password`<br>`DELETE /api/v1/users/me`<br>`POST /api/v1/feedback` |
| **UC-13** | **Sinkronisasi Data via API (Mock POS & Ojol)** | `server/routes/account.js` (`PROVIDERS`, `GET /integrations`, `POST /integrations/:provider/connect`, `DELETE /integrations/:provider`, `POST /integrations/sync`) | `GET /api/integrations`<br>`POST /api/integrations/:provider/connect`<br>`POST /api/integrations/sync` | `app/api/integration/use_cases.py`:<br>• `list_integrations_use_case`<br>• `connect_provider_use_case`<br>• `sync_mock_provider_orders_use_case` | `GET /api/v1/integrations`<br>`POST /api/v1/integrations/{provider}/connect`<br>`POST /api/v1/integrations/{provider}/sync` |
| **INFRA** | **Health Check & Seed Data Demo** | `server/server.js` (`GET /api/health`) & `server/seed.js` (`seedEvents`, `seedDemoData`, `ensureDemoAccount`) | `GET /api/health` | `app/api/health/views.py` (`check_health`) & `app/seed.py` (`seed_demo_data`) | `GET /api/v1/health`<br>`GET /healthz` |

---

## 5. Catatan Perbedaan Kontrak yang Perlu Diperhatikan Saat Migrasi

1. **Standard Response Envelope (`app/api/standard_response.py`):**
   * Prototipe lama mengembalikan JSON langsung (misal `{ user: ... }` atau `{ ok: true }`).
   * Backend FastAPI membungkus seluruh respons ke dalam `{ "success": bool, "data": T | null, "error": ErrorDetail | null }`. Klien `src/frontend/js/api.js` (Tugas T-8.1) akan meng-unwrap properti `data` secara transparan.
2. **Penanganan Error Terpusat (`app/api/exceptions/`):**
   * `HttpError(status, message)` pada `server/util.js` digantikan oleh hierarki `CustomException` (`EmailAlreadyRegisteredException`, `InvalidCredentialsException`, `ProPlanRequiredException`, dll.) di `app/api/exceptions/exceptions.py`.
3. **Zona Waktu & Format Tanggal:**
   * Prototipe lama menyimpan tanggal sebagai `TEXT` (`YYYY-MM-DD`) dengan zona waktu `Asia/Jakarta`.
   * PostgreSQL menggunakan tipe native `DATE` dan `TIMESTAMPTZ` dengan serialisasi ISO-8601 (`YYYY-MM-DD`) pada DTO Pydantic agar tetap kompatibel dengan frontend.

