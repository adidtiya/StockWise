import { api } from '../api.js';
import { html, icon, loading, modal, confirmDialog, toast, rupiah, number, emptyState, topbarActions } from '../ui.js';

async function editProduct(product, ings, reload) {
  let recipe = product?.recipe?.map((r) => ({ ingredient_id: r.ingredient_id, qty: r.qty })) || [{ ingredient_id: ings[0]?.id, qty: '' }];
  const rowsHtml = () =>
    recipe.map((r, k) => {
      const ing = ings.find((i) => i.id === +r.ingredient_id);
      return html`<div class="row" style="gap:8px">
        <select class="input grow" data-k="${k}" data-f="ingredient_id">${ings.map((i) => html`<option value="${i.id}" ${+r.ingredient_id === i.id ? 'selected' : ''}>${i.name}</option>`)}</select>
        <div class="input-group" style="width:150px"><input class="input" data-k="${k}" data-f="qty" inputmode="decimal" value="${r.qty}" placeholder="0" /><span class="suffix">${ing?.unit || ''}</span></div>
        <button type="button" class="icon-btn" data-rm="${k}" aria-label="Hapus bahan">${icon('x')}</button>
      </div>`;
    });

  await modal({
    title: product ? 'Ubah menu' : 'Tambah menu',
    wide: true,
    body: html`<form class="stack" id="f" novalidate>
      <div class="grid grid-2" style="gap:12px">
        <div class="field"><label>Nama menu</label><input class="input" name="name" value="${product?.name || ''}" placeholder="cth. Nasi Ayam Goreng" /></div>
        <div class="field"><label>Harga jual (Rp)</label><input class="input" name="price" inputmode="numeric" value="${product?.price ?? ''}" placeholder="0" /></div>
      </div>
      <div class="field"><span class="label-text">Komposisi bahan per porsi</span><span class="hint">Takaran ini menerjemahkan forecast penjualan menu menjadi kebutuhan bahan baku.</span></div>
      <div class="stack-sm" id="rows">${rowsHtml()}</div>
      <button type="button" class="btn btn-ghost btn-sm" id="add" style="align-self:flex-start">${icon('plus')}Tambah bahan</button>
    </form>`,
    onMount: (m) => {
      const bind = () => {
        m.querySelectorAll('[data-f]').forEach((inp) =>
          inp.addEventListener('input', () => {
            recipe[+inp.dataset.k][inp.dataset.f] = inp.value;
            if (inp.dataset.f === 'ingredient_id') redraw();
          })
        );
        m.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => (recipe.splice(+b.dataset.rm, 1), redraw())));
      };
      const redraw = () => {
        m.querySelector('#rows').innerHTML = rowsHtml().map(String).join('');
        bind();
      };
      m.querySelector('#add').onclick = () => {
        const used = new Set(recipe.map((r) => +r.ingredient_id));
        recipe.push({ ingredient_id: (ings.find((i) => !used.has(i.id)) || ings[0]).id, qty: '' });
        redraw();
      };
      bind();
    },
    actions: [
      ...(product
        ? [{
            label: 'Nonaktifkan',
            cls: 'btn-ghost',
            onClick: async () => {
              if (!(await confirmDialog({ title: `Nonaktifkan ${product.name}?`, message: 'Menu tidak lagi muncul di input penjualan dan forecast. Riwayat penjualannya tetap disimpan.', confirm: 'Nonaktifkan', danger: true }))) return false;
              await api(`/products/${product.id}`, { method: 'DELETE' });
              toast('Menu dinonaktifkan');
              reload();
            },
          }]
        : []),
      { label: 'Batal', cls: 'btn-secondary' },
      {
        label: 'Simpan',
        onClick: async (m) => {
          const f = m.querySelector('#f');
          const body = { name: f.name.value, price: f.price.value, recipe: recipe.filter((r) => String(r.qty).trim() !== '') };
          await api(product ? `/products/${product.id}` : '/products', { method: product ? 'PUT' : 'POST', body });
          toast(product ? 'Menu diperbarui' : 'Menu ditambahkan');
          reload();
        },
      },
    ],
  });
}

export default {
  title: 'Menu & Resep',
  async render(el) {
    el.innerHTML = loading(2);
    let products;
    let ings;
    const reload = async () => {
      [products, ings] = await Promise.all([api('/products'), api('/ingredients')]);
      draw();
    };
    topbarActions(html`<button class="btn btn-sm" id="add-prod">${icon('plus')}<span>Menu</span></button>`);
    document.getElementById('add-prod').onclick = () => (ings.length ? editProduct(null, ings, reload) : toast('Tambahkan bahan baku terlebih dahulu.', 'error'));

    const draw = () => {
      const priceOf = new Map(ings.map((i) => [i.id, i.price]));
      el.innerHTML = html`<div class="stack">
        <div class="callout">${icon('info')}<div>Komposisi bahan per porsi dipakai untuk mengubah forecast penjualan menu menjadi kebutuhan bahan, dan untuk menghitung berapa porsi yang masih bisa dibuat dari stok.</div></div>
        ${products.length
          ? html`<div class="grid grid-2">${products.map((p) => {
              const hpp = p.recipe.reduce((s, r) => s + r.qty * (priceOf.get(r.ingredient_id) || 0), 0);
              const margin = p.price ? (p.price - hpp) / p.price : null;
              return html`<div class="card">
                <div class="row-between" style="margin-bottom:10px">
                  <div class="row"><div class="avatar" style="width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:var(--brand-50);color:var(--brand)">${icon('utensils')}</div>
                    <div><h3>${p.name}</h3><span class="small muted">${rupiah(p.price)} · HPP bahan ${rupiah(hpp)}${margin != null ? ` · margin ${Math.round(margin * 100)}%` : ''}</span></div></div>
                  <button class="icon-btn" data-edit="${p.id}" aria-label="Ubah ${p.name}">${icon('edit')}</button>
                </div>
                <div class="list">${p.recipe.map(
                  (r) => html`<div class="list-item" style="padding:7px 0"><span class="grow small">${r.name}</span><b class="small num">${number(r.qty, 3)} ${r.unit}</b></div>`
                )}</div>
              </div>`;
            })}</div>`
          : html`<div class="card">${emptyState('utensils', 'Belum ada menu', ings.length ? 'Tambahkan menu beserta komposisi bahannya.' : 'Daftarkan bahan baku dulu, lalu tambahkan menu.', ings.length ? html`<button class="btn" id="empty-add">${icon('plus')}Tambah menu</button>` : html`<a class="btn" href="#/bahan">Ke bahan baku</a>`)}</div>`}
      </div>`;
      el.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => editProduct(products.find((p) => p.id === +b.dataset.edit), ings, reload)));
      el.querySelector('#empty-add')?.addEventListener('click', () => editProduct(null, ings, reload));
    };
    await reload();
  },
};
