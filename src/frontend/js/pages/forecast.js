import { api } from '../api.js';
import { html, icon, loading, toast, number, qty, pct, dateShort, dateMed, dayName, signedPct, categoryBadge, lineChart, responsive, emptyState } from '../ui.js';

const DAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

// UC-05 Lihat forecast kebutuhan (menjalankan UC-08 Hitung forecast)
export default {
  title: 'Forecast Kebutuhan',
  async render(el, ctx, params) {
    let days = 7;
    let view = params.view === 'bahan' ? 'bahan' : 'menu';
    let selected = null;
    let d;
    let cleanups = [];
    const isPro = ctx.user.role === 'pro';

    const load = async () => {
      el.innerHTML = loading(3);
      d = await api(`/forecast?days=${days}`);
      selected ??= d.products[0]?.id;
      draw();
    };

    const draw = () => {
      cleanups.forEach((f) => f());
      cleanups = [];
      if (!d.products.length) {
        el.innerHTML = html`<div class="card">${emptyState('chart', 'Belum ada data untuk forecast', 'Tambahkan menu dan catat penjualan beberapa minggu agar pola bisa dipelajari.', html`<a class="btn" href="#/import">Import riwayat penjualan</a>`)}</div>`;
        return;
      }
      const p = d.products.find((x) => x.id === selected) || d.products[0];
      el.innerHTML = html`<div class="stack">
        <div class="row-between wrap">
          <div class="tabs" style="flex:0 1 auto">
            <button class="tab ${view === 'menu' ? 'active' : ''}" data-view="menu">Per menu</button>
            <button class="tab ${view === 'bahan' ? 'active' : ''}" data-view="bahan">Kebutuhan bahan</button>
          </div>
          <div class="tabs" style="flex:0 1 auto">${[7, 14, 30].map(
            (n) => html`<button class="tab ${days === n ? 'active' : ''}" data-days="${n}">${n} hari${n > 7 && !isPro ? html`<span class="lock">🔒</span>` : ''}</button>`
          )}</div>
        </div>

        ${d.events.length
          ? html`<div class="callout warn">${icon('calendar')}<div><b>Ada hari khusus dalam periode ini:</b> ${d.events.map((e, i) => html`${i ? ', ' : ''}${e.name} (${dateShort(e.date)}, ${signedPct(e.multiplier)})`)}. Forecast sudah menyesuaikan.</div></div>`
          : ''}

        <div class="card">
          <div class="card-head"><div><h2>Total porsi ${days} hari ke depan</h2><p>Gabungan semua menu · ${dateShort(d.dates[0])} – ${dateShort(d.dates.at(-1))}</p></div>
            <b class="num" style="font-size:22px">${number(d.totals.reduce((s, x) => s + x, 0), 0)}</b></div>
          <div id="total-chart"></div>
        </div>

        ${view === 'menu' ? menuView(p) : bahanView()}

        <div class="card">
          <div class="card-head"><div><h2>Pola hari dalam seminggu</h2><p>Faktor pengali terhadap rata-rata penjualan (1,00 = normal)</p></div></div>
          <div class="grid" style="grid-template-columns:repeat(7,1fr);gap:8px">
            ${d.weekday.map(
              (w) => html`<div class="portion center" style="padding:10px 4px"><small>${DAYS[w.dow]}</small><b style="font-size:17px;color:${w.factor >= 1.1 ? 'var(--brand)' : w.factor <= 0.9 ? 'var(--mid)' : 'inherit'}">${number(w.factor, 2)}</b></div>`
            )}
          </div>
        </div>
      </div>`;

      el.querySelectorAll('[data-view]').forEach((b) => (b.onclick = () => ((view = b.dataset.view), draw())));
      el.querySelectorAll('[data-days]').forEach(
        (b) =>
          (b.onclick = () => {
            const n = +b.dataset.days;
            if (n > 7 && !isPro) return toast('Forecast 14 & 30 hari tersedia di paket Pro.', 'error');
            days = n;
            load();
          })
      );
      el.querySelectorAll('[data-prod]').forEach((b) => (b.onclick = () => ((selected = +b.dataset.prod), draw())));

      const totalEl = el.querySelector('#total-chart');
      cleanups.push(
        responsive(totalEl, () =>
          lineChart(totalEl, {
            labels: d.dates,
            series: [{ name: 'Forecast', values: d.totals, color: '#0d9488', area: true }],
            xLabel: (l) => (days <= 14 ? `${dayName(l)} ${dateShort(l).split(' ')[0]}` : dateShort(l)),
            height: 180,
          })
        )
      );
      const pe = el.querySelector('#prod-chart');
      if (pe) {
        const labels = [...p.history.map((h) => h.date), ...p.daily.map((x) => x.date)];
        const nH = p.history.length;
        cleanups.push(
          responsive(pe, () =>
            lineChart(pe, {
              labels,
              series: [
                { name: 'Aktual', values: [...p.history.map((h) => h.actual), ...p.daily.map(() => null)], color: '#0d9488' },
                { name: 'Prediksi historis', values: [...p.history.map((h) => h.pred), ...p.daily.map(() => null)], color: '#94a3b8', dashed: true },
                { name: 'Forecast', values: [...p.history.map((_, i) => (i === nH - 1 ? p.history[i].actual : null)), ...p.daily.map((x) => x.pred)], color: '#f59e0b' },
              ],
              band: { lo: [...p.history.map(() => null), ...p.daily.map((x) => x.lo)], hi: [...p.history.map(() => null), ...p.daily.map((x) => x.hi)], color: '#f59e0b' },
              xLabel: (l) => dateShort(l),
              tooltip: (i) => {
                const l = labels[i];
                if (i < nH) {
                  const h = p.history[i];
                  return `<b>${dateMed(l)}</b><br>Aktual: <b>${h.actual ?? '–'}</b><br>Prediksi: ${h.pred ?? '–'}`;
                }
                const x = p.daily[i - nH];
                return `<b>${dateMed(l)}</b><br>Forecast: <b>${number(x.pred, 0)} porsi</b><br>Rentang ${number(x.lo, 0)}–${number(x.hi, 0)}`;
              },
            })
          )
        );
      }
    };

    const menuView = (p) => html`<div class="grid grid-3">
      <div class="card">
        <div class="card-head"><div><h2>Menu</h2><p>Total ${days} hari ke depan</p></div></div>
        <div class="list">${d.products.map(
          (x) => html`<button class="list-item clickable" data-prod="${x.id}" style="border-left:0;border-right:0;border-top:0;background:${x.id === p.id ? 'var(--brand-50)' : 'transparent'};text-align:left;width:calc(100% + 16px);font:inherit;cursor:pointer">
            <div class="grow"><div class="title">${x.name}</div><div class="meta">${number(x.lo, 0)}–${number(x.hi, 0)} porsi</div></div><b class="num">${number(x.total, 0)}</b></button>`
        )}</div>
      </div>
      <div class="card span-2">
        <div class="card-head"><div><h2>${p.name}</h2><p>21 hari aktual, lalu forecast ${days} hari dengan rentang ketidakpastian ±${pct(p.sigma)}</p></div></div>
        <div id="prod-chart"></div>
        <div class="legend" style="margin-top:8px"><span><i style="background:#0d9488"></i>Aktual</span><span style="color:#94a3b8"><i class="dash"></i>Prediksi historis</span><span><i style="background:#f59e0b"></i>Forecast</span><span><i class="band" style="background:#f59e0b"></i>Rentang</span></div>
        <div class="table-wrap" style="margin-top:14px"><table class="table"><thead><tr><th>Tanggal</th><th class="num">Forecast</th><th class="num">Rentang</th></tr></thead><tbody>
          ${p.daily.slice(0, 14).map((x) => html`<tr><td>${dateMed(x.date)}</td><td class="num"><b>${number(x.pred, 0)}</b> porsi</td><td class="num muted">${number(x.lo, 0)} – ${number(x.hi, 0)}</td></tr>`)}
        </tbody></table></div>
      </div>
    </div>`;

    const bahanView = () => html`<div class="card pad-0">
      <div class="card-head"><div><h2>Kebutuhan bahan baku</h2><p>Forecast menu × komposisi resep. Bahan segar direkomendasikan per hari, bahan tahan lama per minggu/bulan.</p></div></div>
      <div class="table-wrap" style="margin-top:12px"><table class="table">
        <thead><tr><th>Bahan</th><th>Kategori</th><th class="num">Besok</th><th class="num">${days} hari</th><th>Periode beli</th></tr></thead>
        <tbody>${d.ingredients.map(
          (i) => html`<tr><td><b>${i.name}</b></td><td>${categoryBadge(i.category)}</td>
            <td class="num nowrap"><b>${qty(i.tomorrow.need, i.unit)}</b><div class="xs muted">${number(i.tomorrow.lo)}–${number(i.tomorrow.hi)}</div></td>
            <td class="num nowrap"><b>${qty(i.need, i.unit)}</b><div class="xs muted">${number(i.lo)}–${number(i.hi)}</div></td>
            <td><span class="badge">${i.horizon === 1 ? 'Harian' : i.horizon === 7 ? 'Mingguan' : 'Bulanan'}</span></td></tr>`
        )}</tbody></table></div>
      <div style="padding:14px 18px"><a class="btn" href="#/rekomendasi">${icon('cart')}Lihat rekomendasi belanja</a></div>
    </div>`;

    await load();
    return () => cleanups.forEach((f) => f());
  },
};
