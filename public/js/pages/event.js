import { api } from '../api.js';
import { html, icon, loading, modal, confirmDialog, toast, formData, dateLong, dayNum, monthShort, signedPct, emptyState, todayStr, topbarActions } from '../ui.js';

const CAT = { nasional: ['info', 'Hari besar'], gajian: ['brand', 'Gajian'], custom: ['mid', 'Event usaha'] };

async function editEvent(ev, reload) {
  const pctVal = ev ? Math.round((ev.impact - 1) * 100) : 30;
  await modal({
    title: ev ? 'Ubah event' : 'Tambah event',
    body: html`<form class="stack" id="f" novalidate>
      <div class="field"><label>Nama event</label><input class="input" name="name" value="${ev?.name || ''}" placeholder="cth. Pesanan arisan RT, Bazar sekolah" /></div>
      <div class="field"><label>Tanggal</label><input class="input" type="date" name="date" value="${ev?.date || todayStr()}" /></div>
      <div class="field"><label>Perkiraan dampak ke penjualan</label>
        <div class="row"><input type="range" name="pct" min="-80" max="200" step="5" value="${pctVal}" class="grow" style="accent-color:var(--brand)" /><b id="pv" class="num" style="width:64px;text-align:right">${pctVal > 0 ? '+' : ''}${pctVal}%</b></div>
        <span class="hint">Dipakai sebagai nilai awal. Setelah event yang sama pernah terjadi, StockWise mempelajari dampak sebenarnya dari data penjualan.</span></div>
    </form>`,
    onMount: (m) => {
      const r = m.querySelector('[name=pct]');
      r.oninput = () => (m.querySelector('#pv').textContent = `${r.value > 0 ? '+' : ''}${r.value}%`);
    },
    actions: [
      ...(ev
        ? [{
            label: 'Hapus',
            cls: 'btn-ghost',
            onClick: async () => {
              if (!(await confirmDialog({ title: `Hapus ${ev.name}?`, message: 'Label event pada tanggal ini dihapus dari data latih.', confirm: 'Hapus', danger: true }))) return false;
              await api(`/events/${ev.id}`, { method: 'DELETE' });
              toast('Event dihapus');
              reload();
            },
          }]
        : []),
      { label: 'Batal', cls: 'btn-secondary' },
      {
        label: 'Simpan',
        onClick: async (m) => {
          const d = formData(m.querySelector('#f'));
          await api(ev ? `/events/${ev.id}` : '/events', { method: ev ? 'PUT' : 'POST', body: { name: d.name, date: d.date, impact: 1 + Number(d.pct) / 100 } });
          toast(ev ? 'Event diperbarui' : 'Event ditambahkan');
          reload();
        },
      },
    ],
  });
}

// Tahap 3: Event tagging
export default {
  title: 'Event & Hari Khusus',
  async render(el) {
    el.innerHTML = loading(2);
    const T = todayStr();
    let view = 'mendatang';
    let events;
    let learned = new Map();
    const reload = async () => {
      const [ev, evalData] = await Promise.all([api('/events'), api('/evaluation').catch(() => null)]);
      events = ev;
      learned = new Map((evalData?.learned_events || []).map((e) => [e.name, e]));
      draw();
    };
    topbarActions(html`<button class="btn btn-sm" id="add-ev">${icon('plus')}<span>Event</span></button>`);
    document.getElementById('add-ev').onclick = () => editEvent(null, reload);

    const draw = () => {
      const list = view === 'mendatang' ? events.filter((e) => e.date >= T) : events.filter((e) => e.date < T).reverse();
      el.innerHTML = html`<div class="stack" style="max-width:860px">
        <div class="callout">${icon('calendar')}<div>Transaksi pada hari berlabel (Natal, Lebaran, tanggal gajian, atau event usahamu) dipakai sebagai data latih. Saat hari yang sama datang lagi, forecast menyesuaikan lonjakan atau penurunannya.</div></div>
        ${learned.size
          ? html`<div class="card"><div class="card-head"><div><h2>Dampak yang sudah dipelajari</h2><p>Dihitung dari penjualan aktual dibanding perkiraan normal pada hari tersebut</p></div></div>
              <div class="chips">${[...learned.values()].map((l) => html`<span class="badge ${l.factor >= 1 ? 'brand' : 'mid'}" style="height:30px;padding:0 12px">${l.name}: ${signedPct(l.factor)} · ${l.occurrences}× terjadi</span>`)}</div></div>`
          : ''}
        <div class="tabs"><button class="tab ${view === 'mendatang' ? 'active' : ''}" data-v="mendatang">Mendatang</button><button class="tab ${view === 'lalu' ? 'active' : ''}" data-v="lalu">Sudah lewat (data latih)</button></div>
        <div class="card">
          ${list.length
            ? html`<div class="list">${list.map((e) => {
                const l = learned.get(e.name);
                return html`<div class="list-item clickable" data-id="${e.id}">
                  <div class="event-date"><b>${dayNum(e.date)}</b><small>${monthShort(e.date)}</small></div>
                  <div class="grow"><div class="title">${e.name}</div><div class="meta">${dateLong(e.date)}</div></div>
                  <span class="badge ${CAT[e.category]?.[0] || ''}">${CAT[e.category]?.[1] || e.category}</span>
                  <div class="right" style="min-width:86px"><b class="num">${signedPct(e.impact)}</b><div class="xs muted">${l ? `data: ${signedPct(l.factor)}` : 'default'}</div></div>
                </div>`;
              })}</div>`
            : emptyState('calendar', 'Tidak ada event', 'Tambahkan event usaha seperti pesanan besar atau bazar.')}
        </div>
      </div>`;
      el.querySelectorAll('[data-v]').forEach((b) => (b.onclick = () => ((view = b.dataset.v), draw())));
      el.querySelectorAll('[data-id]').forEach((r) => (r.onclick = () => editEvent(events.find((e) => e.id === +r.dataset.id), reload)));
    };
    await reload();
  },
};

