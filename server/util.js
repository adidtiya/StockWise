// Utilitas tanggal & angka. Semua tanggal disimpan sebagai teks 'YYYY-MM-DD'
// dan dihitung dalam zona waktu Asia/Jakarta (WIB).
export const TZ = 'Asia/Jakarta';

export function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}

export function addDays(d, n) {
  const t = new Date(d + 'T00:00:00Z');
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

export function dow(d) {
  return new Date(d + 'T00:00:00Z').getUTCDay();
}

export function daysBetween(a, b) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

export function dateRange(a, b) {
  const out = [];
  for (let d = a; d <= b; d = addDays(d, 1)) out.push(d);
  return out;
}

export function isDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
}

export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
export const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
export const sum = (a) => a.reduce((s, x) => s + x, 0);
export const round = (x, p = 2) => Math.round(x * 10 ** p) / 10 ** p;

// Satuan yang boleh pecahan dibulatkan per 0,5; satuan hitungan dibulatkan ke bilangan bulat.
const FRACTIONAL_UNITS = ['kg', 'liter', 'l'];
export function unitStep(unit) {
  return FRACTIONAL_UNITS.includes(String(unit).toLowerCase()) ? 0.5 : 1;
}
export function ceilTo(x, step) {
  return Math.ceil(x / step - 1e-9) * step;
}
export function roundTo(x, step) {
  return Math.round(x / step) * step;
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
