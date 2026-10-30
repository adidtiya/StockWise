// Helper tampilan: template HTML aman, ikon, format angka/tanggal, toast, modal, dan grafik SVG.

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

class Raw {
  constructor(s) {
    this.s = s;
  }
  toString() {
    return this.s;
  }
}
export const raw = (s) => new Raw(String(s));
const renderVal = (v) => (v == null || v === false ? '' : Array.isArray(v) ? v.map(renderVal).join('') : v instanceof Raw ? v.s : esc(v));
export function html(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < vals.length) out += renderVal(vals[i]);
  });
  return new Raw(out);
}

const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/><path d="M10 20v-6h4v6"/>',
  chart: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>',
  cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2.5 3h2.5l2.6 12.2a1.5 1.5 0 0 0 1.5 1.3h8.7a1.5 1.5 0 0 0 1.5-1.2L21 8H6"/>',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5"/><path d="M12 13v8"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  utensils: '<path d="M4 3v7a3 3 0 0 0 3 3v8"/><path d="M10 3v7a3 3 0 0 1-3 3"/><path d="M7 3v6"/><path d="M17 21V3c-2 1.5-3 4-3 7v4h3"/>',
  receipt: '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  upload: '<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
  download: '<path d="M12 4v12"/><path d="m7 11 5 5 5-5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  sparkles: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  crown: '<path d="m3 8 4 4 5-7 5 7 4-4-2 11H5z"/>',
  plug: '<path d="M9 2v6M15 2v6"/><path d="M6 8h12v3a6 6 0 0 1-12 0z"/><path d="M12 17v5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  message: '<path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12z"/>',
  trash: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/><path d="M9 7V4h6v3"/>',
  logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l-5-5 5-5"/><path d="M5 12h12"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  chevronLeft: '<path d="m15 6-6 6 6 6"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17.5v.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  leaf: '<path d="M5 21c0-9 6-15 16-16-1 10-7 16-16 16z"/><path d="M5 21 14 12"/>',
  flame: '<path d="M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5.5 1-8.5z"/>',
  store: '<path d="M4 9 5.5 4h13L20 9"/><path d="M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0A2.7 2.7 0 0 0 20 9"/><path d="M5 12v8h14v-8"/><path d="M10 20v-5h4v5"/>',
  truck: '<path d="M3 6h11v10H3z"/><path d="M14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  chef: '<path d="M7 14a4 4 0 1 1 1.5-7.7A4 4 0 0 1 15.5 6 4 4 0 1 1 17 14"/><path d="M7 14v6h10v-6"/><path d="M7 17h10"/>',
  file: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.8-4.2L3 9"/><path d="M3 4v5h5"/><path d="M4 13a8 8 0 0 0 14.8 4.2L21 15"/><path d="M21 20v-5h-5"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" fill="currentColor"/>',
  wallet: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18"/><path d="M16 15h2"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  trend: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  trendDown: '<path d="m3 7 6 6 4-4 8 8"/><path d="M15 17h6v-6"/>',
  cloud: '<path d="M7 18a4 4 0 0 1-.6-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  scale: '<path d="M12 3v18M5 21h14"/><path d="M5 7h14"/><path d="m5 7-3 7a3 3 0 0 0 6 0z"/><path d="m19 7-3 7a3 3 0 0 0 6 0z"/>',
};

export function icon(name, cls = '') {
  return raw(
    `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`
  );
}

