// Event default dan data contoh (riwayat 90 hari) supaya forecast bisa langsung dicoba.
import { db, tx } from './db.js';
import { Inventory, expiryFor } from './inventory.js';
import { addDays, dateRange, dow, today, unitStep, roundTo, sum } from './util.js';
import { hashPassword } from './auth.js';
import { train } from './forecast.js';

const FIXED_HOLIDAYS = [
  ['01-01', 'Tahun Baru', 1.3],
  ['08-17', 'Hari Kemerdekaan', 1.3],
  ['12-24', 'Malam Natal', 1.2],
  ['12-25', 'Natal', 1.35],
  ['12-31', 'Malam Tahun Baru', 1.4],
];
const MOVING_HOLIDAYS = [
  ['2025-01-29', 'Imlek', 1.15],
  ['2025-03-30', 'Menjelang Lebaran', 1.5],
  ['2025-03-31', 'Lebaran', 0.7],
  ['2025-06-06', 'Idul Adha', 1.2],
  ['2026-02-17', 'Imlek', 1.15],
  ['2026-03-19', 'Menjelang Lebaran', 1.5],
  ['2026-03-20', 'Lebaran', 0.7],
  ['2026-05-27', 'Idul Adha', 1.2],
  ['2027-02-06', 'Imlek', 1.15],
  ['2027-03-09', 'Menjelang Lebaran', 1.5],
  ['2027-03-10', 'Lebaran', 0.7],
  ['2027-05-16', 'Idul Adha', 1.2],
];

export async function seedEvents(userId, businessType) {
  const T = today();
  const from = addDays(T, -400);
  const to = addDays(T, 400);
  const rows = [];
  const ins = { run: (...r) => rows.push(r) };
  const years = [...new Set([from, T, to].map((d) => +d.slice(0, 4)))];
  for (let y = years[0]; y <= years.at(-1); y++) {
    for (const [md, name, impact] of FIXED_HOLIDAYS) {
      const d = `${y}-${md}`;
      if (d >= from && d <= to) ins.run(userId, name, d, impact, 'nasional');
    }
    for (let m = 1; m <= 12; m++) {
      for (const day of [25, 26]) {
        const d = `${y}-${String(m).padStart(2, '0')}-${day}`;
        if (d >= from && d <= to) ins.run(userId, 'Tanggal Gajian', d, 1.15, 'gajian');
      }
    }
  }
  for (const [d, name, impact] of MOVING_HOLIDAYS) {
    // Katering justru ramai saat Lebaran (pesanan hampers/open house), warung banyak yang tutup.
    const adj = name === 'Lebaran' && businessType === 'katering' ? 1.6 : impact;
    if (d >= from && d <= to) ins.run(userId, name, d, adj, 'nasional');
  }
  await db.insertMany('events', ['user_id', 'name', 'date', 'impact', 'category'], rows);
}

