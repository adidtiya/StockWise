import { api } from '../api.js';
import { html, icon, loading, rupiah, rupiahShort, number, dateLong, dateShort, lineChart, responsive, emptyState } from '../ui.js';

function greeting() {
  const h = +new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Asia/Jakarta' }).format(new Date());
  return h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 19 ? 'Selamat sore' : 'Selamat malam';
}

export default {
  title: 'Beranda',
  async render(el, ctx) {
    el.innerHTML = loading(3);
    const u = ctx.user || {};

    const [dashRes, salesRes] = await Promise.all([
      api('/dashboard').catch(() => null),
      api('/sales/history?type=sales').catch(() => ({ rows: [] })),
    ]);

    const d = dashRes || {
      date: new Date().toISOString().slice(0, 10),
      counts: { products: 0, ingredients: 0, history_days: 0 },
      waste: { current_month_cost: 0, previous_month_cost: 0, reduction_percentage: 0 },
      risk: { high: 0, medium: 0, low: 0 },
      buy: { items_to_buy: 0, estimated_total_cost: 0 },
      portions: [],
    };

    const userName = u.name ? u.name.split(' ')[0] : 'Mitra';

    if (!d.counts.products && !d.counts.ingredients) {
      el.innerHTML = html`<div class="stack">
        <div class="card hero">
          <h2>${greeting()}, ${userName}!</h2>
          <p class="muted" style="margin-top:6px">Lengkapi data usaha agar StockWise bisa mulai memperkirakan kebutuhan bahan baku dan meminimalkan limbah.</p>
        </div>
        <div class="card">
          <div class="card-head" style="margin-bottom:8px">
            <div>
              <h3 style="font-size:16px;font-weight:700">Langkah Memulai</h3>
              <p class="muted small">Lengkapi data usaha berikut untuk mulai mengaktifkan peramalan otomatis</p>
            </div>
          </div>
          <div class="stack">
            ${[
              ['box', 'Daftarkan bahan baku', 'Nama, satuan, kategori segar / tahan lama, dan umur simpan.', '#/bahan', d.counts.ingredients > 0],
              ['utensils', 'Isi menu & komposisi resep', 'Agar penjualan menu dapat diterjemahkan menjadi kebutuhan bahan baku.', '#/menu', d.counts.products > 0],
              ['receipt', 'Catat penjualan atau impor Excel', 'Model peramalan mulai aktif setelah terkumpul minimal 14 hari riwayat.', '#/import', d.counts.history_days > 0],
            ].map(
              ([ico, t, s, href, done]) => html`<a class="list-item clickable" href="${href}" style="text-decoration:none;color:inherit">
                <div class="avatar" style="${done ? 'background:var(--ok-bg);color:var(--ok)' : ''}">${icon(done ? 'check' : ico)}</div>
                <div class="grow">
                  <div class="title" style="display:flex;align-items:center;gap:8px">${t} ${done ? html`<span class="badge ok" style="font-size:11px;height:20px;padding:0 6px">Selesai</span>` : ''}</div>
                  <div class="meta">${s}</div>
                </div>
                ${icon('chevronRight')}
              </a>`
            )}
          </div>
        </div>
      </div>`;
      return;
    }

    const riskTotal = (d.risk.high || 0) + (d.risk.medium || 0) + (d.risk.low || 0);

    el.innerHTML = html`<div class="stack">
      <div class="card hero">
        <div class="row-between wrap" style="position:relative;z-index:1">
          <div class="stack-sm">
            <span class="muted small">${dateLong(d.date)}</span>
            <h2 style="font-size:22px">${greeting()}, ${userName}!</h2>
            <p class="muted">
              ${d.buy.items_to_buy
                ? `Ada ${d.buy.items_to_buy} bahan yang perlu dibeli${d.risk.high ? ` dan ${d.risk.high} bahan berisiko limbah tinggi` : ''}.`
                : 'Stok bahan baku terpantau aman untuk periode berikutnya.'}
            </p>
          </div>
          <div class="row wrap">
            <a class="btn btn-light" href="#/penjualan">${icon('receipt')}Input Penjualan</a>
            <a class="btn" style="background:#fff;color:var(--brand-700)" href="#/rekomendasi">${icon('cart')}Rekomendasi Belanja</a>
          </div>
        </div>
      </div>

      <div class="grid grid-4">
        <a class="card kpi" href="#/menu" style="text-decoration:none;color:inherit">
          <span class="label"><span class="ico">${icon('utensils')}</span>Master Data</span>
          <span class="value">${d.counts.products} <small class="muted" style="font-size:14px">menu</small></span>
          <span class="sub">${d.counts.ingredients} bahan baku terdaftar</span>
        </a>

        <a class="card kpi" href="#/rekomendasi" style="text-decoration:none;color:inherit">
          <span class="label"><span class="ico">${icon('cart')}</span>Perlu Dibeli</span>
          <span class="value" id="kpi-buy">${d.buy.items_to_buy} <small class="muted" style="font-size:14px">bahan</small></span>
          <span class="sub">Estimasi ${rupiahShort(d.buy.estimated_total_cost)}</span>
        </a>

        <a class="card kpi" href="#/rekomendasi?filter=risiko" style="text-decoration:none;color:inherit">
          <span class="label"><span class="ico" style="background:var(--high-bg);color:var(--high)">${icon('flame')}</span>Waste Risk</span>
          <span class="value" id="kpi-risk">${d.risk.high + d.risk.medium} <small class="muted" style="font-size:14px">waspada</small></span>
          <span class="sub row wrap" style="gap:6px">
            ${d.risk.high ? html`<span class="badge high">${d.risk.high} tinggi</span>` : ''}
            ${d.risk.medium ? html`<span class="badge mid">${d.risk.medium} sedang</span>` : ''}
            ${!d.risk.high && !d.risk.medium ? 'Risiko limbah terkendali' : ''}
          </span>
        </a>

        <div class="card kpi">
          <span class="label"><span class="ico" style="background:var(--ok-bg);color:var(--ok)">${icon('trash')}</span>Limbah Bulan Ini</span>
          <span class="value">${rupiahShort(d.waste.current_month_cost)}</span>
          <span class="sub">
            ${d.waste.reduction_percentage > 0
              ? html`<span style="color:var(--ok)">▼ Turun ${number(d.waste.reduction_percentage, 1)}%</span> dari bulan lalu`
              : 'Pantauan nilai bahan terbuang'}
          </span>
        </div>
      </div>

      <div class="card">
        <div class="card-head wrap">
          <div>
            <h2>Tren Penjualan Terakhir</h2>
            <p>Total kuantitas porsi terjual per tanggal</p>
          </div>
          <a class="btn btn-ghost btn-sm" href="#/riwayat">Lihat Riwayat</a>
        </div>
        <div id="chart-wrap" style="margin-top:10px;overflow-x:auto;-webkit-overflow-scrolling:touch">
          <div id="chart" style="min-width:280px"></div>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <div>
            <h2>Kapasitas Porsi Produk yang Bisa Dibuat</h2>
            <p>Dihitung dari stok bahan baku saat ini berdasarkan komposisi resep masing-masing menu</p>
          </div>
        </div>
        <div class="portions" id="portions-grid" style="margin-top:12px">
          ${d.portions && d.portions.length
            ? d.portions.map(
                (p) => html`<div class="portion" style="padding:14px;border:1px solid var(--border);border-radius:12px">
                  <b style="font-size:22px;color:${p.remaining_portions === 0 ? 'var(--high)' : p.remaining_portions < 10 ? 'var(--mid)' : 'var(--brand-700)'}">
                    ${number(p.remaining_portions, 0)}
                  </b>
                  <span style="font-weight:700;margin-top:4px">${p.product_name}</span>
                  <small class="muted">porsi tersedia</small>
                </div>`
              )
            : html`<p class="small muted">Belum ada menu dengan takaran resep aktif.</p>`}
        </div>
      </div>
    </div>`;

    // Process sales rows to draw trend line chart
    const salesRows = salesRes?.rows || [];
    const dateMap = new Map();
    for (const r of salesRows) {
      const dt = r.date;
      dateMap.set(dt, (dateMap.get(dt) || 0) + (Number(r.qty) || 0));
    }

    const sortedDates = [...dateMap.keys()].sort();
    let chartLabels = sortedDates;
    let chartValues = sortedDates.map((dt) => dateMap.get(dt));

    if (chartLabels.length < 2) {
      // Provide clean default 7-day range if history is sparse
      const today = new Date(d.date || Date.now());
      chartLabels = [];
      chartValues = [];
      for (let i = 6; i >= 0; i--) {
        const dt = new Date(today);
        dt.setDate(today.getDate() - i);
        const iso = dt.toISOString().slice(0, 10);
        chartLabels.push(iso);
        chartValues.push(dateMap.get(iso) || 0);
      }
    }

    const chartEl = el.querySelector('#chart');
    if (chartEl) {
      responsive(chartEl, () => {
        const isMobile = (chartEl.clientWidth || window.innerWidth) < 480;
        lineChart(chartEl, {
          labels: chartLabels,
          series: [
            {
              name: 'Penjualan Aktual',
              values: chartValues,
              color: '#0d9488',
              area: true,
            },
          ],
          xLabel: (l) => {
            if (isMobile) {
              const d = new Date(l + 'T00:00:00Z');
              return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
            }
            return dateShort(l);
          },
          yFormat: (v) => `${number(v, 0)} porsi`,
        });
      });
    }
  },
};