// ---------- Format ----------
const nf = new Intl.NumberFormat('id-ID');
export const rupiah = (n) => 'Rp' + nf.format(Math.round(n || 0));
export const rupiahShort = (n) => {
  const a = Math.abs(n || 0);
  if (a >= 1e9) return 'Rp' + (n / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' M';
  if (a >= 1e6) return 'Rp' + (n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt';
  if (a >= 1e3) return 'Rp' + (n / 1e3).toLocaleString('id-ID', { maximumFractionDigits: 0 }) + ' rb';
  return rupiah(n);
};
export const number = (n, digits = 1) => (n == null ? '–' : Number(n).toLocaleString('id-ID', { maximumFractionDigits: digits }));
export const qty = (n, unit) => `${number(n, ['kg', 'liter', 'l'].includes(String(unit).toLowerCase()) ? 1 : 0)} ${unit}`;
export const pct = (x, digits = 0) => (x == null ? '–' : `${(x * 100).toLocaleString('id-ID', { maximumFractionDigits: digits })}%`);
export const signedPct = (m) => {
  const v = Math.round((m - 1) * 100);
  return (v > 0 ? '+' : '') + v + '%';
};

const d0 = (s) => new Date(s + 'T00:00:00Z');
const fmt = (opts) => new Intl.DateTimeFormat('id-ID', { timeZone: 'UTC', ...opts });
export const dateLong = (s) => fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d0(s));
export const dateFull = (s) => fmt({ day: 'numeric', month: 'long', year: 'numeric' }).format(d0(s));
export const dateMed = (s) => fmt({ weekday: 'short', day: 'numeric', month: 'short' }).format(d0(s));
export const dateShort = (s) => fmt({ day: 'numeric', month: 'short' }).format(d0(s));
export const dayName = (s) => fmt({ weekday: 'short' }).format(d0(s));
export const monthShort = (s) => fmt({ month: 'short' }).format(d0(s));
export const dayNum = (s) => d0(s).getUTCDate();
export const dateTime = (s) =>
  new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }).format(
    new Date(String(s).replace(' ', 'T') + (String(s).includes('Z') ? '' : 'Z'))
  );
export function todayStr() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
}
export function addDays(d, n) {
  const t = d0(d);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}
export const initials = (name) =>
  String(name || '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

export const RISK = {
  tinggi: { label: 'Risiko tinggi', cls: 'high' },
  sedang: { label: 'Risiko sedang', cls: 'mid' },
  rendah: { label: 'Risiko rendah', cls: 'low' },
};
export const riskBadge = (level) => (level ? html`<span class="badge dot ${RISK[level].cls}">${RISK[level].label}</span>` : html`<span class="badge dot ok">Aman</span>`);
export const categoryBadge = (c) => (c === 'segar' ? html`<span class="badge low">Segar</span>` : html`<span class="badge info">Tahan lama</span>`);
export const SOURCES = {
  manual: 'Input manual',
  excel: 'Import Excel',
  mokapos: 'MokaPOS',
  gofood: 'GoFood',
  grabfood: 'GrabFood',
  shopeefood: 'ShopeeFood',
  pembelian: 'Pembelian',
  rekomendasi: 'Dari rekomendasi',
  awal: 'Stok awal',
};
export const BUSINESS_TYPES = { warung: 'Warung', rumah_makan: 'Rumah Makan', katering: 'Katering' };

// ---------- Toast ----------
export function toast(message, type = 'success') {
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  box.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }, type === 'error' ? 4800 : 3000);
}

// ---------- Modal ----------
// body: html; onMount(el, close); actions: [{label, cls, onClick(el, close) -> false keeps open}]
export function modal({ title, body, actions = [], wide = false, onMount }) {
  return new Promise((resolve) => {
    const back = document.createElement('div');
    back.className = 'modal-backdrop';
    back.innerHTML = html`
      <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${title}">
        <div class="modal-head"><h2>${title}</h2><button class="icon-btn plain" data-close aria-label="Tutup">${icon('x')}</button></div>
        <div class="modal-body">${body}</div>
        ${actions.length ? html`<div class="modal-foot">${actions.map((a, i) => html`<button class="btn ${a.cls || ''}" data-act="${i}">${a.label}</button>`)}</div>` : ''}
      </div>`;
    const close = (val) => {
      back.remove();
      document.removeEventListener('keydown', onKey);
      resolve(val);
    };
    const onKey = (e) => e.key === 'Escape' && close(null);
    document.addEventListener('keydown', onKey);
    back.addEventListener('mousedown', (e) => e.target === back && close(null));
    back.querySelector('[data-close]').onclick = () => close(null);
    back.querySelectorAll('[data-act]').forEach((b) => {
      b.onclick = async () => {
        const a = actions[+b.dataset.act];
        if (!a.onClick) return close(a.value ?? null);
        b.disabled = true;
        try {
          const r = await a.onClick(back, close);
          if (r !== false) close(r ?? true);
        } catch (err) {
          toast(err.message, 'error');
        } finally {
          b.disabled = false;
        }
      };
    });
    document.body.appendChild(back);
    onMount?.(back, close);
    back.querySelector('input:not([type=hidden]), select, textarea')?.focus();
  });
}

