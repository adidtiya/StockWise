import { api } from '../api.js';
import { html, icon, loading, toast, number, pct, emptyState } from '../ui.js';

const formatDateTime = (s) => {
  if (!s) return 'Belum dilatih';
  try {
    const d = new Date(s);
    if (isNaN(d.getTime())) return String(s);
    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Jakarta',
    }).format(d);
  } catch {
    return String(s);
  }
};

// Tahap 7: Evaluasi akurasi forecast dan latih ulang model (UC-08)
export default {
  title: 'Evaluasi Akurasi',
  async render(el) {
    const load = async () => {
      el.innerHTML = loading(3);
      try {
        const d = await api('/evaluation');
        draw(d);
      } catch (err) {
        el.innerHTML = html`<div class="stack" style="max-width:860px">
          <div class="card">
            ${emptyState(
              'target',
              'Belum Bisa Dievaluasi',
              err.message || 'Evaluasi akurasi dan pelatihan model membutuhkan minimal 14 hari riwayat penjualan.',
              html`<a class="btn" href="#/import">${icon('upload')}Impor Riwayat Penjualan</a>`
            )}
          </div>
        </div>`;
      }
    };

    const draw = (d) => {
      const model = d.model || {};
      const products = d.products || [];
      const accuracyStr = d.accuracy != null ? `${number(d.accuracy, 1)}%` : '–';
      const prevAccuracyStr = d.accuracy_prev != null ? `${number(d.accuracy_prev, 1)}%` : null;
      const wapeStr = model.wape != null ? `${number(model.wape * 100, 1)}%` : '–';

      el.innerHTML = html`<div class="stack">
        <div class="grid grid-4">
          <div class="card kpi">
            <span class="label"><span class="ico">${icon('target')}</span>Akurasi Model</span>
            <span class="value" id="eval-acc">${accuracyStr}</span>
            <span class="sub" id="eval-prev">
              ${prevAccuracyStr ? `Sebelumnya: ${prevAccuracyStr}` : 'Formula: 1 − WAPE'}
            </span>
          </div>
          <div class="card kpi">
            <span class="label"><span class="ico">${icon('sparkles')}</span>Error WAPE</span>
            <span class="value" id="eval-wape">${wapeStr}</span>
            <span class="sub">Weighted Absolute % Error</span>
          </div>
          <div class="card kpi">
            <span class="label"><span class="ico">${icon('history')}</span>Data Latih</span>
            <span class="value">${number(model.history_days || 0, 0)} <small class="muted" style="font-size:14px">hari</small></span>
            <span class="sub">${number(model.samples || 0, 0)} titik data transaksi</span>
          </div>
          <div class="card kpi">
            <span class="label"><span class="ico">${icon('refresh')}</span>Waktu Pelatihan</span>
            <span class="value" id="eval-trained" style="font-size:16px;font-weight:700">
              ${formatDateTime(model.trained_at)}
            </span>
            <span class="sub">Parameter α = ${model.alpha ?? 0.2}</span>
          </div>
        </div>

        <div class="card">
          <div class="card-head wrap">
            <div>
              <h2>Pelatihan Model Peramalan</h2>
              <p>Model Exponential Smoothing memilih α terbaik dari kandidat [0.05, 0.1, 0.2, 0.3, 0.5] dengan WAPE terendah.</p>
            </div>
            <button class="btn btn-secondary" id="train-btn" type="button">
              ${icon('refresh')}Latih Ulang Model
            </button>
          </div>
        </div>

        <div class="card pad-0">
          <div class="card-head">
            <div>
              <h2>Akurasi per Menu Produk</h2>
              <p>Evaluasi one-step-ahead pada riwayat penjualan aktif</p>
            </div>
          </div>
          <div class="table-wrap" style="margin-top:12px">
            <table class="table" id="eval-table">
              <thead>
                <tr>
                  <th>Menu Produk</th>
                  <th class="num">Akurasi</th>
                  <th>Kecenderungan Bias</th>
                </tr>
              </thead>
              <tbody>
                ${products.length
                  ? products.map(
                      (p) => html`<tr>
                        <td><b>${p.product_name}</b></td>
                        <td class="num">
                          <span class="badge ${p.accuracy != null && p.accuracy >= 80 ? 'ok' : p.accuracy != null && p.accuracy >= 60 ? 'mid' : 'high'}">
                            ${p.accuracy != null ? `${number(p.accuracy, 1)}%` : '–'}
                          </span>
                        </td>
                        <td>
                          ${p.bias === 'over'
                            ? html`<span class="badge mid">Cenderung over-estimate</span>`
                            : p.bias === 'under'
                              ? html`<span class="badge high">Cenderung under-estimate</span>`
                              : html`<span class="badge ok">Netral</span>`}
                        </td>
                      </tr>`
                    )
                  : html`<tr><td colspan="3" class="muted center">Belum ada evaluasi per menu.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;

      const trainBtn = el.querySelector('#train-btn');
      if (trainBtn) {
        trainBtn.onclick = async () => {
          trainBtn.disabled = true;
          trainBtn.textContent = 'Melatih...';
          try {
            const res = await api('/evaluation/train', { method: 'POST' });
            toast(`Model berhasil dilatih ulang. α: ${res.optimal_alpha ?? res.alpha ?? 0.2}, WAPE: ${res.wape != null ? (res.wape * 100).toFixed(1) + '%' : '–'}`);
            await load();
          } catch (err) {
            toast(err.message, 'error');
            trainBtn.disabled = false;
            trainBtn.innerHTML = `${icon('refresh')}Latih Ulang Model`;
          }
        };
      }
    };

    await load();
  },
};
