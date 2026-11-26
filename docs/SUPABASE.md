# Panduan Integrasi Supabase (PostgreSQL)

StockWise tetap memakai **FastAPI + SQLAlchemy async + asyncpg + Alembic**. Supabase
hanya menggantikan host PostgreSQL, sehingga tidak ada perubahan model, tabel, atau
kode domain. Frontend tidak memerlukan `supabase-js` dan backend tidak memerlukan
anon/service_role key.

## 1. Prasyarat

1. Project Supabase aktif (disarankan region `ap-southeast-1` / Singapore).
2. Database password dari **Project Settings -> Database**.
3. Akses ke **Connect -> Session pooler** di dashboard Supabase.
4. Docker berjalan (untuk menjalankan API dan migrasi).

> Supabase free tier mem-pause project setelah 7 hari tanpa aktivitas. Untuk demo,
> pastikan project dipakai secara berkala atau tingkatkan paket.

## 2. Pilih Metode Koneksi

| Mode | Host / Port | User | Catatan |
|---|---|---|---|
| **Session pooler** (disarankan) | `aws-0-<region>.pooler.supabase.com` : `5432` | `postgres.<project-ref>` | IPv4, mendukung prepared statement, cocok untuk Docker dan backend jangka panjang. |
| Direct connection | `db.<project-ref>.supabase.co` : `5432` | `postgres` | Hanya IPv6 secara default; butuh IPv4 add-on atau jaringan IPv6. Docker bridge biasanya tidak memiliki IPv6. |
| Transaction pooler | `aws-0-<region>.pooler.supabase.com` : `6543` | `postgres.<project-ref>` | Hemat koneksi, tetapi prepared statement harus dinonaktifkan. |

Gunakan **Session pooler** untuk StockWise. Database yang dipakai adalah `postgres`
(pooler Supabase tidak mendukung nama database kustom).

## 3. Konfigurasi Environment

Untuk database lokal (Docker Compose development), gunakan `development.env.example`.
Untuk Supabase, jika `supabase.env` belum ada, salin template berikut:

```bash
cp src/backend/app/config/env/supabase.env.example src/backend/app/config/env/supabase.env
```

Isi nilai berikut di `supabase.env` (jangan di-commit):

| Variabel | Nilai |
|---|---|
| `POSTGRES_USER` | `postgres.<project-ref>` (dari Session pooler) |
| `POSTGRES_PASSWORD` | Database password |
| `POSTGRES_DB` | `postgres` |
| `POSTGRES_HOST` | Host Session pooler persis dari dashboard |
| `POSTGRES_PORT` | `5432` |
| `DATABASE_SSL` | `true` |
| `DB_POOL_SIZE` | `5` |
| `DB_MAX_OVERFLOW` | `5` |

`APP_ENV`:

- `development` untuk demo lokal via HTTP.
- `production` bila backend diakses via HTTPS (cookie sesi otomatis `Secure`).
  Jangan memakai `production` saat demo lewat `http://localhost`, karena browser
  tidak akan mengirim cookie `Secure`.

Jika platform deployment menyuntikkan satu URL penuh, gunakan `DATABASE_URL`:

```env
DATABASE_URL=postgresql+asyncpg://postgres.<project-ref>:<password>@<host>:5432/postgres?ssl=require
```

Aplikasi otomatis mengubah skema `postgresql://`/`postgres://` menjadi
`postgresql+asyncpg://` dan mengubah `sslmode` menjadi `ssl` (asyncpg tidak menerima
parameter `sslmode`).

## 4. Migrasi dan Seed

Dari root repositori:

```bash
docker compose -f deploy/compose/docker-compose.supabase.yml build
docker compose -f deploy/compose/docker-compose.supabase.yml run --rm api alembic upgrade head
docker compose -f deploy/compose/docker-compose.supabase.yml run --rm api python -m app.seed
docker compose -f deploy/compose/docker-compose.supabase.yml up -d api
```

Verifikasi:

```bash
curl http://localhost:8000/api/v1/health
```

Respons yang diharapkan: `{"success": true, "data": {"status": "healthy", "database": "connected"}}`.

