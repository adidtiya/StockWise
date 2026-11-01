import { api } from '../api.js';
import { html, icon, loading, modal, toast, formData, dateFull, dateTime, initials, BUSINESS_TYPES } from '../ui.js';

const profileHead = (u) => html`<div class="profile-head">
  <div class="big-avatar">${initials(u.name)}</div>
  <div class="grow" style="min-width:0">
    <h2>${u.name}</h2>
    <p class="small muted">${u.email}</p>
    <div class="row wrap" style="gap:6px;margin-top:6px">
      <span class="badge brand">${u.business_name}</span>
      ${u.role === 'pro' ? html`<span class="badge pro">PRO s/d ${dateFull(u.pro_until)}</span>` : html`<span class="badge">Freemium</span>`}
    </div>
  </div>
</div>`;

// Hub akun (menu "Akun" di navigasi bawah pada ponsel)
export const akun = {
  title: 'Akun',
  render(el, ctx) {
    const u = ctx.user;
    const link = (href, ico, label, extra = '', cls = '') => html`<a href="${href}" class="${cls}">${icon(ico)}<span class="grow">${label}</span>${extra}<span class="chev">${icon('chevronRight')}</span></a>`;
    el.innerHTML = html`<div class="stack" style="max-width:720px">
      <a class="card" href="#/profil" style="text-decoration:none;color:inherit">${profileHead(u)}</a>
      <div class="card menu-list" style="padding:4px 16px">
        ${link('#/bahan', 'box', 'Stok & Bahan Baku')}
        ${link('#/menu', 'utensils', 'Menu & Resep')}
        ${link('#/penjualan', 'receipt', 'Input Penjualan')}
        ${link('#/import', 'upload', 'Import Excel')}
        ${link('#/event', 'calendar', 'Event & Hari Khusus')}
        ${link('#/riwayat', 'history', 'Riwayat Transaksi')}
        ${link('#/evaluasi', 'target', 'Evaluasi Akurasi')}
      </div>
      <div class="card menu-list" style="padding:4px 16px">
        ${link('#/langganan', 'crown', 'Paket & Langganan', u.role === 'pro' ? html`<span class="badge pro">PRO</span>` : html`<span class="badge">Freemium</span>`)}
        ${link('#/integrasi', 'plug', 'Sinkronisasi API', u.role === 'pro' ? '' : html`<span class="badge mid">Pro</span>`)}
        ${link('#/profil', 'user', 'Profil & Keamanan')}
        ${link('#/feedback', 'message', 'Kirim Feedback')}
        ${link('#/onboarding', 'sparkles', 'Lihat pengenalan aplikasi')}
      </div>
      <div class="card menu-list" style="padding:4px 16px">
        <a href="#" id="logout">${icon('logout')}<span class="grow">Keluar</span></a>
        ${link('#/hapus-akun', 'trash', 'Hapus akun saya', '', 'danger')}
      </div>
      <p class="center xs faint">StockWise v1.0 · Know what and how much to stock before it becomes waste.</p>
    </div>`;
    el.querySelector('#logout').onclick = (e) => {
      e.preventDefault();
      ctx.logout();
    };
    // Onboarding hanya untuk tamu; untuk pengguna masuk tampilkan sebagai pratinjau
    el.querySelector('a[href="#/onboarding"]').onclick = (e) => {
      e.preventDefault();
      previewOnboarding();
    };
  },
};

async function previewOnboarding() {
  const { default: onb } = await import('./onboarding.js');
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;inset:0;z-index:80;overflow:auto';
  document.body.appendChild(host);
  const cleanup = onb.render(host, {
    go: () => {
      cleanup?.();
      host.remove();
    },
  });
}

