import { api } from '../api.js';
import { html, icon, toast, number, emptyState } from '../ui.js';

const BASE_URL = (typeof window !== 'undefined' && window.__API_BASE__) || 'http://localhost:8000/api/v1';

export default {
  title: 'Import Excel',
  async render(el, ctx) {
    let fileName = '';
    let isUploading = false;
    let importResult = null;
    let importError = null;

    const draw = () => {
      el.innerHTML = html`<div class="stack" style="max-width:920px">
        <div class="grid grid-3">
          <div class="card span-2 stack">
            <div>
              <h2>1. Unggah file Excel Penjualan</h2>
              <p class="small muted">Format .xlsx atau .xls. Kolom wajib: <b>Tanggal</b>, <b>Menu</b>, dan <b>Jumlah</b>.</p>
            </div>
            <label class="dropzone ${isUploading ? 'loading' : ''}" id="drop">
              <input type="file" id="file" accept=".xlsx,.xls" class="sr-only" ${isUploading ? 'disabled' : ''} />
              ${icon('upload')}
              <b>${fileName || (isUploading ? 'Mengunggah & memproses...' : 'Pilih file atau tarik ke sini')}</b>
              <p class="small muted">File akan otomatis divalidasi dan diimpor ke riwayat transaksi penjualan.</p>
            </label>
          </div>
          <div class="card stack">
            <div>
              <h2>Templat Excel</h2>
              <p class="small muted">Gunakan templat resmi StockWise agar format kolom sesuai.</p>
            </div>
            <div class="small" style="font-family:ui-monospace,monospace;background:var(--surface-2);padding:10px;border-radius:10px">
              Tanggal | Nama Menu | Jumlah Porsi Terjual
            </div>
            <button class="btn btn-secondary" id="tpl" type="button">
              ${icon('download')}Unduh templat (.xlsx)
            </button>
          </div>
        </div>

        ${importError
          ? html`<div class="callout danger stack-sm" id="import-err">
              <div class="row" style="align-items:flex-start;gap:8px">${icon('alert')}<b>Gagal Mengimpor:</b></div>
              <div style="font-size:13.5px;line-height:1.5">
                ${importError.includes(';')
                  ? html`<ul style="margin:4px 0 0 18px;padding:0">${importError.split(';').map((e) => html`<li style="margin-bottom:4px">${e.trim()}</li>`)}</ul>`
                  : html`<p style="margin:0">${importError}</p>`}
              </div>
            </div>`
          : ''}

        ${importResult
          ? html`<div class="card stack" id="import-res">
              <div class="row-between wrap">
                <div>
                  <h2>Hasil Impor</h2>
                  <p class="small muted">Data penjualan berhasil dicatat dan memperbarui stok bahan baku.</p>
                </div>
                <div class="row">
                  <span class="badge ok">${importResult.imported_rows ?? importResult.imported} baris berhasil diimpor</span>
                  ${importResult.skipped > 0 ? html`<span class="badge mid">${importResult.skipped} dilewati</span>` : ''}
                </div>
              </div>
              <div class="row-between wrap" style="margin-top:10px">
                <span class="small muted">Data siap digunakan untuk pelatihan model forecast.</span>
                <a class="btn" href="#/riwayat">${icon('history')}Lihat di Riwayat Transaksi</a>
              </div>
            </div>`
          : ''}
      </div>`;

      const input = el.querySelector('#file');
      input.onchange = () => input.files[0] && uploadFile(input.files[0]);

      const drop = el.querySelector('#drop');
      drop.ondragover = (e) => {
        e.preventDefault();
        drop.classList.add('drag');
      };
      drop.ondragleave = () => drop.classList.remove('drag');
      drop.ondrop = (e) => {
        e.preventDefault();
        drop.classList.remove('drag');
        if (e.dataTransfer.files[0]) uploadFile(e.dataTransfer.files[0]);
      };

      el.querySelector('#tpl').onclick = downloadTemplate;
    };

    const downloadTemplate = async () => {
      try {
        const res = await fetch(`${BASE_URL}/sales/template`, {
          method: 'GET',
          credentials: 'include',
        });
        if (!res.ok) throw new Error('Gagal mengunduh templat');
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'template-penjualan-stockwise.xlsx';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        toast('Templat Excel berhasil diunduh');
      } catch (err) {
        toast(err.message, 'error');
      }
    };

    const uploadFile = async (file) => {
      fileName = file.name;
      isUploading = true;
      importError = null;
      importResult = null;
      draw();

      try {
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch(`${BASE_URL}/sales/import-excel`, {
          method: 'POST',
          body: formData,
          credentials: 'include',
        });

        const payload = await res.json().catch(() => null);

        if (!res.ok || (payload && payload.success === false)) {
          const errMsg = payload?.error?.message || `Gagal mengimpor berkas (HTTP ${res.status})`;
          throw new Error(errMsg);
        }

        const data = payload?.data || payload;
        importResult = data;
        const totalImported = data.imported_rows ?? data.imported ?? 0;
        toast(`${totalImported} baris transaksi berhasil diimpor`);
      } catch (err) {
        importError = err.message;
        toast(err.message, 'error');
      } finally {
        isUploading = false;
        draw();
      }
    };

    draw();
  },
};
