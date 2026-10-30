import { api } from '../api.js';
import { html, icon, loading, toast, rupiahShort, number, qty, pct, dateShort, dateTime, signedPct, lineChart, barChart, responsive, emptyState } from '../ui.js';

// Tahap 7: Evaluasi akurasi forecast, tren waste, dan latih ulang model
export default {
  title: 'Evaluasi Akurasi',
  async render(el) {
    let cleanups = [];
    const load = async () => {
      cleanups.forEach((f) => f());
      cleanups = [];
      el.innerHTML = loading(3);
      const d = await api('/evaluation');
      if (!d.chart.dates.length) {
        el.innerHTML = html`<div class="card">${emptyState('target', 'Belum bisa dievaluasi', 'Evaluasi muncul setelah ada riwayat penjualan minimal beberapa minggu.')}</div>`;
        return;
      }
      const first = d.waste_weeks.slice(0, 4).reduce((s, w) => s + w.value, 0);
      const last = d.waste_weeks.slice(-4).reduce((s, w) => s + w.value, 0);
      const reduction = first > 0 ? 1 - last / first : null;
      el.innerHTML = html`<div class="stack">
        <div class="grid grid-4">
          <div class="card kpi"><span class="label"><span class="ico">${icon('target')}</span>Akurasi 14 hari</span><span class="value">${pct(d.accuracy)}</span>
            <span class="sub">${d.accuracy_prev != null ? html`${Math.round(d.accuracy * 100) === Math.round(d.accuracy_prev * 100) ? 'Stabil' : d.accuracy > d.accuracy_prev ? '▲ naik' : '▼ turun'} dari ${pct(d.accuracy_prev)} periode sebelumnya` : '1 − WAPE'}</span></div>
          <div class="card kpi"><span class="label"><span class="ico" style="background:var(--ok-bg);color:var(--ok)">${icon('trendDown')}</span>Pengurangan waste</span><span class="value">${reduction == null ? '–' : pct(reduction)}</span><span class="sub">4 minggu terakhir vs 4 minggu pertama</span></div>
          <div class="card kpi"><span class="label"><span class="ico">${icon('history')}</span>Data latih</span><span class="value">${number(d.model.history_days, 0)} <small class="muted" style="font-size:14px">hari</small></span><span class="sub">${number(d.model.samples, 0)} titik data menu-harian</span></div>
          <div class="card kpi"><span class="label"><span class="ico">${icon('sparkles')}</span>Model</span><span class="value" style="font-size:20px">α = ${d.model.alpha}</span><span class="sub">Dilatih ${dateTime(d.model.trained_at)}</span></div>
        </div>

        <div class="card">
          <div class="card-head wrap"><div><h2>Penjualan aktual vs forecast</h2><p>Prediksi one-step-ahead 28 hari terakhir (total porsi semua menu)</p></div>
            <button class="btn btn-secondary" id="train">${icon('refresh')}Latih ulang model</button></div>
          <div id="acc-chart"></div>
          <div class="legend" style="margin-top:8px"><span><i style="background:#0d9488"></i>Aktual</span><span style="color:#f59e0b"><i class="dash"></i>Forecast</span></div>
        </div>

        <div class="grid grid-2">
          <div class="card pad-0">
            <div class="card-head"><div><h2>Akurasi per menu</h2><p>14 hari terakhir</p></div></div>
            <div class="table-wrap" style="margin-top:12px"><table class="table"><thead><tr><th>Menu</th><th class="num">Aktual</th><th class="num">Forecast</th><th class="num">Akurasi</th></tr></thead><tbody>
              ${d.products.map(
                (p) => html`<tr><td><b>${p.name}</b>${p.bias != null ? html`<div class="xs muted">${p.bias > 0 ? 'cenderung lebih' : 'cenderung kurang'} ${pct(Math.abs(p.bias))}</div>` : ''}</td>
                  <td class="num">${number(p.actual, 0)}</td><td class="num">${number(p.forecast, 0)}</td>
                  <td class="num"><span class="badge ${p.accuracy >= 0.85 ? 'ok' : p.accuracy >= 0.7 ? 'mid' : 'high'}">${pct(p.accuracy)}</span></td></tr>`
              )}</tbody></table></div>
          </div>
          <div class="card">
            <div class="card-head"><div><h2>Nilai bahan terbuang per minggu</h2><p>12 minggu terakhir</p></div></div>
            <div id="waste-chart"></div>
            <h3 style="margin:16px 0 10px">Paling banyak terbuang (30 hari)</h3>
            ${d.waste_by_ingredient.length
              ? html`<div class="bars">${d.waste_by_ingredient.slice(0, 5).map(
                  (w) => html`<div class="bar-row"><span class="name">${w.name}</span><div class="track"><i style="width:${(w.value / d.waste_by_ingredient[0].value) * 100}%;background:var(--high)"></i></div><span class="num small nowrap">${qty(w.qty, w.unit)} · ${rupiahShort(w.value)}</span></div>`
                )}</div>`
              : html`<p class="small muted">Tidak ada bahan terbuang dalam 30 hari terakhir.</p>`}
          </div>
        </div>

        <div class="card">
          <div class="card-head"><div><h2>Cara kerja model</h2><p>${d.model.method}</p></div></div>
          <div class="grid grid-3" style="gap:12px">
            <div class="stack-sm"><b class="small">1. Level penjualan</b><p class="small muted">Rata-rata bergerak eksponensial per menu. Parameter α dipilih otomatis dari ${['0,05', '0,1', '0,2', '0,3', '0,5'].join(' / ')} dengan error terkecil saat latih ulang.</p></div>
            <div class="stack-sm"><b class="small">2. Pola mingguan</b><p class="small muted">Faktor pengali tiap hari (Senin–Minggu) dari 8 minggu terakhir, tanpa hari event agar tidak bias.</p></div>
            <div class="stack-sm"><b class="small">3. Event tagging</b><p class="small muted">${d.learned_events.length ? html`Dampak yang dipelajari: ${d.learned_events.map((e, i) => html`${i ? ', ' : ''}${e.name} ${signedPct(e.factor)} (${e.occurrences}×)`)}.` : 'Belum ada event dalam riwayat; dipakai dampak default.'}</p></div>
          </div>
        </div>
      </div>`;

      const ac = el.querySelector('#acc-chart');
      cleanups.push(
        responsive(ac, () =>
          lineChart(ac, {
            labels: d.chart.dates,
            series: [
              { name: 'Aktual', values: d.chart.actual, color: '#0d9488', area: true },
              { name: 'Forecast', values: d.chart.predicted, color: '#f59e0b', dashed: true },
            ],
            xLabel: (l) => dateShort(l),
          })
        )
      );
      const wc = el.querySelector('#waste-chart');
      cleanups.push(
        responsive(wc, () =>
          barChart(wc, {
            labels: d.waste_weeks.map((w) => w.start),
            values: d.waste_weeks.map((w) => w.value),
            color: '#f87171',
            xLabel: (l) => dateShort(l),
            yFormat: (v) => rupiahShort(v).replace('Rp', ''),
            height: 180,
          })
        )
      );
      el.querySelector('#train').onclick = async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = 'Melatih…';
        try {
          const r = await api('/model/train', { method: 'POST' });
          toast(`Model dilatih ulang · α ${r.alpha} · error ${pct(r.wape, 1)}`);
          load();
        } catch (err) {
          toast(err.message, 'error');
          btn.disabled = false;
        }
      };
    };
    await load();
    return () => cleanups.forEach((f) => f());
  },
};

