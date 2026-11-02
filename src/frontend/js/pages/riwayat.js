import { api } from '../api.js';
import { html, icon, loading, confirmDialog, toast, rupiah, number, qty, dateMed, emptyState, todayStr, addDays, SOURCES } from '../ui.js';

// UC-10 Riwayat transaksi (penjualan, stok masuk, bahan terbuang)
export default {
  title: 'Riwayat Transaksi',
  async render(el, ctx, params = {}) {
    const T = todayStr();
    const state = {
      type: ['sales', 'stock', 'waste'].includes(params.type) ? params.type : 'sales',
      from: addDays(T, -30),
      to: T,
      source: 'all',
    };

    const load = async () => {
      const bodyEl = el.querySelector('#body');
      if (bodyEl) bodyEl.innerHTML = loading(1);

      const q = new URLSearchParams({
        type: state.type,
        from: state.from,
        to: state.to,
      });
      if (state.type === 'sales' && state.source && state.source !== 'all') {
        q.set('source', state.source);
      }

      try {
        const d = await api(`/sales/history?${q}`);
        if (bodyEl) bodyEl.innerHTML = body(d);

        el.querySelectorAll('[data-del]').forEach((b) => {
          b.onclick = async () => {
            const saleId = b.dataset.del;
            if (
              !(await confirmDialog({
                title: 'Hapus transaksi ini?',
                message: 'Stok bahan dan data latih forecast ikut menyesuaikan.',
                confirm: 'Hapus',
                danger: true,
              }))
            )
              return;

            try {
              await api(`/sales/${saleId}`, { method: 'DELETE' });
              toast('Transaksi berhasil dihapus');
              load();
            } catch (err) {
              toast(err.message, 'error');
            }
          };
        });
      } catch (err) {
        if (bodyEl) bodyEl.innerHTML = html`<div class="card">${emptyState('alert', 'Gagal memuat riwayat', err.message)}</div>`;
      }
    };

    const groupByDate = (rows) => {
      const m = new Map();
      for (const r of rows) {
        if (!m.has(r.date)) m.set(r.date, []);
        m.get(r.date).push(r);
      }
      return [...m.entries()];
    };

    const body = (d) => {
      const rows = d?.rows || [];
      const events = d?.events || {};

      if (!rows.length) {
        return html`<div class="card">${emptyState('history', 'Belum ada transaksi', 'Tidak ada data pada rentang tanggal ini.')}</div>`;
      }

      if (d.type === 'sales') {
        const total = rows.reduce((s, r) => s + (Number(r.qty) || 0), 0);
        const rev = rows.reduce((s, r) => s + (Number(r.revenue) || 0), 0);

        return html`<div class="stack">
          <div class="row wrap small">
            <span class="badge brand">${number(total, 0)} porsi</span>
            <span class="badge brand">${rupiah(rev)}</span>
            <span class="badge">${rows.length} transaksi</span>
          </div>
          ${groupByDate(rows).map(
            ([date, dateRows]) => html`<div class="card pad-0">
              <div class="row-between" style="padding:12px 16px;background:var(--surface-2)">
                <div class="row wrap">
                  <b>${dateMed(date)}</b>
                  ${(events[date] || []).map((n) => html`<span class="badge mid">${icon('calendar')}${n}</span>`)}
                </div>
                <span class="small muted num">
                  ${number(dateRows.reduce((s, r) => s + (Number(r.qty) || 0), 0), 0)} porsi · ${rupiah(dateRows.reduce((s, r) => s + (Number(r.revenue) || 0), 0))}
                </span>
              </div>
              <div class="table-wrap">
                <table class="table">
                  <tbody>
                    ${dateRows.map(
                      (r) => html`<tr>
                        <td><b>${r.product || r.product_name}</b></td>
                        <td><span class="badge">${SOURCES[r.source] || r.source}</span></td>
                        <td class="num">${number(r.qty, 0)} porsi</td>
                        <td class="num">${rupiah(r.revenue)}</td>
                        <td class="right" style="width:48px">
                          <button class="icon-btn plain" data-del="${r.id}" aria-label="Hapus">${icon('trash')}</button>
                        </td>
                      </tr>`
                    )}
                  </tbody>
                </table>
              </div>
            </div>`
          )}
        </div>`;
      }

      if (d.type === 'stock') {
        return html`<div class="card pad-0"><div class="table-wrap"><table class="table">
          <thead><tr><th>Tanggal masuk</th><th>Bahan</th><th class="num">Jumlah</th><th class="num">Harga/satuan</th><th>Kedaluwarsa</th><th>Sumber</th></tr></thead>
          <tbody>${rows.map(
            (r) => html`<tr><td class="nowrap">${dateMed(r.date)}</td><td><b>${r.ingredient}</b></td><td class="num nowrap">${qty(r.qty, r.unit)}</td><td class="num">${rupiah(r.unit_price)}</td><td class="nowrap">${dateMed(r.expiry_date)}</td><td><span class="badge">${SOURCES[r.source] || r.source}</span></td></tr>`
          )}</tbody></table></div></div>`;
      }

      const total = rows.reduce((s, r) => s + (Number(r.value) || 0), 0);
      return html`<div class="stack">
        <div class="row wrap small"><span class="badge high">Total ${rupiah(total)}</span><span class="badge">${rows.length} catatan</span></div>
        <div class="card pad-0"><div class="table-wrap"><table class="table">
          <thead><tr><th>Tanggal</th><th>Bahan</th><th class="num">Jumlah</th><th class="num">Nilai</th><th>Penyebab</th></tr></thead>
          <tbody>${rows.map(
            (r) => html`<tr><td class="nowrap">${dateMed(r.date)}</td><td><b>${r.ingredient}</b></td><td class="num nowrap">${qty(r.qty, r.unit)}</td><td class="num">${rupiah(r.value)}</td>
              <td><span class="badge ${r.auto ? 'mid' : 'high'}">${r.auto ? 'Kedaluwarsa (otomatis)' : r.reason}</span></td></tr>`
          )}</tbody></table></div></div></div>`;
    };

    el.innerHTML = html`<div class="stack">
      <div class="tabs">${[
        ['sales', 'Penjualan'],
        ['stock', 'Stok masuk'],
        ['waste', 'Bahan terbuang'],
      ].map(([v, l]) => html`<button class="tab ${state.type === v ? 'active' : ''}" data-type="${v}">${l}</button>`)}</div>
      <div class="row wrap">
        <div class="field"><label class="xs">Dari</label><input class="input" type="date" id="from" value="${state.from}" max="${T}" /></div>
        <div class="field"><label class="xs">Sampai</label><input class="input" type="date" id="to" value="${state.to}" max="${T}" /></div>
        <div class="field ${state.type === 'sales' ? '' : 'hidden'}" id="src-wrap"><label class="xs">Sumber</label>
          <select class="input" id="source"><option value="all">Semua sumber</option>${['manual', 'excel', 'mokapos', 'gofood', 'grabfood', 'shopeefood'].map((s) => html`<option value="${s}">${SOURCES[s] || s}</option>`)}</select></div>
      </div>
      <div id="body"></div>
    </div>`;

    el.querySelectorAll('[data-type]').forEach(
      (b) =>
        (b.onclick = () => {
          state.type = b.dataset.type;
          el.querySelectorAll('[data-type]').forEach((x) => x.classList.toggle('active', x === b));
          el.querySelector('#src-wrap').classList.toggle('hidden', state.type !== 'sales');
          load();
        })
    );
    el.querySelector('#from').onchange = (e) => ((state.from = e.target.value || state.from), load());
    el.querySelector('#to').onchange = (e) => ((state.to = e.target.value || state.to), load());
    el.querySelector('#source').onchange = (e) => ((state.source = e.target.value), load());
    await load();
  },
};
