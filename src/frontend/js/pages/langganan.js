import { api } from '../api.js';
import { html, icon, loading, modal, confirmDialog, toast, rupiah, dateMed, dateFull, dateTime, number } from '../ui.js';

const FREE = [
  [true, 'Input penjualan manual & import Excel'],
  [true, '300 transaksi per bulan'],
  [true, 'Forecast 7 hari, rekomendasi belanja, Waste Risk Score'],
  [true, 'Event tagging & evaluasi akurasi'],
  [false, 'Sinkronisasi otomatis POS & aplikasi pesan antar'],
  [false, 'Forecast 14 & 30 hari'],
];
const PRO = [
  [true, 'Semua fitur Freemium'],
  [true, 'Transaksi tanpa batas'],
  [true, 'Sinkronisasi API MokaPOS, GoFood, GrabFood, ShopeeFood'],
  [true, 'Forecast hingga 30 hari ke depan'],
  [true, 'Prioritas dukungan via WhatsApp'],
];

const features = (list) => html`<ul>${list.map(([ok, t]) => html`<li class="${ok ? '' : 'no'}">${icon(ok ? 'check' : 'x')}${t}</li>`)}</ul>`;

async function checkout(sub, ctx, onDone) {
  let method = 'qris';
  await modal({
    title: 'Berlangganan StockWise Pro',
    body: html`<div class="stack">
      <div class="row-between"><span>Paket Pro · 1 bulan</span><b>${rupiah(sub.price)}</b></div>
      <div class="field"><span class="label-text">Metode pembayaran</span>
        <div class="choice-grid" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr))">
          ${Object.entries(sub.methods).map(([k, l]) => html`<label class="choice" style="padding:12px"><input type="radio" name="m" value="${k}" ${k === method ? 'checked' : ''} /><b>${l}</b></label>`)}
        </div></div>
      <div class="callout info">${icon('info')}<div>Mode prototipe: pembayaran disimulasikan dan langsung berhasil. Integrasi payment gateway (mis. Midtrans/Xendit) dilakukan saat produksi.</div></div>
    </div>`,
    onMount: (m) => m.querySelectorAll('[name=m]').forEach((r) => (r.onchange = () => (method = r.value))),
    actions: [
      { label: 'Batal', cls: 'btn-secondary' },
      {
        label: `Bayar ${rupiah(sub.price)}`,
        onClick: async () => {
          const r = await api('/subscription/checkout', { method: 'POST', body: { method } });
          const { user } = await api('/auth/me');
          ctx.setUser(user);
          toast(`Pembayaran berhasil. Pro aktif sampai ${dateFull(r.pro_until)}.`);
          onDone();
        },
      },
    ],
  });
}

// UC-11 Berlangganan paket Pro
export const langganan = {
  title: 'Paket & Langganan',
  async render(el, ctx) {
    const load = async () => {
      el.innerHTML = loading(2);
      const sub = await api('/subscription');
      const isPro = sub.role === 'pro';
      el.innerHTML = html`<div class="stack" style="max-width:920px">
        <div class="card ${isPro ? 'hero' : ''}">
          <div class="row-between wrap" style="position:relative;z-index:1">
            <div class="stack-sm">
              <span class="muted small">Paket saat ini</span>
              <h2 style="font-size:22px">${isPro ? 'StockWise Pro' : 'Freemium'} ${isPro ? html`<span class="badge pro">PRO</span>` : ''}</h2>
              <p class="muted small">${isPro ? `Aktif sampai ${dateFull(sub.pro_until)}` : `Terpakai ${sub.quota.used} dari ${sub.quota.limit} transaksi bulan ini`}</p>
            </div>
            ${isPro ? html`<button class="btn btn-light" id="extend">${icon('refresh')}Perpanjang 1 bulan</button>` : ''}
          </div>
          ${!isPro
            ? html`<div class="progress ${sub.quota.used / sub.quota.limit > 0.8 ? 'warn' : ''}" style="margin-top:12px"><i style="width:${Math.min(100, (sub.quota.used / sub.quota.limit) * 100)}%"></i></div>`
            : ''}
        </div>
        <div class="grid grid-2">
          <div class="plan-card ${isPro ? '' : 'featured'}">
            <div class="row-between"><h2>Freemium</h2>${!isPro ? html`<span class="badge brand">Paket kamu</span>` : ''}</div>
            <div class="price">Rp0 <small>/ selamanya</small></div>
            <p class="small muted">Untuk UMKM yang masih mencatat manual atau dengan Excel.</p>
            ${features(FREE)}
          </div>
          <div class="plan-card ${isPro ? 'featured' : ''}">
            <div class="row-between"><h2>Pro</h2>${isPro ? html`<span class="badge pro">Paket kamu</span>` : html`<span class="badge pro">Populer</span>`}</div>
            <div class="price">${rupiah(sub.price)} <small>/ bulan</small></div>
            <p class="small muted">Untuk usaha dengan transaksi tinggi yang sudah memakai POS atau aplikasi pesan antar.</p>
            ${features(PRO)}
            ${isPro ? html`<button class="btn btn-secondary" id="cancel">Berhenti berlangganan</button>` : html`<button class="btn btn-lg" id="upgrade">${icon('crown')}Upgrade ke Pro</button>`}
          </div>
        </div>
        ${sub.payments.length
          ? html`<div class="card pad-0"><div class="card-head"><div><h2>Riwayat pembayaran</h2></div></div>
              <div class="table-wrap" style="margin-top:12px"><table class="table"><thead><tr><th>Tanggal</th><th>Periode</th><th>Metode</th><th class="num">Jumlah</th><th>Status</th></tr></thead><tbody>
                ${sub.payments.map(
                  (p) => html`<tr><td class="nowrap">${dateTime(p.created_at)}</td><td class="nowrap">${dateMed(p.period_start)} – ${dateMed(p.period_end)}</td><td>${sub.methods[p.method] || p.method}</td><td class="num">${rupiah(p.amount)}</td><td><span class="badge ok">Lunas</span></td></tr>`
                )}</tbody></table></div></div>`
          : ''}
      </div>`;
      el.querySelector('#upgrade')?.addEventListener('click', () => checkout(sub, ctx, load));
      el.querySelector('#extend')?.addEventListener('click', () => checkout(sub, ctx, load));
      el.querySelector('#cancel')?.addEventListener('click', async () => {
        if (!(await confirmDialog({ title: 'Berhenti berlangganan Pro?', message: 'Akun kembali ke Freemium: sinkronisasi API diputus dan input dibatasi 300 transaksi/bulan. Data usahamu tetap aman.', confirm: 'Ya, berhenti', danger: true }))) return;
        await api('/subscription/cancel', { method: 'POST' });
        const { user } = await api('/auth/me');
        ctx.setUser(user);
        toast('Langganan dihentikan. Akun kembali ke Freemium.');
        load();
      });
    };
    await load();
  },
};

