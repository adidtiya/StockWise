import { api } from '../api.js';
import { html, icon, loading, modal, confirmDialog, toast, formData, rupiah, qty, number, dateShort, dateMed, categoryBadge, emptyState, todayStr, addDays, topbarActions } from '../ui.js';

const STATUS = {
  aman: ['ok', 'Aman'],
  menipis: ['mid', 'Menipis'],
  habis: ['high', 'Habis'],
  segera_kedaluwarsa: ['mid', 'Segera kedaluwarsa'],
};

function ingredientForm(i = {}) {
  return html`<form class="stack" id="f" novalidate>
    <div class="field"><label>Nama bahan</label><input class="input" name="name" value="${i.name || ''}" placeholder="cth. Ayam potong" /></div>
    <div class="grid grid-2" style="gap:12px">
      <div class="field"><label>Satuan</label><input class="input" name="unit" list="units" value="${i.unit || ''}" placeholder="kg, liter, butir…" />
        <datalist id="units"><option>kg</option><option>gram</option><option>liter</option><option>ml</option><option>butir</option><option>buah</option><option>potong</option><option>papan</option><option>ikat</option><option>bungkus</option><option>botol</option><option>kotak</option></datalist></div>
      <div class="field"><label>Harga per satuan (Rp)</label><input class="input" name="price" inputmode="decimal" value="${i.price ?? ''}" placeholder="0" /></div>
    </div>
    <div class="field"><span class="label-text">Kategori</span>
      <div class="choice-grid" style="grid-template-columns:1fr 1fr">
        <label class="choice"><input type="radio" name="category" value="segar" ${i.category !== 'tahan_lama' ? 'checked' : ''} /><b>Bahan segar</b><span>Daging, sayur, tahu… forecast harian</span></label>
        <label class="choice"><input type="radio" name="category" value="tahan_lama" ${i.category === 'tahan_lama' ? 'checked' : ''} /><b>Tahan lama</b><span>Beras, minyak, gula… forecast mingguan/bulanan</span></label>
      </div></div>
    <div class="grid grid-2" style="gap:12px">
      <div class="field"><label>Umur simpan (hari)</label><input class="input" name="shelf_life_days" inputmode="numeric" value="${i.shelf_life_days ?? ''}" placeholder="cth. 2" /><span class="hint">Dipakai untuk menghitung tanggal kedaluwarsa & Waste Risk Score</span></div>
      <div class="field"><label>Stok minimum</label><input class="input" name="min_stock" inputmode="decimal" value="${i.min_stock ?? ''}" placeholder="0" /><span class="hint">Peringatan stok menipis</span></div>
    </div>
  </form>`;
}

async function editIngredient(item, reload) {
  await modal({
    title: item ? 'Ubah bahan' : 'Tambah bahan baku',
    body: ingredientForm(item || {}),
    actions: [
      ...(item
        ? [{
            label: 'Hapus',
            cls: 'btn-ghost',
            onClick: async () => {
              const ok = await confirmDialog({ title: `Hapus ${item.name}?`, message: 'Seluruh riwayat stok bahan ini dan komposisinya di menu ikut terhapus.', confirm: 'Hapus', danger: true });
              if (!ok) return false;
              await api(`/ingredients/${item.id}`, { method: 'DELETE' });
              toast('Bahan dihapus');
              reload();
            },
          }]
        : []),
      { label: 'Batal', cls: 'btn-secondary' },
      {
        label: 'Simpan',
        onClick: async (m) => {
          const body = formData(m.querySelector('#f'));
          await api(item ? `/ingredients/${item.id}` : '/ingredients', { method: item ? 'PUT' : 'POST', body });
          toast(item ? 'Bahan diperbarui' : 'Bahan ditambahkan');
          reload();
        },
      },
    ],
  });
}