const TEMPLATES = {
  warung: {
    ingredients: [
      ['Ayam potong', 'kg', 'segar', 2, 5, 38000],
      ['Beras', 'kg', 'tahan_lama', 180, 20, 14000],
      ['Telur ayam', 'butir', 'segar', 14, 30, 2200],
      ['Tahu', 'potong', 'segar', 3, 20, 1000],
      ['Tempe', 'papan', 'segar', 3, 3, 6000],
      ['Sayuran (kol, tauge, timun)', 'kg', 'segar', 2, 2, 12000],
      ['Bumbu dasar', 'kg', 'segar', 5, 1, 45000],
      ['Minyak goreng', 'liter', 'tahan_lama', 180, 5, 18000],
      ['Kacang tanah', 'kg', 'tahan_lama', 60, 1, 32000],
      ['Kecap manis', 'botol', 'tahan_lama', 365, 2, 12000],
      ['Gula pasir', 'kg', 'tahan_lama', 365, 2, 17000],
      ['Teh celup', 'kotak', 'tahan_lama', 365, 2, 7000],
      ['Es batu', 'kg', 'segar', 2, 5, 3000],
    ],
    products: [
      ['Nasi Ayam Goreng', 22000, 42, { 'Beras': 0.12, 'Ayam potong': 0.15, 'Minyak goreng': 0.03, 'Bumbu dasar': 0.015, 'Sayuran (kol, tauge, timun)': 0.03 }],
      ['Nasi Ayam Bakar', 24000, 28, { 'Beras': 0.12, 'Ayam potong': 0.15, 'Kecap manis': 0.04, 'Bumbu dasar': 0.02, 'Sayuran (kol, tauge, timun)': 0.03 }],
      ['Soto Ayam', 20000, 32, { 'Beras': 0.1, 'Ayam potong': 0.08, 'Telur ayam': 0.5, 'Sayuran (kol, tauge, timun)': 0.04, 'Bumbu dasar': 0.02 }],
      ['Nasi Goreng Telur', 18000, 38, { 'Beras': 0.15, 'Telur ayam': 1, 'Kecap manis': 0.02, 'Minyak goreng': 0.02, 'Bumbu dasar': 0.01 }],
      ['Gado-gado', 17000, 20, { 'Sayuran (kol, tauge, timun)': 0.15, 'Tahu': 1, 'Tempe': 0.2, 'Telur ayam': 0.5, 'Kacang tanah': 0.06 }],
      ['Es Teh Manis', 5000, 85, { 'Teh celup': 0.04, 'Gula pasir': 0.025, 'Es batu': 0.2 }],
    ],
    dowMult: [1.25, 0.85, 0.9, 0.95, 1.0, 1.15, 1.35],
    overbuyToday: { 'Tahu': 3.2, 'Sayuran (kol, tauge, timun)': 1.8 },
    lowStock: 'Minyak goreng',
    oldExcess: ['Telur ayam', 10, 160],
  },
  katering: {
    ingredients: [
      ['Ayam potong', 'kg', 'segar', 2, 8, 38000],
      ['Daging sapi', 'kg', 'segar', 2, 3, 135000],
      ['Beras', 'kg', 'tahan_lama', 180, 30, 14000],
      ['Telur ayam', 'butir', 'segar', 14, 50, 2200],
      ['Sayuran campur', 'kg', 'segar', 2, 3, 15000],
      ['Kentang', 'kg', 'segar', 10, 5, 18000],
      ['Santan', 'liter', 'segar', 2, 2, 24000],
      ['Bumbu dasar', 'kg', 'segar', 5, 2, 45000],
      ['Minyak goreng', 'liter', 'tahan_lama', 180, 8, 18000],
      ['Tepung terigu', 'kg', 'tahan_lama', 180, 5, 13000],
      ['Gula pasir', 'kg', 'tahan_lama', 365, 3, 17000],
      ['Air mineral 330 ml', 'botol', 'tahan_lama', 365, 48, 1500],
    ],
    products: [
      ['Nasi Box Ayam Bakar', 28000, 55, { 'Beras': 0.12, 'Ayam potong': 0.15, 'Sayuran campur': 0.04, 'Bumbu dasar': 0.02, 'Air mineral 330 ml': 1 }],
      ['Nasi Box Rendang', 35000, 30, { 'Beras': 0.12, 'Daging sapi': 0.1, 'Santan': 0.05, 'Bumbu dasar': 0.025, 'Air mineral 330 ml': 1 }],
      ['Prasmanan (per pax)', 45000, 40, { 'Beras': 0.15, 'Ayam potong': 0.08, 'Daging sapi': 0.05, 'Sayuran campur': 0.08, 'Kentang': 0.06, 'Santan': 0.03, 'Bumbu dasar': 0.02 }],
      ['Snack Box', 15000, 45, { 'Tepung terigu': 0.05, 'Telur ayam': 0.3, 'Gula pasir': 0.02, 'Minyak goreng': 0.02 }],
      ['Tumpeng Mini', 40000, 8, { 'Beras': 0.2, 'Ayam potong': 0.12, 'Telur ayam': 1, 'Sayuran campur': 0.05, 'Bumbu dasar': 0.02 }],
    ],
    dowMult: [1.45, 0.7, 0.8, 0.85, 0.95, 1.1, 1.6],
    overbuyToday: { 'Santan': 3, 'Sayuran campur': 1.7 },
    lowStock: 'Minyak goreng',
    oldExcess: ['Telur ayam', 10, 220],
  },
};
TEMPLATES.rumah_makan = TEMPLATES.warung;

