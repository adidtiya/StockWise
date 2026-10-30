# Panduan Rincian Tugas Implementasi (Task Breakdown) StockWise

Dokumen ini adalah panduan kerja teknis komprehensif untuk merombak total backend StockWise dari prototipe Node.js/SQLite menjadi arsitektur modern berbasis FastAPI, PostgreSQL 16, dan Docker Compose lokal sesuai spesifikasi [TRD.md](file:///Users/heru/Development/StockWise/docs/TRD.md) dan [PRD.md](file:///Users/heru/Development/StockWise/docs/PRD.md).

---

## 1. Cara Pakai Dokumen

Dokumen ini disusun untuk dieksekusi secara bertahap oleh AI Coding Agent dengan alur satu tugas per satu sesi interaksi, di bawah pengawasan dan tinjauan langsung oleh Tech Lead/Pengembang. Setiap tugas telah dirancang mandiri, memiliki batasan file yang tegas, dependensi terurut, dan kriteria selesai yang dapat diuji secara mekanis tanpa interpretasi manual. Pengembang cukup menyalin templat prompt di bawah ini ke sesi percakapan agent untuk memulai pengerjaan:

```text
Kerjakan tugas [ID_TUGAS] di docs/TASK_BREAKDOWN.md. Baca bagian TRD dan PRD yang dirujuk, ikuti seluruh langkah serta kriteria selesai dengan ketat. Jangan mengubah file atau mengerjakan fitur di luar cakupan tugas ini.
```

Setelah tugas selesai diverifikasi dan dinyatakan lolos, centang kotak checkbox `- [ ]` menjadi `- [x]` pada tugas tersebut sebelum melanjutkan ke tugas berikutnya.

---

## 2. Ringkasan Fase Pengerjaan

| Fase | Tujuan Utama | Jumlah Tugas | Checkpoint Verifikasi Akhir Fase |
|---|---|:---:|---|
| **Fase 0: Persiapan Repo** | Menata struktur folder target, memindahkan frontend, dan audit kode lama | 4 | Struktur folder `src/frontend/` aktif, pohon folder TRD 4.2 terbentuk, dan audit selesai |
| **Fase 1: Fondasi Backend** | Menyiapkan dependensi, koneksi async PostgreSQL, Docker dev, Alembic, & response envelope | 9 | `docker-compose -f deploy/compose/docker-compose.dev.yml up -d`, migrasi sukses, dan `GET /api/v1/health` 200 OK |
| **Fase 2: Middleware & Auth** | Mengamankan request HTTP, hashing sandi, sesi JWT cookie HttpOnly, & rate limiting | 9 | Registrasi, login, refresh token, logout, dan rate limit 5 req/menit terverifikasi via curl |
| **Fase 3: Data Master** | Membangun domain bahan baku, resep menu, stok masuk (FEFO), limbah, dan event | 5 | Seluruh master data dapat dibuat, diubah, dan dibaca dengan isolasi penuh per `user_id` |
| **Fase 4: Penjualan & Impor** | Pencatatan transaksi penjualan, parser in-memory Excel, dan validasi data | 3 | Input manual dan upload template Excel berhasil diparsing tanpa external storage |
| **Fase 5: Algoritma Inti** | Porting time-series exponential smoothing, forward simulation FEFO 60 hari, & evaluasi WAPE | 5 | Perhitungan forecast akurat, rekomendasi pembelian aman limbah, dan metrik evaluasi tervalidasi |
| **Fase 6: Dashboard** | Agregasi analitik inventaris dan kartu kapasitas porsi menu produk | 1 | Endpoint dashboard menyajikan grafik tren penjualan dan ketersediaan porsi menu secara instan |
| **Fase 7: Fitur Simulasi** | Menyediakan alur upgrade Pro, sinkronisasi mock data POS/ojol, dan feedback | 3 | Upgrade paket Pro langsung aktif, mock sync menyuntikkan pesanan, dan teks feedback tersimpan |
| **Fase 8: Integrasi Frontend** | Menghubungkan client PWA `src/frontend/js/` ke base path `/api/v1` dan response envelope | 6 | Seluruh halaman UI PWA berfungsi mulus menggunakan backend FastAPI lokal |
| **Fase 9: Pengujian & Demo** | Otomasi test suite (unit & API), seeding data awal, dan pembersihan artefak lama | 5 | Seluruh tes Pytest lolos (`pytest tests/`), data seed terisi, dan checklist demo 13 UC tervalidasi |

---

## 3. Daftar Tugas per Fase

### Fase 0: Persiapan Repo & Migrasi Struktur Awal
Tujuan: Memisahkan frontend ke target direktori baru dan menyiapkan kerangka kerja bersih tanpa merusak riwayat git.

- [x] **T-0.1 Pemindahan direktori frontend `public/` ke `src/frontend/`**
  * **Ukuran:** S
  * **Rujukan:** TRD 1.2, TRD 4.1, TRD 4.2; PRD 4.1
  * **Dependensi:** Tidak ada
  * **File:** `public/` (dipindahkan), `src/frontend/` (tujuan)
  * **Langkah:**
    1. Buat direktori induk `src/frontend/`.
    2. Pindahkan seluruh isi dari folder `public/` (`index.html`, `manifest.webmanifest`, `css/`, `img/`, `js/`) ke dalam `src/frontend/`.
    3. Pastikan folder `public/` lama dihapus setelah seluruh isinya berpindah.
    4. Pastikan struktur internal `src/frontend/js/pages/` tetap utuh memuat 14 file halaman modular.
  * **Kriteria Selesai:**
    * Perintah `test -d src/frontend/js/pages && test ! -d public` keluar dengan exit code 0.
    * Perintah `ls src/frontend/index.html` berhasil menemukan file.

- [x] **T-0.2 Pembentukan kerangka struktur direktori proyek sesuai TRD 4.2**
  * **Ukuran:** S
  * **Rujukan:** TRD 4.2
  * **Dependensi:** T-0.1
  * **File:** Direktori `deploy/`, `src/backend/app/api/`, `src/backend/app/config/`, `src/backend/app/connections/`, `src/backend/app/lib/`, `src/backend/app/middleware/`, `src/backend/app/models/`, `src/backend/db_migrations/`, `src/backend/tests/`
  * **Langkah:**
    1. Buat pohon folder infrastruktur: `deploy/compose/`, `deploy/docker/entrypoints/`.
    2. Buat pohon folder backend FastAPI: `src/backend/app/` beserta sub-folder: `api/`, `config/env/`, `connections/`, `lib/`, `middleware/`, `models/`.
    3. Di dalam `src/backend/app/api/`, buat direktori untuk seluruh 16 domain: `auth`, `user`, `ingredient`, `product`, `batch`, `sale`, `waste_log`, `event`, `forecast`, `recommendation`, `dashboard`, `evaluation`, `subscription`, `integration`, `feedback`, `health`, dan `exceptions`.
    4. Buat pohon folder pengujian: `src/backend/tests/api/auth/`, `src/backend/tests/api/forecast/`, `src/backend/tests/unit/lib/`.
    5. Letakkan file placeholder `.gitkeep` pada direktori kosong agar terlacak git.
  * **Kriteria Selesai:**
    * Perintah shell `find src/backend/app/api -type d | wc -l` mengembalikan minimal 17 baris direktori.

- [x] **T-0.3 Konfigurasi `.gitignore` komprehensif**
  * **Ukuran:** S
  * **Rujukan:** TRD 4.2, TRD 8.4
  * **Dependensi:** T-0.2
  * **File:** `.gitignore`
  * **Langkah:**
    1. Buka dan perbarui file `.gitignore` di root proyek.
    2. Tambahkan pengecualian environment Python: `__pycache__/`, `*.py[cod]`, `.venv/`, `env/`, `dist/`, `*.egg-info/`.
    3. Tambahkan pengecualian file environment rahasia: `*.env`, `!*.env.example`, `.env.*`.
    4. Tambahkan pengecualian artefak pengujian & coverage: `.pytest_cache/`, `.coverage`, `htmlcov/`.
    5. Tambahkan pengecualian file basis data lokal & volume: `*.sqlite`, `*.db`, `postgres_data_*`.
    6. Pertahankan pengecualian Node.js eksisting: `node_modules/`, `npm-debug.log`.
  * **Kriteria Selesai:**
    * File `.gitignore` memuat baris `*.env` dan `!development.env.example` (atau `!env.example`).
    * Perintah `git status --ignored` mengenali file `.env` virtual sebagai ignored.

- [x] **T-0.4 Audit kode prototipe Node.js/SQLite terhadap target FastAPI**
  * **Ukuran:** S
  * **Rujukan:** TRD 1.1, TRD 4.3; kode lama `server/*.js`
  * **Dependensi:** T-0.2
  * **File:** `docs/MIGRATION_AUDIT.md` (baru)
  * **Langkah:**
    1. Analisis alur autentikasi dan sesi di `server/auth.js` serta `server/routes/auth.js`.
    2. Analisis kueri SQL transaksi dan mutasi inventaris di `server/routes/data.js` dan `server/inventory.js`.
    3. Analisis algoritma time-series di `server/forecast.js` dan simulasi safe-buy di `server/analytics.js`.
    4. Buat dokumen catatan ringkas `docs/MIGRATION_AUDIT.md` yang memetakan fungsi lama ke nama use case Python target.
  * **Kriteria Selesai:**
    * File `docs/MIGRATION_AUDIT.md` terbuat dan merinci pemetaan minimal 13 use case lama ke modul backend baru.

---

### Fase 1: Fondasi Backend & Basis Data Relasional
Tujuan: Menginisialisasi aplikasi FastAPI, container Docker lokal, koneksi asinkron PostgreSQL 16, skema tabel SQLAlchemy, dan sistem penanganan error standar.

- [x] **T-1.1 Inisialisasi dependensi & packaging backend (`pyproject.toml`)**
  * **Ukuran:** S
  * **Rujukan:** TRD 2.3, TRD 4.2, TRD 8.2
  * **Dependensi:** T-0.2
  * **File:** `src/backend/pyproject.toml`
  * **Langkah:**
    1. Buat file `src/backend/pyproject.toml` menggunakan standar `setuptools` atau `hatchling`.
    2. Definisikan dependensi inti: `fastapi>=0.110.0`, `uvicorn[standard]>=0.28.0`, `pydantic>=2.6.0`, `pydantic-settings>=2.2.0`.
    3. Definisikan dependensi database: `sqlalchemy[asyncio]>=2.0.28`, `asyncpg>=0.29.0`, `alembic>=1.13.1`.
    4. Definisikan dependensi utilitas & sains: `passlib[bcrypt]>=1.7.4`, `python-jose[cryptography]>=3.3.0`, `python-multipart>=0.0.9`, `openpyxl>=3.1.2`, `httpx>=0.27.0`.
    5. Definisikan dependensi pengujian: `pytest>=8.1.0`, `pytest-asyncio>=0.23.0`.
  * **Kriteria Selesai:**
    * File `src/backend/pyproject.toml` valid secara sintaksis TOML (`python3 -m tomllib src/backend/pyproject.toml` exit 0).

- [x] **T-1.2 Konfigurasi environment & modul pengaturan terpusat (`settings.py`)**
  * **Ukuran:** S
  * **Rujukan:** TRD 3.2, TRD 8.4, TRD 10.1
  * **Dependensi:** T-1.1
  * **File:** `src/backend/app/settings.py`, `src/backend/app/config/env/env.example`
  * **Langkah:**
    1. Buat `src/backend/app/config/env/env.example` berisi variabel: `APP_ENV`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_HOST`, `POSTGRES_PORT`, `JWT_SECRET`, `CORS_ORIGINS`, `ACCESS_TOKEN_EXPIRE_MINUTES=15`, `REFRESH_TOKEN_EXPIRE_DAYS=7`, `RATE_LIMIT_AUTH=5/minute`, `RATE_LIMIT_DEFAULT=60/minute`.
    2. Buat kelas `Settings(BaseSettings)` di `src/backend/app/settings.py` menggunakan `pydantic_settings`.
    3. Sediakan properti komputasi `database_url` berformat `postgresql+asyncpg://{user}:{password}@{host}:{port}/{db}`.
    4. Instansiasi objek singleton `settings = Settings()`.
  * **Kriteria Selesai:**
    * File `src/backend/app/settings.py` dapat diimpor tanpa ImportError.
    * Variabel `settings.database_url` menghasilkan string DSN asyncpg yang valid.

- [x] **T-1.3 Koneksi basis data PostgreSQL asinkron (`postgres.py`)**
  * **Ukuran:** S
  * **Rujukan:** TRD 2.3, TRD 4.2; kode lama `server/db.js`
  * **Dependensi:** T-1.2
  * **File:** `src/backend/app/connections/postgres.py`
  * **Langkah:**
    1. Buat `create_async_engine` dengan pooling (`pool_size=20`, `max_overflow=10`, `pool_pre_ping=True`) merujuk `settings.database_url`.
    2. Buat `async_sessionmaker` dengan flag `expire_on_commit=False`.
    3. Definisikan kelas dasar deklaratif `Base = declarative_base()` untuk model ORM.
    4. Sediakan fungsi generator asinkron `get_async_session()` untuk injeksi sesi database.
  * **Kriteria Selesai:**
    * Modul `src/backend/app/connections/postgres.py` mengekspor `engine`, `AsyncSessionLocal`, `Base`, dan `get_async_session`.

- [x] **T-1.4 Setup Dockerfile & Docker Compose development lokal**
  * **Ukuran:** M
  * **Rujukan:** TRD 8.1, TRD 8.2, TRD 8.3, TRD 8.5
  * **Dependensi:** T-1.2, T-1.3
  * **File:** `deploy/docker/backend.dev.Dockerfile`, `deploy/docker/entrypoints/api.sh`, `deploy/compose/docker-compose.dev.yml`
  * **Langkah:**
    1. Buat `deploy/docker/backend.dev.Dockerfile` berbasis `python:3.11-slim`, instalasi `build-essential` dan `libpq-dev`, pasang non-root user `appuser:appgroup`, dan CMD uvicorn dengan reload.
    2. Buat skrip pembungkus start `deploy/docker/entrypoints/api.sh` yang menjalankan uvicorn pada port 8000 dan berikan izin eksekusi (`chmod +x`).
    3. Buat `deploy/compose/docker-compose.dev.yml` yang mendefinisikan dua service: `db` (`postgres:16` dengan healthcheck pg_isready dan volume `postgres_data_dev`) dan `api` (build dari Dockerfile dev, mounting volume kode sumber, dan `depends_on: db: condition: service_healthy`).
    4. Salin `env.example` ke `src/backend/app/config/env/development.env` untuk kebutuhan lokal.
  * **Kriteria Selesai:**
    * Perintah `docker compose -f deploy/compose/docker-compose.dev.yml config` valid tanpa sintaks error.
    * Service `db` dapat dijalankan via `docker compose -f deploy/compose/docker-compose.dev.yml up -d db` dan mencapai status healthy.

- [x] **T-1.5 Definisi model ORM SQLAlchemy seluruh 12 tabel**
  * **Ukuran:** M
  * **Rujukan:** TRD 5, TRD 5.1; kode lama `server/db.js`
  * **Dependensi:** T-1.3
  * **File:** `src/backend/app/models/__init__.py`, `user_model.py`, `ingredient_model.py`, `product_model.py`, `recipe_model.py`, `batch_model.py`, `sale_model.py`, `waste_log_model.py`, `event_model.py`, `model_state_model.py`, `integration_model.py`, `payment_model.py`, `feedback_model.py`
  * **Langkah:**
    1. Buat `user_model.py`: tabel `users` (id, name, email unique, password_hash, role, pro_until, business_name, business_type, city, phone, created_at).
    2. Buat `ingredient_model.py`: tabel `ingredients` (id, user_id FK, name, unit, category, shelf_life_days, min_stock, price).
    3. Buat `product_model.py` dan `recipe_model.py`: tabel `products` dan relasi komposit `recipes` (product_id FK, ingredient_id FK, qty).
    4. Buat `batch_model.py`, `sale_model.py`, dan `waste_log_model.py`: tabel stok dan transaksi beserta indeks komposit (`idx_batches_user_expiry`, `idx_sales_user_date`, `idx_waste_user_date`).
    5. Buat `event_model.py` dan `model_state_model.py`: tabel event dan model peramalan.
    6. Buat `integration_model.py`, `payment_model.py`, dan `feedback_model.py`: tabel integrasi pihak ketiga, histori langganan, dan umpan balik.
    7. Daftarkan seluruh model di `src/backend/app/models/__init__.py`.
  * **Kriteria Selesai:**
    * Seluruh model turunan `Base` berhasil diimpor sekaligus melalui `from app.models import *` tanpa kegagalan foreign key resolution.

- [x] **T-1.6 Inisialisasi Alembic & migrasi skema awal basis data**
  * **Ukuran:** M
  * **Rujukan:** TRD 2.3 poin 4, TRD 4.3 poin 5, TRD 5, TRD 8.5
  * **Dependensi:** T-1.4, T-1.5
  * **File:** `src/backend/alembic.ini`, `src/backend/db_migrations/env.py`, `src/backend/db_migrations/script.py.mako`, `src/backend/app/migrate.py`, revisi migrasi awal di `db_migrations/versions/`
  * **Langkah:**
    1. Konfigurasi `src/backend/alembic.ini` dengan path skrip `db_migrations`.
    2. Sesuaikan `src/backend/db_migrations/env.py` untuk mengimpor `Base.metadata` dari `app.connections.postgres` dan memuat URL database asinkron dari `settings.database_url`.
    3. Buat skrip migrasi awal mencakup deklarasi 12 tabel, foreign key constraints (`ON DELETE CASCADE`), dan indeks komposit.
    4. Buat skrip utilitas `src/backend/app/migrate.py` untuk menjalankan `command.upgrade(alembic_cfg, "head")` secara programatik.
    5. Jalankan migrasi ke kontainer PostgreSQL lokal.
  * **Kriteria Selesai:**
    * Perintah `docker compose -f deploy/compose/docker-compose.dev.yml run --rm api alembic upgrade head` sukses membuat seluruh 12 tabel.
    * Kueri `\dt` pada psql kontainer `db` menampilkan 12 tabel aplikasi dan tabel `alembic_version`.

- [x] **T-1.7 Standard response envelope & skema Pydantic (`standard_response.py`)**
  * **Ukuran:** S
  * **Rujukan:** TRD 6.1.1, TRD 6.1.2, TRD 6.1.3, TRD 6.1.4
  * **Dependensi:** T-1.1
  * **File:** `src/backend/app/api/standard_response.py`
  * **Langkah:**
    1. Buat model DTO Pydantic generic: `StandardResponse[T]`, `ErrorDetail`, dan `SuccessResponse`.
    2. Implementasikan struktur: `success: bool`, `data: Optional[T]`, `error: Optional[ErrorDetail]`.
    3. Struktur `error` memuat field: `code: str`, `message: str`, dan `request_id: Optional[str]`.
    4. Sediakan fungsi pembantu `create_success_response(data)` dan `create_error_response(code, message, request_id)`.
  * **Kriteria Selesai:**
    * Uji serialisasi Pydantic: `StandardResponse(success=True, data={"id": 1}).model_dump()` menghasilkan dict sesuai kontrak TRD 6.1.3.

- [x] **T-1.8 Sistem exception domain terpusat & error handlers (`exceptions.py` & `handlers.py`)**
  * **Ukuran:** S
  * **Rujukan:** TRD 4.3 poin 3, TRD 6.1.5
  * **Dependensi:** T-1.7
  * **File:** `src/backend/app/api/exceptions/exceptions.py`, `src/backend/app/api/exceptions/handlers.py`
  * **Langkah:**
    1. Buat kelas dasar `CustomException(Exception)` di `exceptions.py` dengan atribut `status_code`, `code`, dan `message`.
    2. Definisikan seluruh exception domain di `exceptions.py`: `EmailAlreadyRegisteredException`, `InvalidCredentialsException`, `NotAuthenticatedException`, `IngredientNotFoundException`, `ProductNotFoundException`, `BatchNotFoundException`, `SaleNotFoundException`, `EventNotFoundException`, `ProPlanRequiredException`, `RateLimitExceededException`, dll.
    3. Buat handler global di `handlers.py` untuk menangkap `CustomException`, `RequestValidationError`, `HTTPException`, dan unhandled server exception.
    4. Sediakan fungsi `setup_exception_handlers(app)` untuk mendaftarkan seluruh handler ke FastAPI instance.
  * **Kriteria Selesai:**
    * Handler `CustomException` mengembalikan HTTP status dan format payload JSON envelope sesuai kontrak TRD 6.1.4 dan matriks TRD 6.1.5.

- [x] **T-1.9 Inisialisasi aplikasi FastAPI utama & endpoint health check (`health/`)**
  * **Ukuran:** S
  * **Rujukan:** TRD 4.2, TRD 4.3 poin 2, TRD 6.2.16, TRD 9 poin 3; kode lama `server/server.js` (`/api/health`)
  * **Dependensi:** T-1.3, T-1.7, T-1.8
  * **File:** `src/backend/app/api/health/views.py`, `src/backend/app/api/health/schema.py`, `src/backend/app/api/main.py`, `src/backend/app/main.py`
  * **Langkah:**
    1. Buat endpoint router `GET /health` di `health/views.py` yang memeriksa konektivitas kueri basis data `SELECT 1`.
    2. Daftarkan router health ke `src/backend/app/api/main.py` di bawah prefix `/health`.
    3. Di `src/backend/app/main.py`, inisialisasi `FastAPI(title="StockWise API")`, pasang handler exception, dan includekan router api ke prefix `/api/v1`.
    4. Tambahkan alias route `GET /healthz` untuk kompatibilitas pengecekan sistem.
  * **Kriteria Selesai:**
    * Jalankan server API via Docker Compose, lalu eksekusi `curl -i http://localhost:8000/api/v1/health`.
    * Mengembalikan status HTTP 200 OK dengan payload `{"success": true, "data": {"status": "healthy", "database": "connected"}, "error": null}`.

---

### Fase 2: Keamanan, Middleware, & Autentikasi
Tujuan: Menerapkan rantai middleware keamanan berlapis, manajemen token JWT via cookie HttpOnly, proteksi rate limit, serta endpoint registrasi, login, dan manajemen akun.

- [x] **T-2.1 Implementasi middleware `request_id` (`request_id.py`)**
  * **Ukuran:** S
  * **Rujukan:** TRD 10.1, TRD 10.2
  * **Dependensi:** T-1.9
  * **File:** `src/backend/app/middleware/request_id.py`
  * **Langkah:**
    1. Buat middleware berbasis BaseHTTPMiddleware atau fungsi ASGI murni.
    2. Periksa apakah header `X-Request-ID` sudah ada di request yang masuk; jika tidak ada, buat UUIDv4 baru.
    3. Simpan ID ke `request.state.request_id`.
    4. Suntikkan header `X-Request-ID` ke respons HTTP yang dikembalikan ke client.
    5. Pasang middleware ini di posisi paling awal rantai eksekusi pada `app/main.py`.
  * **Kriteria Selesai:**
    * Perintah `curl -i http://localhost:8000/api/v1/health` mengembalikan header respons `X-Request-ID` yang valid berformat UUID.

- [x] **T-2.2 Implementasi middleware `security_headers` (`security_headers.py`)**
  * **Ukuran:** S
  * **Rujukan:** TRD 10.1, TRD 10.2
  * **Dependensi:** T-2.1
  * **File:** `src/backend/app/middleware/security_headers.py`
  * **Langkah:**
    1. Buat middleware untuk menyuntikkan header keamanan HTTP esensial.
    2. Tambahkan header respons: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`.
    3. Tambahkan direktif dasar `Content-Security-Policy: default-src 'self'`.
    4. Daftarkan middleware pada `app/main.py`.
  * **Kriteria Selesai:**
    * Perintah `curl -I http://localhost:8000/api/v1/health` menampilkan header `X-Content-Type-Options: nosniff` dan `X-Frame-Options: DENY`.

- [x] **T-2.3 Implementasi middleware `cors` (`cors.py`)**
  * **Ukuran:** S
  * **Rujukan:** TRD 8.4, TRD 10.1, TRD 10.2
  * **Dependensi:** T-2.2
  * **File:** `src/backend/app/middleware/cors.py`
  * **Langkah:**
    1. Konfigurasikan `CORSMiddleware` standar Starlette/FastAPI.
    2. Muat daftar origin yang diizinkan dari `settings.CORS_ORIGINS` (default development: `http://localhost:5173`).
    3. Atur `allow_credentials=True` agar pengiriman cookie sesi lintas origin diizinkan.
    4. Atur `allow_methods=["*"]` dan `allow_headers=["*"]`.
    5. Daftarkan middleware pada `app/main.py`.
  * **Kriteria Selesai:**
    * Request preflight OPTIONS `curl -I -X OPTIONS http://localhost:8000/api/v1/health -H "Origin: http://localhost:5173" -H "Access-Control-Request-Method: GET"` mengembalikan status 200 dan header `Access-Control-Allow-Origin: http://localhost:5173` serta `Access-Control-Allow-Credentials: true`.

- [x] **T-2.4 Implementasi middleware `rate_limit` in-memory (`rate_limit.py`)**
  * **Ukuran:** M
  * **Rujukan:** TRD 3.2 poin 5, TRD 8.4, TRD 10.1, TRD 10.2; PRD 6.3
  * **Dependensi:** T-2.3
  * **File:** `src/backend/app/middleware/rate_limit.py`
  * **Langkah:**
    1. Buat class rate limiter in-memory menggunakan struktur sliding window atau fixed window berbasis timestamp.
    2. Terapkan aturan batas laju sesuai spesifikasi tegas:
       * Endpoint auth (`/api/v1/auth/login`, `/api/v1/auth/register`): **5 request per 1 menit per alamat IP**.
       * Seluruh endpoint API lainnya (`/api/v1/*`): **60 request per 1 menit per user_id** (atau per IP jika request belum login).
    3. Jika batas request terlampaui, kembalikan respons HTTP 429 Too Many Requests dengan header `Retry-After: <detik>` dan payload envelope standar error (`code: "RateLimitExceededException"`).
    4. Daftarkan middleware pada `app/main.py`.
  * **Kriteria Selesai:**
    * Pengujian loop shell: kirim 6 request berturut-turut ke endpoint `/api/v1/auth/login`. Request ke-6 wajib mengembalikan HTTP status 429, header `Retry-After: 60`, dan body error `RateLimitExceededException`.

- [x] **T-2.5 Utilitas kriptografi password & JWT (`jwt_utils.py`)**
  * **Ukuran:** S
  * **Rujukan:** TRD 3.2 poin 2 & 3, TRD 8.4; kode lama `server/auth.js`
  * **Dependensi:** T-1.2
  * **File:** `src/backend/app/lib/jwt_utils.py`
  * **Langkah:**
    1. Implementasikan fungsi hashing sandi `hash_password(plain)` dan verifikasi `verify_password(plain, hashed)` menggunakan `passlib[bcrypt]`.
    2. Implementasikan fungsi pembuatan JWT:
       * `create_access_token(user_id, role)` dengan masa aktif 15 menit (`ACCESS_TOKEN_EXPIRE_MINUTES`).
       * `create_refresh_token(user_id)` dengan masa aktif 7 hari (`REFRESH_TOKEN_EXPIRE_DAYS`).
    3. Implementasikan fungsi pembacaan dan decoding token `decode_token(token)`.
    4. Sediakan fungsi pembantu penyetelan cookie `set_auth_cookies(response, access_token, refresh_token)` dengan atribut `HttpOnly=True`, `SameSite="lax"`, dan `Max-Age` (access: 900 detik, refresh: 604800 detik).
  * **Kriteria Selesai:**
    * Uji fungsi hashing: verifikasi sandi dengan string yang sama menghasilkan True, string berbeda menghasilkan False.
    * Uji decode token mengembalikan payload klaim `sub` yang sesuai dengan `user_id`.

- [x] **T-2.6 Dependensi FastAPI autentikasi & otorisasi (`depedencies.py`)**
  * **Ukuran:** S
  * **Rujukan:** TRD 3.2 poin 6, TRD 4.2; kode lama `server/auth.js` (`requireAuth`)
  * **Dependensi:** T-1.5, T-2.5
  * **File:** `src/backend/app/api/depedencies.py`
  * **Langkah:**
    1. Implementasikan fungsi dependensi `get_db()` yang menginjeksi async session database.
    2. Implementasikan fungsi dependensi `get_current_user(request, db)` yang membaca `access_token` dari cookie request, mendekode klaim token, mengambil record user aktif dari database, dan memvalidasi eksistensinya. Jika tidak valid, lemparkan `NotAuthenticatedException`.
    3. Implementasikan fungsi guard paket `require_pro_plan(current_user)` yang memeriksa `current_user.role == 'pro'`. Jika pengguna berstatus freemium, lemparkan `ProPlanRequiredException`.
  * **Kriteria Selesai:**
    * Modul `src/backend/app/api/depedencies.py` dapat diimpor dan siap digunakan sebagai dependensi FastAPI (`Depends(get_current_user)`).

- [x] **T-2.7 Domain Auth: Registrasi akun baru & Login (`auth/`)**
  * **Ukuran:** M
  * **Rujukan:** TRD 6.2.1; PRD UC-01; kode lama `server/routes/auth.js`
  * **Dependensi:** T-2.4, T-2.6
  * **File:** `src/backend/app/api/auth/views.py`, `schema.py`, `repository.py`, `use_cases.py`
  * **Langkah:**
    1. Buat `schema.py`: DTO Pydantic `RegisterRequest`, `LoginRequest`, dan `UserResponse`.
    2. Buat `repository.py`: query SQLAlchemy asinkron untuk mencari pengguna berdasarkan email (case-insensitive) dan insert user baru.
    3. Buat `use_cases.py`: logika validasi email unik (lemparkan `EmailAlreadyRegisteredException` jika ganda), hashing sandi bcrypt, dan validasi kredensial login (lemparkan `InvalidCredentialsException` jika salah).
    4. Buat `views.py`:
       * `POST /api/v1/auth/register`: mengembalikan data user baru dengan status 201 Created.
       * `POST /api/v1/auth/login`: menyetel cookie `HttpOnly` untuk access token dan refresh token, mengembalikan data user dengan status 200 OK.
    5. Daftarkan router auth ke `src/backend/app/api/main.py`.
  * **Kriteria Selesai:**
    * Eksekusi curl registrasi berhasil: `curl -s -X POST http://localhost:8000/api/v1/auth/register -H "Content-Type: application/json" -d '{"name":"Budi","email":"budi@test.com","password":"Password123!","business_name":"Katering","business_type":"katering"}'` mengembalikan HTTP 201.
    * Eksekusi curl login berhasil: `curl -s -i -X POST http://localhost:8000/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"budi@test.com","password":"Password123!"}'` mengembalikan HTTP 200 dan memuat header `Set-Cookie: access_token=...` serta `Set-Cookie: refresh_token=...`.

- [x] **T-2.8 Domain Auth: Refresh token, Logout, & Get Me**
  * **Ukuran:** S
  * **Rujukan:** TRD 3.2 poin 3, TRD 6.2.1; PRD UC-01; kode lama `server/routes/auth.js`
  * **Dependensi:** T-2.7
  * **File:** `src/backend/app/api/auth/views.py`, `use_cases.py`
  * **Langkah:**
    1. Tambahkan use case di `use_cases.py`:
       * Refresh token: baca cookie `refresh_token`, validasi token, terbitkan access token baru 15 menit tanpa meminta login ulang.
       * Logout: hapus cookie `access_token` dan `refresh_token` dengan menyetel `Max-Age=0`.
    2. Tambahkan endpoint di `views.py`:
       * `POST /api/v1/auth/refresh`: mengembalikan 200 OK dengan header Set-Cookie access_token baru.
       * `POST /api/v1/auth/logout`: menghapus cookie dan mengembalikan 200 OK.
       * `GET /api/v1/auth/me`: dilindungi `get_current_user`, mengembalikan profil pengguna yang sedang login.
  * **Kriteria Selesai:**
    * Eksekusi `GET /api/v1/auth/me` dengan cookie login yang valid mengembalikan data profil pengguna (200 OK).
    * Eksekusi `POST /api/v1/auth/refresh` mengembalikan status 200 dan access_token baru.

- [x] **T-2.9 Domain User: Update profil & Hapus akun (`user/`)**
  * **Ukuran:** S
  * **Rujukan:** TRD 6.2.2; PRD UC-12; kode lama `server/routes/account.js`
  * **Dependensi:** T-2.8
  * **File:** `src/backend/app/api/user/views.py`, `schema.py`, `repository.py`, `use_cases.py`
  * **Langkah:**
    1. Buat `schema.py`: DTO `UpdateProfileRequest` (business_name, city, phone).
    2. Buat `repository.py`: kueri update data user berdasarkan `current_user.id` dan kueri delete user cascade.
    3. Buat `use_cases.py`: logika update profil dan penghapusan akun mandiri.
    4. Buat `views.py`:
       * `PATCH /api/v1/users/me`: memperbarui informasi profil akun (200 OK).
       * `DELETE /api/v1/users/me`: menghapus akun secara permanen beserta data terkait dan membersihkan cookie sesi (200 OK).
    5. Daftarkan router user ke `src/backend/app/api/main.py`.
  * **Kriteria Selesai:**
    * Eksekusi `PATCH /api/v1/users/me` berhasil mengubah `business_name` pada database.
    * Eksekusi `DELETE /api/v1/users/me` menghapus record user dari tabel `users` dan kueri login sesudahnya gagal dengan 401 Unauthorized.

---

### Fase 3: Domain Data Master & Inventaris
Tujuan: Membangun modul manajemen master bahan baku, takaran resep menu produk, pencatatan batch stok masuk berbasis FEFO, limbah dapur, dan hari khusus.

- [x] **T-3.1 Domain Ingredient: Master bahan baku & kategori segar/tahan lama (`ingredient/`)**
  * **Ukuran:** M
  * **Rujukan:** TRD 5, TRD 6.2.3; PRD UC-02; kode lama `server/routes/data.js` (`/api/ingredients`)
  * **Dependensi:** T-2.6
  * **File:** `src/backend/app/api/ingredient/views.py`, `schema.py`, `repository.py`, `use_cases.py`
  * **Langkah:**
    1. Buat `schema.py`: `IngredientCreateRequest`, `IngredientUpdateRequest`, `IngredientResponse`. Validasi kategori wajib `'segar'` atau `'tahan_lama'`.
    2. Buat `repository.py`: operasi CRUD tabel `ingredients` terisolasi ketat menggunakan filter `WHERE user_id = current_user.id`.
    3. Buat `use_cases.py`: validasi bisnis (nama bahan tidak boleh kosong, shelf_life_days > 0, min_stock >= 0).
    4. Buat `views.py` mengimplementasikan 5 endpoint standar:
       * `GET /api/v1/ingredients`: daftar semua bahan milik pengguna.
       * `POST /api/v1/ingredients`: buat bahan baku baru (201 Created).
       * `GET /api/v1/ingredients/{id}`: detail bahan baku.
       * `PUT /api/v1/ingredients/{id}`: perbarui bahan baku.
       * `DELETE /api/v1/ingredients/{id}`: hapus bahan baku.
    5. Daftarkan router ingredient ke `src/backend/app/api/main.py`.
  * **Kriteria Selesai:**
    * Eksekusi `POST /api/v1/ingredients` dengan data ayam broiler mengembalikan 201 Created.
    * Akses bahan ID tersebut dari user lain mengembalikan 404 IngredientNotFoundException (terisolasi).

- [x] **T-3.2 Domain Product & Recipe: Master menu produk & takaran resep (`product/`)**
  * **Ukuran:** M
  * **Rujukan:** TRD 5, TRD 6.2.4; PRD UC-02; kode lama `server/routes/data.js` (`/api/products`, `/api/recipes`)
  * **Dependensi:** T-3.1
  * **File:** `src/backend/app/api/product/views.py`, `schema.py`, `repository.py`, `use_cases.py`
  * **Langkah:**
    1. Buat `schema.py`: DTO `ProductCreateRequest` (name, price, active, recipes: list of `{ingredient_id, qty}`).
    2. Buat `repository.py`: operasi CRUD tabel `products` dan tabel relasi `recipes`. Seluruh operasi dipagari `user_id`.
    3. Buat `use_cases.py`: validasi bahwa setiap `ingredient_id` pada komposisi resep benar-benar milik pengguna aktif; buat produk dan komposisi resep dalam satu transaksi atomik.
    4. Buat `views.py` mengimplementasikan 5 endpoint:
       * `GET /api/v1/products`: daftar produk beserta komposisi resepnya.
       * `POST /api/v1/products`: tambah menu produk & resep (201 Created).
       * `GET /api/v1/products/{id}`: detail produk dan resep.
       * `PUT /api/v1/products/{id}`: perbarui produk dan resepnya.
       * `DELETE /api/v1/products/{id}`: nonaktifkan atau hapus produk.
    5. Daftarkan router product ke `src/backend/app/api/main.py`.
  * **Kriteria Selesai:**
    * `POST /api/v1/products` berhasil menyimpan produk "Ayam Bakar Madu" beserta 2 bahan resepnya dalam tabel `recipes`.

- [x] **T-3.3 Domain Batch: Pencatatan stok masuk FEFO & daftar batch aktif (`batch/`)**
  * **Ukuran:** M
  * **Rujukan:** TRD 5, TRD 6.2.5; PRD UC-03; kode lama `server/routes/data.js` (`/api/batches`), `server/inventory.js`
  * **Dependensi:** T-3.1
  * **File:** `src/backend/app/api/batch/views.py`, `schema.py`, `repository.py`, `use_cases.py`
  * **Langkah:**
    1. Buat `schema.py`: DTO `BatchCreateRequest` (ingredient_id, qty, unit_price, received_date, expiry_date, source).
    2. Buat `repository.py`: operasi CRUD tabel `batches` dengan pengurutan default FEFO (`ORDER BY expiry_date ASC, id ASC`).
    3. Buat `use_cases.py`: validasi tanggal kedaluwarsa tidak boleh lebih awal dari tanggal penerimaan (`expiry_date >= received_date`) dan kepemilikan `ingredient_id`.
    4. Buat `views.py`:
       * `GET /api/v1/batches`: daftar stok batch bahan (dengan opsi filter `ingredient_id` dan `status=active`).
       * `POST /api/v1/batches`: catat stok bahan masuk baru (201 Created).
       * `DELETE /api/v1/batches/{id}`: hapus atau batalkan pencatatan batch.
    5. Daftarkan router batch ke `src/backend/app/api/main.py`.
  * **Kriteria Selesai:**
    * Eksekusi `POST /api/v1/batches` berhasil mencatat batch baru.
    * Kueri `GET /api/v1/batches` mengembalikan daftar batch yang berurutan dari kedaluwarsa terdekat.

- [x] **T-3.4 Domain Waste Log: Pencatatan manual bahan terbuang/rusak (`waste_log/`)**
  * **Ukuran:** S
  * **Rujukan:** TRD 5, TRD 6.2.6; PRD UC-03; kode lama `server/routes/data.js` (`/api/waste`)
  * **Dependensi:** T-3.1
  * **File:** `src/backend/app/api/waste_log/views.py`, `schema.py`, `repository.py`, `use_cases.py`
  * **Langkah:**
    1. Buat `schema.py`: `WasteLogCreateRequest` (ingredient_id, qty, date, reason).
    2. Buat `repository.py`: operasi insert dan select pada tabel `waste_logs` terisolasi per `user_id`.
    3. Buat `use_cases.py`: validasi qty > 0 dan pencatatan alasan limbah (misal: "kedaluwarsa", "busuk", "gosong").
    4. Buat `views.py`:
       * `GET /api/v1/waste-logs`: daftar histori limbah bahan baku pengguna.
       * `POST /api/v1/waste-logs`: catat insiden bahan terbuang manual (201 Created).
    5. Daftarkan router waste_log ke `src/backend/app/api/main.py`.
  * **Kriteria Selesai:**
    * Eksekusi `POST /api/v1/waste-logs` berhasil mencatat log limbah 2 kg ayam dan tersimpan di database.

- [x] **T-3.5 Domain Event: Master hari khusus & multiplier dampak penjualan (`event/`)**
  * **Ukuran:** S
  * **Rujukan:** TRD 5, TRD 6.2.8; PRD UC-08; kode lama `server/routes/data.js` (`/api/events`)
  * **Dependensi:** T-2.6
  * **File:** `src/backend/app/api/event/views.py`, `schema.py`, `repository.py`, `use_cases.py`
  * **Langkah:**
    1. Buat `schema.py`: `EventCreateRequest` (name, date, impact, category).
    2. Buat `repository.py`: operasi CRUD tabel `events` terisolasi per `user_id`.
    3. Buat `use_cases.py`: validasi angka dampak pengali (multiplier > 0, misal: 1.5 untuk lonjakan 50% saat tanggal gajian).
    4. Buat `views.py`:
       * `GET /api/v1/events`: daftar event hari khusus pengguna.
       * `POST /api/v1/events`: tambah event baru (201 Created).
       * `DELETE /api/v1/events/{id}`: hapus event.
    5. Daftarkan router event ke `src/backend/app/api/main.py`.
  * **Kriteria Selesai:**
    * `POST /api/v1/events` berhasil menambahkan event "Tanggal Gajian" dengan impact 1.4 pada tanggal yang ditentukan.

---

### Fase 4: Domain Penjualan & Impor Transaksi
Tujuan: Membangun modul input penjualan harian manual, parser in-memory berkas impor Excel tanpa object storage eksternal, dan penayangan riwayat transaksi latih.

- [x] **T-4.1 Domain Sale: Pencatatan penjualan harian manual & mutasi stok (`sale/`)**
  * **Ukuran:** M
  * **Rujukan:** TRD 2.2 poin 4, TRD 5, TRD 6.2.7; PRD UC-03; kode lama `server/routes/data.js` (`/api/sales`)
  * **Dependensi:** T-3.2, T-3.3
  * **File:** `src/backend/app/api/sale/views.py`, `schema.py`, `repository.py`, `use_cases.py`
  * **Langkah:**
    1. Buat `schema.py`: `SaleCreateRequest` (product_id, qty, date, source="manual").
    2. Buat `repository.py`: insert record penjualan ke tabel `sales`.
    3. Buat `use_cases.py`:
       * Validasi eksistensi dan kepemilikan `product_id`.
       * Jalankan mutasi konsumsi bahan baku dari komposisi resep produk: hitung total bahan yang terpakai dan lakukan pemotongan stok pada tabel `batches` mengikuti prioritas FEFO dalam transaksi ACID.
    4. Buat `views.py`:
       * `GET /api/v1/sales`: daftar transaksi penjualan (dukung filter `start_date` dan `end_date`).
       * `POST /api/v1/sales`: catat transaksi penjualan baru (201 Created).
    5. Daftarkan router sale ke `src/backend/app/api/main.py`.
  * **Kriteria Selesai:**
    * `POST /api/v1/sales` dengan 10 porsi "Ayam Bakar" berhasil mencatat record di tabel `sales` dan memotong kuantitas batch ayam terkait di tabel `batches`.

- [x] **T-4.2 Domain Sale: Impor riwayat penjualan Excel dengan validasi in-memory**
  * **Ukuran:** M
  * **Rujukan:** TRD 3.1 poin 2, TRD 6.2.7; PRD UC-04, PRD 6.2; kode lama `server/routes/data.js` (`/api/import`)
  * **Dependensi:** T-4.1
  * **File:** `src/backend/app/api/sale/views.py`, `use_cases.py`, `schema.py`
  * **Langkah:**
    1. Buat endpoint `POST /api/v1/sales/import-excel` menerima `UploadFile` (multipart/form-data).
    2. Di `use_cases.py`, baca stream byte berkas Excel langsung di memori (*in-memory*) menggunakan `openpyxl` tanpa menyimpan berkas fisik ke disk.
    3. Terapkan validasi ketat sesuai PRD 6.2:
       * Validasi format tanggal (ISO `YYYY-MM-DD` atau tipe Date Excel).
       * Validasi konsistensi nama produk/menu terhadap master `products` milik pengguna.
       * Validasi kelengkapan kolom wajib (Tanggal, Menu, Jumlah).
    4. Jika terdapat baris tidak valid, batalkan proses dan kembalikan detail baris error. Jika valid, masukkan data transaksi secara massal (*bulk insert*) ke tabel `sales`.
  * **Kriteria Selesai:**
    * Upload file contoh Excel yang valid menghasilkan respons 200 OK dengan payload `{"imported_rows": N, "errors": []}`.
    * Upload file Excel dengan format tanggal salah mengembalikan 422 Unprocessable Entity dan daftar nomor baris yang salah.

- [x] **T-4.3 Domain Sale: Unduh template Excel & Riwayat transaksi latih (`sale/`)**
  * **Ukuran:** S
  * **Rujukan:** TRD 6.2.7; PRD UC-04, PRD UC-10; kode lama `server/routes/data.js`
  * **Dependensi:** T-4.2
  * **File:** `src/backend/app/api/sale/views.py`, `use_cases.py`
  * **Langkah:**
    1. Buat generator file template Excel di memori (`openpyxl`) yang memuat header kolom standar: `Tanggal`, `Nama Menu`, `Jumlah Porsi Terjual`.
    2. Implementasikan endpoint `GET /api/v1/sales/template` yang mengembalikan berkas `.xlsx` biner (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`).
    3. Buat endpoint `GET /api/v1/sales/history` (UC-10) untuk meninjau dataset transaksi historis yang telah tervalidasi bersih dan siap menjadi data latih model.
  * **Kriteria Selesai:**
    * Perintah `curl -o template.xlsx http://localhost:8000/api/v1/sales/template` berhasil mengunduh file Excel yang dapat dibuka dengan benar.

---

### Fase 5: Domain Algoritma Inti Produk (Forecast, FEFO, & Evaluasi)
Tujuan: Melakukan porting logika komputasi time-series exponential smoothing, forward simulation FEFO 60 hari, penilaian Waste Risk Score, dan metrik akurasi WAPE ke modul Python murni di `app/lib/`.

- [x] **T-5.1 Modul pustaka komputasi time-series forecast (`forecast_math.py`)**
  * **Ukuran:** M
  * **Rujukan:** TRD 7.1; PRD UC-08; kode lama `server/forecast.js`
  * **Dependensi:** T-1.1
  * **File:** `src/backend/app/lib/forecast_math.py`
  * **Langkah:**
    1. Porting fungsi komputasi Exponential Smoothing dari `server/forecast.js`:
       $$S_t = \alpha Y_t + (1 - \alpha) S_{t-1}$$
    2. Porting grid-search pemilihan parameter $\alpha \in [0.05, 0.1, 0.2, 0.3, 0.5]$ untuk meminimalkan WAPE pada data histori 120 hari.
    3. Porting perhitungan faktor hari dalam seminggu ($F_{\text{dow}}$) dengan moving window 56 hari (8 minggu).
    4. Porting pembelajaran faktor event ($F_{\text{event}}$) dengan formula bobot kredibilitas data $w = \frac{n}{n + 1}$.
    5. Implementasikan konversi prediksi penjualan menu menjadi kebutuhan bahan mentah berdasarkan takaran resep.
    6. Implementasikan pembentukan rentang estimasi ramalan (rentang $\pm 10\%$ atau berbasis variansi error).
  * **Kriteria Selesai:**
    * Modul `src/backend/app/lib/forecast_math.py` bebas dependensi database, dapat diuji via unit test murni, dan mengembalikan rentang ramalan numerik yang presisi.

- [x] **T-5.2 Modul pustaka inventaris FEFO & simulasi waste 60 hari (`fefo.py`)**
  * **Ukuran:** M
  * **Rujukan:** TRD 7.2; PRD UC-06, PRD UC-07; kode lama `server/inventory.js`, `server/analytics.js`
  * **Dependensi:** T-1.1
  * **File:** `src/backend/app/lib/fefo.py`
  * **Langkah:**
    1. Porting struktur `Inventory` kronologis dari `server/inventory.js` yang mengurutkan batch berdasarkan tanggal kedaluwarsa terdekat.
    2. Porting simulasi forward 60 hari ($T+1$ hingga $T+60$):
       * Batch dengan $\text{expiry\_date} < d$ otomatis dihitung sebagai limbah terbuang (*waste*).
       * Kebutuhan konsumsi harian ramalan dipotongkan secara FEFO dari batch aktif.
    3. Hitung rasio potensi limbah terhadap total stok:
       $$\text{Ratio} = \frac{\text{Waste Value}}{\text{Stok Tersedia} + \text{Rencana Beli}}$$
    4. Tetapkan status `Waste Risk Score`: **rendah** ($<10\%$), **sedang** ($10\% - 30\%$), atau **tinggi** ($>30\%$).
    5. Implementasikan loop optimasi Safe-Buy untuk menurunkan kuantitas beli rekomendasi jika menambah limbah (*Zero Incremental Waste*).
  * **Kriteria Selesai:**
    * Fungsi `simulate_fefo_60_days()` menerima list batch dan kebutuhan harian, lalu mengembalikan proyeksi limbah dan klasifikasi risiko secara tepat.

- [x] **T-5.3 Domain Forecast: Kalkulasi & penayangan proyeksi kebutuhan bahan (`forecast/`)**
  * **Ukuran:** M
  * **Rujukan:** TRD 6.2.9, TRD 7.1; PRD UC-05, PRD UC-08; kode lama `server/routes/data.js` (`/api/forecast`)
  * **Dependensi:** T-4.1, T-5.1
  * **File:** `src/backend/app/api/forecast/views.py`, `schema.py`, `repository.py`, `use_cases.py`
  * **Langkah:**
    1. Buat `schema.py`: DTO `ForecastQuery` (horizon_days: default 7) dan `ForecastResponse` (memuat rentang nilai `qty_min`, `qty_max`, satuan, dan kategori bahan).
    2. Buat `repository.py`: kueri histori penjualan 120 hari terakhir per menu dan komposisi resep bahan.
    3. Buat `use_cases.py`:
       * Validasi batas horizon: paket Freemium dibatasi maksimal horizon 7 hari; horizon 14 dan 30 hari mewajibkan paket Pro (`ProPlanRequiredException`).
       * Muat data penjualan, panggil algoritma `forecast_math.py`, dan konversikan ke kebutuhan bahan baku.
    4. Buat `views.py`:
       * `GET /api/v1/forecast`: mengembalikan proyeksi kebutuhan bahan harian/mingguan dalam bentuk rentang nilai.
    5. Daftarkan router forecast ke `src/backend/app/api/main.py`.
  * **Kriteria Selesai:**
    * Pengguna Freemium meminta `GET /api/v1/forecast?days=7` mendapatkan estimasi rentang (misal: ayam 18–22 kg).
    * Pengguna Freemium meminta `GET /api/v1/forecast?days=14` menerima error 403 Forbidden `ProPlanRequiredException`.

- [x] **T-5.4 Domain Recommendation: Rekomendasi pembelian safe-buy & Waste Risk Score (`recommendation/`)**
  * **Ukuran:** M
  * **Rujukan:** TRD 6.2.10, TRD 7.2; PRD UC-06, PRD UC-07; kode lama `server/analytics.js` (`/api/recommendations`)
  * **Dependensi:** T-5.2, T-5.3
  * **File:** `src/backend/app/api/recommendation/views.py`, `schema.py`, `repository.py`, `use_cases.py`
  * **Langkah:**
    1. Buat `schema.py`: `RecommendationResponse` (ingredient_id, name, current_stock, forecast_demand, recommended_buy_min, recommended_buy_max, waste_risk_score, risk_level, action_message).
    2. Buat `use_cases.py`:
       * Ambil proyeksi kebutuhan bahan dari forecast use case.
       * Ambil stok batch aktif yang masih layak pakai.
       * Hitung rekomendasi beli bersih: $\text{Kebutuhan} - \text{Stok Layak Pakai}$.
       * Panggil fungsi `fefo.py` untuk menjalankan forward simulation dan menetapkan *Waste Risk Score* (rendah/sedang/tinggi) serta saran tindakan.
    3. Buat `views.py`:
       * `GET /api/v1/recommendations`: menyajikan daftar saran pembelian bahan baku bebas limbah.
    4. Daftarkan router recommendation ke `src/backend/app/api/main.py`.
  * **Kriteria Selesai:**
    * Kasus uji makalah tervalidasi: kebutuhan ayam 18–22 kg dengan sisa stok 5 kg menghasilkan rekomendasi pembelian bersih 13–17 kg.

- [x] **T-5.5 Domain Evaluation: Perhitungan metrik WAPE & pelatihan ulang model (`evaluation/`)**
  * **Ukuran:** M
  * **Rujukan:** TRD 6.2.12; PRD 4.1 poin 6, PRD UC-10; kode lama `server/analytics.js` (`/api/evaluasi`), `server/forecast.js`
  * **Dependensi:** T-5.1, T-5.3
  * **File:** `src/backend/app/api/evaluation/views.py`, `schema.py`, `repository.py`, `use_cases.py`
  * **Langkah:**
    1. Buat `schema.py`: `EvaluationResponse` (overall_wape, total_actual_sales, total_forecast_sales, accuracy_percentage, trained_at, per_product: list).
    2. Buat `use_cases.py`:
       * Ambil data penjualan aktual 28 hari terakhir dan bandingkan dengan baseline prediksi terdahulu.
       * Hitung formula WAPE:
         $$\text{WAPE} = \frac{\sum |Y_t - \hat{Y}_t|}{\sum Y_t}$$
       * Akurasi dihitung sebagai: $\max(0, 1 - \text{WAPE}) \times 100\%$.
       * Sediakan fitur pelatihan ulang (*retrain*) parameter model $\alpha$ optimal dan simpan statusnya ke tabel `model_state`.
    3. Buat `views.py`:
       * `GET /api/v1/evaluation`: ambil metrik akurasi peramalan.
       * `POST /api/v1/evaluation/retrain`: latih ulang model peramalan dengan data aktual terbaru (200 OK).
    4. Daftarkan router evaluation ke `src/backend/app/api/main.py`.
  * **Kriteria Selesai:**
    * `GET /api/v1/evaluation` menampilkan persentase akurasi model.
    * `POST /api/v1/evaluation/retrain` memperbarui timestamp `trained_at` di tabel `model_state`.

---

### Fase 6: Domain Dashboard Inventaris
Tujuan: Membangun modul analitik ringkasan operasional harian yang mengagregasikan grafik tren penjualan, pergerakan stok bahan, dan perhitungan otomatis sisa porsi menu yang dapat dibuat.

- [x] **T-6.1 Domain Dashboard: Agregasi metrik, grafik tren penjualan, & kapasitas porsi (`dashboard/`)**
  * **Ukuran:** M
  * **Rujukan:** TRD 6.2.11; PRD UC-09; kode lama `server/routes/data.js` (`/api/dashboard`)
  * **Dependensi:** T-4.1, T-5.4
  * **File:** `src/backend/app/api/dashboard/views.py`, `schema.py`, `repository.py`, `use_cases.py`
  * **Langkah:**
    1. Buat `schema.py`: `DashboardResponse` memuat:
       * `summary`: total_active_ingredients, total_active_products, low_stock_alerts.
       * `sales_trend`: daftar penjualan harian 30 hari terakhir untuk grafik visual.
       * `stock_movement`: daftar mutasi stok masuk dan pemakaian bahan.
       * `product_capacities`: list berisi nama produk dan `portions_available` (porsi yang dapat dibuat dari sisa stok bahan saat ini).
    2. Buat `use_cases.py`:
       * Kueri data histori penjualan agregat.
       * Hitung kapasitas porsi menu secara otomatis: untuk setiap produk, bagi stok aktif tiap bahan dengan takaran resepnya, lalu ambil nilai minimum (*bottleneck ingredient*).
    3. Buat `views.py`:
       * `GET /api/v1/dashboard`: menyajikan seluruh payload kompilasi dashboard dalam satu kali pemanggilan API.
    4. Daftarkan router dashboard ke `src/backend/app/api/main.py`.
  * **Kriteria Selesai:**
    * Panggilan `GET /api/v1/dashboard` mengembalikan seluruh blok summary, sales_trend, dan product_capacities dengan status 200 OK.

---

### Fase 7: Fitur Simulasi (Langganan, Integrasi, & Feedback)
Tujuan: Membangun modul paket Pro, sinkronisasi data pesanan POS/ojol, dan formulir feedback dalam versi simulasi tugas tanpa dependensi pihak ketiga berbayar.

- [x] **T-7.1 Domain Subscription: Simulasi upgrade paket Pro & status kuota (`subscription/`)**
  * **Ukuran:** S
  * **Rujukan:** TRD 6.2.13; PRD 4.2 poin 1, PRD UC-11; kode lama `server/routes/account.js`
  * **Dependensi:** T-2.6
  * **File:** `src/backend/app/api/subscription/views.py`, `schema.py`, `repository.py`, `use_cases.py`
  * **Langkah:**
    1. Buat `schema.py`: `SubscriptionStatusResponse`, `CheckoutRequest`, `CheckoutResponse`.
    2. Buat `use_cases.py`:
       * `get_status`: kembalikan role pengguna aktif (`freemium` atau `pro`), masa berlaku `pro_until`, harga bulanan Rp100.000, dan histori pembayaran di tabel `payments`.
       * `checkout_simulation`: langsung ubah `role` user menjadi `'pro'`, perpanjang `pro_until` 30 hari ke depan, catat record di tabel `payments` dengan status `'completed'`, dan tandai flag `"payment_simulation": true`.
       * `cancel_subscription`: ubah status pengguna kembali menjadi `'freemium'`.
    3. Buat `views.py`:
       * `GET /api/v1/subscription`: status langganan.
       * `POST /api/v1/subscription/checkout`: tombol upgrade paket Pro langsung lunas (201 Created).
       * `POST /api/v1/subscription/cancel`: batalkan paket Pro (200 OK).
    4. Daftarkan router subscription ke `src/backend/app/api/main.py`.
  * **Kriteria Selesai:**
    * Pengguna Freemium mengeksekusi `POST /api/v1/subscription/checkout` berhasil menjadi Pro dan record `users.role` berubah menjadi `'pro'`.

- [x] **T-7.2 Domain Integration: Simulasi koneksi & mock sync POS/Food Delivery (`integration/`)**
  * **Ukuran:** M
  * **Rujukan:** TRD 6.2.14; PRD 4.2 poin 2, PRD UC-13; kode lama `server/routes/account.js`
  * **Dependensi:** T-4.1, T-7.1
  * **File:** `src/backend/app/api/integration/views.py`, `schema.py`, `repository.py`, `use_cases.py`
  * **Langkah:**
    1. Buat `schema.py`: `IntegrationStatusResponse`, `ConnectRequest`, `SyncResponse`.
    2. Di `use_cases.py`:
       * Lindungi endpoint dengan `require_pro_plan` (hanya paket Pro yang dapat mengakses).
       * `connect_provider`: simulasikan penyimpanan token/API key penyedia (`mokapos`, `gofood`, `grabfood`, `shopeefood`) ke tabel `integrations`.
       * `sync_provider`: buat generator data pesanan contoh (*mock order generator*) yang membangkitkan transaksi penjualan realistis dan menyimpannya ke tabel `sales` dengan `source = provider`.
    3. Buat `views.py`:
       * `GET /api/v1/integrations`: daftar status koneksi 4 provider.
       * `POST /api/v1/integrations/{provider}/connect`: hubungkan akun provider (201 Created).
       * `POST /api/v1/integrations/{provider}/sync`: jalankan sinkronisasi pesanan mock (200 OK).
    4. Daftarkan router integration ke `src/backend/app/api/main.py`.
  * **Kriteria Selesai:**
    * Akun Pro mengeksekusi `POST /api/v1/integrations/mokapos/sync` berhasil menambahkan data penjualan contoh ke tabel `sales` tanpa koneksi internet ke MokaPOS riil.

- [x] **T-7.3 Domain Feedback: Formulir sederhana penyimpanan pesan umpan balik (`feedback/`)**
  * **Ukuran:** S
  * **Rujukan:** TRD 6.2.15; PRD 4.2 poin 7, PRD UC-12; kode lama `server/routes/account.js`
  * **Dependensi:** T-2.6
  * **File:** `src/backend/app/api/feedback/views.py`, `schema.py`, `repository.py`, `use_cases.py`
  * **Langkah:**
    1. Buat `schema.py`: `FeedbackCreateRequest` (rating: int 1-5, category: str, message: str).
    2. Buat `repository.py`: kueri insert ke tabel `feedback` memuat `user_id`, rating, category, message, dan timestamp.
    3. Buat `use_cases.py`: simpan masukan teks pengguna langsung ke basis data lokal.
    4. Buat `views.py`:
       * `POST /api/v1/feedback`: kirim pesan umpan balik (201 Created).
    5. Daftarkan router feedback ke `src/backend/app/api/main.py`.
  * **Kriteria Selesai:**
    * Panggilan `POST /api/v1/feedback` dengan rating 5 dan pesan teks berhasil mengembalikan 201 Created dan tersimpan di tabel `feedback`.

---

### Fase 8: Penyesuaian & Integrasi Frontend
Tujuan: Menyesuaikan antarmuka Vanilla JS / PWA di `src/frontend/` agar kompatibel penuh dengan base path API `/api/v1`, envelope standard response, kredensial cookie HttpOnly, serta kode error 401 dan 429.

- [x] **T-8.1 Refactoring klien API Frontend (`src/frontend/js/api.js`)**
  * **Ukuran:** M
  * **Rujukan:** TRD 4.3 poin 7, TRD 6.3; kode frontend `src/frontend/js/api.js`
  * **Dependensi:** T-2.8
  * **File:** `src/frontend/js/api.js`
  * **Langkah:**
    1. Ubah konfigurasi base path dari `/api` menjadi `http://localhost:8000/api/v1` (atau `/api/v1` jika menggunakan reverse proxy lokal).
    2. Pastikan setiap pemanggilan `fetch` menyertakan opsi `credentials: 'include'` agar browser mengirim dan menerima cookie `HttpOnly`.
    3. Tambahkan parser envelope respons terpusat: ekstrak `response.data` jika `success: true`. Jika `success: false`, ekstrak objek `response.error`.
    4. Terapkan interceptor status error:
       * Status 401 Unauthorized: panggil `POST /api/v1/auth/refresh`. Jika refresh gagal, arahkan tampilan ke halaman login (`#auth`).
       * Status 429 Too Many Requests: tangkap header `Retry-After` dan tampilkan notifikasi toast: *"Terlalu banyak permintaan. Silakan tunggu X detik"*.
  * **Kriteria Selesai:**
    * Fungsi `api.get('/health')` mengembalikan payload `data` secara langsung tanpa memecah struktur UI pemanggil.

- [x] **T-8.2 Penyesuaian halaman Auth, Profil Akun, & Onboarding**
  * **Ukuran:** S
  * **Rujukan:** TRD 6.2.1, TRD 6.2.2; PRD UC-01, UC-12
  * **Dependensi:** T-8.1, T-2.9
  * **File:** `src/frontend/js/pages/auth.js`, `src/frontend/js/pages/akun.js`, `src/frontend/js/pages/onboarding.js`
  * **Langkah:**
    1. Sesuaikan form login dan registrasi di `auth.js` untuk memanggil endpoint `/api/v1/auth/login` dan `/api/v1/auth/register`. Hapus penyimpanan token di `localStorage` karena sesi dikelola via cookie HttpOnly.
    2. Sesuaikan `akun.js` untuk memanggil `GET /api/v1/auth/me`, `PATCH /api/v1/users/me`, dan tombol hapus akun `DELETE /api/v1/users/me`.
    3. Sesuaikan alur `onboarding.js` untuk pengguna baru setelah login pertama kali.
  * **Kriteria Selesai:**
    * Pengguna dapat melakukan login melalui form web, halaman beralih ke dashboard, dan nama pengguna tampil di navigasi.

- [x] **T-8.3 Penyesuaian halaman Master Bahan, Menu, & Event**
  * **Ukuran:** S
  * **Rujukan:** TRD 6.2.3, TRD 6.2.4, TRD 6.2.8; PRD UC-02
  * **Dependensi:** T-8.1, T-3.5
  * **File:** `src/frontend/js/pages/bahan.js`, `src/frontend/js/pages/menu.js`, `src/frontend/js/pages/event.js`
  * **Langkah:**
    1. Sesuaikan `bahan.js` untuk operasi CRUD master bahan baku ke `/api/v1/ingredients`.
    2. Sesuaikan `menu.js` untuk input produk dan penentuan takaran bahan resep ke `/api/v1/products`.
    3. Sesuaikan `event.js` untuk penambahan hari khusus dan multiplier ke `/api/v1/events`.
  * **Kriteria Selesai:**
    * Input bahan baru dan pembuatan menu resep di antarmuka web berhasil muncul di daftar tabel UI secara reaktif.

- [ ] **T-8.4 Penyesuaian halaman Penjualan, Impor Excel, & Riwayat**
  * **Ukuran:** S
  * **Rujukan:** TRD 6.2.7; PRD UC-03, UC-04, UC-10
  * **Dependensi:** T-8.1, T-4.3
  * **File:** `src/frontend/js/pages/penjualan.js`, `src/frontend/js/pages/import.js`, `src/frontend/js/pages/riwayat.js`
  * **Langkah:**
    1. Sesuaikan form input penjualan manual di `penjualan.js` ke `/api/v1/sales`.
    2. Sesuaikan drag-and-drop upload berkas Excel di `import.js` ke `/api/v1/sales/import-excel` dan link unduh `/api/v1/sales/template`.
    3. Sesuaikan tabel log riwayat transaksi di `riwayat.js` ke `/api/v1/sales/history`.
  * **Kriteria Selesai:**
    * Berkas template Excel berhasil diunduh via tombol di web, dan pengunggahan berkas Excel menampilkan pesan sukses baris terimpor.

- [ ] **T-8.5 Penyesuaian halaman Forecast, Rekomendasi, Evaluasi, & Dashboard**
  * **Ukuran:** M
  * **Rujukan:** TRD 6.2.9, TRD 6.2.10, TRD 6.2.11, TRD 6.2.12; PRD UC-05, UC-06, UC-07, UC-09
  * **Dependensi:** T-8.1, T-5.5, T-6.1
  * **File:** `src/frontend/js/pages/forecast.js`, `src/frontend/js/pages/rekomendasi.js`, `src/frontend/js/pages/evaluasi.js`, `src/frontend/js/pages/dashboard.js`
  * **Langkah:**
    1. Sesuaikan `forecast.js` untuk menampilkan rentang nilai kebutuhan bahan (mis. 18–22 kg) dari `/api/v1/forecast`.
    2. Sesuaikan `rekomendasi.js` untuk menampilkan kartu rekomendasi beli dan badge warna *Waste Risk Score* (hijau=rendah, kuning=sedang, merah=tinggi) dari `/api/v1/recommendations`.
    3. Sesuaikan `evaluasi.js` untuk menampilkan metrik akurasi WAPE dan tombol latih ulang ke `/api/v1/evaluation`.
    4. Sesuaikan `dashboard.js` untuk merender grafik tren penjualan dan kartu kapasitas porsi produk dari `/api/v1/dashboard`.
  * **Kriteria Selesai:**
    * Halaman dashboard dan rekomendasi merender grafik visual serta indikator skor risiko limbah tanpa error konsol JavaScript di peramban.

- [ ] **T-8.6 Penyesuaian halaman Langganan Pro & Integrasi Mock**
  * **Ukuran:** S
  * **Rujukan:** TRD 6.2.13, TRD 6.2.14; PRD UC-11, UC-13
  * **Dependensi:** T-8.1, T-7.2
  * **File:** `src/frontend/js/pages/langganan.js`
  * **Langkah:**
    1. Sesuaikan tampilan kartu paket Freemium vs Pro di `langganan.js`.
    2. Hubungkan tombol "Tingkatkan ke Pro" ke endpoint `/api/v1/subscription/checkout`.
    3. Hubungkan tombol "Sinkronisasi Sekarang" pada kartu MokaPOS, GoFood, Grab, dan Shopee Partner ke `/api/v1/integrations/{provider}/sync`.
    4. Sediakan modal dialog sederhana untuk form feedback pengguna yang mengirim data ke `/api/v1/feedback`.
  * **Kriteria Selesai:**
    * Klik tombol upgrade di antarmuka langsung mengubah badge pengguna menjadi "PRO" dan membuka akses tombol sinkronisasi.

---

### Fase 9: Pengujian, Data Seeding, & Finalisasi Demo
Tujuan: Mengotomasi rangkaian tes unit dan API, menyediakan skrip data seed realistis untuk pengujian live demo, membersihkan artefak Node.js lama, dan memvalidasi seluruh 13 Use Case.

- [ ] **T-9.1 Otomasi tes unit algoritma (`test_forecast_math.py`, `test_fefo.py`)**
  * **Ukuran:** S
  * **Rujukan:** TRD 4.2; PRD UC-06, UC-07, UC-08
  * **Dependensi:** T-5.1, T-5.2
  * **File:** `src/backend/tests/unit/lib/test_forecast_math.py`, `src/backend/tests/unit/lib/test_fefo.py`
  * **Langkah:**
    1. Buat fixture pengujian data penjualan sintesis 60 hari.
    2. Tulis tes unit untuk `forecast_math.py`: uji perhitungan level smoothing, faktor hari, faktor event, dan keabsahan rentang ramalan.
    3. Tulis tes unit untuk `fefo.py`: uji konsumsi stok batch berurut sesuai tanggal kedaluwarsa, deteksi limbah kedaluwarsa, dan batas klasifikasi *Waste Risk Score*.
    4. Uji kasus batas: stok kosong, kebutuhan 0, dan tanggal kadaluarsa ganda.
  * **Kriteria Selesai:**
    * Perintah `docker compose -f deploy/compose/docker-compose.dev.yml run --rm api pytest tests/unit/lib` lolos 100% (semua assertions passed).

- [ ] **T-9.2 Otomasi tes integrasi API (`test_auth_api.py`, `test_forecast_api.py`)**
  * **Ukuran:** M
  * **Rujukan:** TRD 4.2, TRD 6.2.1, TRD 6.2.9; PRD UC-01, UC-05
  * **Dependensi:** T-2.8, T-5.3
  * **File:** `src/backend/tests/conftest.py`, `src/backend/tests/api/auth/test_auth_api.py`, `src/backend/tests/api/forecast/test_forecast_api.py`
  * **Langkah:**
    1. Di `conftest.py`, siapkan client pengujian `httpx.AsyncClient` yang terhubung ke instance FastAPI dengan test database.
    2. Di `test_auth_api.py`: uji alur registrasi, penolakan email ganda, login sukses (memastikan Set-Cookie), login gagal (401), dan refresh token.
    3. Di `test_forecast_api.py`: buat data bahan, produk, batch, dan penjualan; uji respons endpoint `GET /api/v1/forecast`, serta uji pembatasan kuota horizon Freemium vs Pro.
  * **Kriteria Selesai:**
    * Perintah `docker compose -f deploy/compose/docker-compose.dev.yml run --rm api pytest tests/api` berjalan sukses tanpa error.

- [ ] **T-9.3 Skrip seeding data awal realistis untuk demo (`seed.py`)**
  * **Ukuran:** M
  * **Rujukan:** TRD 5, TRD 8.5; kode lama `server/seed.js`
  * **Dependensi:** T-1.6, T-4.1
  * **File:** `src/backend/app/seed.py`
  * **Langkah:**
    1. Porting data contoh realistis dari `server/seed.js` ke `src/backend/app/seed.py` (berbasis SQLAlchemy async session).
    2. Buat 1 akun demo UMKM Katering: `demo@stockwise.id` (kata sandi ter-hash: `Demo1234!`).
    3. Buat master data bahan baku realistis: Daging Ayam, Beras, Minyak Goreng, Bawang Merah, Cabai Merah.
    4. Buat menu produk & takaran resep: Nasi Ayam Bakar, Nasi Goreng Spesial.
    5. Buat batch stok masuk aktif dan batch mendekati tanggal kedaluwarsa.
    6. Buat riwayat transaksi penjualan selama 90 hari terakhir untuk memicu komputasi model forecast.
    7. Buat event hari khusus (misal: "Tanggal Gajian" dan "Libur Nasional").
  * **Kriteria Selesai:**
    * Perintah `docker compose -f deploy/compose/docker-compose.dev.yml run --rm api python -m app.seed` sukses menyuntikkan seluruh data contoh tanpa pelanggaran integrity constraint.

- [ ] **T-9.4 Pembersihan kode Node.js lama & pembaruan panduan operasional (`README.md`)**
  * **Ukuran:** S
  * **Rujukan:** TRD 1.2, TRD 8.5
  * **Dependensi:** T-9.2, T-9.3, T-8.5
  * **File:** `README.md`, penghapusan folder `server/`, `node_modules/`, `package.json`, `package-lock.json`, `render.yaml`
  * **Langkah:**
    1. Hapus seluruh artefak Node.js lama dari root: folder `server/`, `node_modules/`, `package.json`, `package-lock.json`, dan `render.yaml`.
    2. Tulis ulang `README.md` di root proyek:
       * Deskripsi produk StockWise.
       * Prasyarat sistem (Docker & Docker Compose).
       * Panduan langkah demi langkah menjalankan backend (perintah build, migrasi Alembic, up, dan seed data).
       * Panduan menjalankan frontend via server HTTP statis lokal (`python3 -m http.server 5173` di folder `src/frontend/`).
       * Kredensial akun demo dan tautan Swagger UI docs (`http://localhost:8000/docs`).
  * **Kriteria Selesai:**
    * Direktori `server/` dan `package.json` sudah tidak ada di repositori.
    * Menjalankan instruksi di `README.md` dari awal pada repositori bersih berhasil menampilkan aplikasi web yang berjalan normal.

- [ ] **T-9.5 Verifikasi end-to-end checklist demo 13 Use Case**
  * **Ukuran:** S
  * **Rujukan:** PRD 5.1 (UC-01 s/d UC-13); TRD 6.2
  * **Dependensi:** T-9.4
  * **File:** `docs/CHECKLIST_DEMO.md` (baru)
  * **Langkah:**
    1. Buat checklist pengujian manual interaktif di file `docs/CHECKLIST_DEMO.md` mencakup skenario pengujian 13 Use Case.
    2. Jalankan simulasi pengguna: login akun demo -> lihat dashboard -> lihat rekomendasi ayam 13–17 kg -> tambah stok masuk -> catat penjualan -> uji download/upload Excel -> lihat akurasi WAPE -> coba klik upgrade Pro -> coba klik sinkronisasi MokaPOS -> kirim feedback.
    3. Catat status verifikasi seluruh use case.
  * **Kriteria Selesai:**
    * Seluruh 13 Use Case (UC-01 sampai UC-13) terverifikasi berstatus `PASS` pada `docs/CHECKLIST_DEMO.md`.

---

## 4. Matriks Keterlacakan (Traceability Matrix UC ke Tugas)

Tabel ini memastikan tidak ada kebutuhan fungsional dari PRD yang terlewat dalam rincian tugas implementasi:

| Kode Use Case | Nama Use Case (PRD 5.1) | ID Tugas yang Mengimplementasikan | Checkpoint Verifikasi |
|---|---|---|---|
| **UC-01** | Register dan Sign In | T-2.5, T-2.6, T-2.7, T-2.8, T-8.2, T-9.2 | Akun baru terdaftar, login menghasilkan cookie HttpOnly, refresh token sukses |
| **UC-02** | Atur profil usaha dan bahan | T-1.5, T-3.1, T-3.2, T-8.3 | Master bahan (segar/tahan lama) dan menu resep tersimpan per user_id |
| **UC-03** | Input penjualan dan stok | T-1.5, T-3.3, T-3.4, T-4.1, T-8.4 | Penjualan memotong batch aktif via FEFO, stok masuk dan limbah tercatat |
| **UC-04** | Import data Excel | T-4.2, T-4.3, T-8.4 | Download template Excel dan upload file berhasil divalidasi in-memory |
| **UC-05** | Lihat forecast kebutuhan | T-5.1, T-5.3, T-8.5, T-9.2 | Tampil rentang proyeksi kebutuhan bahan (mis. ayam 18–22 kg) |
| **UC-06** | Lihat rekomendasi pembelian | T-5.2, T-5.4, T-8.5, T-9.1 | Saran beli bersih = kebutuhan - stok layak pakai (contoh uji: 13–17 kg) |
| **UC-07** | Waste Risk Score | T-5.2, T-5.4, T-8.5, T-9.1 | Forward simulation 60 hari menampilkan status risiko rendah/sedang/tinggi |
| **UC-08** | Hitung forecast | T-1.5, T-3.5, T-5.1, T-5.3, T-9.1 | Model time-series mempelajari alpha optimal, pola hari, dan event multiplier |
| **UC-09** | Pantau dashboard inventory | T-6.1, T-8.5 | Dashboard menampilkan tren penjualan dan porsi produk yang dapat dibuat |
| **UC-10** | Lihat riwayat transaksi | T-4.1, T-4.3, T-5.5, T-8.4 | Transaksi historis bersih tampil di UI dan menjadi data latih evaluasi |
| **UC-11** | Berlangganan paket Pro | T-7.1, T-8.6 | Tombol checkout simulasi mengubah role pengguna menjadi Pro secara instan |
| **UC-12** | Kelola akun dan feedback | T-2.9, T-7.3, T-8.2, T-8.6 | Perbarui profil, hapus akun mandiri, dan form pengiriman pesan feedback |
| **UC-13** | Sinkronisasi data via API | T-7.2, T-8.6 | Generator mock orders memasukkan transaksi POS & ojol untuk akun Pro |

---

## 5. Temuan dan Keputusan yang Dibutuhkan

Berikut adalah daftar temuan teknis serta parameter bisnis yang belum ditetapkan secara numerik di makalah/PRD/TRD dan membutuhkan konfirmasi pengembang saat implementasi berlangsung:

1. **Angka Pasti Batas Kuota Transaksi Bulanan Paket Freemium:**
   * *Kondisi:* Makalah menyebutkan bahwa paket Freemium memiliki batasan kuota transaksi per bulan, namun tidak menyebutkan angka eksak.
   * *Temuan Kode Lama:* File prototipe `server/analytics.js` mendefinisikan konstanta `FREE_QUOTA = 300`.
   * *Usulan Teknis:* Terapkan batas 300 transaksi/bulan untuk pengguna Freemium, dan tampilkan pesan upgrade Pro saat kuota tercapai.
2. **Formula Pembagian Persentase Waste Risk Score:**
   * *Kondisi:* Makalah menetapkan tiga kategori risiko (*rendah*, *sedang*, *tinggi*), namun tidak memberikan ambang batas matematis.
   * *Usulan Teknis:* Mengikuti TRD 7.2, gunakan rasio nilai limbah terhadap ketersediaan stok: Rendah ($<10\%$), Sedang ($10\% - 30\%$), dan Tinggi ($>30\%$).
3. **Syarat Minimal Durasi Riwayat Data Sebelum Forecast Pertama:**
   * *Kondisi:* Makalah menyebutkan peramalan dijalankan setelah data terkumpul "beberapa minggu".
   * *Usulan Teknis:* Tetapkan batas minimal 14 hari transaksi aktif agar model time-series memiliki titik data historis yang memadai untuk menghitung faktor hari dalam seminggu.
4. **Kebijakan Default Pembulatan Rekomendasi Belanja Bahan:**
   * *Kondisi:* Beberapa bahan baku dibeli dalam kelipatan satuan tertentu (misal: telur per kg atau per butir, bumbu per pack).
   * *Usulan Teknis:* Rekomendasi pembelian safe-buy dibulatkan ke atas (*ceil*) pada 1 digit desimal terdekat atau mengikuti unit terkecil bahan di master data.
5. **Konsistensi Nama Field Komposisi Resep (`recipe` vs `recipes`) pada Domain Product (Fase 3):**
   * *Kondisi:* TRD 6.2.4 mendefinisikan properti komposisi bahan dengan nama `recipe`, sedangkan rincian langkah T-3.2 di dokumen ini menggunakan nama `recipes`.
   * *Asumsi & Keputusan Implementasi:* Skema request dan response pada `src/backend/app/api/product/schema.py` menerima kedua nama field (`recipe` dan `recipes`) serta mengembalikan keduanya pada respons agar kompatibel penuh dengan kontrak TRD 6.2.4 maupun pengujian T-3.2.
6. **Metode HTTP Pembaruan Data Master (`PUT` vs `PATCH`) & Filter Batch Aktif (`active_only` vs `status=active`) (Fase 3):**
   * *Kondisi:* TRD 6.2.3 menggunakan metode `PATCH` untuk pembaruan bahan dan TRD 6.2.5 menggunakan query parameter `active_only=true`, sedangkan langkah T-3.1/T-3.2/T-3.3 menggunakan `PUT` dan `status=active`.
   * *Asumsi & Keputusan Implementasi:* Endpoint pembaruan di `ingredient/`, `product/`, dan `event/` didaftarkan untuk menerima `PUT` maupun `PATCH`, dan `GET /api/v1/batches` mendukung filter `active_only=true` maupun `status=active`.
7. **Struktur Payload `POST /api/v1/sales` & Endpoint Impor Excel (`import-excel` vs `import`) (Fase 4):**
   * *Kondisi:* TRD 6.2.7.1 mendefinisikan input penjualan dalam bentuk array `items: [{product_id, qty}]` dan TRD 6.2.7.2 mendefinisikan `POST /api/v1/sales/import` (payload JSON `rows`), sedangkan T-4.1 mendefinisikan field tunggal `(product_id, qty, date)` dan T-4.2 mendefinisikan `POST /api/v1/sales/import-excel` (`UploadFile` multipart dengan `openpyxl` in-memory). Selain itu, PRD 4.1.7 menetapkan kuota Freemium `300` transaksi/bulan sementara contoh TRD 6.2.7 menulis `500`.
   * *Asumsi & Keputusan Implementasi:* `SaleCreateRequest` menerima baik format tunggal `(product_id, qty)` maupun daftar `items`; modul `sale/` menyediakan kedua endpoint `POST /api/v1/sales/import-excel` (`UploadFile` in-memory `openpyxl`) dan `POST /api/v1/sales/import` (JSON `rows`); batas kuota Freemium mengikuti PRD 4.1.7 dan prototipe `server/analytics.js` yaitu `300` transaksi/bulan.
8. **Kontrak domain algoritma Fase 5 yang berbeda antara rincian tugas dan TRD:**
   * *Kondisi:* T-5.5 menyebut `POST /api/v1/evaluation/retrain`, sedangkan TRD 6.2.12 menetapkan `/api/v1/evaluation/train`. Bentuk respons ringkas di T-5.3/T-5.4/T-5.5 juga berbeda dari contoh payload rinci TRD 6.2.9/6.2.10/6.2.12.
   * *Asumsi & Keputusan Implementasi:* Mengikuti kontrak TRD yang rinci: endpoint `/train` dan struktur payload contoh pada TRD. Rentang numerik forecast tetap disajikan dalam `need_lo`/`need_hi` sesuai contoh TRD.
9. **Penyebut untuk rasio risiko limbah:**
   * *Kondisi:* TRD 7.2 menyebut `Waste Value / (Stok Tersedia + Rencana Beli)` tanpa mendefinisikan unit nilai penyebut; penjumlahan nilai uang dengan kuantitas stok tidak berdimensi konsisten.
   * *Asumsi & Keputusan Implementasi:* Gunakan nilai stok moneter (kuantitas batch × harga satuan) ditambah nilai rencana beli moneter sebagai penyebut, agar rasio dapat dibandingkan dengan ambang persentase 10% dan 30%. Jika penyebut nilai moneter bernilai 0 (mis. unit price 0), fallback ke rasio kuantitas (`waste_qty / (stock_qty + planned_buy)`).
10. **Horizon Adaptif Pembelian Bahan Baku (`segar` vs `tahan_lama`):**
    * *Kondisi:* PRD UC-05 menetapkan periode adaptif (harian untuk segar, mingguan/bulanan untuk tahan lama).
    * *Asumsi & Keputusan Implementasi:* Mengikuti prototipe `server/analytics.js`: endpoint rekomendasi pembelian menghitung kebutuhan 1 hari ($T+1$) untuk bahan segar (`segar`), 30 hari untuk bahan sangat tahan lama ($\ge 90$ hari), dan 7 hari untuk bahan standar. Skema forecast juga mengembalikan field `category`.
11. **Agregasi Interval Kepercayaan Kebutuhan Bahan Baku (`need_lo` & `need_hi`):**
    * *Kondisi:* TRD tidak merinci formula agregasi rentang estimasi kebutuhan bahan lintas menu resep.
    * *Asumsi & Keputusan Implementasi:* Mengikuti prototipe `server/forecast.js`: varians kesalahan diakumulasi secara kuadratik $\sum (\text{half} \times \text{qty})^2$ dan diakarkan $sd = \sqrt{\text{var}}$, menghasilkan interval $[need - sd, need + sd]$ yang konsisten dan akurat.
12. **Perhitungan Metrik `accuracy_prev` & Alias Route `/retrain`:**
    * *Kondisi:* TRD 6.2.12 memuat field `accuracy_prev`, namun skema `model_state` hanya menyimpan satu WAPE terkini. Tugas T-5.5 juga menyebut `/retrain` sementara TRD menyebut `/train`.
    * *Asumsi & Keputusan Implementasi:* `accuracy_prev` dihitung secara dinamis dari jendela 28 hari sebelumnya ($T-56$ s.d. $T-28$) jika riwayat aktif mencukupi, dan router mendaftarkan kedua endpoint `POST /api/v1/evaluation/train` dan `POST /api/v1/evaluation/retrain`.

13. **Kontrak payload Dashboard (T-6.1) berbeda dari TRD 6.2.11:**
    * *Kondisi:* T-6.1 menyebut blok `summary`, `sales_trend`, `stock_movement`, `product_capacities`, sedangkan TRD 6.2.11 menetapkan `date`, `counts`, `waste`, `risk`, `buy`, `portions`. PRD UC-09 juga menyebut grafik penjualan dan pergerakan stok, yang tidak ada di payload TRD.
    * *Asumsi & Keputusan Implementasi:* Mengikuti TRD persis (aturan "ikuti TRD"). Blok `sales_trend` dan `stock_movement` tidak dibuat; bila grafik diperlukan frontend, perlu keputusan menambah blok atau endpoint terpisah.
14. **Definisi perhitungan Dashboard yang tidak dirinci TRD:**
    * *Asumsi & Keputusan Implementasi:* `waste.*_cost` = Σ(qty waste_logs × `ingredients.price`) per bulan kalender (WIB), `reduction_percentage` = (prev − cur)/prev × 100 (0 bila prev = 0); `risk.high/medium` dari level `tinggi/sedang` hasil rekomendasi, `low` = sisa bahan; `buy` dari item berstatus `beli` (jumlah dan Σ`buy_cost`); `history_days` = jumlah tanggal penjualan berbeda; `remaining_portions` = min(⌊stok layak pakai / takaran⌋) di seluruh bahan resep produk aktif (0 bila tanpa resep). Bila riwayat < 14 hari (rekomendasi tidak tersedia), risk/buy bernilai 0 dan `low` = jumlah bahan.
15. **Kontrak Subscription (Fase 7) — TRD vs tugas:**
    * *Kondisi:* TRD 6.2.13 meminta body checkout `{method, months}`, `pro_until` bertipe datetime (`...T23:59:59Z`), `order_id` `SUB-YYYYMMDD-NNN`, dan metode `qris/va_bca/va_mandiri/gopay`; T-7.1 hanya menyebut perpanjangan 30 hari dan status `completed`. Kolom `users.pro_until` bertipe `date`.
    * *Asumsi & Keputusan Implementasi:* Mengikuti TRD: `months` (default 1, 1–12) → 30 × months hari, amount Rp100.000 × months; `pro_until` dikembalikan sebagai tanggal (`date`) karena kolom DB bertipe date; `order_id` = `SUB-<tanggal mulai>-<id payment 3 digit>`; record `payments.status = 'completed'`, respons `status: "active"`. Checkout saat masih Pro memperpanjang dari `pro_until`. `cancel` langsung mengembalikan `role` ke `freemium` dan mengosongkan `pro_until` (sesuai T-7.1; TRD berjudul "batalkan perpanjangan" tetapi respons contohnya `role: freemium`).
16. **Kontrak Integration (Fase 7):**
    * *Kondisi:* TRD 6.2.14 menetapkan `GET /integrations` hanya butuh login, sedangkan T-7.2 menyebut seluruh endpoint dilindungi Pro. Pesan 403 TRD berbeda dari pesan default `require_pro_plan`. Skema `sales` tidak punya kolom tanggal/waktu pesanan selain `date`.
    * *Asumsi & Keputusan Implementasi:* `GET` terbuka untuk semua pengguna login; `connect` dan `sync` memakai `require_pro_plan` dengan pesan TRD. Mock sync membuat 8 baris `sales` (produk aktif acak, qty 1–3, tanggal hari ini WIB, `source = provider`); `synced_orders` = jumlah baris, 0 bila tak ada produk aktif. `api_key` disimpan apa adanya (simulasi) dan tidak pernah dikembalikan di respons. Kuota Freemium 300 transaksi tidak diterapkan pada sync (hanya Pro yang dapat sync).
17. **Tes API dan rate limit:** Tes yang login berulang melebihi batas 5 req/menit pada `/auth/*`. `tests/conftest.py` kini memanggil `rate_limiter.reset()` sebelum tiap tes; kode produksi tidak diubah.
18. **Penyesuaian Integrasi Frontend (Fase 8A - T-8.1, T-8.2, T-8.3):**
    * *Kondisi:* TRD 4.3 poin 7 & 6.1 mensyaratkan autentikasi berbasis HttpOnly cookie dengan penanganan refresh 401 dan rate limit 429. Halaman master menu lama menggunakan format `recipes` array sedangkan TRD 6.2.4 menggunakan `recipe`. Pada `event.js`, input persentase dampak menggunakan slider/number yang perlu sinkron dengan backend `multiplier = 1.0 + pct/100`.
    * *Asumsi & Keputusan Implementasi:*
      - `src/frontend/js/api.js`: Konfigurasi base path menunjuk ke `http://localhost:8000/api/v1` dengan `credentials: 'include'` aktif di seluruh request. Interceptor 401 mengimplementasikan lock single-flight refresh dan mengecualikan `/auth/login`, `/auth/register`, `/auth/refresh`, `/auth/logout` dari rekursi refresh. Penanganan 429 mengekstrak header `Retry-After` dan memicu toast "Terlalu banyak permintaan. Silakan tunggu X detik".
      - `src/frontend/js/pages/auth.js` & `akun.js`: Token dihapus total dari `localStorage`/`sessionStorage`. Pembaruan profil menggunakan `PATCH /users/me`, perubahan password `PATCH /users/me/password`, dan hapus akun `DELETE /users/me`.
      - `src/frontend/js/pages/bahan.js`, `menu.js`, `event.js`: Diadaptasi penuh ke endpoint `/ingredients`, `/batches`, `/waste-logs`, `/products`, dan `/events` dengan payload dan respons envelope standar. Seluruh perubahan tabel berjalan reaktif tanpa reload halaman.