function batchDetail(item, reload) {
  const T = todayStr();
  modal({
    title: item.name,
    wide: true,
    body: html`<div class="stack">
      <div class="row wrap">${categoryBadge(item.category)}<span class="badge">Umur simpan ${item.shelf_life_days} hari</span><span class="badge">Harga ${rupiah(item.price)}/${item.unit}</span></div>
      <div class="grid grid-3" style="gap:10px">
        <div class="portion"><small>Stok layak pakai</small><b>${qty(item.stock, item.unit)}</b></div>
        <div class="portion"><small>Nilai stok</small><b>${rupiah(item.value)}</b></div>
        <div class="portion"><small>Kedaluwarsa terdekat</small><b style="font-size:17px">${item.nearest_expiry ? dateMed(item.nearest_expiry) : '–'}</b></div>
      </div>
      <h3>Batch stok (FEFO: yang paling cepat kedaluwarsa dipakai dulu)</h3>
      ${item.batches.length
        ? html`<div class="table-wrap"><table class="table"><thead><tr><th>Masuk</th><th>Kedaluwarsa</th><th class="num">Sisa</th><th class="num">Harga</th><th></th></tr></thead><tbody>
            ${item.batches.map((b) => {
              const left = Math.round((Date.parse(b.expiry) - Date.parse(T)) / 86400000);
              return html`<tr><td>${dateShort(b.received)}</td><td>${dateShort(b.expiry)} <span class="badge ${left <= 0 ? 'high' : left <= 1 ? 'mid' : 'ok'}">${left <= 0 ? 'hari ini' : `${left} hari lagi`}</span></td>
                <td class="num">${qty(b.qty, item.unit)}</td><td class="num">${rupiah(b.price)}</td>
                <td class="right"><button class="icon-btn plain" data-del="${b.id}" title="Hapus batch (salah input)">${icon('trash')}</button></td></tr>`;
            })}</tbody></table></div>`
        : emptyState('box', 'Stok kosong', 'Belum ada batch yang layak pakai.')}
    </div>`,
    actions: [
      { label: 'Ubah data bahan', cls: 'btn-secondary', onClick: () => void setTimeout(() => editIngredient(item, reload)) },
      { label: 'Catat bahan terbuang', cls: 'btn-secondary', onClick: () => (location.hash = `/stok-masuk?tab=terbuang&bahan=${item.id}`) },
      { label: 'Catat stok masuk', onClick: () => (location.hash = `/stok-masuk?bahan=${item.id}`) },
    ],
    onMount: (m, close) =>
      m.querySelectorAll('[data-del]').forEach(
        (b) =>
          (b.onclick = async () => {
            if (!(await confirmDialog({ title: 'Hapus batch ini?', message: 'Gunakan hanya jika batch tersebut salah input.', confirm: 'Hapus', danger: true }))) return;
            await api(`/stock/batches/${b.dataset.del}`, { method: 'DELETE' });
            toast('Batch dihapus');
            close();
            reload();
          })
      ),
  });
}

