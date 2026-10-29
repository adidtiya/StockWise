import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db } from './db.js';
import { HttpError, today } from './util.js';

const COOKIE = 'sw_session';
const MAX_AGE_DAYS = 7;

// Secret penandatangan sesi: dari env (wajib di server publik), atau dibuat sekali lalu disimpan di folder data lokal.
function loadSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const dir = path.join(import.meta.dirname, '..', 'data');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, '.session-secret');
  if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(32).toString('hex'));
  return fs.readFileSync(file, 'utf8').trim();
}
const SECRET = loadSecret();

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === test.length && crypto.timingSafeEqual(expected, test);
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${mac}`;
}

function unsign(token) {
  const [body, mac] = String(token || '').split('.');
  if (!body || !mac) return null;
  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    return payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export function setSession(res, userId) {
  const token = sign({ uid: userId, exp: Date.now() + MAX_AGE_DAYS * 86400000 });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: MAX_AGE_DAYS * 86400000,
    path: '/',
  });
}

export function clearSession(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

// Paket Pro yang masa aktifnya habis otomatis kembali ke Freemium.
async function expireProIfNeeded(user) {
  if (user.role === 'pro' && user.pro_until && user.pro_until < today()) {
    await db.run("UPDATE users SET role = 'freemium' WHERE id = ?", user.id);
    user.role = 'freemium';
  }
  return user;
}

export async function requireAuth(req, res, next) {
  const payload = unsign(readCookie(req, COOKIE));
  const user = payload && (await db.get('SELECT * FROM users WHERE id = ?', payload.uid));
  if (!user) throw new HttpError(401, 'Sesi berakhir, silakan masuk kembali.');
  req.user = await expireProIfNeeded(user);
  next();
}

export function requirePro(req, res, next) {
  if (req.user.role !== 'pro') throw new HttpError(403, 'Fitur ini khusus paket Pro.');
  next();
}

export function publicUser(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    pro_until: u.pro_until,
    business_name: u.business_name,
    business_type: u.business_type,
    city: u.city,
    phone: u.phone,
    created_at: u.created_at,
  };
}
