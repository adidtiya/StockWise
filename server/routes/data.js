import { Router } from 'express';
import { db, tx } from '../db.js';
import { replay, loadIngredients, expiryFor } from '../inventory.js';
import { quotaUsage, FREE_QUOTA } from '../analytics.js';
import { HttpError, today, addDays, isDate, round } from '../util.js';

const router = Router();

const num = (v, field, { min = 0, allowZero = false } = {}) => {
  const n = Number(String(v ?? '').replace(',', '.'));
  if (!Number.isFinite(n) || n < min || (!allowZero && n === 0)) throw new HttpError(400, `${field} harus berupa angka${allowZero ? '' : ' lebih dari 0'}.`);
  return n;
};
const str = (v, field, max = 80) => {
  const s = String(v ?? '').trim();
  if (!s) throw new HttpError(400, `${field} wajib diisi.`);
  return s.slice(0, max);
};
const owned = (table, id, userId) => {
  const row = db.prepare(`SELECT * FROM ${table} WHERE id = ? AND user_id = ?`).get(Number(id), userId);
  if (!row) throw new HttpError(404, 'Data tidak ditemukan.');
  return row;
};
const checkDate = (d, { allowFuture = false } = {}) => {
  if (!isDate(d)) throw new HttpError(400, 'Tanggal tidak valid.');
  if (!allowFuture && d > today()) throw new HttpError(400, 'Tanggal tidak boleh di masa depan.');
  return d;
};

// ---------- UC-02 Bahan baku ----------
function ingredientInput(b) {
  const category = b.category === 'tahan_lama' ? 'tahan_lama' : b.category === 'segar' ? 'segar' : null;
  if (!category) throw new HttpError(400, 'Pilih kategori bahan (segar / tahan lama).');
  return {
    name: str(b.name, 'Nama bahan'),
    unit: str(b.unit, 'Satuan', 20),
    category,
    shelf: Math.round(num(b.shelf_life_days, 'Umur simpan (hari)', { min: 1 })),
    min_stock: num(b.min_stock ?? 0, 'Stok minimum', { allowZero: true }),
    price: num(b.price ?? 0, 'Harga per satuan', { allowZero: true }),
  };
}

router.get('/ingredients', (req, res) => {
  res.json(loadIngredients(req.user.id));
});