export const bahan = {
  title: 'Stok & Bahan Baku',
  async render(el) {
    let filter = 'semua';
    let q = '';
    let data;
    const reload = async () => {
      data = await api('/stock');
      draw();
    };
    topbarActions(html`<button class="btn btn-sm" id="add-ing">${icon('plus')}<span>Bahan</span></button>`);
    document.getElementById('add-ing').onclick = () => editIngredient(null, reload);

    const draw = () => {
      const items = data.items.filter(
        (i) =>
          (filter === 'semua' || (filter === 'segar' ? i.category === 'segar' : filter === 'tahan_lama' ? i.category === 'tahan_lama' : i.status !== 'aman')) &&
          i.name.toLowerCase().includes(q.toLowerCase())
      );
      const value = data.items.reduce((s, i) => s + i.value, 0);
      const attention = data.items.filter((i) => i.status !== 'aman').length;
      el.innerHTML = html`<div class="stack">
        <div class="grid grid-3">
          <div class="card kpi"><span class="label"><span class="ico">${icon('box')}</span>Jenis bahan</span><span class="value">${data.items.length}</span><span class="sub">${data.items.filter((i) => i.category === 'segar').length} segar · ${data.items.filter((i) => i.category === 'tahan_lama').length} tahan lama</span></div>
          <div class="card kpi"><span class="label"><span class="ico">${icon('wallet')}</span>Nilai stok</span><span class="value">${rupiah(value)}</span><span class="sub">Berdasarkan harga beli tiap batch</span></div>
          <div class="card kpi"><span class="label"><span class="ico" style="background:var(--mid-bg);color:var(--mid)">${icon('alert')}</span>Perlu perhatian</span><span class="value">${attention}</span><span class="sub">Habis, menipis, atau segera kedaluwarsa</span></div>
        </div>
        <div class="row wrap">
          <input class="input grow" id="q" placeholder="Cari bahan…" value="${q}" style="max-width:320px" />
          <div class="chips">${[
            ['semua', 'Semua'],
            ['segar', 'Segar'],
            ['tahan_lama', 'Tahan lama'],
            ['perhatian', 'Perlu perhatian'],
          ].map(([v, l]) => html`<button class="chip ${filter === v ? 'active' : ''}" data-filter="${v}">${l}</button>`)}</div>
          <div class="grow"></div>
          <a class="btn btn-secondary" href="#/stok-masuk">${icon('truck')}Catat stok masuk</a>
        </div>
        <div class="card pad-0">
          ${items.length
            ? html`<div class="table-wrap"><table class="table">
                <thead><tr><th>Bahan</th><th>Kategori</th><th class="num">Stok</th><th>Kedaluwarsa terdekat</th><th>Status</th><th></th></tr></thead>
                <tbody>${items.map(
                  (i) => html`<tr data-id="${i.id}" style="cursor:pointer">
                    <td><b>${i.name}</b><div class="xs muted">${rupiah(i.price)}/${i.unit} · simpan ${i.shelf_life_days} hari</div></td>
                    <td>${categoryBadge(i.category)}</td>
                    <td class="num nowrap"><b>${qty(i.stock, i.unit)}</b>${i.min_stock ? html`<div class="xs muted">min ${number(i.min_stock)}</div>` : ''}</td>
                    <td class="nowrap">${i.nearest_expiry ? dateMed(i.nearest_expiry) : '–'}</td>
                    <td><span class="badge dot ${STATUS[i.status][0]}">${STATUS[i.status][1]}</span></td>
                    <td class="right">${icon('chevronRight')}</td>
                  </tr>`
                )}</tbody></table></div>`
            : emptyState('box', data.items.length ? 'Tidak ada yang cocok' : 'Belum ada bahan baku', data.items.length ? 'Ubah filter atau kata kunci.' : 'Tambahkan bahan beserta kategori dan umur simpannya.', data.items.length ? '' : html`<button class="btn" id="empty-add">${icon('plus')}Tambah bahan</button>`)}
        </div>
      </div>`;
      const qi = el.querySelector('#q');
      qi.oninput = () => {
        q = qi.value;
        const pos = qi.selectionStart;
        draw();
        const n = el.querySelector('#q');
        n.focus();
        n.setSelectionRange(pos, pos);
      };
      el.querySelectorAll('[data-filter]').forEach((c) => (c.onclick = () => ((filter = c.dataset.filter), draw())));
      el.querySelectorAll('tr[data-id]').forEach((r) => (r.onclick = () => batchDetail(data.items.find((i) => i.id === +r.dataset.id), reload)));
      el.querySelector('#empty-add')?.addEventListener('click', () => editIngredient(null, reload));
    };
    el.innerHTML = loading(2);
    await reload();
  },
};

