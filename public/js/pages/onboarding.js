import { html, raw, icon } from '../ui.js';

// Ilustrasi sederhana per slide (SVG inline, warna brand).
const ART = {
  basket: raw(`<svg viewBox="0 0 300 260">
    <circle cx="150" cy="130" r="112" fill="#ccfbf1"/>
    <rect x="62" y="70" width="176" height="118" rx="18" fill="#fff" stroke="#0f766e" stroke-width="3"/>
    <path d="M86 160l34-34 26 20 52-52" fill="none" stroke="#0d9488" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="198" cy="94" r="9" fill="#fbbf24"/>
    <rect x="86" y="92" width="58" height="9" rx="4.5" fill="#e1e9e7"/>
    <path d="M70 196h160l-14 44H84z" fill="#0f766e"/>
    <path d="M98 196l18-30M202 196l-18-30" stroke="#0f766e" stroke-width="7" stroke-linecap="round"/>
    <circle cx="112" cy="190" r="15" fill="#f87171"/><circle cx="148" cy="186" r="17" fill="#84cc16"/><circle cx="186" cy="190" r="14" fill="#fbbf24"/>
  </svg>`),
  calendar: raw(`<svg viewBox="0 0 300 260">
    <circle cx="150" cy="130" r="112" fill="#ccfbf1"/>
    <rect x="58" y="54" width="184" height="162" rx="20" fill="#fff" stroke="#0f766e" stroke-width="3"/>
    <rect x="58" y="54" width="184" height="40" rx="20" fill="#0f766e"/><rect x="58" y="74" width="184" height="20" fill="#0f766e"/>
    <circle cx="100" cy="54" r="7" fill="#5eead4"/><circle cx="200" cy="54" r="7" fill="#5eead4"/>
    <g fill="#0d9488"><rect x="80" y="150" width="18" height="44" rx="5"/><rect x="106" y="160" width="18" height="34" rx="5"/><rect x="132" y="144" width="18" height="50" rx="5"/><rect x="158" y="136" width="18" height="58" rx="5"/></g>
    <rect x="184" y="108" width="22" height="86" rx="5" fill="#fbbf24"/>
    <path d="M195 100l6-12h-12z" fill="#f59e0b"/>
    <text x="195" y="128" font-family="sans-serif" font-size="11" font-weight="700" fill="#422006" text-anchor="middle">25</text>
    <text x="80" y="128" font-family="sans-serif" font-size="13" font-weight="700" fill="#5a6e6a">Sen–Sab</text>
  </svg>`),
  gauge: raw(`<svg viewBox="0 0 300 260">
    <circle cx="150" cy="130" r="112" fill="#ccfbf1"/>
    <path d="M62 170a88 88 0 0 1 58-83" fill="none" stroke="#65a30d" stroke-width="22"/>
    <path d="M124 85a88 88 0 0 1 64 6" fill="none" stroke="#f59e0b" stroke-width="22"/>
    <path d="M192 93a88 88 0 0 1 46 77" fill="none" stroke="#dc2626" stroke-width="22"/>
    <path d="M150 170l50-52" stroke="#102a26" stroke-width="8" stroke-linecap="round"/>
    <circle cx="150" cy="170" r="14" fill="#102a26"/>
    <rect x="96" y="196" width="108" height="34" rx="17" fill="#fee2e2"/>
    <text x="150" y="218" font-family="sans-serif" font-size="14" font-weight="800" fill="#b91c1c" text-anchor="middle">TINGGI</text>
  </svg>`),
  plug: raw(`<svg viewBox="0 0 300 260">
    <circle cx="150" cy="130" r="112" fill="#ccfbf1"/>
    <rect x="112" y="96" width="76" height="76" rx="22" fill="#0f766e"/>
    <path d="M131 145l11-11 8 6 16-16" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
    <g stroke="#0d9488" stroke-width="4" stroke-dasharray="6 6"><path d="M112 120H70"/><path d="M188 120h42"/><path d="M150 96V58"/><path d="M150 172v36"/></g>
    <rect x="34" y="104" width="40" height="34" rx="10" fill="#fff" stroke="#0f766e" stroke-width="3"/><text x="54" y="126" font-family="sans-serif" font-size="11" font-weight="800" fill="#0f766e" text-anchor="middle">POS</text>
    <rect x="226" y="104" width="40" height="34" rx="10" fill="#00aa13"/><text x="246" y="126" font-family="sans-serif" font-size="10" font-weight="800" fill="#fff" text-anchor="middle">Food</text>
    <rect x="130" y="26" width="40" height="34" rx="10" fill="#fff" stroke="#0f766e" stroke-width="3"/><text x="150" y="48" font-family="sans-serif" font-size="10" font-weight="800" fill="#0f766e" text-anchor="middle">XLSX</text>
    <rect x="130" y="206" width="40" height="34" rx="10" fill="#f97316"/><text x="150" y="228" font-family="sans-serif" font-size="10" font-weight="800" fill="#fff" text-anchor="middle">Shop</text>
  </svg>`),
};