// UC-12 Profil
export const profil = {
  title: 'Profil',
  render(el, ctx) {
    const u = ctx.user;
    el.innerHTML = html`<div class="stack" style="max-width:720px">
      <div class="card">${profileHead(u)}<p class="xs faint" style="margin-top:12px">Bergabung ${dateTime(u.created_at)}</p></div>
      <form class="card stack" id="pf" novalidate>
        <h2>Data pemilik & usaha</h2>
        <div class="grid grid-2" style="gap:12px">
          <div class="field"><label>Nama lengkap</label><input class="input" name="name" value="${u.name}" /></div>
          <div class="field"><label>Email</label><input class="input" name="email" type="email" value="${u.email}" /></div>
          <div class="field"><label>No. WhatsApp</label><input class="input" name="phone" value="${u.phone || ''}" inputmode="tel" /></div>
          <div class="field"><label>Kota</label><input class="input" name="city" value="${u.city || ''}" /></div>
          <div class="field"><label>Nama usaha</label><input class="input" name="business_name" value="${u.business_name}" /></div>
          <div class="field"><label>Jenis usaha</label><select class="input" name="business_type">${Object.entries(BUSINESS_TYPES).map(([k, l]) => html`<option value="${k}" ${u.business_type === k ? 'selected' : ''}>${l}</option>`)}</select></div>
        </div>
        <button class="btn" type="submit" style="align-self:flex-end">${icon('check')}Simpan perubahan</button>
      </form>
      <div class="card row-between wrap">
        <div><h2>Keamanan</h2><p class="small muted">Ganti kata sandi akun secara berkala.</p></div>
        <button class="btn btn-secondary" id="pw">${icon('lock')}Ubah kata sandi</button>
      </div>
      <div class="card row-between wrap" style="border-color:#fecaca">
        <div><h2 style="color:var(--high)">Hapus akun</h2><p class="small muted">Menghapus akun beserta seluruh data usaha secara permanen.</p></div>
        <a class="btn btn-danger" href="#/hapus-akun">${icon('trash')}Hapus akun saya</a>
      </div>
    </div>`;
    const pf = el.querySelector('#pf');
    pf.onsubmit = async (e) => {
      e.preventDefault();
      try {
        const res = await api('/users/me', { method: 'PATCH', body: formData(pf) });
        const user = res?.user || res;
        ctx.setUser(user);
        toast('Profil diperbarui');
        profil.render(el, ctx);
      } catch (err) {
        toast(err.message, 'error');
      }
    };
    el.querySelector('#pw').onclick = () =>
      modal({
        title: 'Ubah kata sandi',
        body: html`<form class="stack" id="f">
          <div class="field"><label>Kata sandi saat ini</label><input class="input" type="password" name="current" autocomplete="current-password" /></div>
          <div class="field"><label>Kata sandi baru</label><input class="input" type="password" name="next" autocomplete="new-password" placeholder="Minimal 8 karakter" /></div>
        </form>`,
        actions: [
          { label: 'Batal', cls: 'btn-secondary' },
          {
            label: 'Simpan',
            onClick: async (m) => {
              await api('/users/me/password', { method: 'PATCH', body: formData(m.querySelector('#f')) });
              toast('Kata sandi diperbarui');
            },
          },
        ],
      });
  },
};

// UC-12 Feedback
export async function openFeedbackModal(onSuccess = () => {}) {
  let category = 'rekomendasi_pembelian';

  await modal({
    title: 'Kirim Feedback Pengguna',
    body: html`<div class="stack" id="feedback-modal-wrap">
      <div>
        <p class="small muted">Masukan Anda sangat berharga untuk meningkatkan akurasi dan fitur StockWise.</p>
      </div>
      <div class="field">
        <label for="modal-rating">Rating Bintang (1–5)</label>
        <div class="row" style="gap:8px">
          <input class="input" type="number" id="modal-rating" value="5" style="max-width:100px" />
          <span class="small muted" style="align-self:center">skala 1 sampai 5</span>
        </div>
      </div>
      <div class="field">
        <label for="modal-cat">Kategori</label>
        <select class="input" id="modal-cat">
          <option value="rekomendasi_pembelian">Rekomendasi Pembelian</option>
          <option value="forecast">Peramalan Kebutuhan</option>
          <option value="umum">Fitur Umum & Tampilan</option>
        </select>
      </div>
      <div class="field">
        <label for="modal-msg">Pesan / Masukan</label>
        <textarea class="input" id="modal-msg" rows="3" placeholder="Tuliskan pengalaman atau kendala yang Anda alami...">Sangat membantu memotong limbah ayam harian!</textarea>
      </div>
    </div>`,
    actions: [
      { label: 'Batal', cls: 'btn-secondary' },
      {
        label: 'Kirim Feedback',
        cls: 'btn btn-primary',
        onClick: async (m) => {
          const ratingVal = Number(m.querySelector('#modal-rating')?.value);
          const categoryVal = m.querySelector('#modal-cat')?.value || 'umum';
          const msgVal = m.querySelector('#modal-msg')?.value || '';

          if (!msgVal.trim()) {
            toast('Pesan feedback tidak boleh kosong', 'error');
            throw new Error('Pesan feedback tidak boleh kosong');
          }

          try {
            await api('/feedback', {
              method: 'POST',
              body: {
                rating: ratingVal,
                category: categoryVal,
                message: msgVal.trim(),
              },
            });
            toast('Terima kasih! Feedback berhasil dikirim.');
            onSuccess();
          } catch (err) {
            toast(err.message, 'error');
            throw err;
          }
        },
      },
    ],
  });
}

