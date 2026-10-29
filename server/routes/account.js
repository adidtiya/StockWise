import { Router } from 'express';
import { db, tx, NOW } from '../db.js';
import { requirePro } from '../auth.js';
import { dashboard, forecastView, recommendations, evaluation, quotaUsage, FREE_QUOTA } from '../analytics.js';
import { train, getModel, predict } from '../forecast.js';
import { HttpError, today, addDays } from '../util.js';

const router = Router();

// ---------- Inti layanan ----------
router.get('/dashboard', async (req, res) => res.json(await dashboard(req.user)));

router.get('/forecast', async (req, res) => {
  const days = [7, 14, 30].includes(Number(req.query.days)) ? Number(req.query.days) : 7;
  if (days > 7 && req.user.role !== 'pro') throw new HttpError(403, 'Forecast 14 dan 30 hari tersedia di paket Pro.');
  res.json(await forecastView(req.user.id, days));
});

router.get('/recommendations', async (req, res) => {
  const { inv, ...rest } = await recommendations(req.user.id);
  res.json(rest);
});

router.get('/evaluation', async (req, res) => res.json(await evaluation(req.user.id)));

router.post('/model/train', async (req, res) => {
  const result = await train(req.user.id);
  res.json(result);
});

// ---------- UC-11 Berlangganan Pro ----------
const PRICE = 100000;
const METHODS = { qris: 'QRIS', gopay: 'GoPay', ovo: 'OVO', transfer_bca: 'Transfer BCA', transfer_mandiri: 'Transfer Mandiri' };

router.get('/subscription', async (req, res) => {
  const T = today();
  const [used, payments] = await Promise.all([
    quotaUsage(req.user.id, T),
    db.all('SELECT * FROM payments WHERE user_id = ? ORDER BY id DESC', req.user.id),
  ]);
  res.json({
    role: req.user.role,
    pro_until: req.user.pro_until,
    price: PRICE,
    quota: { used, limit: FREE_QUOTA },
    methods: METHODS,
    payments,
  });
});

// Pembayaran disimulasikan (belum terhubung payment gateway sungguhan).
router.post('/subscription/checkout', async (req, res) => {
  const method = req.body?.method;
  if (!METHODS[method]) throw new HttpError(400, 'Pilih metode pembayaran.');
  const T = today();
  const from = req.user.role === 'pro' && req.user.pro_until && req.user.pro_until >= T ? addDays(req.user.pro_until, 1) : T;
  const until = addDays(from, 29);
  await tx(async () => {
    await db.run(
      "INSERT INTO payments (user_id, plan, amount, method, status, period_start, period_end) VALUES (?, 'pro', ?, ?, 'paid', ?, ?)",
      req.user.id, PRICE, method, from, until
    );
    await db.run("UPDATE users SET role = 'pro', pro_until = ? WHERE id = ?", until, req.user.id);
  });
  res.json({ ok: true, pro_until: until });
});

router.post('/subscription/cancel', async (req, res) => {
  if (req.user.role !== 'pro') throw new HttpError(400, 'Akun ini belum berlangganan Pro.');
  await tx(async () => {
    await db.run("UPDATE users SET role = 'freemium', pro_until = NULL WHERE id = ?", req.user.id);
    await db.run('DELETE FROM integrations WHERE user_id = ?', req.user.id);
  });
  res.json({ ok: true });
});

// ---------- UC-13 Sinkronisasi API pihak ketiga (khusus Pro) ----------
export const PROVIDERS = {
  mokapos: { name: 'MokaPOS', kind: 'Kasir (POS)', share: 0.5 },
  gofood: { name: 'GoFood (GoBiz)', kind: 'Pesan antar', share: 0.2 },
  grabfood: { name: 'GrabFood (GrabMerchant)', kind: 'Pesan antar', share: 0.2 },
  shopeefood: { name: 'ShopeeFood (Shopee Partner)', kind: 'Pesan antar', share: 0.1 },
};

