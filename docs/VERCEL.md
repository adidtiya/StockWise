# Deploy StockWise ke Vercel

StockWise dideploy sebagai **satu project Vercel** dengan dua service:

- `frontend` — static PWA dari `src/frontend/`
- `backend` — FastAPI dari `src/backend/`

Keduanya berbagi satu domain Vercel, sehingga cookie autentikasi `SameSite=Lax`
tetap bekerja tanpa konfigurasi CORS cross-site.

```text
https://<project>.vercel.app
├── /api/v1/*      -> backend FastAPI
├── /docs, /redoc  -> backend
├── /healthz       -> backend
└── /*             -> frontend static

Backend Vercel  -> Supabase Transaction Pooler :6543
GitHub Actions  -> Supabase Session Pooler :5432 -> Vercel Deploy Hook
```

## 1. Prasyarat

1. Repository GitHub `adidtiya/StockWise` sudah terhubung.
2. Akun Vercel dengan akses membuat project.
3. Project Supabase aktif dan tidak sedang di-pause.
4. Dua connection string Supabase:
   - **Session pooler** (port `5432`) untuk migrasi dan seed.
   - **Transaction pooler** (port `6543`) untuk runtime Vercel.
5. Vercel **Services** masih berstatus beta, tetapi tersedia pada semua plan.

Database Supabase saat ini kosong. Migrasi harus dijalankan sebelum aplikasi
dapat digunakan.

## 2. Konfigurasi Vercel

### 2.1 Import project

1. Buka Vercel Dashboard -> **Add New Project**.
2. Import repository StockWise.
3. Gunakan **root directory repo** (bukan `src/backend` atau `src/frontend`).
4. Production branch: `main`.
5. Vercel membaca `vercel.json` dan membangun service `frontend` dan `backend`.

### 2.2 Environment Variables (Production)

Isi di **Project Settings -> Environment Variables**:

| Variable | Nilai |
|---|---|
| `APP_ENV` | `production` |
| `POSTGRES_USER` | `postgres.<project-ref>` |
| `POSTGRES_PASSWORD` | password database Supabase |
| `POSTGRES_DB` | `postgres` |
| `POSTGRES_HOST` | host pooler dari dashboard Supabase |
| `POSTGRES_PORT` | `6543` |
| `DATABASE_SSL` | `true` |
| `DB_POOL_SIZE` | `1` |
| `DB_MAX_OVERFLOW` | `0` |
| `DB_POOL_RECYCLE` | `300` |
| `DB_STATEMENT_CACHE_SIZE` | `0` |
| `JWT_SECRET` | secret produksi yang kuat |
| `CORS_ORIGINS` | `https://<project>.vercel.app` atau custom domain |

Catatan:

- Gunakan **transaction pooler port `6543`** untuk runtime Vercel.
- `DB_STATEMENT_CACHE_SIZE=0` wajib untuk transaction pooler karena prepared
  statement tidak didukung secara persisten.
- Jangan set `MIGRATION_DATABASE_URL` di Vercel; variabel itu hanya untuk CI.
- `APP_ENV=production` membuat cookie sesi `Secure`; pastikan domain memakai HTTPS.

### 2.3 Region function

`vercel.json` mengatur function backend ke region **`hnd1`** (Tokyo) agar dekat
dengan Supabase region `ap-northeast-1`. Jika project Supabase dipindah region,
sesuaikan nilai `regions` pada `vercel.json`.

### 2.4 Deploy Hook

1. Buka **Project Settings -> Git -> Deploy Hooks**.
2. Buat hook dengan nama `github-actions` dan branch `main`.
3. Simpan URL hook sebagai secret GitHub `VERCEL_DEPLOY_HOOK_URL`.

`vercel.json` menonaktifkan auto-deploy untuk branch `main`, sehingga production
hanya dideploy setelah workflow migrasi berhasil dan memanggil Deploy Hook.
Preview deployment pada branch lain tetap mengikuti pengaturan Vercel.

> Jika tidak membutuhkan preview deployment, ubah
> `git.deploymentEnabled` menjadi `false` agar semua branch hanya dideploy lewat
> workflow. Preview yang memakai database produksi berisiko mengubah data demo.

## 3. GitHub Actions

Workflow: `.github/workflows/deploy-production.yml`

Alur:

1. Trigger push ke `main` atau `workflow_dispatch`.
2. Install dependency backend.
3. Jalankan `alembic upgrade head` ke Supabase **session pooler**.
4. Jika input `seed=true`, jalankan `python -m app.seed`.
5. Panggil Vercel Deploy Hook setelah migrasi berhasil.

### 3.1 Secrets GitHub

Buka **Settings -> Secrets and variables -> Actions** dan tambahkan:

| Secret | Nilai |
|---|---|
| `SUPABASE_SESSION_DATABASE_URL` | Session pooler port `5432`, termasuk `?ssl=require` |
| `VERCEL_DEPLOY_HOOK_URL` | URL Deploy Hook Vercel |

