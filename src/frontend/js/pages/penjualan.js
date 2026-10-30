import { api } from '../api.js';
import { html, icon, loading, toast, rupiah, number, emptyState, todayStr, addDays, dateLong } from '../ui.js';

// UC-03 Input penjualan harian (manual)
export default {
  title: 'Input Penjualan',
  async render(el, ctx) {
    el.innerHTML = loading(2);
    const T = todayStr();
    const [products, sub] = await Promise.all([api('/products'), api('/subscription')]);
    if (!products.length) {
      el.innerHTML = html`<div class="card">${emptyState('utensils', 'Belum ada menu', 'Tambahkan menu dan komposisinya sebelum mencatat penjualan.', html`<a class="btn" href="#/menu">Ke Menu & Resep</a>`)}</div>`;
      return;
    }
    const counts = Object.fromEntries(products.map((p) => [p.id, 0]));
    let date = T;

    el.innerHTML = html`<div class="stack" style="max-width:820px">
      ${ctx.user.role === 'freemium'
        ? html`<div class="card card-flat" style="padding:14px">
            <div class="row-between small"><span>Kuota Freemium bulan ini</span><b class="num">${sub.quota.used} / ${sub.quota.limit} transaksi</b></div>
            <div class="progress ${sub.quota.used / sub.quota.limit > 0.9 ? 'danger' : sub.quota.used / sub.quota.limit > 0.7 ? 'warn' : ''}" style="margin-top:8px"><i style="width:${Math.min(100, (sub.quota.used / sub.quota.limit) * 100)}%"></i></div>
            <p class="xs muted" style="margin-top:6px">1 transaksi = 1 baris menu per tanggal. Pengguna Pro tanpa batas dan bisa sinkron otomatis dari POS / aplikasi pesan antar.</p>
          </div>`
        : html`<div class="callout">${icon('plug')}<div>Akun Pro: penjualan dari kanal yang terhubung masuk otomatis lewat <a href="#/integrasi"><b>Sinkronisasi API</b></a>. Gunakan form ini untuk penjualan di luar kanal tersebut.</div></div>`}
      <div class="card">
        <div class="row-between wrap" style="margin-bottom:12px">
          <div class="field" style="max-width:220px"><label for="date">Tanggal penjualan</label><input class="input" type="date" id="date" value="${T}" max="${T}" min="${addDays(T, -60)}" /></div>
          <span class="small muted" id="date-label">${dateLong(T)}</span>
        </div>
        <div class="list">
          ${products.map(
            (p) => html`<div class="list-item">
              <div class="avatar">${icon('utensils')}</div>
              <div class="grow"><div class="title">${p.name}</div><div class="meta">${rupiah(p.price)}</div></div>
              <div class="stepper">
                <button type="button" data-dec="${p.id}" aria-label="Kurangi">−</button>
                <input type="number" min="0" inputmode="numeric" data-id="${p.id}" value="0" aria-label="Jumlah ${p.name}" />
                <button type="button" data-inc="${p.id}" aria-label="Tambah">+</button>
              </div>
            </div>`
          )}
        </div>
      </div>
      <div class="card row-between wrap" style="position:sticky;bottom:12px;z-index:5">
        <div><div class="small muted">Total</div><b id="sum" class="num" style="font-size:18px">0 porsi · Rp0</b></div>
        <button class="btn btn-lg" id="save">${icon('check')}Simpan penjualan</button>
      </div>
    </div>`;

    const update = () => {
      const qtyTotal = Object.values(counts).reduce((s, x) => s + x, 0);
      const rev = products.reduce((s, p) => s + counts[p.id] * p.price, 0);
      el.querySelector('#sum').textContent = `${number(qtyTotal, 0)} porsi · ${rupiah(rev)}`;
    };
    const set = (id, v) => {
      counts[id] = Math.max(0, Math.round(Number(v) || 0));
      el.querySelector(`input[data-id="${id}"]`).value = counts[id];
      update();
    };
    el.querySelectorAll('[data-inc]').forEach((b) => (b.onclick = () => set(b.dataset.inc, counts[b.dataset.inc] + 1)));
    el.querySelectorAll('[data-dec]').forEach((b) => (b.onclick = () => set(b.dataset.dec, counts[b.dataset.dec] - 1)));
    el.querySelectorAll('input[data-id]').forEach((i) => {
      i.oninput = () => {
        counts[i.dataset.id] = Math.max(0, Math.round(Number(i.value) || 0));
        update();
      };
      i.onfocus = () => i.select();
    });
    const dateInput = el.querySelector('#date');
    dateInput.onchange = () => {
      date = dateInput.value || T;
      el.querySelector('#date-label').textContent = dateLong(date);
    };
    el.querySelector('#save').onclick = async (e) => {
      const btn = e.currentTarget;
      const items = Object.entries(counts).filter(([, q]) => q > 0).map(([product_id, qty]) => ({ product_id, qty }));
      if (!items.length) return toast('Isi jumlah terjual minimal untuk satu menu.', 'error');
      btn.disabled = true;
      try {
        const r = await api('/sales', { method: 'POST', body: { date, items } });
        toast(`${r.total} porsi tercatat. Stok bahan diperbarui otomatis.`);
        ctx.go('/riwayat');
      } catch (err) {
        toast(err.message, 'error');
        btn.disabled = false;
      }
    };
  },
};
