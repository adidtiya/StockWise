// UC-08 Hitung forecast.
// Model time-series per menu: level (exponential smoothing) x faktor hari dalam minggu
// x faktor event. Faktor event dipelajari dari riwayat penjualan pada hari berlabel
// yang sama (mis. "Tanggal Gajian"); bila belum ada riwayat dipakai dampak default event.
import { db, NOW } from './db.js';
import { addDays, clamp, dateRange, dow, mean, today } from './util.js';

export const ALPHAS = [0.05, 0.1, 0.2, 0.3, 0.5];
const DEFAULT_ALPHA = 0.2;
const HISTORY_DAYS = 120;
const DOW_WINDOW = 56;
const EVAL_DAYS = 28;

export async function loadSalesContext(userId) {
  const T = today();
  const [products, rows, todayRows, events] = await Promise.all([
    db.all('SELECT id, name, price FROM products WHERE user_id = ? AND active = 1 ORDER BY name', userId),
    db.all(
      `SELECT product_id, date, SUM(qty) AS q FROM sales
       WHERE user_id = ? AND date >= ? AND date < ? GROUP BY product_id, date`,
      userId,
      addDays(T, -HISTORY_DAYS),
      T
    ),
    db.all('SELECT product_id, SUM(qty) AS q FROM sales WHERE user_id = ? AND date = ? GROUP BY product_id', userId, T),
    db.all('SELECT id, name, date, impact, category FROM events WHERE user_id = ?', userId),
  ]);

  const eventsByDate = new Map();
  for (const e of events) {
    if (!eventsByDate.has(e.date)) eventsByDate.set(e.date, []);
    eventsByDate.get(e.date).push(e);
  }
  const first = rows.reduce((m, r) => (!m || r.date < m ? r.date : m), null);
  const dates = first ? dateRange(first, addDays(T, -1)) : [];
  const idx = new Map(dates.map((d, i) => [d, i]));
  const series = new Map(products.map((p) => [p.id, new Array(dates.length).fill(0)]));
  for (const r of rows) {
    const s = series.get(r.product_id);
    if (s) s[idx.get(r.date)] = r.q;
  }
  return { T, products, dates, series, eventsByDate, todaySold: new Map(todayRows.map((r) => [r.product_id, r.q])) };
}

function dowFactors(values, dates, eventsByDate) {
  const n = dates.length;
  const s = Array(7).fill(0);
  const c = Array(7).fill(0);
  let tot = 0;
  let tc = 0;
  for (let i = Math.max(0, n - DOW_WINDOW); i < n; i++) {
    if (eventsByDate.has(dates[i])) continue;
    const w = dow(dates[i]);
    s[w] += values[i];
    c[w]++;
    tot += values[i];
    tc++;
  }
  const avg = tc ? tot / tc : 0;
  // Shrinkage ke 1 saat data per hari masih sedikit, supaya faktor tidak liar.
  return s.map((x, w) => {
    if (!avg || !c[w]) return 1;
    const raw = x / c[w] / avg;
    return clamp(1 + (raw - 1) * (c[w] / (c[w] + 2)), 0.2, 3);
  });
}

function eventFactor(stats, e) {
  const s = stats.get(e.name);
  if (!s || s.exp <= 0) return e.impact;
  const learned = clamp(s.act / s.exp, 0.3, 3);
  const w = s.n / (s.n + 1); // makin banyak kejadian, makin percaya pada data historis
  return learned * w + e.impact * (1 - w);
}

export function fitModel(ctx, alpha = DEFAULT_ALPHA) {
  const { products, dates, series, eventsByDate } = ctx;
  const P = products.map((p) => ({
    id: p.id,
    name: p.name,
    values: series.get(p.id),
    f: dowFactors(series.get(p.id), dates, eventsByDate),
    L: null,
    warm: [],
    preds: new Array(dates.length).fill(null),
  }));
  const eventStats = new Map();

  // Satu lintasan maju: setiap hari diprediksi dulu (one-step-ahead) sebelum level diperbarui,
  // sehingga prediksi historis bisa dipakai untuk mengukur akurasi tanpa bocoran data.
  dates.forEach((d, i) => {
    const evs = eventsByDate.get(d) || [];
    const w = dow(d);
    const fac = evs.reduce((m, e) => m * eventFactor(eventStats, e), 1);
    let act = 0;
    let exp = 0;
    for (const p of P) {
      const y = p.values[i];
      if (p.L != null) {
        const base = p.L * p.f[w];
        p.preds[i] = base * fac;
        act += y;
        exp += base;
      }
      if (!evs.length) {
        const ds = y / p.f[w];
        if (p.L == null) {
          p.warm.push(ds);
          if (p.warm.length >= 7) p.L = mean(p.warm);
        } else p.L = alpha * ds + (1 - alpha) * p.L;
      }
    }
    if (evs.length && exp > 0) {
      for (const e of evs) {
        const s = eventStats.get(e.name) || { act: 0, exp: 0, n: 0 };
        s.act += act;
        s.exp += exp;
        s.n++;
        eventStats.set(e.name, s);
      }
    }
  });

  for (const p of P) {
    if (p.L == null) p.L = p.warm.length ? mean(p.warm) : 0;
    let s2 = 0;
    let c = 0;
    for (let i = Math.max(0, dates.length - EVAL_DAYS); i < dates.length; i++) {
      if (p.preds[i] == null) continue;
      const r = (p.values[i] - p.preds[i]) / Math.max(p.preds[i], 1);
      s2 += r * r;
      c++;
    }
    p.sigma = clamp(c ? Math.sqrt(s2 / c) : 0.3, 0.08, 0.6);
  }
  return { alpha, dates, products: new Map(P.map((p) => [p.id, p])), eventStats, eventsByDate };
}

