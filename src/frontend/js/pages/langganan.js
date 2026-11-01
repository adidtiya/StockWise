import { api } from '../api.js';
import { html, icon, loading, modal, confirmDialog, toast, rupiah, dateMed, dateFull, dateTime, number } from '../ui.js';

const FREE = [
  [true, 'Input penjualan manual & impor Excel'],
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
  [true, 'Prioritas dukungan operasional'],
];

const features = (list) => html`<ul>${list.map(([ok, t]) => html`<li class="${ok ? '' : 'no'}">${icon(ok ? 'check' : 'x')}${t}</li>`)}</ul>`;

async function checkout(sub, ctx, onDone) {
  let method = 'qris';
  const methodsMap = {
    qris: 'QRIS (Gopay/OVO/ShopeePay)',
    va_bca: 'BCA Virtual Account',
    va_mandiri: 'Mandiri Virtual Account',
    gopay: 'GoPay',
  };

  await modal({
    title: 'Berlangganan StockWise Pro',
    body: html`<div class="stack">
      <div class="row-between">
        <span>Paket Pro · 1 bulan</span>
        <b>${rupiah(sub.price_monthly || 100000)}</b>
      </div>
      <div class="field">
        <span class="label-text">Metode Pembayaran</span>
        <div class="choice-grid" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr))">
          ${(sub.methods || ['qris', 'va_bca', 'va_mandiri', 'gopay']).map(
            (k) => html`<label class="choice" style="padding:12px">
              <input type="radio" name="m" value="${k}" ${k === method ? 'checked' : ''} />
              <b>${methodsMap[k] || k.toUpperCase()}</b>
            </label>`
          )}
        </div>
      </div>
      <div class="callout info" id="sim-badge">
        ${icon('info')}
        <div>
          <b>Simulasi Pembayaran (payment_simulation: true):</b>
          Fitur pembayaran disimulasikan sesuai spesifikasi TRD 6.2.13. Paket Pro akan langsung aktif tanpa pemotongan dana riil.
        </div>
      </div>
    </div>`,
    onMount: (m) => m.querySelectorAll('[name=m]').forEach((r) => (r.onchange = () => (method = r.value))),
    actions: [
      { label: 'Batal', cls: 'btn-secondary' },
      {
        label: `Tingkatkan ke Pro (Simulasi)`,
        onClick: async () => {
          const r = await api('/subscription/checkout', {
            method: 'POST',
            body: { method, months: 1 },
          });
          const me = await api('/auth/me').catch(() => null);
          if (ctx.setUser && me) ctx.setUser(me.user || me);
          toast(`Pembayaran simulasi berhasil (${r.order_id}). Akun Pro aktif sampai ${dateFull(r.pro_until)}.`);
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
      const sub = await api('/subscription').catch(() => ({
        role: ctx.user?.role || 'freemium',
        price_monthly: 100000,
        methods: ['qris', 'va_bca', 'va_mandiri', 'gopay'],
        payments: [],
      }));

      const isPro = sub.role === 'pro' || ctx.user?.role === 'pro';

      el.innerHTML = html`<div class="stack" style="max-width:920px">
        <div class="card ${isPro ? 'hero' : ''}">
          <div class="row-between wrap" style="position:relative;z-index:1">
            <div class="stack-sm">
              <span class="muted small">Paket saat ini</span>
              <h2 style="font-size:22px" id="role-title">
                ${isPro ? 'StockWise Pro' : 'Freemium'}
                ${isPro ? html`<span class="badge pro" id="pro-badge">PRO</span>` : ''}
              </h2>
              <p class="muted small" id="pro-status">
                ${isPro
                  ? `Paket Pro Aktif sampai ${sub.pro_until ? dateFull(sub.pro_until) : '30 hari ke depan'}`
                  : 'Paket Freemium dengan kuota 300 transaksi per bulan'}
              </p>
            </div>
            ${isPro
              ? html`<button class="btn btn-light" id="extend">${icon('refresh')}Perpanjang 1 Bulan</button>`
              : ''}
          </div>
        </div>

        <div class="grid grid-2">
          <div class="plan-card ${isPro ? '' : 'featured'}">
            <div class="row-between">
              <h2>Freemium</h2>
              ${!isPro ? html`<span class="badge brand">Paket Kamu</span>` : ''}
            </div>
            <div class="price">Rp0 <small>/ selamanya</small></div>
            <p class="small muted">Untuk UMKM yang masih mencatat penjualan harian secara manual atau dengan Excel.</p>
            ${features(FREE)}
          </div>

          <div class="plan-card ${isPro ? 'featured' : ''}">
            <div class="row-between">
              <h2>Pro</h2>
              ${isPro ? html`<span class="badge pro">Paket Kamu</span>` : html`<span class="badge pro">Populer</span>`}
            </div>
            <div class="price">${rupiah(sub.price_monthly || 100000)} <small>/ bulan</small></div>
            <p class="small muted">Untuk usaha dengan transaksi tinggi yang ingin otomatisasi sinkronisasi POS dan aplikasi pesan antar.</p>
            ${features(PRO)}
            ${isPro
              ? html`<button class="btn btn-secondary" id="cancel">Berhenti Berlangganan</button>`
              : html`<button class="btn btn-lg" id="upgrade">${icon('crown')}Tingkatkan ke Pro</button>`}
          </div>
        </div>

        ${sub.payments && sub.payments.length
          ? html`<div class="card pad-0">
              <div class="card-head">
                <div><h2>Riwayat Pembayaran (Simulasi)</h2></div>
              </div>
              <div class="table-wrap" style="margin-top:12px">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Order ID</th>
                      <th>Periode</th>
                      <th>Metode</th>
                      <th class="num">Jumlah</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${sub.payments.map(
                      (p) => html`<tr>
                        <td class="nowrap"><b>${p.order_id}</b></td>
                        <td class="nowrap">${dateMed(p.period_start)} – ${dateMed(p.period_end)}</td>
                        <td>${p.method.toUpperCase()}</td>
                        <td class="num">${rupiah(p.amount)}</td>
                        <td><span class="badge ok">Lunas (Simulasi)</span></td>
                      </tr>`
                    )}
                  </tbody>
                </table>
              </div>
            </div>`
          : ''}
      </div>`;

      el.querySelector('#upgrade')?.addEventListener('click', () => checkout(sub, ctx, load));
      el.querySelector('#extend')?.addEventListener('click', () => checkout(sub, ctx, load));
      el.querySelector('#cancel')?.addEventListener('click', async () => {
        if (
          !(await confirmDialog({
            title: 'Berhenti Berlangganan Pro?',
            message: 'Akun Anda akan kembali ke paket Freemium. Sinkronisasi otomatis akan dinonaktifkan.',
            confirm: 'Ya, Berhenti',
            danger: true,
          }))
        )
          return;
        await api('/subscription/cancel', { method: 'POST' });
        const me = await api('/auth/me').catch(() => null);
        if (ctx.setUser && me) ctx.setUser(me.user || me);
        toast('Langganan Pro dibatalkan. Akun kembali ke Freemium.');
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

// UC-13 Sinkronisasi data via API (Khusus Pro)
export const integrasi = {
  title: 'Sinkronisasi API',
  async render(el, ctx) {
    const isPro = ctx.user?.role === 'pro';

    const load = async () => {
      el.innerHTML = loading(2);
      let d = null;
      try {
        d = await api('/integrations');
      } catch (err) {
        d = {
          providers: [
            { name: 'mokapos', label: 'Moka POS', connected: false, last_sync: null },
            { name: 'gofood', label: 'GoFood (GoBiz)', connected: false, last_sync: null },
            { name: 'grabfood', label: 'GrabFood (GrabMerchant)', connected: false, last_sync: null },
            { name: 'shopeefood', label: 'ShopeeFood (Shopee Partner)', connected: false, last_sync: null },
          ],
        };
      }

      const providers = d.providers || [];
      const connectedCount = providers.filter((p) => p.connected).length;

      el.innerHTML = html`<div class="stack" style="max-width:860px">
        ${isPro
          ? html`<div class="card row-between wrap">
              <div>
                <h2>${connectedCount} Kanal Terhubung</h2>
                <p class="small muted">Penjualan ditarik otomatis dari aplikasi POS / kasir dan langsung menjadi data latih model peramalan.</p>
              </div>
              <span class="badge pro">Fitur Pro Aktif</span>
            </div>`
          : html`<div class="card hero">
              <div class="stack-sm" style="position:relative;z-index:1">
                <span class="badge pro" style="align-self:flex-start">Fitur Khusus Pro</span>
                <h2>Otomatisasi Penjualan Lintas Platform</h2>
                <p class="muted">Hubungkan MokaPOS, GoFood, GrabFood, dan ShopeeFood agar transaksi otomatis tersinkron tanpa perlu input manual.</p>
                <a class="btn" style="background:#fff;color:var(--brand-700);align-self:flex-start" href="#/langganan">
                  ${icon('crown')}Tingkatkan ke Pro · Rp100.000/bulan
                </a>
              </div>
            </div>`}

        <div class="card">
          <div class="list" id="providers-list">
            ${providers.map((p) => {
              const pId = p.name;
              const pLabel = p.label || p.name;
              const logo = LOGO[pId] || ['#0F766E', pLabel.slice(0, 2).toUpperCase()];

              return html`<div class="list-item" data-provider="${pId}">
                <div class="provider-logo" style="background:${logo[0]};color:#fff;width:40px;height:40px;border-radius:10px;display:grid;place-items:center;font-weight:700">
                  ${logo[1]}
                </div>
                <div class="grow">
                  <div class="title">${pLabel}</div>
                  <div class="meta">
                    ${p.connected
                      ? `Terhubung · Sinkron terakhir: ${p.last_sync ? dateTime(p.last_sync) : 'Belum pernah'}`
                      : 'Belum terhubung'}
                  </div>
                </div>
                ${p.connected
                  ? html`<span class="badge ok dot">Terhubung</span>
                      <button class="btn btn-primary btn-sm sync-btn" data-sync="${pId}">
                        ${icon('refresh')}Sinkronkan Sekarang
                      </button>`
                  : html`<button class="btn btn-secondary btn-sm connect-btn" data-connect="${pId}" ${isPro ? '' : 'disabled'}>
                      ${isPro ? 'Hubungkan' : html`${icon('lock')}Pro`}
                    </button>`}
              </div>`;
            })}
          </div>
        </div>

        <div class="callout info">
          ${icon('info')}
          <div>
            <b>Simulasi Integrasi API (Mock):</b> Tombol sinkronisasi menarik pesanan contoh dan langsung mencatat transaksi ke riwayat penjualan StockWise untuk simulasi operasional.
          </div>
        </div>
      </div>`;

      // Event handlers for Connect
      el.querySelectorAll('.connect-btn').forEach((b) => {
        b.onclick = async () => {
          const providerId = b.dataset.connect;
          if (!isPro) {
            return toast('Sinkronisasi otomatis POS dan Food Delivery hanya tersedia untuk pengguna paket Pro', 'error');
          }
          try {
            await api(`/integrations/${providerId}/connect`, {
              method: 'POST',
              body: { api_key: `${providerId}_mock_secret_key` },
            });
            toast(`Layanan ${providerId} berhasil terhubung`);
            load();
          } catch (err) {
            toast(err.message, 'error');
          }
        };
      });

      // Event handlers for Sync
      el.querySelectorAll('.sync-btn').forEach((b) => {
        b.onclick = async () => {
          const providerId = b.dataset.sync;
          if (!isPro) {
            return toast('Sinkronisasi otomatis POS dan Food Delivery hanya tersedia untuk pengguna paket Pro', 'error');
          }
          b.disabled = true;
          b.textContent = 'Menyinkronkan...';
          try {
            const res = await api(`/integrations/${providerId}/sync`, { method: 'POST' });
            toast(`${res.synced_orders || 0} pesanan berhasil disinkronkan dari ${providerId}`);
            load();
          } catch (err) {
            toast(err.message, 'error');
            b.disabled = false;
            b.textContent = 'Sinkronkan Sekarang';
          }
        };
      });
    };

    await load();
  },
};
