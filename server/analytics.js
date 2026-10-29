import { db } from './db.js';
import { getModel, predict, productRange, ingredientNeeds, wape, eventMultiplier } from './forecast.js';
import { replay, loadIngredients, loadRecipes, wasteBetween } from './inventory.js';
import { addDays, dateRange, ceilTo, unitStep, round, sum } from './util.js';

const PROJECTION_DAYS = 60;
export const FREE_QUOTA = 300;

// Periode beli mengikuti jenis bahan: segar harian, tahan lama mingguan / bulanan.
export function horizonFor(ing) {
  if (ing.category === 'segar') return 1;
  return ing.shelf_life_days >= 90 ? 30 : 7;
}

function takeFefo(batches, qty) {
  let need = qty;
  for (const b of batches) {
    if (need <= 1e-9) break;
    const t = Math.min(b.qty, need);
    b.qty -= t;
    need -= t;
  }
  return qty - need;
}

// Simulasi pemakaian harian ke depan. Bahan yang belum terpakai saat kedaluwarsa = waste.
function simulateWaste(batches, usage, dates) {
  let bs = batches.map((b) => ({ ...b })).sort((x, y) => (x.expiry < y.expiry ? -1 : 1));
  let waste = 0;
  let firstDate = null;
  for (const d of dates) {
    const keep = [];
    for (const b of bs) {
      if (b.expiry < d) {
        if (b.qty > 1e-6) {
          waste += b.qty;
          firstDate ??= b.expiry;
        }
      } else keep.push(b);
    }
    bs = keep;
    if (!bs.length) break;
    takeFefo(bs, usage.get(d) || 0);
    bs = bs.filter((b) => b.qty > 1e-6);
  }
  return { waste, firstDate };
}

// Proyeksi pemakaian bahan per hari: sisa hari ini + PROJECTION_DAYS hari ke depan.
function dailyUsage(model, ctx, recipes, ingredients) {
  const T = ctx.T;
  const future = dateRange(addDays(T, 1), addDays(T, PROJECTION_DAYS));
  const usage = new Map(ingredients.map((i) => [i.id, new Map()]));
  const add = (ing, d, q) => {
    const m = usage.get(ing);
    if (m) m.set(d, (m.get(d) || 0) + q);
  };
  for (const pid of model.products.keys()) {
    const rec = recipes.get(pid);
    if (!rec) continue;
    const remainingToday = Math.max(0, predict(model, pid, T) - (ctx.todaySold.get(pid) || 0));
    const perDay = future.map((d) => predict(model, pid, d));
    for (const r of rec) {
      add(r.ingredient_id, T, remainingToday * r.qty);
      future.forEach((d, i) => add(r.ingredient_id, d, perDay[i] * r.qty));
    }
  }
  return { usage, future };
}

const fmtShort = (d) =>
  new Intl.DateTimeFormat('id-ID', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(d + 'T00:00:00Z')
  );