export function predict(model, productId, date) {
  const p = model.products.get(productId);
  if (!p) return 0;
  const fac = (model.eventsByDate.get(date) || []).reduce((m, e) => m * eventFactor(model.eventStats, e), 1);
  return Math.max(0, p.L * p.f[dow(date)] * fac);
}

export function eventMultiplier(model, e) {
  return eventFactor(model.eventStats, e);
}

// Weighted Absolute Percentage Error pada `days` hari terakhir (semua menu).
export function wape(model, days = 14) {
  let err = 0;
  let act = 0;
  const from = Math.max(0, model.dates.length - days);
  for (const p of model.products.values()) {
    for (let i = from; i < model.dates.length; i++) {
      if (p.preds[i] == null) continue;
      err += Math.abs(p.values[i] - p.preds[i]);
      act += p.values[i];
    }
  }
  return act > 0 ? err / act : null;
}

// Tahap 7: latih ulang. Pilih alpha dengan error terkecil pada 28 hari terakhir.
export async function train(userId, ctx) {
  ctx ??= await loadSalesContext(userId);
  let best = { alpha: DEFAULT_ALPHA, wape: null };
  for (const alpha of ALPHAS) {
    const w = wape(fitModel(ctx, alpha), EVAL_DAYS);
    if (w != null && (best.wape == null || w < best.wape)) best = { alpha, wape: w };
  }
  const samples = ctx.dates.length * ctx.products.length;
  await db.run(
    `INSERT INTO model_state (user_id, alpha, wape, samples, trained_at) VALUES (?, ?, ?, ?, ${NOW})
     ON CONFLICT(user_id) DO UPDATE SET alpha = excluded.alpha, wape = excluded.wape,
       samples = excluded.samples, trained_at = excluded.trained_at`,
    userId,
    best.alpha,
    best.wape,
    samples
  );
  return { ...best, samples };
}

export async function getModel(userId) {
  const [stateNow, ctx] = await Promise.all([db.get('SELECT * FROM model_state WHERE user_id = ?', userId), loadSalesContext(userId)]);
  let state = stateNow;
  // Latih ulang otomatis bila belum pernah, belum punya data, atau sudah lebih dari sehari.
  const stale = state && (state.samples === 0 || Date.now() - Date.parse(state.trained_at.replace(' ', 'T') + 'Z') > 86400000);
  if (!state || stale) {
    await train(userId, ctx);
    state = await db.get('SELECT * FROM model_state WHERE user_id = ?', userId);
  }
  return { ctx, model: fitModel(ctx, state.alpha), state };
}

// Jumlah prediksi + rentang untuk sekumpulan tanggal.
export function productRange(model, productId, dates) {
  const p = model.products.get(productId);
  const total = dates.reduce((s, d) => s + predict(model, productId, d), 0);
  const half = total * (p ? p.sigma : 0.3) / Math.sqrt(Math.max(1, dates.length));
  return { total, lo: Math.max(0, total - half), hi: total + half, half };
}

// Konversi forecast menu menjadi kebutuhan bahan berdasarkan resep.
export function ingredientNeeds(model, recipes, dates) {
  const out = new Map();
  for (const pid of model.products.keys()) {
    const rec = recipes.get(pid);
    if (!rec) continue;
    const r = productRange(model, pid, dates);
    for (const x of rec) {
      const o = out.get(x.ingredient_id) || { need: 0, v: 0 };
      o.need += r.total * x.qty;
      o.v += (r.half * x.qty) ** 2;
      out.set(x.ingredient_id, o);
    }
  }
  for (const o of out.values()) {
    const sd = Math.sqrt(o.v);
    o.lo = Math.max(0, o.need - sd);
    o.hi = o.need + sd;
  }
  return out;
}
