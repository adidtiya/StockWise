import { api } from '../api.js';
import { html, icon, toast, formData, rupiah } from '../ui.js';

const PAY = [
  ['qris', 'QRIS'],
  ['gopay', 'GoPay'],
  ['ovo', 'OVO'],
  ['transfer_bca', 'Transfer BCA'],
  ['transfer_mandiri', 'Transfer Mandiri'],
];

export const login = {
  title: 'Masuk',
  async render(root, ctx) {
    root.innerHTML = html`
      <div class="screen">
        <div class="screen-inner">
          <div class="auth-head">
            <img src="/img/logo.svg" alt="StockWise" />
            <h1>Masuk ke StockWise</h1>
            <p class="muted">Know what and how much to stock before it becomes waste.</p>
          </div>
          <form id="form" class="stack" novalidate>
            <div class="field"><label for="email">Email</label><input class="input" id="email" name="email" type="email" autocomplete="email" placeholder="nama@usaha.com" required /></div>
            <div class="field">
              <label for="password">Kata sandi</label>
              <div class="input-group"><input class="input" id="password" name="password" type="password" autocomplete="current-password" placeholder="Minimal 8 karakter" required />
                <button type="button" class="btn btn-ghost btn-sm" id="toggle" style="position:absolute;right:4px;top:5px">Lihat</button></div>
            </div>
            <div class="form-error" id="err"></div>
            <button class="btn btn-lg btn-block" type="submit">Masuk</button>
          </form>
          <div class="or" style="margin:20px 0 14px">atau coba akun demo</div>
          <div class="stack-sm" id="demos"></div>
          <div style="flex:1"></div>
          <p class="center small" style="margin-top:22px">Belum punya akun? <a href="#/register"><b>Daftar gratis</b></a></p>
        </div>
      </div>`;

    const form = root.querySelector('#form');
    const err = root.querySelector('#err');
    root.querySelector('#toggle').onclick = (e) => {
      const p = root.querySelector('#password');
      p.type = p.type === 'password' ? 'text' : 'password';
      e.target.textContent = p.type === 'password' ? 'Lihat' : 'Sembunyi';
    };
    const doLogin = async (email, password, btn) => {
      err.textContent = '';
      btn.disabled = true;
      try {
        const { user } = await api('/auth/login', { method: 'POST', body: { email, password } });
        ctx.setUser(user);
        toast(`Selamat datang, ${user.name.split(' ')[0]}!`);
        ctx.go('/dashboard');
      } catch (e) {
        err.textContent = e.message;
      } finally {
        btn.disabled = false;
      }
    };
    form.onsubmit = (e) => {
      e.preventDefault();
      const d = formData(form);
      if (!d.email || !d.password) return (err.textContent = 'Email dan kata sandi wajib diisi.');
      doLogin(d.email, d.password, form.querySelector('[type=submit]'));
    };

    try {
      const demos = await api('/auth/demo-accounts');
      root.querySelector('#demos').innerHTML = html`${demos.map(
        (d) => html`<button class="choice" data-email="${d.email}" data-pass="${d.password}" style="flex-direction:row;align-items:center;text-align:left">
          <div class="ico">${icon(d.role === 'pro' ? 'crown' : 'store')}</div>
          <div class="grow"><b>${d.business_name}</b><br /><span>${d.role === 'pro' ? 'Pemilik UMKM Pro · katering' : 'Pemilik UMKM Freemium · warung'}</span></div>
          ${icon('chevronRight')}
        </button>`
      )}`;
      root.querySelectorAll('#demos [data-email]').forEach((b) => {
        b.onclick = () => {
          form.email.value = b.dataset.email;
          form.password.value = b.dataset.pass;
          doLogin(b.dataset.email, b.dataset.pass, b);
        };
      });
    } catch {
      /* daftar demo opsional */
    }
  },
};