const LOGO = {
  mokapos: ['#E4002B', 'M'],
  gofood: ['#00AA13', 'GF'],
  grabfood: ['#00B14F', 'Gr'],
  shopeefood: ['#EE4D2D', 'SF'],
};

// UC-13 Sinkronisasi data via API (khusus Pemilik UMKM Pro)
export const integrasi = {
  title: 'Sinkronisasi API',
  async render(el, ctx) {
    const isPro = ctx.user.role === 'pro';
    const load = async () => {
      el.innerHTML = loading(2);
      const d = await api('/integrations');
      const connected = d.providers.filter((p) => p.connected);
      el.innerHTML = html`<div class="stack" style="max-width:860px">
        ${isPro
          ? html`<div class="card row-between wrap">
              <div><h2>${connected.length} kanal terhubung</h2><p class="small muted">Transaksi ditarik otomatis tanpa input manual dan langsung menjadi data latih forecast.</p></div>
              <button class="btn" id="sync" ${connected.length ? '' : 'disabled'}>${icon('refresh')}Sinkronkan sekarang</button>
            </div>`
          : html`<div class="card hero"><div class="stack-sm" style="position:relative;z-index:1">
              <span class="badge pro" style="align-self:flex-start">Fitur Pro</span>
              <h2>Tidak perlu input manual lagi</h2>
              <p class="muted">Hubungkan MokaPOS, GoFood, GrabFood, dan ShopeeFood agar penjualan tersinkron otomatis, tanpa batas transaksi.</p>
              <a class="btn" style="background:#fff;color:var(--brand-700);align-self:flex-start" href="#/langganan">${icon('crown')}Upgrade ke Pro · Rp100.000/bulan</a>
            </div></div>`}
        <div class="card">
          <div class="list">${d.providers.map(
            (p) => html`<div class="list-item">
              <div class="provider-logo" style="background:${LOGO[p.id][0]}">${LOGO[p.id][1]}</div>
              <div class="grow"><div class="title">${p.name}</div>
                <div class="meta">${p.kind}${p.connected ? ` · sinkron terakhir ${p.last_sync ? dateTime(p.last_sync) : 'belum pernah'} · ${number(p.orders_30d, 0)} porsi (30 hari)` : ''}</div></div>
              ${p.connected
                ? html`<span class="badge ok dot">Terhubung</span><button class="btn btn-ghost btn-sm" data-off="${p.id}">Putuskan</button>`
                : html`<button class="btn btn-secondary btn-sm" data-on="${p.id}" ${isPro ? '' : 'disabled'}>${isPro ? 'Hubungkan' : html`${icon('lock')}Pro`}</button>`}
            </div>`
          )}</div>
        </div>
        <div class="callout info">${icon('info')}<div><b>Mode simulasi prototipe.</b> Integrasi resmi membutuhkan kemitraan API dengan tiap penyedia (MokaPOS Open API, GoBiz, GrabMerchant, Shopee Partner). Pada prototipe ini, tombol sinkron menarik pesanan contoh yang dibangkitkan dari pola forecast hari ini.</div></div>
      </div>`;

      el.querySelectorAll('[data-on]').forEach(
        (b) =>
          (b.onclick = async () => {
            const p = d.providers.find((x) => x.id === b.dataset.on);
            const ok = await confirmDialog({
              title: `Hubungkan ${p.name}?`,
              message: `StockWise akan meminta izin membaca data transaksi (menu, jumlah, tanggal) dari akun ${p.name} milikmu. StockWise tidak dapat mengubah pesanan atau menarik dana.`,
              confirm: 'Izinkan & hubungkan',
            });
            if (!ok) return;
            await api(`/integrations/${p.id}/connect`, { method: 'POST' });
            toast(`${p.name} terhubung`);
            load();
          })
      );
      el.querySelectorAll('[data-off]').forEach(
        (b) =>
          (b.onclick = async () => {
            await api(`/integrations/${b.dataset.off}`, { method: 'DELETE' });
            toast('Kanal diputus');
            load();
          })
      );
      el.querySelector('#sync')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = 'Menyinkronkan…';
        try {
          const r = await api('/integrations/sync', { method: 'POST' });
          toast(`${r.total} porsi baru dari ${r.synced.length} kanal tersinkron`);
          load();
        } catch (err) {
          toast(err.message, 'error');
          btn.disabled = false;
        }
      });
    };
    await load();
  },
};