export function confirmDialog({ title, message, confirm = 'Ya, lanjutkan', danger = false }) {
  return modal({
    title,
    body: html`<p class="muted">${message}</p>`,
    actions: [
      { label: 'Batal', cls: 'btn-secondary', value: false },
      { label: confirm, cls: danger ? 'btn-danger' : '', value: true },
    ],
  });
}

export function formData(form) {
  const o = {};
  for (const [k, v] of new FormData(form).entries()) o[k] = typeof v === 'string' ? v.trim() : v;
  return o;
}

export const loading = (n = 3) =>
  html`<div class="stack">${Array.from({ length: n }, (_, i) => html`<div class="skeleton" style="height:${i ? 160 : 110}px"></div>`)}</div>`;

export const emptyState = (ico, title, text, action = '') =>
  html`<div class="empty">${icon(ico)}<b>${title}</b><p class="small">${text}</p>${action ? html`<div style="margin-top:14px">${action}</div>` : ''}</div>`;

// ---------- Grafik ----------
let tipEl;
function tip(e, content) {
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.className = 'chart-tip';
    document.body.appendChild(tipEl);
  }
  if (!content) return (tipEl.style.display = 'none');
  tipEl.innerHTML = content;
  tipEl.style.display = 'block';
  const x = Math.min(e.clientX + 14, window.innerWidth - tipEl.offsetWidth - 8);
  tipEl.style.left = x + 'px';
  tipEl.style.top = e.clientY - tipEl.offsetHeight - 12 + 'px';
}

function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v);
}

