import express from 'express';
import path from 'node:path';
import './db.js';
import { requireAuth } from './auth.js';
import authRoutes from './routes/auth.js';
import dataRoutes from './routes/data.js';
import accountRoutes from './routes/account.js';
import { ensureDemoAccount, DEMO_ACCOUNTS } from './seed.js';
import { HttpError } from './util.js';

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(import.meta.dirname, '..', 'public');

app.disable('x-powered-by');
app.use(express.json({ limit: '5mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api', requireAuth, dataRoutes);
app.use('/api', requireAuth, accountRoutes);
app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan.' }));

app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));
// SPA: semua rute non-API dilayani index.html
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.use((err, req, res, next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Format data tidak valid.' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'File terlalu besar.' });
  console.error(err);
  res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
});

for (const acc of DEMO_ACCOUNTS) ensureDemoAccount(acc.email);

app.listen(PORT, () => {
  console.log(`StockWise berjalan di http://localhost:${PORT}`);
});
