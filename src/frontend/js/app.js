import { api, setUnauthorizedHandler } from './api.js';
import { html, icon, modal, toast } from './ui.js';
import onboarding from './pages/onboarding.js';
import { login, register } from './pages/auth.js';
import dashboard from './pages/dashboard.js';
import { bahan, stokMasuk } from './pages/bahan.js';
import menu from './pages/menu.js';
import penjualan from './pages/penjualan.js';
import importPage from './pages/import.js';
import events from './pages/event.js';
import riwayat from './pages/riwayat.js';
import forecast from './pages/forecast.js';
import rekomendasi from './pages/rekomendasi.js';
import evaluasi from './pages/evaluasi.js';
import { langganan, integrasi } from './pages/langganan.js';
import { akun, profil, feedback, hapusAkun } from './pages/akun.js';

const ROUTES = {
  '/onboarding': { page: onboarding, public: true },
  '/login': { page: login, public: true },
  '/register': { page: register, public: true },
  '/dashboard': { page: dashboard, nav: 'dashboard' },
  '/bahan': { page: bahan, nav: 'bahan' },
  '/stok-masuk': { page: stokMasuk, nav: 'bahan', back: '/bahan' },
  '/menu': { page: menu, nav: 'menu' },
  '/penjualan': { page: penjualan, nav: 'penjualan' },
  '/import': { page: importPage, nav: 'import' },
  '/event': { page: events, nav: 'event' },
  '/riwayat': { page: riwayat, nav: 'riwayat' },
  '/forecast': { page: forecast, nav: 'forecast' },
  '/rekomendasi': { page: rekomendasi, nav: 'rekomendasi' },
  '/evaluasi': { page: evaluasi, nav: 'evaluasi' },
  '/langganan': { page: langganan, nav: 'langganan' },
  '/integrasi': { page: integrasi, nav: 'integrasi' },
  '/akun': { page: akun, nav: 'akun' },
  '/profil': { page: profil, nav: 'profil', back: '/akun' },
  '/feedback': { page: feedback, nav: 'feedback', back: '/akun' },
  '/hapus-akun': { page: hapusAkun, nav: 'profil', back: '/profil' },
};

const NAV = [
  { group: 'Utama', items: [['dashboard', 'Beranda', 'home']] },
  {
    group: 'Data usaha',
    items: [
      ['bahan', 'Stok & Bahan Baku', 'box'],
      ['menu', 'Menu & Resep', 'utensils'],
      ['penjualan', 'Input Penjualan', 'receipt'],
      ['import', 'Import Excel', 'upload'],
      ['event', 'Event & Hari Khusus', 'calendar'],
      ['riwayat', 'Riwayat Transaksi', 'history'],
    ],
  },
  {
    group: 'Analitik',
    items: [
      ['forecast', 'Forecast Kebutuhan', 'chart'],
      ['rekomendasi', 'Rekomendasi Belanja', 'cart'],
      ['evaluasi', 'Evaluasi Akurasi', 'target'],
    ],
  },
  {
    group: 'Akun',
    items: [
      ['langganan', 'Paket & Langganan', 'crown'],
      ['integrasi', 'Sinkronisasi API', 'plug', true],
      ['profil', 'Profil', 'user'],
      ['feedback', 'Feedback', 'message'],
    ],
  },
];
const BOTTOM = [
  ['dashboard', 'Beranda', 'home'],
  ['forecast', 'Forecast', 'chart'],
  null,
  ['rekomendasi', 'Belanja', 'cart'],
  ['akun', 'Akun', 'user'],
];

const state = { user: null, cleanup: null, shell: false };
const root = document.getElementById('app');

export const go = (path) => {
  if (location.hash === '#' + path) route();
  else location.hash = path;
};

function parseHash() {
  const h = location.hash.slice(1) || '';
  const [path, query = ''] = h.split('?');
  return { path: path || '', params: Object.fromEntries(new URLSearchParams(query)) };
}

const ctx = {
  get user() {
    return state.user;
  },
  setUser(u) {
    state.user = u;
    if (state.shell) renderShellChrome();
  },
  go,
  async logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    state.user = null;
    state.shell = false;
    go('/login');
  },
};

setUnauthorizedHandler(() => {
  if (!state.user) return;
  state.user = null;
  state.shell = false;
  toast('Sesi berakhir, silakan masuk kembali.', 'error');
  go('/login');
});

function onboarded() {
  try {
    return localStorage.getItem('sw_onboarded') === '1';
  } catch {
    return false;
  }
}

function navLink([id, label, ico, proOnly]) {
  const locked = proOnly && state.user?.role !== 'pro';
  return html`<a class="nav-link" data-nav="${id}" href="#/${id}">${icon(ico)}<span>${label}</span>${locked ? html`<span class="lock">PRO</span>` : ''}</a>`;
}