router.get('/integrations', async (req, res) => {
  const [rows, counts] = await Promise.all([
    db.all('SELECT * FROM integrations WHERE user_id = ?', req.user.id),
    db.all('SELECT source, COUNT(*) AS n, SUM(qty) AS qty FROM sales WHERE user_id = ? AND date >= ? GROUP BY source', req.user.id, addDays(today(), -29)),
  ]);
  res.json({
    providers: Object.entries(PROVIDERS).map(([id, p]) => {
      const r = rows.find((x) => x.provider === id);
      const c = counts.find((x) => x.source === id);
      return { id, ...p, connected: !!r, connected_at: r?.connected_at, last_sync: r?.last_sync, orders_30d: c?.qty || 0 };
    }),
  });
});

router.post('/integrations/:provider/connect', requirePro, async (req, res) => {
  if (!PROVIDERS[req.params.provider]) throw new HttpError(404, 'Penyedia tidak dikenal.');
  await db.run('INSERT INTO integrations (user_id, provider) VALUES (?, ?) ON CONFLICT (user_id, provider) DO NOTHING', req.user.id, req.params.provider);
  res.json({ ok: true });
});

router.delete('/integrations/:provider', requirePro, async (req, res) => {
  await db.run('DELETE FROM integrations WHERE user_id = ? AND provider = ?', req.user.id, req.params.provider);
  res.json({ ok: true });
});

// Mode simulasi: menarik "pesanan baru" hari ini dari setiap kanal yang terhubung.
router.post('/integrations/sync', requirePro, async (req, res) => {
  const conns = await db.all('SELECT * FROM integrations WHERE user_id = ?', req.user.id);
  if (!conns.length) throw new HttpError(400, 'Belum ada kanal yang terhubung.');
  const T = today();
  const { model, ctx } = await getModel(req.user.id);
  const result = await tx(async () => {
    const out = [];
    const rows = [];
    for (const c of conns) {
      let orders = 0;
      for (const p of ctx.products) {
        const expected = predict(model, p.id, T) * PROVIDERS[c.provider].share;
        const q = Math.round(expected * (0.1 + Math.random() * 0.15));
        if (q > 0) {
          rows.push([req.user.id, p.id, q, T, c.provider]);
          orders += q;
        }
      }
      await db.run(`UPDATE integrations SET last_sync = ${NOW} WHERE id = ?`, c.id);
      out.push({ provider: c.provider, name: PROVIDERS[c.provider].name, orders });
    }
    await db.insertMany('sales', ['user_id', 'product_id', 'qty', 'date', 'source'], rows);
    return out;
  });
  res.json({ synced: result, total: result.reduce((s, r) => s + r.orders, 0) });
});

// ---------- UC-12 Feedback ----------
const FEEDBACK_CATEGORIES = ['Saran fitur', 'Akurasi forecast', 'Laporan bug', 'Tampilan aplikasi', 'Lainnya'];

router.get('/feedback', async (req, res) => {
  res.json({
    categories: FEEDBACK_CATEGORIES,
    items: await db.all('SELECT * FROM feedback WHERE user_id = ? ORDER BY id DESC', req.user.id),
  });
});

router.post('/feedback', async (req, res) => {
  const { rating, category, message } = req.body || {};
  const r = Number(rating);
  if (!Number.isInteger(r) || r < 1 || r > 5) throw new HttpError(400, 'Beri penilaian 1 sampai 5 bintang.');
  if (!FEEDBACK_CATEGORIES.includes(category)) throw new HttpError(400, 'Pilih kategori feedback.');
  const msg = String(message || '').trim();
  if (msg.length < 10) throw new HttpError(400, 'Ceritakan feedback minimal 10 karakter.');
  await db.run('INSERT INTO feedback (user_id, rating, category, message) VALUES (?, ?, ?, ?)', req.user.id, r, category, msg.slice(0, 2000));
  res.status(201).json({ ok: true });
});

export default router;
