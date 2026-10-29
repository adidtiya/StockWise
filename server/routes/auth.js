import { Router } from 'express';
import { db, tx } from '../db.js';
import { verifyPassword, setSession, clearSession, requireAuth, publicUser, hashPassword } from '../auth.js';
import { createUser, ensureDemoAccount } from '../seed.js';
import { HttpError } from '../util.js';

const router = Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TYPES = ['katering', 'warung', 'rumah_makan'];
const PAY_METHODS = ['qris', 'gopay', 'ovo', 'transfer_bca', 'transfer_mandiri'];

function text(v, field, { min = 1, max = 120 } = {}) {
  const s = String(v ?? '').trim();
  if (s.length < min) throw new HttpError(400, `${field} wajib diisi${min > 1 ? ` (minimal ${min} karakter)` : ''}.`);
  if (s.length > max) throw new HttpError(400, `${field} maksimal ${max} karakter.`);
  return s;
}

// UC-01 Register (tipe user: Pemilik UMKM Freemium / Pemilik UMKM Pro)
router.post('/register', async (req, res) => {
  const b = req.body || {};
  const name = text(b.name, 'Nama', { min: 2 });
  const email = text(b.email, 'Email').toLowerCase();
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Format email tidak valid.');
  const password = String(b.password || '');
  if (password.length < 8) throw new HttpError(400, 'Kata sandi minimal 8 karakter.');
  const business_name = text(b.business_name, 'Nama usaha', { min: 2 });
  if (!TYPES.includes(b.business_type)) throw new HttpError(400, 'Pilih jenis usaha.');
  const role = b.plan === 'pro' ? 'pro' : 'freemium';
  if (role === 'pro' && !PAY_METHODS.includes(b.payment_method)) throw new HttpError(400, 'Pilih metode pembayaran untuk paket Pro.');
  if (await db.get('SELECT 1 FROM users WHERE email = ?', email)) throw new HttpError(409, 'Email sudah terdaftar. Silakan masuk.');

  const userId = await tx(() =>
    createUser({
      name,
      email,
      password,
      business_name,
      business_type: b.business_type,
      city: String(b.city || '').trim().slice(0, 80),
      phone: String(b.phone || '').trim().slice(0, 20),
      role,
      payment_method: b.payment_method,
      demo: !!b.seed_demo,
    })
  ).catch((err) => {
    // Dua pendaftaran bersamaan dengan email yang sama
    if (err.code === '23505') throw new HttpError(409, 'Email sudah terdaftar. Silakan masuk.');
    throw err;
  });
  setSession(res, userId);
  res.status(201).json({ user: publicUser(await db.get('SELECT * FROM users WHERE id = ?', userId)) });
});

// UC-01 Sign in
router.post('/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!email || !password) throw new HttpError(400, 'Email dan kata sandi wajib diisi.');
  await ensureDemoAccount(email);
  const user = await db.get('SELECT * FROM users WHERE email = ?', email);
  if (!user || !verifyPassword(password, user.password_hash)) throw new HttpError(401, 'Email atau kata sandi salah.');
  setSession(res, user.id);
  res.json({ user: publicUser(user) });
});

router.post('/logout', (req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// UC-12 Kelola akun: ubah profil
router.put('/me', requireAuth, async (req, res) => {
  const b = req.body || {};
  const name = text(b.name, 'Nama', { min: 2 });
  const email = text(b.email, 'Email').toLowerCase();
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Format email tidak valid.');
  const business_name = text(b.business_name, 'Nama usaha', { min: 2 });
  if (!TYPES.includes(b.business_type)) throw new HttpError(400, 'Jenis usaha tidak valid.');
  const taken = await db.get('SELECT id FROM users WHERE email = ? AND id <> ?', email, req.user.id);
  if (taken) throw new HttpError(409, 'Email sudah dipakai akun lain.');
  await db.run(
    'UPDATE users SET name = ?, email = ?, business_name = ?, business_type = ?, city = ?, phone = ? WHERE id = ?',
    name,
    email,
    business_name,
    b.business_type,
    String(b.city || '').trim().slice(0, 80),
    String(b.phone || '').trim().slice(0, 20),
    req.user.id
  );
  res.json({ user: publicUser(await db.get('SELECT * FROM users WHERE id = ?', req.user.id)) });
});

router.put('/me/password', requireAuth, async (req, res) => {
  const { current, next } = req.body || {};
  if (!verifyPassword(String(current || ''), req.user.password_hash)) throw new HttpError(400, 'Kata sandi saat ini salah.');
  if (String(next || '').length < 8) throw new HttpError(400, 'Kata sandi baru minimal 8 karakter.');
  await db.run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(String(next)), req.user.id);
  res.json({ ok: true });
});

// UC-12 Delete my account: seluruh data usaha ikut terhapus (ON DELETE CASCADE).
router.delete('/me', requireAuth, async (req, res) => {
  const { password, confirm } = req.body || {};
  if (confirm !== 'HAPUS') throw new HttpError(400, 'Ketik HAPUS untuk konfirmasi.');
  if (!verifyPassword(String(password || ''), req.user.password_hash)) throw new HttpError(400, 'Kata sandi salah.');
  await db.run('DELETE FROM users WHERE id = ?', req.user.id);
  clearSession(res);
  res.json({ ok: true });
});

export default router;