// PRNG deterministik supaya data contoh tiap akun stabil.
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function seedDemoData(userId, businessType, { pro = false } = {}) {
  const tpl = TEMPLATES[businessType] || TEMPLATES.warung;
  const rnd = mulberry32(userId * 9973 + 7);
  const normal = () => Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd());
  const T = today();
  const start = addDays(T, -90);
  const manualUntil = addDays(T, -31); // 60 hari pertama: belanja berdasarkan perkiraan pemilik

  const ingredients = [];
  for (const [name, unit, category, shelf, minStock, price] of tpl.ingredients) {
    const id = await db.insert(
      'INSERT INTO ingredients (user_id, name, unit, category, shelf_life_days, min_stock, price) VALUES (?, ?, ?, ?, ?, ?, ?)',
      userId, name, unit, category, shelf, minStock, price
    );
    ingredients.push({ id, name, unit, category, shelf_life_days: shelf, min_stock: minStock, price });
  }
  const ingByName = new Map(ingredients.map((i) => [i.name, i]));

  const products = [];
  const recipeRows = [];
  for (const [name, price, base, recipe] of tpl.products) {
    const id = await db.insert('INSERT INTO products (user_id, name, price) VALUES (?, ?, ?)', userId, name, price);
    const rec = Object.entries(recipe).map(([ing, qty]) => ({ ingredient_id: ingByName.get(ing).id, qty }));
    for (const r of rec) recipeRows.push([id, r.ingredient_id, r.qty]);
    products.push({ id, name, base, rec });
  }
  await db.insertMany('recipes', ['product_id', 'ingredient_id', 'qty'], recipeRows);

  // Pengaruh event yang "sebenarnya" pada data contoh (gajian sedikit lebih kuat dari default,
  // sehingga terlihat model belajar dari data).
  const events = await db.all('SELECT name, date, impact FROM events WHERE user_id = ? AND date >= ? AND date <= ?', userId, start, addDays(T, 30));
  const eventMult = new Map();
  for (const e of events) {
    const truth = e.name === 'Tanggal Gajian' ? 1.3 : e.impact;
    eventMult.set(e.date, (eventMult.get(e.date) || 1) * truth);
  }

  const days = dateRange(start, addDays(T, 14));
  const qtyOf = new Map(); // `${pid}|${date}` -> qty (hari penuh)
  days.forEach((d, i) => {
    const trend = 1 + 0.0015 * i;
    for (const p of products) {
      const mu = p.base * tpl.dowMult[dow(d)] * (eventMult.get(d) || 1) * trend;
      qtyOf.set(`${p.id}|${d}`, Math.max(0, Math.round(mu * (1 + 0.12 * normal()))));
    }
  });
  const usageOf = (ingId, d) => sum(products.map((p) => (qtyOf.get(`${p.id}|${d}`) || 0) * (p.rec.find((r) => r.ingredient_id === ingId)?.qty || 0)));
  const avgUsage = new Map(ingredients.map((i) => [i.id, sum(dateRange(start, addDays(start, 27)).map((d) => usageOf(i.id, d))) / 28]));

  const inv = new Inventory(ingredients);
  // Baris dikumpulkan dulu lalu disimpan sekaligus di akhir (bulk insert).
  const batchRows = [];
  const salesRows = [];
  const wasteRows = [];
  const insBatch = { run: (...r) => batchRows.push(r) };
  const addBatch = (ing, qty, d, source = 'pembelian') => {
    const step = unitStep(ing.unit);
    qty = Math.max(step, roundTo(qty, step));
    const price = Math.round(ing.price * (0.95 + rnd() * 0.1));
    const expiry = expiryFor(d, ing.shelf_life_days);
    insBatch.run(userId, ing.id, qty, price, d, expiry, source, `${d} 06:00:00`);
    inv.addBatch({ id: null, ingredient_id: ing.id, qty, unit_price: price, received_date: d, expiry_date: expiry });
  };

  // Stok awal bahan tahan lama
  for (const ing of ingredients) if (ing.category === 'tahan_lama') addBatch(ing, avgUsage.get(ing.id) * 10, start, 'awal');

  const insSale = { run: (...r) => salesRows.push(r) };
  const insWaste = { run: (...r) => wasteRows.push(r) };
  const sources = pro ? [['mokapos', 0.55], ['gofood', 0.25], ['grabfood', 0.2]] : null;

  for (const d of dateRange(start, T)) {
    inv.expire(d);
    const manual = d <= manualUntil;
    for (const ing of ingredients) {
      if (ing.name === tpl.lowStock && d > addDays(T, -12)) continue;
      const short = ing.category === 'segar' && ing.shelf_life_days <= 3;
      const cover = ing.category === 'segar' ? (short ? 1 : 3) : 10;
      const stock = inv.stock(ing.id, d);
      const target = manual
        ? avgUsage.get(ing.id) * cover * (1.15 + rnd() * 0.3)
        : sum(dateRange(d, addDays(d, cover - 1)).map((x) => usageOf(ing.id, x))) * (0.95 + rnd() * 0.4);
      if (!short && stock > target * 0.5) continue;
      let qty = target - stock * (manual ? 0.3 : 0.55);
      if (d === T && tpl.overbuyToday[ing.name]) qty = Math.max(qty, 0) + avgUsage.get(ing.id) * tpl.overbuyToday[ing.name];
      if (qty > 0) addBatch(ing, qty, d);
    }
    if (d === addDays(T, -tpl.oldExcess[1])) addBatch(ingByName.get(tpl.oldExcess[0]), tpl.oldExcess[2], d);

    const fraction = d === T ? 0.4 : 1; // hari ini baru sebagian penjualan yang tercatat
    for (const p of products) {
      const q = Math.round((qtyOf.get(`${p.id}|${d}`) || 0) * fraction);
      if (q <= 0) continue;
      for (const r of p.rec) inv.consume(r.ingredient_id, q * r.qty, d);
      const created = `${d} 21:00:00`;
      if (sources) {
        let left = q;
        sources.forEach(([src, share], k) => {
          const part = k === sources.length - 1 ? left : Math.round(q * share);
          left -= part;
          if (part > 0) insSale.run(userId, p.id, part, d, src, created);
        });
      } else insSale.run(userId, p.id, q, d, d < addDays(T, -60) ? 'excel' : 'manual', created);
    }
    // Sesekali bahan rusak dicatat manual (lebih sering di era sebelum StockWise)
    if (rnd() < (manual ? 0.2 : 0.3) && d !== T) {
      const segar = ingredients.filter((i) => i.category === 'segar');
      const ing = segar[Math.floor(rnd() * segar.length)];
      const qty = roundTo(Math.min(inv.stock(ing.id, d), avgUsage.get(ing.id) * (0.1 + rnd() * 0.2)), unitStep(ing.unit));
      if (qty > 0) {
        insWaste.run(userId, ing.id, qty, d, rnd() < 0.5 ? 'rusak' : 'sisa tidak terjual');
        inv.discard(ing.id, qty, d, 'rusak');
      }
    }
  }

  await db.insertMany('batches', ['user_id', 'ingredient_id', 'qty', 'unit_price', 'received_date', 'expiry_date', 'source', 'created_at'], batchRows);
  await db.insertMany('sales', ['user_id', 'product_id', 'qty', 'date', 'source', 'created_at'], salesRows);
  await db.insertMany('waste_logs', ['user_id', 'ingredient_id', 'qty', 'date', 'reason'], wasteRows);
  if (pro) {
    await db.insertMany(
      'integrations',
      ['user_id', 'provider', 'connected_at', 'last_sync'],
      ['mokapos', 'gofood', 'grabfood'].map((prov) => [userId, prov, `${start} 08:00:00`, `${T} 08:00:00`])
    );
  }
  await train(userId);
}