function renderShell() {
  root.innerHTML = html`
    <div class="app">
      <aside class="sidebar">
        <a class="brand" href="#/dashboard" style="text-decoration:none;color:inherit">
          <img src="/img/logo.png" alt="" />
          <div><b>StockWise</b><small>Stock smart, waste less</small></div>
        </a>
        <nav>
          ${NAV.map((g) => html`<div class="nav-group"><span>${g.group}</span>${g.items.map(navLink)}</div>`)}
        </nav>
        <div class="sidebar-foot" id="sidebar-user"></div>
      </aside>
      <div class="main">
        <header class="topbar" id="topbar">
          <button class="icon-btn plain back" id="back-btn" aria-label="Kembali">${icon('chevronLeft')}</button>
          <img class="mobile-logo" id="mobile-logo" src="/img/logo.png" alt="" />
          <h1 id="page-title"></h1>
          <div id="topbar-actions" class="row"></div>
        </header>
        <main class="content" id="content"></main>
      </div>
      <nav class="bottom-nav">
        ${BOTTOM.map((b) =>
          b
            ? html`<a data-nav="${b[0]}" href="#/${b[0]}">${icon(b[2])}<span>${b[1]}</span></a>`
            : html`<div><button class="fab" id="fab" aria-label="Tambah data">${icon('plus')}</button></div>`
        )}
      </nav>
    </div>`;
  state.shell = true;
  document.getElementById('fab').onclick = openQuickActions;
  const topbar = document.getElementById('topbar');
  window.addEventListener('scroll', () => topbar.classList.toggle('scrolled', window.scrollY > 4), { passive: true });
  renderShellChrome();
}

function renderShellChrome() {
  const u = state.user;
  if (!u) return;
  document.getElementById('sidebar-user').innerHTML = html`
    <a class="list-item clickable" href="#/akun" style="text-decoration:none;color:inherit">
      <div class="avatar">${(u.name || '?').split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()}</div>
      <div class="grow">
        <div class="title">${u.business_name}</div>
        <div class="meta">${u.role === 'pro' ? html`<span class="badge pro" style="height:20px">PRO</span>` : 'Freemium'}</div>
      </div>
    </a>`;
  document.querySelectorAll('.nav-link[data-nav=integrasi]').forEach((a) => {
    a.outerHTML = navLink(['integrasi', 'Sinkronisasi API', 'plug', true]).toString();
  });
}

function openQuickActions() {
  modal({
    title: 'Tambah data',
    body: html`<div class="sheet-actions" style="padding-bottom:10px">
      <a href="#/penjualan">${icon('receipt')}Input penjualan<span>Catat porsi terjual hari ini</span></a>
      <a href="#/stok-masuk">${icon('truck')}Stok masuk<span>Catat bahan yang dibeli</span></a>
      <a href="#/stok-masuk?tab=terbuang">${icon('trash')}Bahan terbuang<span>Catat bahan rusak / sisa</span></a>
      <a href="#/import">${icon('upload')}Import Excel<span>Unggah riwayat sekaligus</span></a>
    </div>`,
    onMount: (el, close) => el.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => close())),
  });
}

async function route() {
  const { path, params } = parseHash();
  let r = ROUTES[path];
  if (!r) return go(state.user ? '/dashboard' : onboarded() ? '/login' : '/onboarding');
  if (r.public && state.user) return go('/dashboard');
  if (!r.public && !state.user) return go(onboarded() ? '/login' : '/onboarding');

  state.cleanup?.();
  state.cleanup = null;
  document.querySelector('.chart-tip')?.style.setProperty('display', 'none');

  if (r.public) {
    state.shell = false;
    root.innerHTML = '';
    state.cleanup = (await r.page.render(root, ctx, params)) || null;
    window.scrollTo(0, 0);
    return;
  }
  if (!state.shell) renderShell();
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === r.nav));
  const title = typeof r.page.title === 'function' ? r.page.title(ctx) : r.page.title;
  document.getElementById('page-title').textContent = title;
  document.title = `${title} · StockWise`;
  const isRoot = BOTTOM.some((b) => b && b[0] === r.nav) && !r.back;
  const backBtn = document.getElementById('back-btn');
  backBtn.classList.toggle('hidden', isRoot);
  document.getElementById('mobile-logo').classList.toggle('hidden', !isRoot);
  backBtn.onclick = () => (history.length > 1 ? history.back() : go(r.back || '/dashboard'));
  document.getElementById('topbar-actions').innerHTML = '';
  const content = document.getElementById('content');
  content.innerHTML = '';
  window.scrollTo(0, 0);
  try {
    state.cleanup = (await r.page.render(content, ctx, params)) || null;
  } catch (err) {
    if (err.status === 401) return;
    content.innerHTML = html`<div class="card"><div class="empty">${icon('alert')}<b>Halaman gagal dimuat</b><p class="small">${err.message}</p>
      <div style="margin-top:14px"><button class="btn btn-secondary" id="retry">Coba lagi</button></div></div></div>`;
    document.getElementById('retry').onclick = route;
  }
}

window.addEventListener('hashchange', route);

(async function init() {
  try {
    const { user } = await api('/auth/me');
    state.user = user;
  } catch {
    state.user = null;
  }
  route();
})();