Di Supabase Table Editor, pastikan ada 12 tabel aplikasi, tabel `alembic_version`,
dan akun demo `demo@stockwise.id` (password `Demo1234!`).

## 5. Amankan Akses Data API

Backend terhubung sebagai role `postgres`, sehingga RLS tidak mengganggu backend.
Jalankan SQL berikut di **Supabase SQL Editor** setelah migrasi agar role
`anon`/`authenticated` tidak dapat membaca tabel aplikasi melalui Data API:

```sql
DO $$
DECLARE
  t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    LOOP
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
    END LOOP;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
  END IF;
END
$$;
```

Jangan menaruh anon/service_role key di frontend atau repositori. StockWise tidak
memerlukannya.

## 6. Pengujian

Test API membuat pengguna dan transaksi nyata (`src/backend/tests/conftest.py`).
Karena itu:

- Jalankan `pytest` hanya terhadap PostgreSQL lokal (compose dev).
- `pytest` otomatis berhenti bila mendeteksi host Supabase, kecuali
  `ALLOW_REMOTE_TESTS=1` di-set untuk project Supabase khusus test.

```bash
docker compose -f deploy/compose/docker-compose.dev.yml up -d db
docker compose -f deploy/compose/docker-compose.dev.yml run --rm api alembic upgrade head
docker compose -f deploy/compose/docker-compose.dev.yml run --rm api pytest
```

## 7. Backup dan Restore

Ambil backup sebelum reset data atau perubahan besar:

```bash
pg_dump "postgresql://postgres.<project-ref>:<password>@<host>:5432/postgres?sslmode=require" \
  --no-owner --no-privileges -Fc -f stockwise_backup.dump
```

Restore ke project Supabase (hati-hati: menimpa data yang ada):

```bash
pg_restore --clean --no-owner --no-privileges \
  -d "postgresql://postgres.<project-ref>:<password>@<host>:5432/postgres?sslmode=require" \
  stockwise_backup.dump
```

Catatan: `pg_dump`/`pg_restore` memakai `sslmode` (libpq), sedangkan aplikasi
memakai `ssl` (asyncpg).

## 8. Troubleshooting

| Gejala | Penyebab | Solusi |
|---|---|---|
| `TypeError: connect() got an unexpected keyword argument 'sslmode'` | URL memakai parameter libpq | Gunakan `?ssl=require` atau biarkan aplikasi menormalkannya. |
| `InvalidPasswordError` | Password salah atau karakter khusus tidak di-encode | Isi `POSTGRES_PASSWORD` mentah dengan variabel terpisah; jangan menyalin URL yang sudah di-encode. |
| Timeout / host tidak ditemukan | Memakai direct connection dari Docker tanpa IPv6 | Gunakan Session pooler port `5432`. |
| `prepared statement ... does not exist` | Memakai transaction pooler `6543` | Set `DB_STATEMENT_CACHE_SIZE=0` atau pindah ke Session pooler. |
| `too many connections` | Pool terlalu besar atau banyak proses | Turunkan `DB_POOL_SIZE`/`DB_MAX_OVERFLOW`. |
| Project tidak merespons | Free tier di-pause | Buka dashboard Supabase untuk mengaktifkan kembali. |
| `ZoneInfoNotFoundError` saat seed di luar Docker | Host Windows tidak memiliki tzdata | Jalankan seed di container, atau instal paket `tzdata`. |

## 9. Catatan Deployment

- Jika frontend dan backend berada di domain berbeda, sesuaikan `CORS_ORIGINS`,
  `window.__API_BASE__`/`src/frontend/js/api.js:3`, dan set `APP_ENV=production`
  (cookie `Secure`).
- Cookie sesi memakai `SameSite=Lax`; untuk domain yang benar-benar berbeda
  (cross-site), autentikasi cookie memerlukan penyesuaian terpisah.
- Untuk backend serverless dengan banyak instance, pertimbangkan transaction
  pooler dan nonaktifkan prepared statement cache.
- Simpan `JWT_SECRET` dan database password di secret manager platform, bukan di
  image Docker atau repositori.