// series: [{name, values, color, dashed, area}], band: {lo, hi, color}
export function lineChart(el, { labels, series, band, height = 220, xLabel = (l) => l, yFormat = (v) => number(v, 0), tooltip }) {
  const W = Math.max(320, el.clientWidth || 640);
  const H = height;
  const pad = { l: 44, r: 12, t: 12, b: 26 };
  const all = series.flatMap((s) => s.values).concat(band ? band.hi : []).filter((v) => v != null);
  const max = niceMax(Math.max(...all, 1) * 1.08);
  const n = labels.length;
  const x = (i) => pad.l + (n === 1 ? 0 : (i * (W - pad.l - pad.r)) / (n - 1));
  const y = (v) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const step = Math.ceil(n / Math.max(2, Math.floor((W - pad.l) / 64)));
  const path = (vals) => {
    let d = '';
    let pen = false;
    vals.forEach((v, i) => {
      if (v == null) return (pen = false);
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  let svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" role="img">`;
  for (let k = 0; k <= 4; k++) {
    const v = (max * k) / 4;
    svg += `<line class="grid-line" x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${pad.l - 8}" y="${y(v) + 4}" text-anchor="end">${esc(yFormat(v))}</text>`;
  }
  labels.forEach((l, i) => {
    if ((n - 1 - i) % step === 0) svg += `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${esc(xLabel(l, i))}</text>`;
  });
  if (band) {
    const idx = band.lo.map((v, i) => (v == null ? null : i)).filter((i) => i != null);
    if (idx.length) {
      const top = idx.map((i) => `${x(i)},${y(band.hi[i])}`).join(' ');
      const bot = idx.reverse().map((i) => `${x(i)},${y(band.lo[i])}`).join(' ');
      svg += `<polygon points="${top} ${bot}" fill="${band.color}" opacity="0.16"/>`;
    }
  }
  for (const s of series) {
    if (s.area) {
      const idx = s.values.map((v, i) => (v == null ? null : i)).filter((i) => i != null);
      if (idx.length > 1)
        svg += `<path d="${path(s.values)} L${x(idx.at(-1))},${y(0)} L${x(idx[0])},${y(0)} Z" fill="${s.color}" opacity="0.08"/>`;
    }
    svg += `<path d="${path(s.values)}" fill="none" stroke="${s.color}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" ${s.dashed ? 'stroke-dasharray="5 5"' : ''}/>`;
    s.values.forEach((v, i) => {
      if (v != null && (n <= 31 || s.dots)) svg += `<circle cx="${x(i)}" cy="${y(v)}" r="${n <= 16 ? 3.2 : 2.2}" fill="#fff" stroke="${s.color}" stroke-width="2"/>`;
    });
  }
  const colW = (W - pad.l - pad.r) / Math.max(1, n - 1);
  labels.forEach((_, i) => {
    svg += `<rect class="hover-col" data-i="${i}" x="${x(i) - colW / 2}" y="${pad.t}" width="${colW}" height="${H - pad.t - pad.b}"/>`;
  });
  svg += '</svg>';
  el.innerHTML = svg;
  el.querySelectorAll('.hover-col').forEach((r) => {
    r.addEventListener('mousemove', (e) => {
      const i = +r.dataset.i;
      const lines = tooltip
        ? tooltip(i)
        : `<b>${esc(xLabel(labels[i], i))}</b><br>` +
          series.filter((s) => s.values[i] != null).map((s) => `${esc(s.name)}: <b>${esc(yFormat(s.values[i]))}</b>`).join('<br>');
      tip(e, lines);
    });
    r.addEventListener('mouseleave', (e) => tip(e, null));
  });
}

export function barChart(el, { labels, values, color = '#0d9488', height = 200, xLabel = (l) => l, yFormat = (v) => number(v, 0), highlight }) {
  const W = Math.max(320, el.clientWidth || 640);
  const H = height;
  const pad = { l: 52, r: 8, t: 10, b: 26 };
  const max = niceMax(Math.max(...values, 1) * 1.08);
  const n = values.length;
  const bw = (W - pad.l - pad.r) / n;
  const y = (v) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  let svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" role="img">`;
  for (let k = 0; k <= 4; k++) {
    const v = (max * k) / 4;
    svg += `<line class="grid-line" x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${pad.l - 8}" y="${y(v) + 4}" text-anchor="end">${esc(yFormat(v))}</text>`;
  }
  const step = Math.ceil(n / Math.max(2, Math.floor((W - pad.l) / 56)));
  values.forEach((v, i) => {
    const x = pad.l + i * bw + bw * 0.18;
    const c = highlight && highlight(i) ? highlight(i) : color;
    svg += `<rect x="${x}" y="${y(v)}" width="${bw * 0.64}" height="${Math.max(0, y(0) - y(v))}" rx="4" fill="${c}" data-i="${i}" class="bar"/>`;
    if ((n - 1 - i) % step === 0) svg += `<text x="${x + bw * 0.32}" y="${H - 6}" text-anchor="middle">${esc(xLabel(labels[i], i))}</text>`;
  });
  svg += '</svg>';
  el.innerHTML = svg;
  el.querySelectorAll('.bar').forEach((r) => {
    r.addEventListener('mousemove', (e) => tip(e, `<b>${esc(xLabel(labels[+r.dataset.i], +r.dataset.i))}</b><br>${esc(yFormat(values[+r.dataset.i]))}`));
    r.addEventListener('mouseleave', (e) => tip(e, null));
  });
}

// Gambar ulang grafik saat lebar kontainer berubah.
export function responsive(el, draw) {
  draw();
  let w = el.clientWidth;
  const ro = new ResizeObserver(() => {
    if (Math.abs(el.clientWidth - w) > 8) {
      w = el.clientWidth;
      draw();
    }
  });
  ro.observe(el);
  return () => ro.disconnect();
}

export function topbarActions(markup) {
  const el = document.getElementById('topbar-actions');
  if (el) el.innerHTML = markup;
  return el;
}