// UC-06 Rekomendasi pembelian + UC-07 Waste Risk Score.
export async function recommendations(userId, cached) {
  const { ctx, model } = cached || (await getModel(userId));
  const T = ctx.T;
  const start = addDays(T, 1);
  const [ingredients, recipes, inv] = await Promise.all([loadIngredients(userId), loadRecipes(userId), replay(userId, T)]);
  const { usage, future } = dailyUsage(model, ctx, recipes, ingredients);

  const items = ingredients.map((ing) => {
    const step = unitStep(ing.unit);
    const h = horizonFor(ing);
    const periodDates = dateRange(start, addDays(start, h - 1));
    const need = ingredientNeeds(model, recipes, periodDates).get(ing.id) || { need: 0, lo: 0, hi: 0 };
    const u = usage.get(ing.id);

    const now = inv.batchesOf(ing.id).filter((b) => b.expiry >= T).map((b) => ({ ...b }));
    const stockNow = sum(now.map((b) => b.qty));
    takeFefo(now, u.get(T) || 0); // sisa penjualan yang masih diperkirakan terjadi hari ini
    const startBatches = now.filter((b) => b.expiry >= start && b.qty > 1e-6);
    const stockStart = sum(startBatches.map((b) => b.qty));

    const buy = ceilTo(Math.max(0, need.need - stockStart), step);
    const buyLo = ceilTo(Math.max(0, need.lo - stockStart), step);
    const buyHi = ceilTo(Math.max(0, need.hi - stockStart), step);

    // Pembelian diasumsikan diterima hari ini/besok pagi dengan umur simpan bahan.
    const plannedExpiry = addDays(T, Math.max(ing.shelf_life_days, 2) - 1);
    const planned = (q) => (q > 0 ? [{ qty: q, expiry: plannedExpiry, price: ing.price }] : []);
    const base = simulateWaste(startBatches, u, future);
    const withPlan = simulateWaste([...startBatches, ...planned(buy)], u, future);

    // Cari jumlah beli terbesar yang tidak menambah waste.
    let safeBuy = buy;
    if (buy > 0 && withPlan.waste > base.waste + step / 2) {
      safeBuy = 0;
      for (let q = buy - step; q > 0; q -= step) {
        if (simulateWaste([...startBatches, ...planned(q)], u, future).waste <= base.waste + step / 2) {
          safeBuy = q;
          break;
        }
      }
    }

    const total = stockStart + buy;
    const ratio = total > 0 ? withPlan.waste / total : 0;
    let level = null;
    if (withPlan.waste >= step / 2) level = ratio < 0.1 ? 'rendah' : ratio < 0.3 ? 'sedang' : 'tinggi';

    const earliest = startBatches[0]?.expiry || null;
    let message = null;
    if (level) {
      const parts = [];
      if (base.waste >= step / 2)
        parts.push(`Stok saat ini melebihi pemakaian sebelum kedaluwarsa. Dahulukan pemakaian ${ing.name} (batch tertua kedaluwarsa ${fmtShort(earliest)}) atau jadikan menu promo.`);
      if (buy > 0 && safeBuy < buy) parts.push(`Kurangi pembelian menjadi ${round(safeBuy, 1)} ${ing.unit} agar tidak menambah bahan terbuang.`);
      message = parts.join(' ');
    }

    const avgDaily = sum(future.slice(0, 7).map((d) => u.get(d) || 0)) / 7;
    return {
      id: ing.id,
      name: ing.name,
      unit: ing.unit,
      category: ing.category,
      shelf_life_days: ing.shelf_life_days,
      price: ing.price,
      min_stock: ing.min_stock,
      horizon: h,
      period_label: h === 1 ? `Besok, ${fmtShort(start)}` : `${h} hari (${fmtShort(start)} – ${fmtShort(periodDates.at(-1))})`,
      stock_now: round(stockNow),
      stock_start: round(stockStart),
      need: round(need.need),
      need_lo: round(need.lo),
      need_hi: round(need.hi),
      buy,
      buy_lo: buyLo,
      buy_hi: buyHi,
      buy_cost: Math.round(buy * ing.price),
      days_cover: avgDaily > 0 ? round(stockNow / avgDaily, 1) : null,
      status: buy > 0 ? 'beli' : 'cukup',
      risk: level
        ? {
            level,
            waste_qty: round(withPlan.waste),
            waste_value: Math.round(withPlan.waste * ing.price),
            ratio: round(ratio, 3),
            first_date: withPlan.firstDate,
            safe_buy: safeBuy,
            message,
          }
        : null,
    };
  });
  return { date: T, period_start: start, items, inv };
}

function portionsLeft(inv, recipes, products, T) {
  return products.map((p) => {
    const rec = recipes.get(p.id) || [];
    if (!rec.length) return { id: p.id, name: p.name, portions: null, limiting: null };
    let min = Infinity;
    let limiting = null;
    for (const r of rec) {
      const n = Math.floor(inv.stock(r.ingredient_id, T) / r.qty + 1e-9);
      if (n < min) {
        min = n;
        limiting = r.ingredient_id;
      }
    }
    return { id: p.id, name: p.name, portions: min, limiting };
  });
}

export async function quotaUsage(userId, T) {
  const month = T.slice(0, 7);
  const r = await db.get(
    `SELECT COUNT(*) AS n FROM sales WHERE user_id = ? AND substr(date, 1, 7) = ? AND source IN ('manual', 'excel')`,
    userId,
    month
  );
  return r.n;
}

