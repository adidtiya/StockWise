import { db } from './db.js';
import { addDays, dateRange, today } from './util.js';

const EPS = 1e-6;

// Stok dimodelkan per batch. Pemakaian selalu mengambil batch yang paling cepat
// kedaluwarsa (FEFO), dan batch yang lewat tanggal kedaluwarsa dihitung sebagai waste.
export class Inventory {
  constructor(ingredients) {
    this.items = new Map(ingredients.map((i) => [i.id, { ing: i, batches: [] }]));
    this.waste = []; // { ingredient_id, date, qty, value, reason }
    this.shortages = []; // { ingredient_id, date, qty }
  }

  addBatch(b) {
    const it = this.items.get(b.ingredient_id);
    if (!it) return;
    it.batches.push({
      id: b.id,
      qty: b.qty,
      received: b.received_date,
      expiry: b.expiry_date,
      price: b.unit_price ?? it.ing.price,
    });
    it.batches.sort((x, y) => (x.expiry < y.expiry ? -1 : x.expiry > y.expiry ? 1 : 0));
  }

  // Ambil qty dari stok (FEFO). Mengembalikan daftar potongan yang diambil.
  take(ingredientId, qty) {
    const it = this.items.get(ingredientId);
    const taken = [];
    if (!it) return taken;
    let need = qty;
    for (const b of it.batches) {
      if (need <= EPS) break;
      const t = Math.min(b.qty, need);
      if (t <= 0) continue;
      b.qty -= t;
      need -= t;
      taken.push({ qty: t, price: b.price });
    }
    it.batches = it.batches.filter((b) => b.qty > EPS);
    return taken;
  }

  consume(ingredientId, qty, date) {
    const taken = this.take(ingredientId, qty);
    const got = taken.reduce((s, t) => s + t.qty, 0);
    if (got < qty - EPS) this.shortages.push({ ingredient_id: ingredientId, date, qty: qty - got });
  }

  discard(ingredientId, qty, date, reason) {
    for (const t of this.take(ingredientId, qty)) {
      this.waste.push({ ingredient_id: ingredientId, date, qty: t.qty, value: t.qty * t.price, reason });
    }
  }

  // Dipanggil di awal hari `date`: batch dengan expiry < date sudah tidak layak pakai.
  expire(date) {
    for (const [id, it] of this.items) {
      const keep = [];
      for (const b of it.batches) {
        if (b.expiry < date) {
          if (b.qty > EPS) this.waste.push({ ingredient_id: id, date: b.expiry, qty: b.qty, value: b.qty * b.price, reason: 'kedaluwarsa', auto: true });
        } else keep.push(b);
      }
      it.batches = keep;
    }
  }

  batchesOf(ingredientId) {
    return this.items.get(ingredientId)?.batches ?? [];
  }

  stock(ingredientId, onDate) {
    return this.batchesOf(ingredientId)
      .filter((b) => !onDate || b.expiry >= onDate)
      .reduce((s, b) => s + b.qty, 0);
  }
}

export function loadIngredients(userId) {
  return db.prepare('SELECT * FROM ingredients WHERE user_id = ? ORDER BY name').all(userId);
}

export function loadRecipes(userId) {
  const rows = db
    .prepare(
      `SELECT r.product_id, r.ingredient_id, r.qty FROM recipes r
       JOIN products p ON p.id = r.product_id WHERE p.user_id = ?`
    )
    .all(userId);
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.product_id)) map.set(r.product_id, []);
    map.get(r.product_id).push({ ingredient_id: r.ingredient_id, qty: r.qty });
  }
  return map;
}

// Membangun ulang kondisi stok dengan memutar ulang seluruh transaksi
// (stok masuk, penjualan x resep, bahan terbuang) secara kronologis sampai `until`.
export function replay(userId, until = today()) {
  const ingredients = loadIngredients(userId);
  const recipes = loadRecipes(userId);
  const inv = new Inventory(ingredients);
  const batches = db
    .prepare('SELECT * FROM batches WHERE user_id = ? AND received_date <= ? ORDER BY received_date, id')
    .all(userId, until);
  const sales = db
    .prepare('SELECT product_id, date, SUM(qty) AS qty FROM sales WHERE user_id = ? AND date <= ? GROUP BY product_id, date')
    .all(userId, until);
  const wastes = db.prepare('SELECT * FROM waste_logs WHERE user_id = ? AND date <= ? ORDER BY date, id').all(userId, until);

  const first = [batches[0]?.received_date, sales.reduce((m, s) => (!m || s.date < m ? s.date : m), null), wastes[0]?.date]
    .filter(Boolean)
    .sort()[0];
  if (!first) return inv;

  const group = (rows, key) => {
    const m = new Map();
    for (const r of rows) {
      if (!m.has(r[key])) m.set(r[key], []);
      m.get(r[key]).push(r);
    }
    return m;
  };
  const batchesByDate = group(batches, 'received_date');
  const salesByDate = group(sales, 'date');
  const wasteByDate = group(wastes, 'date');

  for (const d of dateRange(first, until)) {
    inv.expire(d);
    for (const b of batchesByDate.get(d) || []) inv.addBatch(b);
    for (const s of salesByDate.get(d) || []) {
      for (const r of recipes.get(s.product_id) || []) inv.consume(r.ingredient_id, s.qty * r.qty, d);
    }
    for (const w of wasteByDate.get(d) || []) inv.discard(w.ingredient_id, w.qty, d, w.reason);
  }
  return inv;
}

export function wasteBetween(inv, from, to) {
  return inv.waste.filter((w) => w.date >= from && w.date <= to);
}

export function expiryFor(receivedDate, shelfLifeDays) {
  return addDays(receivedDate, Math.max(1, shelfLifeDays) - 1);
}