export const register = {
  title: 'Daftar',
  render(root, ctx) {
    const data = { business_type: 'warung', plan: 'freemium', seed_demo: true, payment_method: 'qris' };
    let step = 0;

    const steps = [
      () => html`
        <div class="auth-head" style="margin-top:4px"><h1>Buat akun</h1><p class="muted">Langkah 1 dari 3 · Data pemilik</p></div>
        <div class="stack">
          <div class="field"><label for="name">Nama lengkap</label><input class="input" id="name" name="name" autocomplete="name" placeholder="Nama pemilik usaha" value="${data.name || ''}" /></div>
          <div class="field"><label for="email">Email</label><input class="input" id="email" name="email" type="email" autocomplete="email" placeholder="nama@usaha.com" value="${data.email || ''}" /></div>
          <div class="field"><label for="phone">No. WhatsApp <span class="faint">(opsional)</span></label><input class="input" id="phone" name="phone" inputmode="tel" placeholder="08xxxxxxxxxx" value="${data.phone || ''}" /></div>
          <div class="field"><label for="password">Kata sandi</label><input class="input" id="password" name="password" type="password" autocomplete="new-password" placeholder="Minimal 8 karakter" value="${data.password || ''}" /></div>
        </div>`,
      () => html`
        <div class="auth-head" style="margin-top:4px"><h1>Profil usaha</h1><p class="muted">Langkah 2 dari 3 · Jenis usaha menentukan contoh menu & pola permintaan</p></div>
        <div class="stack">
          <div class="field"><label for="business_name">Nama usaha</label><input class="input" id="business_name" name="business_name" placeholder="cth. Warung Makan Bu Sari" value="${data.business_name || ''}" /></div>
          <div class="field">
            <span class="label-text">Jenis usaha</span>
            <div class="choice-grid" style="grid-template-columns:repeat(3,1fr)">
              ${[
                ['warung', 'Warung', 'store'],
                ['rumah_makan', 'Rumah Makan', 'utensils'],
                ['katering', 'Katering', 'chef'],
              ].map(
                ([v, l, ico]) => html`<label class="choice"><input type="radio" name="business_type" value="${v}" ${data.business_type === v ? 'checked' : ''} /><div class="ico">${icon(ico)}</div><b>${l}</b></label>`
              )}
            </div>
          </div>
          <div class="field"><label for="city">Kota</label><input class="input" id="city" name="city" placeholder="cth. Jakarta Barat" value="${data.city || ''}" /></div>
        </div>`,
      () => html`
        <div class="auth-head" style="margin-top:4px"><h1>Pilih tipe akun</h1><p class="muted">Langkah 3 dari 3 · Bisa upgrade atau berhenti kapan saja</p></div>
        <div class="stack">
          <label class="choice"><input type="radio" name="plan" value="freemium" ${data.plan === 'freemium' ? 'checked' : ''} />
            <div class="row-between"><b>Pemilik UMKM · Freemium</b><span class="badge brand">Gratis</span></div>
            <span>Input manual & import Excel (300 transaksi/bulan), forecast 7 hari, rekomendasi belanja, Waste Risk Score.</span></label>
          <label class="choice"><input type="radio" name="plan" value="pro" ${data.plan === 'pro' ? 'checked' : ''} />
            <div class="row-between"><b>Pemilik UMKM Pro</b><span class="badge pro">${rupiah(100000)}/bln</span></div>
            <span>Semua fitur Freemium + sinkronisasi otomatis MokaPOS, GoFood, GrabFood, ShopeeFood, transaksi tanpa batas, forecast hingga 30 hari.</span></label>
          <div id="pay" class="${data.plan === 'pro' ? '' : 'hidden'} field">
            <label for="payment_method">Metode pembayaran</label>
            <select class="input" id="payment_method" name="payment_method">${PAY.map(([v, l]) => html`<option value="${v}" ${data.payment_method === v ? 'selected' : ''}>${l}</option>`)}</select>
            <span class="hint">Mode prototipe: pembayaran disimulasikan, tidak ada dana yang ditarik.</span>
          </div>
          <label class="row small" style="align-items:flex-start;gap:10px;cursor:pointer">
            <input type="checkbox" name="seed_demo" ${data.seed_demo ? 'checked' : ''} style="margin-top:3px;width:18px;height:18px;accent-color:var(--brand)" />
            <span><b>Isi dengan data contoh 90 hari</b><br /><span class="muted">Disarankan agar forecast, rekomendasi, dan Waste Risk Score bisa langsung dicoba. Data bisa diubah atau dihapus nanti.</span></span>
          </label>
        </div>`,
    ];

    const draw = () => {
      root.innerHTML = html`
        <div class="screen">
          <div class="screen-inner">
            <div class="row-between" style="margin-bottom:14px">
              <button class="icon-btn plain" id="back" aria-label="Kembali">${icon('chevronLeft')}</button>
              <img src="/img/logo.svg" width="32" height="32" alt="" />
              <span style="width:38px"></span>
            </div>
            <div class="steps">${[0, 1, 2].map((k) => html`<i class="${k <= step ? 'on' : ''}"></i>`)}</div>
            <form id="form" novalidate>${steps[step]()}
              <div class="form-error" id="err" style="margin-top:12px"></div>
              <button class="btn btn-lg btn-block" type="submit" style="margin-top:14px">${step < 2 ? 'Lanjut' : data.plan === 'pro' ? 'Bayar & buat akun' : 'Buat akun'}</button>
            </form>
            <div style="flex:1"></div>
            <p class="center small" style="margin-top:22px">Sudah punya akun? <a href="#/login"><b>Masuk</b></a></p>
          </div>
        </div>`;
      const form = root.querySelector('#form');
      const err = root.querySelector('#err');
      root.querySelector('#back').onclick = () => (step ? (save(form), step--, draw()) : ctx.go('/onboarding'));
      form.querySelectorAll('[name=plan]').forEach((r) =>
        r.addEventListener('change', () => {
          data.plan = form.plan.value;
          root.querySelector('#pay').classList.toggle('hidden', data.plan !== 'pro');
          form.querySelector('[type=submit]').textContent = data.plan === 'pro' ? 'Bayar & buat akun' : 'Buat akun';
        })
      );
      form.onsubmit = async (e) => {
        e.preventDefault();
        save(form);
        const problem = validate();
        if (problem) return (err.textContent = problem);
        if (step < 2) {
          step++;
          return draw();
        }
        const btn = form.querySelector('[type=submit]');
        btn.disabled = true;
        btn.textContent = data.seed_demo ? 'Menyiapkan data contoh…' : 'Membuat akun…';
        try {
          const { user } = await api('/auth/register', { method: 'POST', body: data });
          ctx.setUser(user);
          toast(user.role === 'pro' ? 'Akun Pro aktif. Selamat datang!' : 'Akun berhasil dibuat. Selamat datang!');
          ctx.go(data.seed_demo ? '/dashboard' : '/bahan');
        } catch (e2) {
          err.textContent = e2.message;
          if (/email/i.test(e2.message)) {
            step = 0;
            draw();
            root.querySelector('#err').textContent = e2.message;
          }
        } finally {
          btn.disabled = false;
        }
      };
      form.querySelector('input:not([type=radio]):not([type=checkbox])')?.focus();
    };

    const save = (form) => {
      const d = Object.fromEntries(new FormData(form).entries());
      Object.assign(data, d);
      if (step === 2) data.seed_demo = !!form.seed_demo?.checked;
    };
    const validate = () => {
      if (step === 0) {
        if (!data.name || data.name.trim().length < 2) return 'Nama wajib diisi.';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email || '')) return 'Masukkan email yang valid.';
        if ((data.password || '').length < 8) return 'Kata sandi minimal 8 karakter.';
      }
      if (step === 1 && (!data.business_name || data.business_name.trim().length < 2)) return 'Nama usaha wajib diisi.';
      return null;
    };
    draw();
  },
};