// UC-09 Dashboard inventory.
export async function dashboard(user) {
  const cached = await getModel(user.id);
  const { ctx, model } = cached;
  const T = ctx.T;
  const pastDates = dateRange(addDays(T, -13), T);
  const SALES_DAY = `SELECT COALESCE(SUM(s.qty), 0) AS qty, COALESCE(SUM(s.qty * p.price), 0) AS revenue
       FROM sales s JOIN products p ON p.id = s.product_id WHERE s.user_id = ? AND s.date = ?`;
  const [rec, ingredients, recipes, todaySales, yesterday, pastRows, upcomingRows, quota] = await Promise.all([
    recommendations(user.id, cached),
    loadIngredients(user.id),
    loadRecipes(user.id),
    db.get(SALES_DAY, user.id, T),
    db.get(SALES_DAY, user.id, addDays(T, -1)),
    db.all('SELECT date, SUM(qty) AS q FROM sales WHERE user_id = ? AND date >= ? GROUP BY date', user.id, pastDates[0]),
    db.all('SELECT * FROM events WHERE user_id = ? AND date >= ? AND date <= ? ORDER BY date LIMIT 5', user.id, T, addDays(T, 45)),
    user.role === 'freemium' ? quotaUsage(user.id, T) : null,
  ]);
  const inv = rec.inv;
  const ingName = new Map(ingredients.map((i) => [i.id, i]));
  const pastMap = new Map(pastRows.map((r) => [r.date, r.q]));
  const futureDates = dateRange(addDays(T, 1), addDays(T, 7));
  const forecastTotals = futureDates.map((d) => {
    let t = 0;
    for (const pid of model.products.keys()) t += predict(model, pid, d);
    return Math.round(t);
  });
  const todayForecast = Math.round([...model.products.keys()].reduce((s, pid) => s + predict(model, pid, T), 0));

  const wasteNow = sum(wasteBetween(inv, addDays(T, -29), T).map((w) => w.value));
  const wastePrev = sum(wasteBetween(inv, addDays(T, -59), addDays(T, -30)).map((w) => w.value));

  const upcoming = upcomingRows.map((e) => ({ ...e, multiplier: round(eventMultiplier(model, e), 2) }));

  const acc = wape(model, 14);
  return {
    date: T,
    today: { qty: todaySales.qty, revenue: todaySales.revenue, forecast: todayForecast },
    yesterday,
    chart: {
      labels: [...pastDates, ...futureDates],
      actual: [...pastDates.map((d) => pastMap.get(d) || 0), ...futureDates.map(() => null)],
      forecast: [...pastDates.map((d, i) => (i === pastDates.length - 1 ? todayForecast : null)), ...forecastTotals],
    },
    buy: {
      count: rec.items.filter((i) => i.status === 'beli').length,
      cost: sum(rec.items.map((i) => i.buy_cost)),
      top: rec.items.filter((i) => i.status === 'beli').sort((a, b) => b.buy_cost - a.buy_cost).slice(0, 4),
    },
    risk: {
      tinggi: rec.items.filter((i) => i.risk?.level === 'tinggi').length,
      sedang: rec.items.filter((i) => i.risk?.level === 'sedang').length,
      rendah: rec.items.filter((i) => i.risk?.level === 'rendah').length,
      items: rec.items.filter((i) => i.risk).sort((a, b) => b.risk.waste_value - a.risk.waste_value).slice(0, 4),
    },
    low_stock: rec.items
      .filter((i) => i.stock_now <= 0 || (i.min_stock > 0 && i.stock_now < i.min_stock) || (i.days_cover != null && i.days_cover < 1))
      .slice(0, 5),
    portions: portionsLeft(inv, recipes, ctx.products, T).map((p) => ({ ...p, limiting: ingName.get(p.limiting)?.name || null })),
    accuracy: acc == null ? null : round(Math.max(0, 1 - acc), 3),
    waste: { last30: Math.round(wasteNow), prev30: Math.round(wastePrev) },
    events: upcoming,
    quota: user.role === 'freemium' ? { used: quota, limit: FREE_QUOTA } : null,
    counts: {
      products: ctx.products.length,
      ingredients: ingredients.length,
      history_days: ctx.dates.length,
    },
  };
}

// UC-05 Lihat forecast kebutuhan.
export async function forecastView(userId, days) {
  const cached = await getModel(userId);
  const { ctx, model } = cached;
  const T = ctx.T;
  const dates = dateRange(addDays(T, 1), addDays(T, days));
  const past = dateRange(addDays(T, -21), addDays(T, -1));
  const idx = new Map(model.dates.map((d, i) => [d, i]));
  const products = ctx.products.map((p) => {
    const m = model.products.get(p.id);
    const r = productRange(model, p.id, dates);
    return {
      id: p.id,
      name: p.name,
      price: p.price,
      sigma: round(m.sigma, 3),
      total: Math.round(r.total),
      lo: Math.floor(r.lo),
      hi: Math.ceil(r.hi),
      daily: dates.map((d) => {
        const v = predict(model, p.id, d);
        return { date: d, pred: round(v, 1), lo: round(Math.max(0, v * (1 - m.sigma)), 1), hi: round(v * (1 + m.sigma), 1) };
      }),
      history: past.map((d) => ({ date: d, actual: idx.has(d) ? m.values[idx.get(d)] : null, pred: idx.has(d) && m.preds[idx.get(d)] != null ? round(m.preds[idx.get(d)], 1) : null })),
      dow_factors: m.f.map((x) => round(x, 2)),
    };
  });
  const [recipes, ingredients] = await Promise.all([loadRecipes(userId), loadIngredients(userId)]);
  const needs = ingredientNeeds(model, recipes, dates);
  const tomorrow = ingredientNeeds(model, recipes, [dates[0]]);
  const events = dates
    .flatMap((d) => (model.eventsByDate.get(d) || []).map((e) => ({ ...e, multiplier: round(eventMultiplier(model, e), 2) })));
  return {
    date: T,
    days,
    dates,
    products,
    ingredients: ingredients.map((i) => {
      const n = needs.get(i.id) || { need: 0, lo: 0, hi: 0 };
      const t = tomorrow.get(i.id) || { need: 0, lo: 0, hi: 0 };
      return {
        id: i.id,
        name: i.name,
        unit: i.unit,
        category: i.category,
        horizon: horizonFor(i),
        need: round(n.need, 2),
        lo: round(n.lo, 2),
        hi: round(n.hi, 2),
        tomorrow: { need: round(t.need, 2), lo: round(t.lo, 2), hi: round(t.hi, 2) },
      };
    }),
    events,
    totals: dates.map((d) => Math.round([...model.products.keys()].reduce((s, pid) => s + predict(model, pid, d), 0))),
    weekday: [1, 2, 3, 4, 5, 6, 0].map((w) => ({ dow: w, factor: round(meanFactor(model, w), 2) })),
  };
}

