import { api } from '../api.js';
import { html, icon, loading, rupiah, rupiahShort, number, qty, pct, dateLong, dateShort, dayName, dayNum, monthShort, signedPct, riskBadge, lineChart, responsive, emptyState } from '../ui.js';

function greeting() {
  const h = +new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Asia/Jakarta' }).format(new Date());
  return h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 19 ? 'Selamat sore' : 'Selamat malam';
}

export default {
  title: 'Beranda',
  async render(el, ctx) {
    el.innerHTML = loading(3);
    const d = await api('/dashboard');
    const u = ctx.user;

    if (!d.counts.products || !d.counts.ingredients) {
      el.innerHTML = html`<div class="stack">
        <div class="card hero"><h2>${greeting()}, ${u.name.split(' ')[0]}!</h2><p class="muted" style="margin-top:6px">Lengkapi data usaha agar StockWise bisa mulai memperkirakan kebutuhan bahan.</p></div>
        <div class="card"><div class="stack">
          ${[
            ['box', 'Daftarkan bahan baku', 'Nama, satuan, kategori segar / tahan lama, dan umur simpan.', '#/bahan', d.counts.ingredients > 0],
            ['utensils', 'Isi menu & komposisi bahan', 'Agar penjualan menu bisa diterjemahkan menjadi pemakaian bahan.', '#/menu', d.counts.products > 0],
            ['receipt', 'Catat penjualan atau import Excel', 'Forecast mulai berjalan setelah ada riwayat beberapa minggu.', '#/import', d.counts.history_days > 0],
          ].map(
            ([ico, t, s, href, done]) => html`<a class="list-item clickable" href="${href}" style="text-decoration:none;color:inherit">
              <div class="avatar" style="${done ? 'background:var(--ok-bg);color:var(--ok)' : ''}">${icon(done ? 'check' : ico)}</div>
              <div class="grow"><div class="title">${t}</div><div class="meta">${s}</div></div>${icon('chevronRight')}</a>`
          )}
        </div></div></div>`;
      return;
    }

    const wasteDelta = d.waste.prev30 > 0 ? (d.waste.last30 - d.waste.prev30) / d.waste.prev30 : null;
    const riskTotal = d.risk.tinggi + d.risk.sedang + d.risk.rendah;

    el.innerHTML = html`
      <div class="stack">
        <div class="card hero">
          <div class="row-between wrap" style="position:relative;z-index:1">
            <div class="stack-sm">
              <span class="muted small">${dateLong(d.date)}</span>
              <h2 style="font-size:22px">${greeting()}, ${u.name.split(' ')[0]}!</h2>
              <p class="muted">${
                d.buy.count
                  ? `Ada ${d.buy.count} bahan yang perlu dibeli${riskTotal ? ` dan ${riskTotal} bahan berisiko terbuang` : ''}.`
                  : riskTotal
                    ? `${riskTotal} bahan berisiko terbuang. Cek saran pemakaiannya.`
                    : 'Stok aman untuk periode berikutnya.'
              }</p>
            </div>
            <div class="row wrap">
              <a class="btn btn-light" href="#/penjualan">${icon('receipt')}Input penjualan</a>
              <a class="btn" style="background:#fff;color:var(--brand-700)" href="#/rekomendasi">${icon('cart')}Lihat belanja</a>
            </div>
          </div>
        </div>

        ${d.quota && d.quota.used / d.quota.limit > 0.8
          ? html`<div class="callout warn">${icon('alert')}<div>Kuota Freemium terpakai ${d.quota.used}/${d.quota.limit} transaksi bulan ini. <a href="#/langganan"><b>Upgrade ke Pro</b></a> untuk transaksi tanpa batas.</div></div>`
          : ''}

        <div class="grid grid-4">
          <div class="card kpi">
            <span class="label"><span class="ico">${icon('receipt')}</span>Terjual hari ini</span>
            <span class="value">${number(d.today.qty, 0)} <small class="muted" style="font-size:14px">porsi</small></span>
            <span class="sub">${rupiah(d.today.revenue)} · forecast ${number(d.today.forecast, 0)} porsi</span>
            <div class="progress" title="Realisasi vs forecast hari ini"><i style="width:${Math.min(100, (d.today.qty / Math.max(1, d.today.forecast)) * 100)}%"></i></div>
          </div>
          <a class="card kpi" href="#/rekomendasi" style="text-decoration:none;color:inherit">
            <span class="label"><span class="ico">${icon('cart')}</span>Perlu dibeli</span>
            <span class="value">${d.buy.count} <small class="muted" style="font-size:14px">bahan</small></span>
            <span class="sub">Estimasi belanja ${rupiahShort(d.buy.cost)}</span>
          </a>
          <a class="card kpi" href="#/rekomendasi?filter=risiko" style="text-decoration:none;color:inherit">
            <span class="label"><span class="ico" style="background:var(--high-bg);color:var(--high)">${icon('flame')}</span>Waste Risk</span>
            <span class="value">${riskTotal} <small class="muted" style="font-size:14px">bahan</small></span>
            <span class="sub row wrap" style="gap:6px">${d.risk.tinggi ? html`<span class="badge high">${d.risk.tinggi} tinggi</span>` : ''}${d.risk.sedang ? html`<span class="badge mid">${d.risk.sedang} sedang</span>` : ''}${d.risk.rendah ? html`<span class="badge low">${d.risk.rendah} rendah</span>` : ''}${!riskTotal ? 'Tidak ada stok berlebih' : ''}</span>
          </a>
          <a class="card kpi" href="#/evaluasi" style="text-decoration:none;color:inherit">
            <span class="label"><span class="ico">${icon('target')}</span>Akurasi forecast</span>
            <span class="value">${pct(d.accuracy)}</span>
            <span class="sub">14 hari terakhir · ${d.counts.history_days} hari data latih</span>
          </a>
        </div>

        <div class="grid grid-3">
          <div class="card span-2">
            <div class="card-head"><div><h2>Penjualan & forecast</h2><p>14 hari terakhir dan perkiraan 7 hari ke depan (total porsi)</p></div><a class="btn btn-ghost btn-sm" href="#/forecast">Detail</a></div>
            <div id="chart"></div>
            <div class="legend" style="margin-top:8px"><span><i style="background:#0d9488"></i>Aktual</span><span style="color:#f59e0b"><i class="dash" style="color:#f59e0b"></i>Forecast</span></div>
          </div>
          <div class="card">
            <div class="card-head"><div><h2>Bahan terbuang</h2><p>Nilai bahan yang kedaluwarsa / rusak</p></div></div>
            <div class="stack-sm">
              <span class="kpi"><span class="value">${rupiah(d.waste.last30)}</span><span class="sub">30 hari terakhir</span></span>
              ${wasteDelta != null
                ? html`<span class="badge ${wasteDelta <= 0 ? 'ok' : 'high'}" style="align-self:flex-start">${icon(wasteDelta <= 0 ? 'trendDown' : 'trend', '')} ${wasteDelta <= 0 ? 'Turun' : 'Naik'} ${pct(Math.abs(wasteDelta))} dari 30 hari sebelumnya</span>`
                : ''}
              <div class="divider"></div>
              <p class="small muted">Sebelumnya ${rupiah(d.waste.prev30)}. Waste dihitung otomatis dari batch stok yang lewat tanggal kedaluwarsa ditambah catatan bahan terbuang.</p>
              <a class="btn btn-secondary btn-sm" href="#/riwayat?type=waste" style="align-self:flex-start">Lihat rincian</a>
            </div>
          </div>
        </div>

        <div class="grid grid-2">
          <div class="card">
            <div class="card-head"><div><h2>Risiko bahan terbuang</h2><p>Waste Risk Score dari stok saat ini + rencana beli</p></div><a class="btn btn-ghost btn-sm" href="#/rekomendasi?filter=risiko">Semua</a></div>
            ${d.risk.items.length
              ? html`<div class="list">${d.risk.items.map(
                  (r) => html`<div class="list-item">
                    <div class="avatar" style="background:var(--${r.risk.level === 'tinggi' ? 'high' : r.risk.level === 'sedang' ? 'mid' : 'low'}-bg);color:var(--${r.risk.level === 'tinggi' ? 'high' : r.risk.level === 'sedang' ? 'mid' : 'low'})">${icon('flame')}</div>
                    <div class="grow"><div class="title">${r.name}</div><div class="meta">Potensi terbuang ${qty(r.risk.waste_qty, r.unit)} · ${rupiah(r.risk.waste_value)}</div></div>
                    ${riskBadge(r.risk.level)}
                  </div>`
                )}</div>`
              : emptyState('shield', 'Tidak ada stok berlebih', 'Semua bahan diperkirakan terpakai sebelum kedaluwarsa.')}
          </div>
          <div class="card">
            <div class="card-head"><div><h2>Prioritas belanja</h2><p>Kebutuhan dikurangi stok tersedia</p></div><a class="btn btn-ghost btn-sm" href="#/rekomendasi">Semua</a></div>
            ${d.buy.top.length
              ? html`<div class="list">${d.buy.top.map(
                  (r) => html`<div class="list-item">
                    <div class="avatar">${icon('cart')}</div>
                    <div class="grow"><div class="title">${r.name}</div><div class="meta">${r.period_label} · stok ${qty(r.stock_now, r.unit)}</div></div>
                    <div class="right"><b class="num">${qty(r.buy, r.unit)}</b><div class="meta">${rupiahShort(r.buy_cost)}</div></div>
                  </div>`
                )}</div>`
              : emptyState('check', 'Stok mencukupi', 'Belum ada bahan yang perlu dibeli untuk periode berikutnya.')}
          </div>
        </div>

        <div class="grid grid-3">
          <div class="card span-2">
            <div class="card-head"><div><h2>Porsi yang masih bisa dibuat</h2><p>Dihitung dari stok saat ini dan komposisi tiap menu</p></div></div>
            <div class="portions">
              ${d.portions.map(
                (p) => html`<div class="portion" title="${p.limiting ? `Dibatasi oleh ${p.limiting}` : ''}">
                  <b style="color:${p.portions === 0 ? 'var(--high)' : p.portions < 20 ? 'var(--mid)' : 'inherit'}">${p.portions == null ? '–' : number(p.portions, 0)}</b>
                  <span>${p.name}</span><small>${p.limiting ? `Pembatas: ${p.limiting}` : 'Resep belum diisi'}</small>
                </div>`
              )}
            </div>
          </div>
          <div class="card">
            <div class="card-head"><div><h2>Event mendatang</h2><p>Dipakai dalam forecast</p></div><a class="btn btn-ghost btn-sm" href="#/event">Kelola</a></div>
            ${d.events.length
              ? html`<div class="list">${d.events.map(
                  (e) => html`<div class="list-item">
                    <div class="event-date"><b>${dayNum(e.date)}</b><small>${monthShort(e.date)}</small></div>
                    <div class="grow"><div class="title">${e.name}</div><div class="meta">${dayName(e.date)}, ${dateShort(e.date)}</div></div>
                    <span class="badge ${e.multiplier >= 1 ? 'brand' : 'mid'}">${signedPct(e.multiplier)}</span>
                  </div>`
                )}</div>`
              : emptyState('calendar', 'Belum ada event', 'Tambahkan hari khusus usahamu.')}
          </div>
        </div>

        ${d.low_stock.length
          ? html`<div class="card">
              <div class="card-head"><div><h2>Stok menipis</h2><p>Di bawah stok minimum atau cukup kurang dari sehari</p></div><a class="btn btn-ghost btn-sm" href="#/bahan">Stok</a></div>
              <div class="list">${d.low_stock.map(
                (r) => html`<div class="list-item"><div class="avatar" style="background:var(--mid-bg);color:var(--mid)">${icon('alert')}</div>
                  <div class="grow"><div class="title">${r.name}</div><div class="meta">Sisa ${qty(r.stock_now, r.unit)}${r.days_cover != null ? ` · cukup ±${number(r.days_cover)} hari` : ''}</div></div>
                  <a class="btn btn-secondary btn-sm" href="#/stok-masuk?bahan=${r.id}">Catat beli</a></div>`
              )}</div></div>`
          : ''}
      </div>`;

    const chartEl = el.querySelector('#chart');
    return responsive(chartEl, () =>
      lineChart(chartEl, {
        labels: d.chart.labels,
        series: [
          { name: 'Aktual', values: d.chart.actual, color: '#0d9488', area: true },
          { name: 'Forecast', values: d.chart.forecast, color: '#f59e0b', dashed: true },
        ],
        xLabel: (l) => dateShort(l),
        yFormat: (v) => number(v, 0),
      })
    );
  },
};
