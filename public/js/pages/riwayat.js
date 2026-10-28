import { api } from '../api.js';
import { html, icon, loading, confirmDialog, toast, rupiah, number, qty, dateMed, emptyState, todayStr, addDays, SOURCES } from '../ui.js';

// UC-10 Riwayat transaksi (penjualan, stok masuk, bahan terbuang)
export default {
  title: 'Riwayat Transaksi',
  async render(el, ctx, params) {
    const T = todayStr();
    const state = { type: ['sales', 'stock', 'waste'].includes(params.type) ? params.type : 'sales', from: addDays(T, 13 * -1), to: T, source: 'all' };

    const load = async () => {
      el.querySelector('#body').innerHTML = loading(1);
      const q = new URLSearchParams({ type: state.type, from: state.from, to: state.to, source: state.source });
      const d = await api(`/history?${q}`);
      el.querySelector('#body').innerHTML = body(d);
      el.querySelectorAll('[data-del]').forEach(
        (b) =>
          (b.onclick = async () => {
            if (!(await confirmDialog({ title: 'Hapus transaksi ini?', message: 'Stok bahan dan data latih forecast ikut menyesuaikan.', confirm: 'Hapus', danger: true }))) return;
            await api(`/sales/${b.dataset.del}`, { method: 'DELETE' });
            toast('Transaksi dihapus');
            load();
          })
      );
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
      if (!d.rows.length) return html`<div class="card">${emptyState('history', 'Belum ada transaksi', 'Tidak ada data pada rentang tanggal ini.')}</div>`;
      if (d.type === 'sales') {
        const total = d.rows.reduce((s, r) => s + r.qty, 0);
        const rev = d.rows.reduce((s, r) => s + r.revenue, 0);
        return html`<div class="stack">
          <div class="row wrap small"><span class="badge brand">${number(total, 0)} porsi</span><span class="badge brand">${rupiah(rev)}</span><span class="badge">${d.rows.length} transaksi</span></div>
          ${groupByDate(d.rows).map(
            ([date, rows]) => html`<div class="card pad-0">
              <div class="row-between" style="padding:12px 16px;background:var(--surface-2)">
                <div class="row wrap"><b>${dateMed(date)}</b>${(d.events[date] || []).map((n) => html`<span class="badge mid">${icon('calendar')}${n}</span>`)}</div>
                <span class="small muted num">${number(rows.reduce((s, r) => s + r.qty, 0), 0)} porsi · ${rupiah(rows.reduce((s, r) => s + r.revenue, 0))}</span>
              </div>
              <div class="table-wrap"><table class="table"><tbody>
                ${rows.map(
                  (r) => html`<tr><td>${r.product}</td><td><span class="badge">${SOURCES[r.source] || r.source}</span></td><td class="num">${r.qty} porsi</td><td class="num">${rupiah(r.revenue)}</td>
                    <td class="right" style="width:48px"><button class="icon-btn plain" data-del="${r.id}" aria-label="Hapus">${icon('trash')}</button></td></tr>`
                )}</tbody></table></div></div>`
          )}</div>`;
      }
      if (d.type === 'stock') {
        return html`<div class="card pad-0"><div class="table-wrap"><table class="table">
          <thead><tr><th>Tanggal masuk</th><th>Bahan</th><th class="num">Jumlah</th><th class="num">Harga/satuan</th><th>Kedaluwarsa</th><th>Sumber</th></tr></thead>
          <tbody>${d.rows.map(
            (r) => html`<tr><td class="nowrap">${dateMed(r.date)}</td><td><b>${r.ingredient}</b></td><td class="num nowrap">${qty(r.qty, r.unit)}</td><td class="num">${rupiah(r.unit_price)}</td><td class="nowrap">${dateMed(r.expiry_date)}</td><td><span class="badge">${SOURCES[r.source] || r.source}</span></td></tr>`
          )}</tbody></table></div></div>`;
      }
      const total = d.rows.reduce((s, r) => s + r.value, 0);
      return html`<div class="stack">
        <div class="row wrap small"><span class="badge high">Total ${rupiah(total)}</span><span class="badge">${d.rows.length} catatan</span></div>
        <div class="card pad-0"><div class="table-wrap"><table class="table">
          <thead><tr><th>Tanggal</th><th>Bahan</th><th class="num">Jumlah</th><th class="num">Nilai</th><th>Penyebab</th></tr></thead>
          <tbody>${d.rows.map(
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
          <select class="input" id="source"><option value="all">Semua sumber</option>${['manual', 'excel', 'mokapos', 'gofood', 'grabfood', 'shopeefood'].map((s) => html`<option value="${s}">${SOURCES[s]}</option>`)}</select></div>
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