// Tahap 6: catat pembelian (stok masuk) & bahan terbuang
export const stokMasuk = {
  title: 'Catat Stok',
  async render(el, ctx, params) {
    const [ings, stock] = await Promise.all([api('/ingredients'), api('/stock')]);
    let tab = params.tab === 'terbuang' ? 'terbuang' : 'masuk';
    const T = todayStr();
    if (!ings.length) {
      el.innerHTML = html`<div class="card">${emptyState('box', 'Belum ada bahan baku', 'Tambahkan bahan dulu sebelum mencatat stok.', html`<a class="btn" href="#/bahan">Ke Stok & Bahan Baku</a>`)}</div>`;
      return;
    }
    const opt = (sel) => ings.map((i) => html`<option value="${i.id}" ${+sel === i.id ? 'selected' : ''}>${i.name} (${i.unit})</option>`);
    let rows = [{ ingredient_id: params.bahan || ings[0].id }];

    const draw = () => {
      el.innerHTML = html`<div class="stack" style="max-width:760px">
        <div class="tabs"><button class="tab ${tab === 'masuk' ? 'active' : ''}" data-tab="masuk">Stok masuk (pembelian)</button><button class="tab ${tab === 'terbuang' ? 'active' : ''}" data-tab="terbuang">Bahan terbuang</button></div>
        ${tab === 'masuk'
          ? html`<form class="card stack" id="f" novalidate>
              <div class="row-between"><div><h2>Pembelian bahan</h2><p class="small muted">Tanggal kedaluwarsa dihitung otomatis dari umur simpan bahan.</p></div></div>
              <div class="field" style="max-width:220px"><label>Tanggal masuk</label><input class="input" type="date" name="date" value="${T}" max="${T}" /></div>
              <div class="stack-sm" id="rows">
                ${rows.map((r, k) => {
                  const ing = ings.find((i) => i.id === +r.ingredient_id) || ings[0];
                  return html`<div class="card card-flat" style="padding:12px;background:var(--surface-2)">
                    <div class="grid" style="grid-template-columns:minmax(0,2fr) minmax(0,1fr) minmax(0,1fr) auto;gap:10px;align-items:end">
                      <div class="field"><label>Bahan</label><select class="input" data-k="${k}" data-f="ingredient_id">${opt(r.ingredient_id)}</select></div>
                      <div class="field"><label>Jumlah (${ing.unit})</label><input class="input" data-k="${k}" data-f="qty" inputmode="decimal" value="${r.qty || ''}" placeholder="0" /></div>
                      <div class="field"><label>Harga/${ing.unit}</label><input class="input" data-k="${k}" data-f="unit_price" inputmode="decimal" value="${r.unit_price ?? ing.price}" /></div>
                      <button type="button" class="icon-btn" data-rm="${k}" ${rows.length === 1 ? 'disabled' : ''} aria-label="Hapus baris">${icon('trash')}</button>
                    </div></div>`;
                })}
              </div>
              <button type="button" class="btn btn-ghost" id="add-row" style="align-self:flex-start">${icon('plus')}Tambah bahan lain</button>
              <div class="row-between wrap"><span class="muted">Total: <b id="total" class="num">${rupiah(rows.reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.unit_price ?? ings.find((i) => i.id === +r.ingredient_id)?.price) || 0), 0))}</b></span>
                <button class="btn" type="submit">${icon('check')}Simpan stok masuk</button></div>
            </form>`
          : html`<form class="card stack" id="w" novalidate>
              <div><h2>Catat bahan terbuang</h2><p class="small muted">Bahan yang lewat tanggal kedaluwarsa tercatat otomatis. Gunakan form ini untuk bahan rusak atau sisa yang tidak terjual.</p></div>
              <div class="grid grid-2" style="gap:12px">
                <div class="field"><label>Bahan</label><select class="input" name="ingredient_id">${opt(params.bahan)}</select></div>
                <div class="field"><label>Tanggal</label><input class="input" type="date" name="date" value="${T}" max="${T}" min="${addDays(T, -30)}" /></div>
                <div class="field"><label>Jumlah</label><input class="input" name="qty" inputmode="decimal" placeholder="0" /><span class="hint" id="avail"></span></div>
                <div class="field"><label>Alasan</label><select class="input" name="reason"><option value="rusak">Rusak / busuk</option><option value="sisa tidak terjual">Sisa tidak terjual</option><option value="kedaluwarsa">Kedaluwarsa</option><option value="lainnya">Lainnya</option></select></div>
              </div>
              <button class="btn btn-danger" type="submit" style="align-self:flex-end">${icon('trash')}Catat terbuang</button>
            </form>`}
      </div>`;

      el.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => ((tab = b.dataset.tab), draw())));
      if (tab === 'masuk') {
        const form = el.querySelector('#f');
        el.querySelectorAll('[data-f]').forEach((inp) => {
          inp.addEventListener('input', () => {
            rows[+inp.dataset.k][inp.dataset.f] = inp.value;
            if (inp.dataset.f === 'ingredient_id') {
              delete rows[+inp.dataset.k].unit_price;
              draw();
            } else
              el.querySelector('#total').textContent = rupiah(
                rows.reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.unit_price ?? ings.find((i) => i.id === +r.ingredient_id)?.price) || 0), 0)
              );
          });
        });
        el.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => (rows.splice(+b.dataset.rm, 1), draw())));
        el.querySelector('#add-row').onclick = () => {
          rows.push({ ingredient_id: ings[0].id });
          draw();
        };
        form.onsubmit = async (e) => {
          e.preventDefault();
          const date = form.date.value;
          const items = rows.filter((r) => Number(r.qty) > 0).map((r) => ({ ...r, date }));
          if (!items.length) return toast('Isi jumlah bahan yang dibeli.', 'error');
          try {
            await api('/stock/in', { method: 'POST', body: { items } });
            toast(`${items.length} pembelian tercatat`);
            ctx.go('/bahan');
          } catch (err) {
            toast(err.message, 'error');
          }
        };
      } else {
        const form = el.querySelector('#w');
        const showAvail = () => {
          const s = stock.items.find((i) => i.id === +form.ingredient_id.value);
          el.querySelector('#avail').textContent = s ? `Stok tersedia ${qty(s.stock, s.unit)}` : '';
        };
        form.ingredient_id.onchange = showAvail;
        showAvail();
        form.onsubmit = async (e) => {
          e.preventDefault();
          try {
            await api('/stock/waste', { method: 'POST', body: formData(form) });
            toast('Bahan terbuang tercatat');
            ctx.go('/riwayat?type=waste');
          } catch (err) {
            toast(err.message, 'error');
          }
        };
      }
    };
    draw();
  },
};