function meanFactor(model, w) {
  let s = 0;
  let wsum = 0;
  for (const p of model.products.values()) {
    s += p.f[w] * p.L;
    wsum += p.L;
  }
  return wsum ? s / wsum : 1;
}

// Tahap 7: Evaluasi akurasi forecast & tren bahan terbuang.
export async function evaluation(userId) {
  const { ctx, model, state } = await getModel(userId);
  const T = ctx.T;
  const n = model.dates.length;
  const from = Math.max(0, n - 28);
  const dates = model.dates.slice(from);
  const actual = dates.map((_, k) => sum([...model.products.values()].map((p) => p.values[from + k])));
  const predicted = dates.map((_, k) => {
    const v = [...model.products.values()].map((p) => p.preds[from + k]);
    return v.every((x) => x == null) ? null : Math.round(sum(v.map((x) => x || 0)));
  });

  const per = [...model.products.values()].map((p) => {
    let a = 0;
    let f = 0;
    let e = 0;
    for (let i = Math.max(0, n - 14); i < n; i++) {
      if (p.preds[i] == null) continue;
      a += p.values[i];
      f += p.preds[i];
      e += Math.abs(p.values[i] - p.preds[i]);
    }
    return { id: p.id, name: p.name, actual: a, forecast: Math.round(f), accuracy: a > 0 ? round(Math.max(0, 1 - e / a), 3) : null, bias: a > 0 ? round((f - a) / a, 3) : null };
  });

  const [inv, ingList] = await Promise.all([replay(userId, T), loadIngredients(userId)]);
  const ingredients = new Map(ingList.map((i) => [i.id, i]));
  const weeks = [];
  for (let k = 11; k >= 0; k--) {
    const end = addDays(T, -7 * k);
    const start = addDays(end, -6);
    const w = wasteBetween(inv, start, end);
    weeks.push({ start, end, value: Math.round(sum(w.map((x) => x.value))) });
  }
  const byIng = new Map();
  for (const w of wasteBetween(inv, addDays(T, -29), T)) {
    const o = byIng.get(w.ingredient_id) || { qty: 0, value: 0 };
    o.qty += w.qty;
    o.value += w.value;
    byIng.set(w.ingredient_id, o);
  }
  const accuracy = wape(model, 14);
  const accuracyPrev = (() => {
    let err = 0;
    let act = 0;
    for (const p of model.products.values()) {
      for (let i = Math.max(0, n - 28); i < n - 14; i++) {
        if (p.preds[i] == null) continue;
        err += Math.abs(p.values[i] - p.preds[i]);
        act += p.values[i];
      }
    }
    return act ? err / act : null;
  })();
  const learnedEvents = [...model.eventStats.entries()].map(([name, s]) => ({ name, occurrences: s.n, factor: round(s.act / s.exp, 2) }));

  return {
    date: T,
    model: {
      alpha: state.alpha,
      trained_at: state.trained_at,
      samples: state.samples,
      wape: state.wape,
      history_days: n,
      method: 'Exponential smoothing + faktor hari (musiman mingguan) + faktor event',
    },
    accuracy: accuracy == null ? null : round(Math.max(0, 1 - accuracy), 3),
    accuracy_prev: accuracyPrev == null ? null : round(Math.max(0, 1 - accuracyPrev), 3),
    chart: { dates, actual, predicted },
    products: per,
    waste_weeks: weeks,
    waste_by_ingredient: [...byIng.entries()]
      .map(([id, o]) => ({ id, name: ingredients.get(id)?.name, unit: ingredients.get(id)?.unit, qty: round(o.qty, 2), value: Math.round(o.value) }))
      .sort((a, b) => b.value - a.value),
    learned_events: learnedEvents,
  };
}
