import { api } from '../api.js';
import { html, icon, toast, number, emptyState, todayStr, addDays } from '../ui.js';

const XLSX_URL = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
let xlsxPromise;
function loadXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  xlsxPromise ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = XLSX_URL;
    s.onload = () => resolve(window.XLSX);
    s.onerror = () => {
      xlsxPromise = null;
      reject(new Error('Gagal memuat pembaca Excel. Periksa koneksi internet.'));
    };
    document.head.appendChild(s);
  });
  return xlsxPromise;
}

const TYPES = {
  sales: {
    label: 'Riwayat penjualan',
    columns: ['tanggal', 'menu', 'jumlah'],
    desc: 'Satu baris per menu per tanggal. Nama menu harus sama dengan yang terdaftar di Menu & Resep.',
  },
  stock: {
    label: 'Stok masuk / pembelian',
    columns: ['tanggal', 'bahan', 'jumlah', 'satuan', 'harga_satuan'],
    desc: 'Satuan gram/ml otomatis dikonversi ke kg/liter. Kolom harga_satuan boleh kosong.',
  },
};

export default {
  title: 'Import Excel',
  async render(el, ctx) {
    let type = 'sales';
    let rows = null;
    let fileName = '';
    let result = null;

    const draw = () => {
      const t = TYPES[type];
      el.innerHTML = html`<div class="stack" style="max-width:920px">
        <div class="tabs">${Object.entries(TYPES).map(([k, v]) => html`<button class="tab ${type === k ? 'active' : ''}" data-type="${k}">${v.label}</button>`)}</div>
        <div class="grid grid-3">
          <div class="card span-2 stack">
            <div><h2>1. Unggah file</h2><p class="small muted">Format .xlsx, .xls, atau .csv. ${t.desc}</p></div>
            <label class="dropzone" id="drop">
              <input type="file" id="file" accept=".xlsx,.xls,.csv" class="sr-only" />
              ${icon('upload')}<b>${fileName || 'Pilih file atau tarik ke sini'}</b>
              <p class="small muted">${rows ? `${rows.length} baris terbaca` : 'Kolom wajib: ' + t.columns.slice(0, 3).join(', ')}</p>
            </label>
          </div>
          <div class="card stack">
            <div><h2>Templat</h2><p class="small muted">Gunakan templat StockWise agar kolom sesuai.</p></div>
            <div class="small" style="font-family:ui-monospace,monospace;background:var(--surface-2);padding:10px;border-radius:10px">${t.columns.join(' | ')}</div>
            <button class="btn btn-secondary" id="tpl">${icon('download')}Unduh templat</button>
          </div>
        </div>
        ${result ? resultView() : ''}
      </div>`;

      el.querySelectorAll('[data-type]').forEach((b) => (b.onclick = () => ((type = b.dataset.type), (rows = null), (result = null), (fileName = ''), draw())));
      const input = el.querySelector('#file');
      input.onchange = () => input.files[0] && readFile(input.files[0]);
      const drop = el.querySelector('#drop');
      drop.ondragover = (e) => (e.preventDefault(), drop.classList.add('drag'));
      drop.ondragleave = () => drop.classList.remove('drag');
      drop.ondrop = (e) => {
        e.preventDefault();
        drop.classList.remove('drag');
        if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]);
      };
      el.querySelector('#tpl').onclick = downloadTemplate;
      el.querySelector('#commit')?.addEventListener('click', commit);
    };

    const resultView = () => html`<div class="card stack">
      <div class="row-between wrap">
        <div><h2>2. Validasi data</h2><p class="small muted">Format tanggal, nama, satuan, dan jumlah diperiksa sebelum disimpan.</p></div>
        <div class="row"><span class="badge ok">${result.valid.length} valid</span><span class="badge ${result.invalid.length ? 'high' : ''}">${result.invalid.length} perlu diperbaiki</span></div>
      </div>
      ${result.invalid.length
        ? html`<div class="callout warn">${icon('alert')}<div>Baris bermasalah tidak akan disimpan. Perbaiki di file lalu unggah ulang, atau lanjutkan menyimpan baris yang valid saja.</div></div>
          <div class="table-wrap"><table class="table"><thead><tr><th>Baris</th><th>Data</th><th>Masalah</th></tr></thead><tbody>
            ${result.invalid.slice(0, 50).map(
              (r) => html`<tr class="bad"><td>${r.row}</td><td class="small">${r.date || '?'} · ${r.menu || r.bahan || '?'} · ${Number.isFinite(r.qty) ? number(r.qty, 3) : '?'}</td><td class="small" style="color:var(--high)">${r.errors.join('; ')}</td></tr>`
            )}</tbody></table></div>`
        : ''}
      ${result.valid.length
        ? html`<details ${result.invalid.length ? '' : 'open'}><summary class="bold small" style="cursor:pointer">Pratinjau ${Math.min(20, result.valid.length)} baris valid</summary>
          <div class="table-wrap" style="margin-top:10px"><table class="table"><thead><tr><th>Baris</th><th>Tanggal</th><th>${type === 'sales' ? 'Menu' : 'Bahan'}</th><th class="num">Jumlah</th></tr></thead><tbody>
            ${result.valid.slice(0, 20).map((r) => html`<tr><td>${r.row}</td><td>${r.date}</td><td>${r.menu || r.bahan}</td><td class="num">${number(r.qty, 3)} ${r.unit || ''}</td></tr>`)}
          </tbody></table></div></details>
          <div class="row-between wrap"><span class="small muted">Data tersimpan juga menjadi data latih forecast.</span><button class="btn" id="commit">${icon('check')}Simpan ${result.valid.length} baris valid</button></div>`
        : emptyState('alert', 'Tidak ada baris valid', 'Periksa kembali isi file.')}
    </div>`;

    const readFile = async (file) => {
      try {
        const XLSX = await loadXlsx();
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
        fileName = file.name;
        if (!rows.length) throw new Error('File tidak berisi data.');
        result = await api(`/import/${type}`, { method: 'POST', body: { rows } });
        draw();
      } catch (err) {
        toast(err.message, 'error');
      }
    };

    const commit = async (e) => {
      e.currentTarget.disabled = true;
      try {
        const r = await api(`/import/${type}`, { method: 'POST', body: { rows, commit: true } });
        toast(`${r.committed} baris berhasil diimpor`);
        ctx.go(type === 'sales' ? '/riwayat' : '/bahan');
      } catch (err) {
        toast(err.message, 'error');
        draw();
      }
    };

    const downloadTemplate = async () => {
      try {
        const XLSX = await loadXlsx();
        const T = todayStr();
        let data;
        if (type === 'sales') {
          const products = await api('/products');
          const names = products.length ? products.map((p) => p.name) : ['Nasi Ayam Goreng', 'Es Teh Manis'];
          data = [addDays(T, -2), addDays(T, -1)].flatMap((d) => names.slice(0, 3).map((m) => ({ tanggal: d, menu: m, jumlah: 10 })));
        } else {
          const ings = await api('/ingredients');
          const list = ings.length ? ings.slice(0, 3) : [{ name: 'Ayam potong', unit: 'kg', price: 38000 }];
          data = list.map((i) => ({ tanggal: addDays(T, -1), bahan: i.name, jumlah: 5, satuan: i.unit, harga_satuan: i.price }));
        }
        const ws = XLSX.utils.json_to_sheet(data, { header: TYPES[type].columns });
        ws['!cols'] = TYPES[type].columns.map(() => ({ wch: 22 }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, type === 'sales' ? 'Penjualan' : 'Stok Masuk');
        XLSX.writeFile(wb, `templat-stockwise-${type === 'sales' ? 'penjualan' : 'stok-masuk'}.xlsx`);
      } catch (err) {
        toast(err.message, 'error');
      }
    };

    draw();
  },
};
