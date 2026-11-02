import { api } from '../api.js';
import { html, icon, loading, toast, number, qty, dateShort, dateMed, categoryBadge, emptyState } from '../ui.js';

// UC-05 Lihat forecast kebutuhan (menjalankan UC-08 Hitung forecast)
export default {
  title: 'Forecast Kebutuhan',
  async render(el, ctx) {
    let days = 7;
    let data = null;
    let loadError = null;
    const isPro = ctx.user?.role === 'pro';

    const load = async () => {
      el.innerHTML = loading(3);
      loadError = null;
      try {
        data = await api(`/forecast?days=${days}&view=bahan`);
        draw();
      } catch (err) {
        loadError = err;
        drawError();
      }
    };

    const drawError = () => {
      const errMsg = loadError?.message || 'Gagal memuat peramalan kebutuhan.';
      el.innerHTML = html`<div class="stack" style="max-width:860px">
        <div class="card">
          ${emptyState(
            'alert',
            'Riwayat Belum Cukup',
            errMsg,
            html`<a class="btn" href="#/import">${icon('upload')}Impor Riwayat Penjualan</a>`
          )}
        </div>
      </div>`;
    };

    const draw = () => {
      if (!data || !data.ingredients || !data.ingredients.length) {
        el.innerHTML = html`<div class="card">
          ${emptyState(
            'chart',
            'Belum ada data kebutuhan bahan',
            'Tambahkan menu dan resep, lalu catat riwayat penjualan minimal 14 hari agar model forecast dapat memprediksi kebutuhan.',
            html`<a class="btn" href="#/import">${icon('upload')}Impor riwayat penjualan</a>`
          )}
        </div>`;
        return;
      }

      el.innerHTML = html`<div class="stack">
        <div class="row-between wrap">
          <div>
            <h2>Peramalan Kebutuhan Bahan Baku</h2>
            <p class="small muted">
              Periode ${dateMed(data.period_start)} – ${dateMed(data.period_end)} (${data.days_count} hari)
            </p>
          </div>
          <div class="tabs" style="flex:0 1 auto">
            ${[7, 14, 30].map(
              (n) => html`<button class="tab ${days === n ? 'active' : ''}" data-days="${n}" style="display:inline-flex;align-items:center;gap:6px">
                <span>${n} hari</span>
                ${n > 7 && !isPro
                  ? html`<span class="tab-lock" style="display:inline-flex;align-items:center;background:rgba(217,119,6,0.12);color:#b45309;padding:1px 6px;border-radius:6px;font-size:11px;font-weight:700;gap:3px">
                      <svg style="width:11px;height:11px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
                      PRO
                    </span>`
                  : ''}
              </button>`
            )}
          </div>
        </div>

        ${data.events && data.events.length
          ? html`<div class="callout warn">
              ${icon('calendar')}
              <div>
                <b>Ada hari khusus / event dalam periode ini:</b>
                ${data.events.map((e, idx) => html`${idx > 0 ? ', ' : ''}${e.name} (${dateShort(e.date)})`)}.
                Forecast sudah otomatis memperhitungkan faktor pengali.
              </div>
            </div>`
          : ''}

        <div class="card pad-0">
          <div class="card-head">
            <div>
              <h2>Estimasi Kebutuhan Stok</h2>
              <p>Nilai peramalan disajikan dalam rentang nilai minimal sampai maksimal berdasarkan tingkat ketidakpastian model.</p>
            </div>
          </div>
          <div class="table-wrap" style="margin-top:12px">
            <table class="table" id="forecast-table">
              <thead>
                <tr>
                  <th>Bahan Baku</th>
                  <th>Kategori</th>
                  <th class="num">Estimasi Total</th>
                  <th class="num">Rentang Kebutuhan (Min – Max)</th>
                </tr>
              </thead>
              <tbody>
                ${data.ingredients.map(
                  (i) => html`<tr>
                    <td><b>${i.name}</b></td>
                    <td>${categoryBadge(i.category)}</td>
                    <td class="num nowrap">
                      <b style="font-size:15px">${number(i.total_need, 2)}</b> ${i.unit}
                    </td>
                    <td class="num nowrap">
                      <span class="badge ${i.category === 'segar' ? 'low' : 'info'}">
                        ${number(i.need_lo, 2)} – ${number(i.need_hi, 2)} ${i.unit}
                      </span>
                    </td>
                  </tr>`
                )}
              </tbody>
            </table>
          </div>
          <div style="padding:14px 18px">
            <a class="btn" href="#/rekomendasi">${icon('cart')}Lihat Rekomendasi Belanja</a>
          </div>
        </div>
      </div>`;

      el.querySelectorAll('[data-days]').forEach((b) => {
        b.onclick = () => {
          const n = Number(b.dataset.days);
          if (n > 7 && !isPro) {
            return toast('Peramalan 14 dan 30 hari hanya tersedia pada paket Pro.', 'error');
          }
          days = n;
          load();
        };
      });
    };

    await load();
  },
};