export const feedback = {
  title: 'Feedback',
  async render(el) {
    let rating = 5;
    const categories = ['rekomendasi_pembelian', 'forecast', 'umum'];

    const draw = () => {
      el.innerHTML = html`<div class="stack" style="max-width:720px">
        <div class="card stack">
          <div class="row-between wrap">
            <div>
              <h2>Beri Masukan untuk StockWise</h2>
              <p class="small muted">Anda dapat mengisi feedback melalui formulir di bawah ini atau melalui dialog modal.</p>
            </div>
            <button class="btn btn-secondary" id="open-feedback-modal" type="button">
              ${icon('message')}Buka Modal Feedback
            </button>
          </div>
        </div>

        <form class="card stack" id="f" novalidate>
          <div>
            <h2>Bagaimana pengalamanmu memakai StockWise?</h2>
            <p class="small muted">Masukanmu membantu kami memperbaiki akurasi peramalan dan rekomendasi bahan baku.</p>
          </div>
          <div class="field">
            <label for="direct-rating">Rating Bintang (1–5)</label>
            <div class="row" style="gap:8px">
              <input class="input" type="number" id="direct-rating" name="rating" value="${rating}" style="max-width:100px" />
              <span class="small muted" style="align-self:center">skala 1 sampai 5</span>
            </div>
          </div>
          <div class="field">
            <span class="label-text">Kategori</span>
            <div class="chips">
              ${categories.map(
                (c, i) => html`<label class="chip ${i === 0 ? 'active' : ''}" style="position:relative">
                  <input type="radio" name="category" value="${c}" ${i === 0 ? 'checked' : ''} class="sr-only" />
                  ${c}
                </label>`
              )}
            </div>
          </div>
          <div class="field">
            <label for="msg">Ceritakan lebih lanjut</label>
            <textarea class="input" id="msg" name="message" placeholder="cth. Forecast ayam saat tanggal gajian terlalu rendah…">Sangat membantu operasional katering kami.</textarea>
          </div>
          <button class="btn" type="submit" id="submit-feedback" style="align-self:flex-end">
            ${icon('message')}Kirim Feedback
          </button>
        </form>
      </div>`;

      const f = el.querySelector('#f');
      const syncChips = () => f.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c.querySelector('input').checked));
      f.querySelectorAll('[name=category]').forEach((r) => (r.onchange = syncChips));

      el.querySelector('#open-feedback-modal')?.addEventListener('click', () => openFeedbackModal());

      f.onsubmit = async (e) => {
        e.preventDefault();
        const ratingVal = Number(f.querySelector('#direct-rating')?.value);
        const categoryVal = f.querySelector('[name=category]:checked')?.value || 'umum';
        const msgVal = f.querySelector('#msg')?.value || '';

        try {
          await api('/feedback', {
            method: 'POST',
            body: {
              rating: ratingVal,
              category: categoryVal,
              message: msgVal.trim(),
            },
          });
          toast('Terima kasih! Feedback berhasil dikirim.');
        } catch (err) {
          toast(err.message, 'error');
        }
      };
    };

    draw();
  },
};

// UC-12 Delete my account
export const hapusAkun = {
  title: 'Hapus Akun',
  render(el, ctx) {
    el.innerHTML = html`<div class="stack" style="max-width:640px">
      <div class="card stack">
        <div class="row"><div class="avatar" style="width:48px;height:48px;border-radius:14px;display:grid;place-items:center;background:var(--high-bg);color:var(--high)">${icon('alert')}</div>
          <div><h2>Hapus akun secara permanen</h2><p class="small muted">${ctx.user.email}</p></div></div>
        <p>Data berikut akan dihapus dan <b>tidak dapat dikembalikan</b>:</p>
        <ul class="small" style="margin:0;padding-left:20px;line-height:1.9">
          <li>Profil pemilik dan usaha <b>${ctx.user.business_name}</b></li>
          <li>Bahan baku, menu, resep, dan seluruh riwayat stok</li>
          <li>Riwayat penjualan, event, dan model forecast yang sudah dilatih</li>
          <li>Koneksi API dan riwayat pembayaran${ctx.user.role === 'pro' ? ' (sisa masa Pro tidak dapat dikembalikan)' : ''}</li>
        </ul>
        <p class="small muted">Feedback yang pernah kamu kirim tetap disimpan secara anonim untuk pengembangan aplikasi.</p>
      </div>
      <form class="card stack" id="f" novalidate>
        <div class="field"><label>Kata sandi</label><input class="input" type="password" name="password" autocomplete="current-password" /></div>
        <div class="field"><label>Ketik <b>HAPUS</b> untuk konfirmasi</label><input class="input" name="confirm" autocomplete="off" placeholder="HAPUS" /></div>
        <div class="row" style="justify-content:flex-end;flex-wrap:wrap">
          <a class="btn btn-secondary" href="#/profil">Batal</a>
          <button class="btn btn-danger" type="submit" id="del" disabled>${icon('trash')}Hapus akun permanen</button>
        </div>
      </form>
    </div>`;
    const f = el.querySelector('#f');
    const btn = el.querySelector('#del');
    f.oninput = () => (btn.disabled = !(f.confirm.value === 'HAPUS' && f.password.value.length > 0));
    f.onsubmit = async (e) => {
      e.preventDefault();
      btn.disabled = true;
      try {
        const d = formData(f);
        await api('/users/me', { method: 'DELETE', body: { password: d.password, confirm: d.confirm } });
        toast('Akun dan seluruh data telah dihapus.');
        ctx.setUser(null);
        try {
          localStorage.removeItem('sw_onboarded');
        } catch {
          /* abaikan */
        }
        location.hash = '/login';
        location.reload();
      } catch (err) {
        toast(err.message, 'error');
        btn.disabled = false;
      }
    };
  },
};
