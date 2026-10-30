import { api } from '../api.js';
import { html, icon, loading, modal, toast, rupiah, number, qty, pct, dateMed, riskBadge, categoryBadge, emptyState } from '../ui.js';

// UC-06 Rekomendasi pembelian + UC-07 Waste Risk Score (extend saat stok berlebih)
export default {
  title: 'Rekomendasi Belanja',
  async render(el, ctx, params) {
    el.innerHTML = loading(3);
    let filter = params.filter === 'risiko' ? 'risiko' : 'beli';
    const d = await api('/recommendations');
    const picked = new Set(d.items.filter((i) => i.status === 'beli').map((i) => i.id));
    const amount = new Map(d.items.map((i) => [i.id, i.risk && i.risk.safe_buy < i.buy ? i.risk.safe_buy : i.buy]));

    const draw = () => {
      const list =
        filter === 'beli' ? d.items.filter((i) => i.status === 'beli') : filter === 'risiko' ? d.items.filter((i) => i.risk).sort((a, b) => b.risk.ratio - a.risk.ratio) : d.items;
      const cost = d.items.filter((i) => picked.has(i.id)).reduce((s, i) => s + (amount.get(i.id) || 0) * i.price, 0);
      const risky = d.items.filter((i) => i.risk);
      el.innerHTML = html`<div class="stack">
        <div class="grid grid-3">
          <div class="card kpi"><span class="label"><span class="ico">${icon('cart')}</span>Perlu dibeli</span><span class="value">${d.items.filter((i) => i.status === 'beli').length} bahan</span><span class="sub">Kebutuhan forecast − stok yang masih layak pakai</span></div>
          <div class="card kpi"><span class="label"><span class="ico" style="background:var(--high-bg);color:var(--high)">${icon('flame')}</span>Berisiko terbuang</span><span class="value">${risky.length} bahan</span><span class="sub">Potensi rugi ${rupiah(risky.reduce((s, i) => s + i.risk.waste_value, 0))}</span></div>
          <div class="card kpi"><span class="label"><span class="ico">${icon('wallet')}</span>Rencana belanja</span><span class="value">${rupiah(cost)}</span><span class="sub">${picked.size} bahan dipilih</span></div>
        </div>

        <div class="row-between wrap">
          <div class="chips">${[
            ['beli', `Perlu dibeli (${d.items.filter((i) => i.status === 'beli').length})`],
            ['risiko', `Waste Risk (${risky.length})`],
            ['semua', `Semua bahan (${d.items.length})`],
          ].map(([v, l]) => html`<button class="chip ${filter === v ? 'active' : ''}" data-f="${v}">${l}</button>`)}</div>
          <button class="btn" id="buy" ${picked.size ? '' : 'disabled'}>${icon('check')}Tandai sudah dibeli (${picked.size})</button>
        </div>

        ${list.length
          ? html`<div class="grid grid-2">${list.map(card)}</div>`
          : emptyState(filter === 'risiko' ? 'shield' : 'check', filter === 'risiko' ? 'Tidak ada stok berlebih' : 'Stok mencukupi', filter === 'risiko' ? 'Semua bahan diperkirakan habis terpakai sebelum kedaluwarsa.' : 'Belum ada bahan yang perlu dibeli untuk periode berikutnya.')}

        <div class="callout info">${icon('info')}<div><b>Cara membaca:</b> kebutuhan ditampilkan sebagai rentang (bukan angka tunggal) agar terlihat tingkat ketidakpastiannya. Waste Risk Score membandingkan stok + rencana beli dengan perkiraan pemakaian sebelum tanggal kedaluwarsa tiap batch: <b>rendah</b> &lt;10%, <b>sedang</b> 10–30%, <b>tinggi</b> &gt;30% berpotensi terbuang.</div></div>
      </div>`;

      el.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => ((filter = b.dataset.f), draw())));
      el.querySelectorAll('[data-pick]').forEach(
        (c) =>
          (c.onchange = () => {
            c.checked ? picked.add(+c.dataset.pick) : picked.delete(+c.dataset.pick);
            draw();
          })
      );
      el.querySelectorAll('[data-amt]').forEach(
        (inp) =>
          (inp.onchange = () => {
            const v = Math.max(0, Number(String(inp.value).replace(',', '.')) || 0);
            amount.set(+inp.dataset.amt, v);
            if (v > 0) picked.add(+inp.dataset.amt);
            else picked.delete(+inp.dataset.amt);
            draw();
          })
      );
      el.querySelector('#buy').onclick = confirmBuy;
    };

    const card = (i) => {
      const lvl = i.risk?.level;
      return html`<div class="card stack-sm risk-card ${lvl || ''}">
        <div class="row-between" style="align-items:flex-start">
          <div class="grow"><h3>${i.name}</h3><div class="row wrap" style="gap:6px;margin-top:6px">${categoryBadge(i.category)}<span class="badge">${i.period_label}</span></div></div>
          ${riskBadge(lvl)}
        </div>
        <div class="grid" style="grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:6px">
          <div class="portion"><small>Kebutuhan</small><b style="font-size:16px">${number(i.need_lo)}–${number(i.need_hi)}</b><small>${i.unit}</small></div>
          <div class="portion"><small>Stok layak pakai</small><b style="font-size:16px">${number(i.stock_start)}</b><small>${i.unit} ${i.days_cover != null ? `· ±${number(i.days_cover)} hari` : ''}</small></div>
          <div class="portion" style="background:${i.buy > 0 ? 'var(--brand-50)' : 'var(--surface-2)'}"><small>Saran beli</small><b style="font-size:16px;color:${i.buy > 0 ? 'var(--brand-700)' : 'inherit'}">${i.buy > 0 ? `${number(i.buy_lo)}–${number(i.buy_hi)}` : '0'}</b><small>${i.unit}</small></div>
        </div>
        ${i.risk
          ? html`<div class="stack-sm" style="margin-top:4px">
              <div class="row-between small"><span>Waste Risk Score</span><b>${pct(i.risk.ratio)} berpotensi terbuang</b></div>
              <div class="meter ${lvl}"><i></i><i></i><i></i></div>
              <div class="callout ${lvl === 'tinggi' ? 'danger' : 'warn'}" style="padding:10px 12px">${icon('alert')}<div>±${qty(i.risk.waste_qty, i.unit)} (${rupiah(i.risk.waste_value)}) diperkirakan terbuang${i.risk.first_date ? ` mulai ${dateMed(i.risk.first_date)}` : ''}. ${i.risk.message}</div></div>
            </div>`
          : ''}
        ${i.buy > 0 || picked.has(i.id)
          ? html`<div class="row-between wrap" style="margin-top:6px;padding-top:10px;border-top:1px solid var(--border)">
              <label class="row small" style="cursor:pointer"><input type="checkbox" data-pick="${i.id}" ${picked.has(i.id) ? 'checked' : ''} style="width:18px;height:18px;accent-color:var(--brand)" />Masukkan ke daftar belanja</label>
              <div class="row"><div class="input-group" style="width:130px"><input class="input" data-amt="${i.id}" inputmode="decimal" value="${amount.get(i.id)}" style="height:38px" /><span class="suffix">${i.unit}</span></div>
                <span class="small muted nowrap">${rupiah((amount.get(i.id) || 0) * i.price)}</span></div>
            </div>`
          : ''}
      </div>`;
    };

    const confirmBuy = async () => {
      const items = d.items.filter((i) => picked.has(i.id) && amount.get(i.id) > 0);
      if (!items.length) return toast('Pilih bahan yang dibeli.', 'error');
      const total = items.reduce((s, i) => s + amount.get(i.id) * i.price, 0);
      await modal({
        title: 'Catat pembelian',
        body: html`<div class="stack-sm">
          <p class="muted small">Stok masuk dicatat hari ini dengan harga per satuan bahan. Tanggal kedaluwarsa dihitung dari umur simpan masing-masing bahan.</p>
          <div class="list">${items.map((i) => html`<div class="list-item"><span class="grow">${i.name}</span><b class="num">${qty(amount.get(i.id), i.unit)}</b><span class="small muted num" style="width:110px;text-align:right">${rupiah(amount.get(i.id) * i.price)}</span></div>`)}</div>
          <div class="row-between"><b>Total</b><b class="num">${rupiah(total)}</b></div>
        </div>`,
        actions: [
          { label: 'Batal', cls: 'btn-secondary' },
          {
            label: 'Simpan stok masuk',
            onClick: async () => {
              await api('/stock/in', { method: 'POST', body: { items: items.map((i) => ({ ingredient_id: i.id, qty: amount.get(i.id), source: 'rekomendasi' })) } });
              toast(`${items.length} bahan masuk ke stok`);
              ctx.go('/bahan');
            },
          },
        ],
      });
    };

    draw();
  },
};
