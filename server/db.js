import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export const DATA_DIR = process.env.DATA_DIR || path.join(import.meta.dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'stockwise.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'freemium' CHECK (role IN ('freemium', 'pro')),
  pro_until     TEXT,
  business_name TEXT NOT NULL,
  business_type TEXT NOT NULL CHECK (business_type IN ('katering', 'warung', 'rumah_makan')),
  city          TEXT,
  phone         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- UC-02: bahan baku beserta kategori (segar / tahan lama) yang menentukan periode forecast
CREATE TABLE IF NOT EXISTS ingredients (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  unit            TEXT NOT NULL,
  category        TEXT NOT NULL CHECK (category IN ('segar', 'tahan_lama')),
  shelf_life_days INTEGER NOT NULL CHECK (shelf_life_days >= 1),
  min_stock       REAL NOT NULL DEFAULT 0,
  price           REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name    TEXT NOT NULL,
  price   REAL NOT NULL DEFAULT 0,
  active  INTEGER NOT NULL DEFAULT 1
);

-- Komposisi bahan per porsi menu
CREATE TABLE IF NOT EXISTS recipes (
  product_id    INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  qty           REAL NOT NULL CHECK (qty > 0),
  PRIMARY KEY (product_id, ingredient_id)
);

-- Stok masuk (per batch, supaya tanggal kedaluwarsa tiap pembelian bisa dilacak)
CREATE TABLE IF NOT EXISTS batches (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  qty           REAL NOT NULL CHECK (qty > 0),
  unit_price    REAL,
  received_date TEXT NOT NULL,
  expiry_date   TEXT NOT NULL,
  source        TEXT NOT NULL DEFAULT 'manual',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sales (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  qty        INTEGER NOT NULL CHECK (qty > 0),
  date       TEXT NOT NULL,
  source     TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS waste_logs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  qty           REAL NOT NULL CHECK (qty > 0),
  date          TEXT NOT NULL,
  reason        TEXT NOT NULL
);

-- Tahap 3: event tagging (Natal, Lebaran, gajian, event milik usaha)
CREATE TABLE IF NOT EXISTS events (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name     TEXT NOT NULL,
  date     TEXT NOT NULL,
  impact   REAL NOT NULL DEFAULT 1,
  category TEXT NOT NULL DEFAULT 'custom'
);

CREATE TABLE IF NOT EXISTS model_state (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  alpha      REAL NOT NULL,
  wape       REAL,
  samples    INTEGER NOT NULL DEFAULT 0,
  trained_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS integrations (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider     TEXT NOT NULL,
  connected_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_sync    TEXT,
  UNIQUE (user_id, provider)
);

CREATE TABLE IF NOT EXISTS payments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan         TEXT NOT NULL,
  amount       INTEGER NOT NULL,
  method       TEXT NOT NULL,
  status       TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end   TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Feedback tetap disimpan (anonim) walaupun akun dihapus
CREATE TABLE IF NOT EXISTS feedback (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  rating     INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  category   TEXT NOT NULL,
  message    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sales_user_date ON sales(user_id, date);
CREATE INDEX IF NOT EXISTS idx_batches_user ON batches(user_id, received_date);
CREATE INDEX IF NOT EXISTS idx_waste_user ON waste_logs(user_id, date);
CREATE INDEX IF NOT EXISTS idx_events_user_date ON events(user_id, date);
`);

export function tx(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