export const DEMO_ACCOUNTS = [
  {
    email: 'demo@stockwise.id',
    password: 'demo12345',
    name: 'Sari Wulandari',
    business_name: 'Warung Makan Bu Sari',
    business_type: 'warung',
    city: 'Jakarta Barat',
    phone: '081234567890',
    role: 'freemium',
  },
  {
    email: 'pro@stockwise.id',
    password: 'demo12345',
    name: 'Budi Santoso',
    business_name: 'Dapur Katering Berkah',
    business_type: 'katering',
    city: 'Tangerang',
    phone: '081298765432',
    role: 'pro',
  },
];

// Dipanggil di dalam tx() oleh pemanggilnya.
export async function createUser({ name, email, password, business_name, business_type, city, phone, role = 'freemium', demo = false, payment_method = 'qris' }) {
  const T = today();
  const userId = await db.insert(
    `INSERT INTO users (name, email, password_hash, role, pro_until, business_name, business_type, city, phone)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    name, email, hashPassword(password), role, role === 'pro' ? addDays(T, 30) : null, business_name, business_type, city || null, phone || null
  );
  await seedEvents(userId, business_type);
  if (role === 'pro') {
    await db.run(
      "INSERT INTO payments (user_id, plan, amount, method, status, period_start, period_end) VALUES (?, 'pro', 100000, ?, 'paid', ?, ?)",
      userId, demo ? 'demo' : payment_method, T, addDays(T, 30)
    );
  }
  if (demo) await seedDemoData(userId, business_type, { pro: role === 'pro' });
  return userId;
}

// Akun demo dibuat ulang bila belum ada atau datanya sudah basi (tidak ada penjualan kemarin).
export async function ensureDemoAccount(email) {
  const acc = DEMO_ACCOUNTS.find((a) => a.email === email.toLowerCase());
  if (!acc) return;
  const T = today();
  await tx(async () => {
    const user = await db.get('SELECT id FROM users WHERE email = ? FOR UPDATE', acc.email);
    if (user) {
      const last = (await db.get('SELECT MAX(date) AS d FROM sales WHERE user_id = ?', user.id)).d;
      if (last && last >= addDays(T, -1)) return;
      await db.run('DELETE FROM users WHERE id = ?', user.id);
    }
    const id = await createUser({ ...acc, demo: true });
    if (acc.role === 'pro') await db.run('UPDATE users SET pro_until = ? WHERE id = ?', addDays(T, 365), id);
  });
}