Workflow memakai secret session pooler untuk `DATABASE_URL` dan
`MIGRATION_DATABASE_URL`, karena `app.seed` memakai engine aplikasi, bukan URL
migrasi. Jangan gunakan transaction pooler port `6543` untuk migrasi.

### 3.2 Seed manual

Seed **tidak** berjalan otomatis pada setiap deploy karena akan me-reset data
akun demo. Untuk menjalankannya:

1. Buka **Actions -> Deploy Production -> Run workflow**.
2. Pilih branch `main`.
3. Centang `seed` jika ingin mengisi ulang data demo.
4. Jalankan.

## 4. Deploy Pertama

1. Commit dan push `vercel.json`, `.vercelignore`, `.python-version`,
   perubahan `api.js`, workflow, dan dokumentasi.
2. Pastikan environment variables Vercel dan GitHub Secrets sudah diisi.
3. Jalankan workflow **Deploy Production** secara manual (atau push ke `main`).
4. Workflow menjalankan migrasi, memanggil Deploy Hook, lalu Vercel membangun
   kedua service.
5. Setelah deploy selesai, jalankan seed manual bila database masih kosong.

## 5. Verifikasi

Ganti `<domain>` dengan domain Vercel:

```bash
curl https://<domain>/api/v1/health
```

Respons sehat:

```json
{"success":true,"data":{"status":"healthy","database":"connected"},"error":null}
```

Periksa juga:

- `https://<domain>/` — frontend PWA.
- `https://<domain>/docs` — Swagger UI.
- Login `demo@stockwise.id` / `Demo1234!` setelah seed.
- Vercel Logs untuk error runtime.
- Supabase Dashboard -> Database -> Connection Pooling untuk jumlah koneksi.

## 6. Batasan dan Catatan

- **Vercel Services masih beta**; jika konfigurasi `services` berubah, gunakan
  satu FastAPI app dengan static mount atau dua project + custom domain.
- **Rate limiter** saat ini in-memory per instance Vercel, sehingga tidak
  konsisten lintas instance. Untuk produksi ketat, gunakan Redis/Upstash.
- **Request body** Vercel dibatasi 4.5 MB; impor Excel harus di bawah batas itu.
- **Function duration** dibatasi 60 detik pada konfigurasi ini (`maxDuration`);
  endpoint analitik berat dapat menyesuaikan nilainya.
- **Preview deployment** pada branch lain tetap aktif. Jangan arahkan Preview ke
  database produksi; gunakan Supabase project terpisah atau nonaktifkan preview.
- **Supabase free tier** dapat pause setelah 7 hari tanpa aktivitas; aktifkan
  kembali dari dashboard sebelum demo.
- **Jangan commit** `supabase.env`, `development.env`, atau URL database asli.
  `.vercelignore` mencegah file tersebut ikut ke Vercel.

## 7. Troubleshooting

| Gejala | Penyebab | Solusi |
|---|---|---|
| `InvalidPasswordError` / `password authentication failed` | Password atau host salah | Periksa env Vercel; gunakan password database, bukan anon key. |
| `TypeError ... sslmode` | URL memakai parameter libpq | Gunakan `?ssl=require`; aplikasi juga menormalkan `sslmode`. |
| `prepared statement ... does not exist` | Transaction pooler tanpa menonaktifkan statement cache | Set `DB_STATEMENT_CACHE_SIZE=0`. |
| `too many connections` | Pool terlalu besar atau banyak instance | Set `DB_POOL_SIZE=1` dan `DB_MAX_OVERFLOW=0`. |
| `/docs` 404 | Rewrite belum mencakup `/docs` | Periksa rewrites di `vercel.json`. |
| Cookie tidak terkirim | Frontend/backend beda site atau bukan HTTPS | Gunakan Services satu domain dan `APP_ENV=production` di HTTPS. |
| Build Vercel gagal karena import `app` | Entrypoint/pyproject tidak terbaca | Periksa `services.backend` di `vercel.json` dan log build. |
| Project Supabase tidak merespons | Free tier di-pause | Buka dashboard Supabase untuk mengaktifkan project. |
| Perubahan schema belum diterapkan | Workflow migrasi gagal atau belum dijalankan | Periksa log Actions dan Deploy Hook. |

## 8. Development Lokal

Alur lokal tidak berubah:

```bash
docker compose -f deploy/compose/docker-compose.dev.yml up -d db
docker compose -f deploy/compose/docker-compose.dev.yml run --rm api alembic upgrade head
docker compose -f deploy/compose/docker-compose.dev.yml run --rm api python -m app.seed
docker compose -f deploy/compose/docker-compose.dev.yml up -d api
python3 -m http.server 5173 --directory src/frontend
```

Vercel hanya menggantikan hosting frontend/backend dan koneksi database saat
deployment; konfigurasi Docker lokal tetap berlaku.