router.post('/ingredients', (req, res) => {
  const i = ingredientInput(req.body || {});
  const info = db
    .prepare('INSERT INTO ingredients (user_id, name, unit, category, shelf_life_days, min_stock, price) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(req.user.id, i.name, i.unit, i.category, i.shelf, i.min_stock, i.price);
  res.status(201).json({ id: Number(info.lastInsertRowid) });
});

router.put('/ingredients/:id', (req, res) => {
  owned('ingredients', req.params.id, req.user.id);
  const i = ingredientInput(req.body || {});
  db.prepare('UPDATE ingredients SET name = ?, unit = ?, category = ?, shelf_life_days = ?, min_stock = ?, price = ? WHERE id = ?').run(
    i.name, i.unit, i.category, i.shelf, i.min_stock, i.price, Number(req.params.id)
  );
  res.json({ ok: true });
});

router.delete('/ingredients/:id', (req, res) => {
  owned('ingredients', req.params.id, req.user.id);
  db.prepare('DELETE FROM ingredients WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ---------- UC-02 Menu & komposisi ----------
function productsWithRecipes(userId) {
  const products = db.prepare('SELECT * FROM products WHERE user_id = ? AND active = 1 ORDER BY name').all(userId);
  const rec = db
    .prepare(
      `SELECT r.product_id, r.ingredient_id, r.qty, i.name, i.unit FROM recipes r
       JOIN ingredients i ON i.id = r.ingredient_id WHERE i.user_id = ? ORDER BY i.name`
    )
    .all(userId);
  return products.map((p) => ({ ...p, recipe: rec.filter((r) => r.product_id === p.id) }));
}

function saveRecipe(userId, productId, recipe) {
  if (!Array.isArray(recipe) || !recipe.length) throw new HttpError(400, 'Isi minimal satu bahan pada komposisi menu.');
  const ids = new Set(loadIngredients(userId).map((i) => i.id));
  db.prepare('DELETE FROM recipes WHERE product_id = ?').run(productId);
  const ins = db.prepare('INSERT INTO recipes (product_id, ingredient_id, qty) VALUES (?, ?, ?)');
  const seen = new Set();
  for (const r of recipe) {
    const iid = Number(r.ingredient_id);
    if (!ids.has(iid)) throw new HttpError(400, 'Bahan pada komposisi tidak ditemukan.');
    if (seen.has(iid)) throw new HttpError(400, 'Bahan yang sama tercantum dua kali pada komposisi.');
    seen.add(iid);
    ins.run(productId, iid, num(r.qty, 'Takaran bahan'));
  }
}

router.get('/products', (req, res) => {
  res.json(productsWithRecipes(req.user.id));
});

router.post('/products', (req, res) => {
  const b = req.body || {};
  const id = tx(() => {
    const info = db.prepare('INSERT INTO products (user_id, name, price) VALUES (?, ?, ?)').run(req.user.id, str(b.name, 'Nama menu'), num(b.price ?? 0, 'Harga', { allowZero: true }));
    const pid = Number(info.lastInsertRowid);
    saveRecipe(req.user.id, pid, b.recipe);
    return pid;
  });
  res.status(201).json({ id });
});

router.put('/products/:id', (req, res) => {
  owned('products', req.params.id, req.user.id);
  const b = req.body || {};
  tx(() => {
    db.prepare('UPDATE products SET name = ?, price = ? WHERE id = ?').run(str(b.name, 'Nama menu'), num(b.price ?? 0, 'Harga', { allowZero: true }), Number(req.params.id));
    saveRecipe(req.user.id, Number(req.params.id), b.recipe);
  });
  res.json({ ok: true });
});

// Menu dinonaktifkan (bukan dihapus) agar riwayat penjualan tetap utuh untuk data latih.
router.delete('/products/:id', (req, res) => {
  owned('products', req.params.id, req.user.id);
  db.prepare('UPDATE products SET active = 0 WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ---------- Stok ----------
router.get('/stock', (req, res) => {
  const T = today();
  const inv = replay(req.user.id, T);
  const items = loadIngredients(req.user.id).map((i) => {
    const batches = inv.batchesOf(i.id).filter((b) => b.expiry >= T);
    const stock = batches.reduce((s, b) => s + b.qty, 0);
    const nearest = batches[0]?.expiry || null;
    let status = 'aman';
    if (stock <= 1e-6) status = 'habis';
    else if (i.min_stock > 0 && stock < i.min_stock) status = 'menipis';
    if (stock > 1e-6 && nearest && nearest <= addDays(T, 1)) status = status === 'aman' ? 'segera_kedaluwarsa' : status;
    return {
      ...i,
      stock: round(stock),
      value: Math.round(batches.reduce((s, b) => s + b.qty * b.price, 0)),
      nearest_expiry: nearest,
      status,
      batches: batches.map((b) => ({ id: b.id, qty: round(b.qty), received: b.received, expiry: b.expiry, price: b.price })),
    };
  });
  res.json({ date: T, items });
});

// Tahap 6: catat stok masuk (pembelian)
router.post('/stock/in', (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [req.body || {}];
  const ins = db.prepare(
    'INSERT INTO batches (user_id, ingredient_id, qty, unit_price, received_date, expiry_date, source) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const n = tx(() => {
    let count = 0;
    for (const it of items) {
      const ing = owned('ingredients', it.ingredient_id, req.user.id);
      const date = checkDate(it.date || today());
      const qty = num(it.qty, `Jumlah ${ing.name}`);
      const price = it.unit_price === '' || it.unit_price == null ? ing.price : num(it.unit_price, 'Harga satuan', { allowZero: true });
      const expiry = it.expiry_date ? checkDate(it.expiry_date, { allowFuture: true }) : expiryFor(date, ing.shelf_life_days);
      if (expiry < date) throw new HttpError(400, 'Tanggal kedaluwarsa tidak boleh sebelum tanggal masuk.');
      ins.run(req.user.id, ing.id, qty, price, date, expiry, it.source === 'rekomendasi' ? 'rekomendasi' : 'manual');
      count++;
    }
    return count;
  });
  res.status(201).json({ created: n });
});

router.delete('/stock/batches/:id', (req, res) => {
  owned('batches', req.params.id, req.user.id);
  db.prepare('DELETE FROM batches WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

const WASTE_REASONS = ['rusak', 'kedaluwarsa', 'sisa tidak terjual', 'lainnya'];
router.post('/stock/waste', (req, res) => {
  const b = req.body || {};
  const ing = owned('ingredients', b.ingredient_id, req.user.id);
  const date = checkDate(b.date || today());
  const qty = num(b.qty, 'Jumlah');
  const reason = WASTE_REASONS.includes(b.reason) ? b.reason : 'lainnya';
  const inv = replay(req.user.id, date);
  const available = inv.stock(ing.id, date);
  if (qty > available + 1e-6) throw new HttpError(400, `Stok ${ing.name} yang tersedia hanya ${round(available)} ${ing.unit}.`);
  db.prepare('INSERT INTO waste_logs (user_id, ingredient_id, qty, date, reason) VALUES (?, ?, ?, ?, ?)').run(req.user.id, ing.id, qty, date, reason);
  res.status(201).json({ ok: true });
});

router.delete('/stock/waste/:id', (req, res) => {
  owned('waste_logs', req.params.id, req.user.id);
  db.prepare('DELETE FROM waste_logs WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ---------- UC-03 Input penjualan ----------
function assertQuota(user, adding, month) {
  if (user.role !== 'freemium') return;
  const used = quotaUsage(user.id, month + '-01');
  if (used + adding > FREE_QUOTA)
    throw new HttpError(
      402,
      `Kuota Freemium ${FREE_QUOTA} transaksi/bulan akan terlampaui (terpakai ${used}). Upgrade ke Pro untuk transaksi tanpa batas.`
    );
}

router.post('/sales', (req, res) => {
  const b = req.body || {};
  const date = checkDate(b.date || today());
  const products = new Set(db.prepare('SELECT id FROM products WHERE user_id = ? AND active = 1').all(req.user.id).map((p) => p.id));
  const items = (Array.isArray(b.items) ? b.items : [])
    .map((i) => ({ product_id: Number(i.product_id), qty: Math.round(Number(i.qty)) }))
    .filter((i) => i.qty > 0);
  if (!items.length) throw new HttpError(400, 'Isi jumlah terjual minimal untuk satu menu.');
  for (const i of items) if (!products.has(i.product_id)) throw new HttpError(400, 'Menu tidak ditemukan.');
  assertQuota(req.user, items.length, date.slice(0, 7));
  const ins = db.prepare("INSERT INTO sales (user_id, product_id, qty, date, source) VALUES (?, ?, ?, ?, 'manual')");
  tx(() => items.forEach((i) => ins.run(req.user.id, i.product_id, i.qty, date)));
  res.status(201).json({ created: items.length, total: items.reduce((s, i) => s + i.qty, 0) });
});

router.delete('/sales/:id', (req, res) => {
  owned('sales', req.params.id, req.user.id);
  db.prepare('DELETE FROM sales WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ---------- UC-04 Import Excel (Tahap 2: validasi sebelum disimpan) ----------
function parseDate(v) {
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    // Nomor seri tanggal Excel
    return new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10);
  }
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

const UNIT_ALIASES = { kilogram: 'kg', kilo: 'kg', gr: 'gram', g: 'gram', lt: 'liter', l: 'liter', ltr: 'liter', pcs: 'buah' };
const CONVERSIONS = { 'gram>kg': 0.001, 'kg>gram': 1000, 'ml>liter': 0.001, 'liter>ml': 1000 };
function convertUnit(qty, from, to) {
  const f = UNIT_ALIASES[from] || from;
  const t = UNIT_ALIASES[to] || to;
  if (!f || f === t) return qty;
  const k = CONVERSIONS[`${f}>${t}`];
  return k ? qty * k : null;
}

const pick = (row, keys) => {
  for (const k of Object.keys(row)) {
    if (keys.includes(k.trim().toLowerCase().replace(/\s+/g, '_'))) return row[k];
  }
  return undefined;
};

router.post('/import/:type', (req, res) => {
  const type = req.params.type;
  if (!['sales', 'stock'].includes(type)) throw new HttpError(404, 'Jenis impor tidak dikenal.');
  const rows = Array.isArray(req.body?.rows) ? req.body.rows.slice(0, 5000) : [];
  if (!rows.length) throw new HttpError(400, 'File tidak berisi baris data.');
  const T = today();
  const valid = [];
  const invalid = [];

  if (type === 'sales') {
    const products = db.prepare('SELECT id, name FROM products WHERE user_id = ? AND active = 1').all(req.user.id);
    const byName = new Map(products.map((p) => [p.name.trim().toLowerCase(), p]));
    rows.forEach((row, i) => {
      const errors = [];
      const date = parseDate(pick(row, ['tanggal', 'date']));
      const menuRaw = String(pick(row, ['menu', 'produk', 'product']) ?? '').trim();
      const qty = Number(pick(row, ['jumlah', 'qty', 'jumlah_terjual']));
      if (!date || !isDate(date)) errors.push('Format tanggal tidak dikenali (pakai YYYY-MM-DD atau DD/MM/YYYY)');
      else if (date > T) errors.push('Tanggal di masa depan');
      const product = byName.get(menuRaw.toLowerCase());
      if (!menuRaw) errors.push('Nama menu kosong');
      else if (!product) errors.push(`Menu "${menuRaw}" belum terdaftar`);
      if (!Number.isFinite(qty) || qty <= 0 || Math.round(qty) !== qty) errors.push('Jumlah harus bilangan bulat > 0');
      const out = { row: i + 2, date, menu: product?.name || menuRaw, qty };
      if (errors.length) invalid.push({ ...out, errors });
      else valid.push({ ...out, product_id: product.id });
    });
  } else {
    const ings = loadIngredients(req.user.id);
    const byName = new Map(ings.map((x) => [x.name.trim().toLowerCase(), x]));
    rows.forEach((row, i) => {
      const errors = [];
      const date = parseDate(pick(row, ['tanggal', 'date', 'tanggal_masuk']));
      const name = String(pick(row, ['bahan', 'nama_bahan', 'ingredient']) ?? '').trim();
      let qty = Number(String(pick(row, ['jumlah', 'qty']) ?? '').replace(',', '.'));
      const unit = String(pick(row, ['satuan', 'unit']) ?? '').trim().toLowerCase();
      const priceRaw = pick(row, ['harga_satuan', 'harga', 'price']);
      const price = priceRaw === undefined || priceRaw === '' ? null : Number(priceRaw);
      const ing = byName.get(name.toLowerCase());
      if (!date || !isDate(date)) errors.push('Format tanggal tidak dikenali');
      else if (date > T) errors.push('Tanggal di masa depan');
      if (!name) errors.push('Nama bahan kosong');
      else if (!ing) errors.push(`Bahan "${name}" belum terdaftar`);
      if (!Number.isFinite(qty) || qty <= 0) errors.push('Jumlah harus angka > 0');
      if (ing && unit && Number.isFinite(qty)) {
        const conv = convertUnit(qty, unit, ing.unit.toLowerCase());
        if (conv == null) errors.push(`Satuan "${unit}" tidak cocok dengan satuan bahan (${ing.unit})`);
        else qty = round(conv, 3);
      }
      if (price != null && (!Number.isFinite(price) || price < 0)) errors.push('Harga tidak valid');
      const out = { row: i + 2, date, bahan: ing?.name || name, qty, unit: ing?.unit || unit, unit_price: price };
      if (errors.length) invalid.push({ ...out, errors });
      else valid.push({ ...out, ingredient_id: ing.id, expiry_date: expiryFor(date, ing.shelf_life_days) });
    });
  }

  let committed = 0;
  if (req.body?.commit && valid.length) {
    if (type === 'sales') {
      const perMonth = {};
      for (const v of valid) perMonth[v.date.slice(0, 7)] = (perMonth[v.date.slice(0, 7)] || 0) + 1;
      for (const [m, n] of Object.entries(perMonth)) assertQuota(req.user, n, m);
      const ins = db.prepare("INSERT INTO sales (user_id, product_id, qty, date, source) VALUES (?, ?, ?, ?, 'excel')");
      tx(() => valid.forEach((v) => ins.run(req.user.id, v.product_id, v.qty, v.date)));
    } else {
      const ins = db.prepare(
        "INSERT INTO batches (user_id, ingredient_id, qty, unit_price, received_date, expiry_date, source) VALUES (?, ?, ?, ?, ?, ?, 'excel')"
      );
      const priceOf = new Map(loadIngredients(req.user.id).map((x) => [x.id, x.price]));
      tx(() => valid.forEach((v) => ins.run(req.user.id, v.ingredient_id, v.qty, v.unit_price ?? priceOf.get(v.ingredient_id), v.date, v.expiry_date)));
    }
    committed = valid.length;
  }
  res.json({ valid, invalid, committed });
});

// ---------- Tahap 3 Event tagging ----------
router.get('/events', (req, res) => {
  const from = isDate(req.query.from) ? req.query.from : addDays(today(), -120);
  const to = isDate(req.query.to) ? req.query.to : addDays(today(), 180);
  res.json(db.prepare('SELECT * FROM events WHERE user_id = ? AND date BETWEEN ? AND ? ORDER BY date').all(req.user.id, from, to));
});

function eventInput(b) {
  const impact = num(b.impact, 'Dampak');
  if (impact < 0.2 || impact > 5) throw new HttpError(400, 'Dampak harus di antara -80% dan +400%.');
  return { name: str(b.name, 'Nama event'), date: checkDate(b.date, { allowFuture: true }), impact };
}

router.post('/events', (req, res) => {
  const e = eventInput(req.body || {});
  const info = db.prepare("INSERT INTO events (user_id, name, date, impact, category) VALUES (?, ?, ?, ?, 'custom')").run(req.user.id, e.name, e.date, e.impact);
  res.status(201).json({ id: Number(info.lastInsertRowid) });
});

router.put('/events/:id', (req, res) => {
  owned('events', req.params.id, req.user.id);
  const e = eventInput(req.body || {});
  db.prepare('UPDATE events SET name = ?, date = ?, impact = ? WHERE id = ?').run(e.name, e.date, e.impact, Number(req.params.id));
  res.json({ ok: true });
});

router.delete('/events/:id', (req, res) => {
  owned('events', req.params.id, req.user.id);
  db.prepare('DELETE FROM events WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ---------- UC-10 Riwayat transaksi ----------
router.get('/history', (req, res) => {
  const T = today();
  const to = isDate(req.query.to) ? req.query.to : T;
  const from = isDate(req.query.from) ? req.query.from : addDays(to, -13);
  const type = req.query.type || 'sales';
  const uid = req.user.id;
  const events = db.prepare('SELECT date, name FROM events WHERE user_id = ? AND date BETWEEN ? AND ?').all(uid, from, to);
  const evMap = {};
  for (const e of events) (evMap[e.date] ||= []).push(e.name);

  if (type === 'sales') {
    const source = req.query.source && req.query.source !== 'all' ? req.query.source : null;
    const rows = db
      .prepare(
        `SELECT s.id, s.date, s.qty, s.source, s.created_at, p.name AS product, p.price, s.qty * p.price AS revenue
         FROM sales s JOIN products p ON p.id = s.product_id
         WHERE s.user_id = ? AND s.date BETWEEN ? AND ? ${source ? 'AND s.source = ?' : ''}
         ORDER BY s.date DESC, s.id DESC`
      )
      .all(...[uid, from, to, source].filter((x) => x != null));
    return res.json({ from, to, type, events: evMap, rows });
  }
  if (type === 'stock') {
    const rows = db
      .prepare(
        `SELECT b.id, b.received_date AS date, b.expiry_date, b.qty, b.unit_price, b.source, i.name AS ingredient, i.unit
         FROM batches b JOIN ingredients i ON i.id = b.ingredient_id
         WHERE b.user_id = ? AND b.received_date BETWEEN ? AND ? ORDER BY b.received_date DESC, b.id DESC`
      )
      .all(uid, from, to);
    return res.json({ from, to, type, events: evMap, rows });
  }
  if (type === 'waste') {
    const inv = replay(uid, to);
    const ings = new Map(loadIngredients(uid).map((i) => [i.id, i]));
    const rows = inv.waste
      .filter((w) => w.date >= from && w.date <= to)
      .map((w) => ({
        date: w.date,
        ingredient: ings.get(w.ingredient_id)?.name,
        unit: ings.get(w.ingredient_id)?.unit,
        qty: round(w.qty, 2),
        value: Math.round(w.value),
        reason: w.reason,
        auto: !!w.auto,
      }))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    return res.json({ from, to, type, events: evMap, rows });
  }
  throw new HttpError(400, 'Jenis riwayat tidak dikenal.');
});

export default router;