const SLIDES = [
  {
    art: 'basket',
    title: 'Belanja bahan tanpa menebak-nebak',
    text: 'StockWise membaca riwayat penjualan usahamu, lalu memberi tahu bahan apa yang perlu dibeli dan berapa banyak.',
  },
  {
    art: 'calendar',
    title: 'Forecast yang paham ritme usahamu',
    text: 'Pola harian, akhir pekan, tanggal gajian, sampai Lebaran dan Natal ikut dihitung. Bahan segar diprediksi harian, bahan tahan lama mingguan atau bulanan.',
  },
  {
    art: 'gauge',
    title: 'Waste Risk Score',
    text: 'Kenali bahan yang berisiko terbuang sebelum terlambat, dengan level rendah, sedang, atau tinggi beserta saran tindakannya.',
  },
  {
    art: 'plug',
    title: 'Mulai gratis, otomatis saat siap',
    text: 'Freemium untuk input manual dan Excel. Upgrade ke Pro agar data dari MokaPOS, GoFood, GrabFood, dan ShopeeFood tersinkron otomatis.',
  },
];

export default {
  title: 'Selamat datang',
  render(root, ctx) {
    let i = 0;
    root.innerHTML = html`
      <div class="screen">
        <div class="screen-inner">
          <div class="onb-top">
            <div class="row"><img src="/img/logo.png" width="34" height="34" alt="" /><b style="font-size:18px">StockWise</b></div>
            <button class="btn btn-ghost btn-sm" id="skip">Lewati</button>
          </div>
          <div class="onb-slides">
            <div class="onb-track" id="track">
              ${SLIDES.map(
                (s) => html`<section class="onb-slide">
                  <div class="onb-art">${ART[s.art]}</div>
                  <div class="stack-sm"><h1>${s.title}</h1><p>${s.text}</p></div>
                </section>`
              )}
            </div>
          </div>
          <div class="onb-dots" id="dots">${SLIDES.map((_, k) => html`<i class="${k === 0 ? 'on' : ''}"></i>`)}</div>
          <div class="stack-sm">
            <button class="btn btn-lg btn-block" id="next">Lanjut ${icon('chevronRight')}</button>
            <button class="btn btn-ghost btn-block" id="login">Sudah punya akun? Masuk</button>
          </div>
        </div>
      </div>`;

    const track = root.querySelector('#track');
    const dots = [...root.querySelectorAll('#dots i')];
    const next = root.querySelector('#next');
    const finish = (path) => {
      try {
        localStorage.setItem('sw_onboarded', '1');
      } catch {
        /* private mode */
      }
      ctx.go(path);
    };
    const show = (k) => {
      i = Math.max(0, Math.min(SLIDES.length - 1, k));
      track.style.transform = `translateX(-${i * 100}%)`;
      dots.forEach((d, n) => d.classList.toggle('on', n === i));
      next.innerHTML = i === SLIDES.length - 1 ? 'Mulai sekarang' : html`Lanjut ${icon('chevronRight')}`.toString();
    };
    next.onclick = () => (i === SLIDES.length - 1 ? finish('/register') : show(i + 1));
    root.querySelector('#skip').onclick = () => finish('/register');
    root.querySelector('#login').onclick = () => finish('/login');

    let x0 = null;
    track.addEventListener('touchstart', (e) => (x0 = e.touches[0].clientX), { passive: true });
    track.addEventListener('touchend', (e) => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 40) show(i + (dx < 0 ? 1 : -1));
      x0 = null;
    });
    const onKey = (e) => {
      if (e.key === 'ArrowRight') show(i + 1);
      if (e.key === 'ArrowLeft') show(i - 1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  },
};
