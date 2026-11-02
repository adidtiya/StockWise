import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ARTIFACTS_DIR = path.resolve('tests/e2e/artifacts');
const USER_DATA_DIR = '/tmp/stockwise_ui_audit_' + Date.now();
const UI_CHECK_CODE = fs.readFileSync('tests/e2e/ui_check.js', 'utf8');

fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let frontendProc = null;

async function ensureFrontendServer() {
  try {
    const res = await fetch('http://localhost:5173/index.html');
    if (res.ok) {
      console.log('Frontend server is already running on port 5173.');
      return;
    }
  } catch {}

  console.log('Starting frontend server on port 5173...');
  frontendProc = spawn('node', ['tests/e2e/serve_frontend.mjs'], { stdio: 'inherit' });
  await sleep(1500);
}

async function main() {
  await ensureFrontendServer();

  console.log('Launching Chrome...');
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9253',
    `--user-data-dir=${USER_DATA_DIR}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--window-size=1280,960',
  ], { stdio: 'ignore' });

  const cleanup = () => {
    try { chrome.kill(); } catch {}
    if (frontendProc) {
      try { frontendProc.kill(); } catch {}
    }
    try { fs.rmSync(USER_DATA_DIR, { recursive: true, force: true }); } catch {}
  };
  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(); });

  let pageWsUrl = null;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9253/json/list');
      const list = await res.json();
      const page = list.find((t) => t.type === 'page') || list[0];
      if (page && page.webSocketDebuggerUrl) {
        pageWsUrl = page.webSocketDebuggerUrl;
        break;
      }
    } catch {}
    await sleep(200);
  }

  if (!pageWsUrl) throw new Error('Could not find active target on Chrome port 9253');
  console.log('Connected to CDP at:', pageWsUrl);

  const ws = new WebSocket(pageWsUrl);
  await new Promise((r) => (ws.onopen = r));

  let idSeq = 1;
  const pending = new Map();
  const eventHandlers = new Map();

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    } else if (msg.method) {
      const handlers = eventHandlers.get(msg.method) || [];
      handlers.forEach((h) => h(msg.params));
    }
  };

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = idSeq++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });

  const onEvent = (method, fn) => {
    if (!eventHandlers.has(method)) eventHandlers.set(method, []);
    eventHandlers.get(method).push(fn);
  };

  const consoleLogs = [];
  const networkErrors = [];

  onEvent('Runtime.consoleAPICalled', (params) => {
    const txt = params.args.map((a) => a.value || a.description || JSON.stringify(a)).join(' ');
    consoleLogs.push({ type: params.type, text: txt, time: Date.now() });
    if (params.type === 'error') {
      console.log(' [CONSOLE ERROR]', txt);
    }
  });

  onEvent('Network.responseReceived', (params) => {
    const status = params.response.status;
    if (status >= 400) {
      networkErrors.push({
        url: params.response.url,
        status: status,
        statusText: params.response.statusText,
        time: Date.now(),
      });
      console.log(` [NETWORK ERROR ${status}]`, params.response.url);
    }
  });

  await send('Page.enable');
  await send('DOM.enable');
  await send('Runtime.enable');
  await send('Network.enable');

  const evalJs = async (expr) => {
    const res = await send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error('JS Error: ' + (res.exceptionDetails.exception?.description || res.exceptionDetails.text));
    }
    return res.result?.value;
  };

  const waitForSelector = async (selector, timeoutMs = 15000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const exists = await evalJs(`!!document.querySelector('${selector}')`);
        if (exists) return true;
      } catch {}
      await sleep(150);
    }
    throw new Error(`Timeout waiting for selector: ${selector}`);
  };

  const takeScreenshot = async (filename) => {
    const filepath = path.join(ARTIFACTS_DIR, filename);
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(filepath, Buffer.from(data, 'base64'));
    console.log(`  Saved screenshot: ${filename}`);
    return filename;
  };

  const setViewport = async (width, height = 900) => {
    const mobile = width <= 768;
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile,
    });
    await sleep(300);
  };

  const runUiCheckInPage = async () => {
    const findings = await evalJs(`
      (() => {
        ${UI_CHECK_CODE}
        return runUiCheck();
      })()
    `);
    return findings || [];
  };

  const setFileInput = async (selector, filePath) => {
    const { root } = await send('DOM.getDocument', { depth: -1 });
    const { nodeId } = await send('DOM.querySelector', {
      nodeId: root.nodeId,
      selector,
    });
    if (!nodeId) throw new Error(`Could not find selector: ${selector}`);
    await send('DOM.setFileInputFiles', {
      nodeId,
      files: [filePath],
    });
  };

  const auditRecords = [];

  const recordAudit = (page, width, findings, shot) => {
    auditRecords.push({ page, width, findings, shot });
    console.log(`[AUDIT] ${page} @ ${width}px -> ${findings.length} findings, shot: ${shot}`);
  };

  console.log('\n=== AUDIT TAHAP 1: Halaman Publik (Belum Login) ===');
  const publicPages = [
    { name: 'onboarding', hash: '#/onboarding', selector: '.onb-slide' },
    { name: 'login', hash: '#/login', selector: '#form' },
    { name: 'register', hash: '#/register', selector: '#name' },
  ];

  for (const p of publicPages) {
    for (const w of [1280, 768, 390]) {
      await setViewport(w, w === 390 ? 844 : 900);
      await send('Page.navigate', { url: `http://localhost:5173/${p.hash}` });
      await sleep(1000);
      await waitForSelector(p.selector);
      await sleep(500);

      const shot = `t91_${p.name}_${w}.png`;
      await takeScreenshot(shot);
      const findings = await runUiCheckInPage();
      recordAudit(p.name, w, findings, shot);
    }
  }

  console.log('\n=== AUDIT TAHAP 2: Registrasi & Seeding Akun A ===');
  const akunaEmail = `akuna_${Date.now()}@stockwise.id`;
  const password = 'Password123!';

  await setViewport(1280, 900);
  await send('Page.navigate', { url: 'http://localhost:5173/#/register' });
  await sleep(1000);
  await waitForSelector('#name');

  // Step 0: User info
  await evalJs(`(() => {
    document.querySelector('#name').value = 'Budi Santoso Uji A';
    document.querySelector('#email').value = '${akunaEmail}';
    document.querySelector('#phone').value = '081234567891';
    document.querySelector('#password').value = '${password}';
    document.querySelector('#form button[type=submit]').click();
  })()`);

  // Step 1: Business info
  await waitForSelector('#business_name');
  await evalJs(`(() => {
    document.querySelector('#business_name').value = 'Dapur Katering Uji A';
    document.querySelector('#city').value = 'Jakarta';
    const rad = document.querySelector('input[name=business_type][value=katering]');
    if (rad) rad.checked = true;
    document.querySelector('#form button[type=submit]').click();
  })()`);

  // Step 2: Seed option (no demo)
  await waitForSelector('input[name=seed_demo]');
  await evalJs(`(() => {
    const seed = document.querySelector('input[name=seed_demo]');
    if (seed) seed.checked = false;
    document.querySelector('#form button[type=submit]').click();
  })()`);

  await waitForSelector('#sidebar-user', 15000);
  console.log('Akun A registered successfully:', akunaEmail);

  // Seeding master data via API in browser context
  console.log('Seeding 5 bahan baku + batch stok untuk Akun A...');
  const seedResult = await evalJs(`
    (async () => {
      const { api } = await import('/js/api.js');

      // 1. Bahan Baku 1: Daging Ayam Broiler (segar, 3 hari, stok 50 kg)
      const ing1 = await api('/ingredients', {
        method: 'POST',
        body: JSON.stringify({ name: 'Daging Ayam Broiler', unit: 'kg', price: 38000, shelf_life_days: 3, min_stock: 10, category: 'segar' })
      });
      await api('/batches', {
        method: 'POST',
        body: JSON.stringify({ ingredient_id: ing1.id, qty: 50, unit_price: 38000, received_date: '2026-10-25', expiry_date: '2026-11-05', source: 'beli' })
      });

      // 2. Bahan Baku 2: Cabai Rawit Merah (segar, 5 hari, stok 15 kg)
      const ing2 = await api('/ingredients', {
        method: 'POST',
        body: JSON.stringify({ name: 'Cabai Rawit Merah', unit: 'kg', price: 45000, shelf_life_days: 5, min_stock: 5, category: 'segar' })
      });
      await api('/batches', {
        method: 'POST',
        body: JSON.stringify({ ingredient_id: ing2.id, qty: 15, unit_price: 45000, received_date: '2026-10-25', expiry_date: '2026-11-08', source: 'beli' })
      });

      // 3. Bahan Baku 3: Bawang Merah (tahan_lama, 30 hari, stok 20 kg)
      const ing3 = await api('/ingredients', {
        method: 'POST',
        body: JSON.stringify({ name: 'Bawang Merah', unit: 'kg', price: 35000, shelf_life_days: 30, min_stock: 5, category: 'tahan_lama' })
      });
      await api('/batches', {
        method: 'POST',
        body: JSON.stringify({ ingredient_id: ing3.id, qty: 20, unit_price: 35000, received_date: '2026-10-20', expiry_date: '2026-11-20', source: 'beli' })
      });

      // 4. Bahan Baku 4: Beras Putih Premium (tahan_lama, 90 hari, stok 100 kg)
      const ing4 = await api('/ingredients', {
        method: 'POST',
        body: JSON.stringify({ name: 'Beras Putih Premium', unit: 'kg', price: 14000, shelf_life_days: 90, min_stock: 20, category: 'tahan_lama' })
      });
      await api('/batches', {
        method: 'POST',
        body: JSON.stringify({ ingredient_id: ing4.id, qty: 100, unit_price: 14000, received_date: '2026-10-15', expiry_date: '2027-01-15', source: 'beli' })
      });

      // 5. Bahan Baku 5: Minyak Goreng (tahan_lama, 180 hari, stok 50 liter)
      const ing5 = await api('/ingredients', {
        method: 'POST',
        body: JSON.stringify({ name: 'Minyak Goreng', unit: 'liter', price: 18000, shelf_life_days: 180, min_stock: 10, category: 'tahan_lama' })
      });
      await api('/batches', {
        method: 'POST',
        body: JSON.stringify({ ingredient_id: ing5.id, qty: 50, unit_price: 18000, received_date: '2026-10-10', expiry_date: '2027-04-10', source: 'beli' })
      });

      // 3 Menu & Resep
      // Menu 1: Ayam Geprek Sambal Korek E2E (Cocok dengan fixtures valid_sales_28d.xlsx!)
      const p1 = await api('/products', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Ayam Geprek Sambal Korek E2E',
          price: 25000,
          recipes: [
            { ingredient_id: ing1.id, qty: 0.25 },
            { ingredient_id: ing2.id, qty: 0.03 },
            { ingredient_id: ing5.id, qty: 0.05 }
          ]
        })
      });

      // Menu 2: Nasi Ayam Bakar
      const p2 = await api('/products', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Nasi Ayam Bakar',
          price: 28000,
          recipes: [
            { ingredient_id: ing1.id, qty: 0.25 },
            { ingredient_id: ing4.id, qty: 0.15 }
          ]
        })
      });

      // Menu 3: Nasi Goreng Spesial
      const p3 = await api('/products', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Nasi Goreng Spesial',
          price: 20000,
          recipes: [
            { ingredient_id: ing4.id, qty: 0.15 },
            { ingredient_id: ing5.id, qty: 0.05 },
            { ingredient_id: ing3.id, qty: 0.02 }
          ]
        })
      });

      // 2 Events
      await api('/events', {
        method: 'POST',
        body: JSON.stringify({ name: 'Tanggal Gajian', date: '2026-10-25', impact: 1.3, category: 'gajian' })
      });
      await api('/events', {
        method: 'POST',
        body: JSON.stringify({ name: 'Promo Akhir Pekan', date: '2026-10-18', impact: 1.2, category: 'promo' })
      });

      return {
        ingredients: [ing1.id, ing2.id, ing3.id, ing4.id, ing5.id],
        products: [p1.id, p2.id, p3.id]
      };
    })()
  `);
  console.log('Seeded master data:', seedResult);

  // Upload valid 28-day Excel file
  console.log('Mengimpor riwayat penjualan 28 hari via Excel...');
  await send('Page.navigate', { url: 'http://localhost:5173/#/import' });
  await sleep(1000);
  await waitForSelector('#file');

  const validFile = path.resolve('tests/e2e/fixtures/valid_sales_28d.xlsx');
  await setFileInput('#file', validFile);
  await sleep(2500);

  const importResText = await evalJs(`
    (() => {
      const resEl = document.querySelector('#import-res') || document.querySelector('.toast');
      return resEl ? resEl.textContent : '';
    })()
  `);
  console.log('Import result:', importResText);

  // Train evaluation model so forecast & evaluation have active data
  try {
    await evalJs(`
      (async () => {
        const { api } = await import('/js/api.js');
        await api('/evaluation/train', { method: 'POST' }).catch(() => {});
      })()
    `);
    console.log('Model trained successfully.');
  } catch (err) {
    console.log('Model training notice:', err.message);
  }

  console.log('\n=== AUDIT TAHAP 3: 11 Halaman Authenticated Akun A (1280, 768, 390 px) ===');
  const authPages = [
    { name: 'dashboard', hash: '#/dashboard', wait: 1200 },
    { name: 'bahan', hash: '#/bahan', wait: 1000 },
    { name: 'menu', hash: '#/menu', wait: 1000 },
    { name: 'event', hash: '#/event', wait: 1000 },
    { name: 'penjualan', hash: '#/penjualan', wait: 1000 },
    { name: 'import', hash: '#/import', wait: 1000 },
    { name: 'riwayat', hash: '#/riwayat', wait: 1500 },
    { name: 'forecast', hash: '#/forecast', wait: 1500 },
    { name: 'rekomendasi', hash: '#/rekomendasi', wait: 1500 },
    { name: 'evaluasi', hash: '#/evaluasi', wait: 1500 },
    { name: 'langganan', hash: '#/langganan', wait: 1000 },
    { name: 'akun', hash: '#/akun', wait: 1000 },
  ];

  for (const p of authPages) {
    for (const w of [1280, 768, 390]) {
      await setViewport(w, w === 390 ? 844 : 900);
      await send('Page.navigate', { url: `http://localhost:5173/${p.hash}` });
      await sleep(p.wait);
      await sleep(500);

      const shot = `t91_${p.name}_${w}.png`;
      await takeScreenshot(shot);
      const findings = await runUiCheckInPage();
      recordAudit(p.name, w, findings, shot);
    }
  }

  console.log('\n=== AUDIT TAHAP 4: Modals pada Akun A (1280 px) ===');
  await setViewport(1280, 900);

  // Modal 1: Quick Actions (FAB)
  await send('Page.navigate', { url: 'http://localhost:5173/#/dashboard' });
  await sleep(1000);
  await evalJs('document.getElementById("fab")?.click()');
  await sleep(600);
  await takeScreenshot('t91_modal_quickactions_1280.png');
  let mFindings = await runUiCheckInPage();
  recordAudit('modal_quickactions', 1280, mFindings, 't91_modal_quickactions_1280.png');
  await evalJs('document.querySelector(".modal [data-close]")?.click(); document.querySelectorAll(".modal-backdrop").forEach(el => el.remove());');
  await sleep(400);

  // Modal 2: Tambah Bahan
  await send('Page.navigate', { url: 'http://localhost:5173/#/bahan' });
  await sleep(1000);
  await evalJs('document.getElementById("add-ing")?.click()');
  await sleep(600);
  await takeScreenshot('t91_modal_add_bahan_1280.png');
  mFindings = await runUiCheckInPage();
  recordAudit('modal_add_bahan', 1280, mFindings, 't91_modal_add_bahan_1280.png');
  await evalJs('document.querySelector(".modal [data-close]")?.click(); document.querySelectorAll(".modal-backdrop").forEach(el => el.remove());');
  await sleep(400);

  // Modal 3: Tambah Menu
  await send('Page.navigate', { url: 'http://localhost:5173/#/menu' });
  await sleep(1000);
  await evalJs('document.getElementById("add-prod")?.click()');
  await sleep(600);
  await takeScreenshot('t91_modal_add_menu_1280.png');
  mFindings = await runUiCheckInPage();
  recordAudit('modal_add_menu', 1280, mFindings, 't91_modal_add_menu_1280.png');
  await evalJs('document.querySelector(".modal [data-close]")?.click(); document.querySelectorAll(".modal-backdrop").forEach(el => el.remove());');
  await sleep(400);

  // Modal 4: Tambah Event
  await send('Page.navigate', { url: 'http://localhost:5173/#/event' });
  await sleep(1000);
  await evalJs('document.getElementById("add-event")?.click()');
  await sleep(600);
  await takeScreenshot('t91_modal_add_event_1280.png');
  mFindings = await runUiCheckInPage();
  recordAudit('modal_add_event', 1280, mFindings, 't91_modal_add_event_1280.png');
  await evalJs('document.querySelector(".modal [data-close]")?.click(); document.querySelectorAll(".modal-backdrop").forEach(el => el.remove());');
  await sleep(400);

  // Modal 5: Feedback
  await send('Page.navigate', { url: 'http://localhost:5173/#/feedback' });
  await sleep(1000);
  await evalJs('document.getElementById("open-feedback-modal")?.click()');
  await sleep(600);
  await takeScreenshot('t91_modal_feedback_1280.png');
  mFindings = await runUiCheckInPage();
  recordAudit('modal_feedback', 1280, mFindings, 't91_modal_feedback_1280.png');
  await evalJs('document.querySelector(".modal [data-close]")?.click(); document.querySelectorAll(".modal-backdrop").forEach(el => el.remove());');
  await sleep(400);

  console.log('\n=== AUDIT TAHAP 5: Registrasi & Audit Akun B (Empty State) ===');
  console.log('Menunggu jeda 12 detik agar terhindar dari rate limit...');
  await sleep(12000);

  // Logout Akun A
  await evalJs(`
    (async () => {
      const { api } = await import('/js/api.js');
      await api('/auth/logout', { method: 'POST' }).catch(() => {});
      location.hash = '#/register';
    })()
  `);
  await sleep(1500);

  const akunbEmail = `akunb_${Date.now()}@stockwise.id`;
  console.log('Mendaftarkan Akun B (kosong):', akunbEmail);

  await setViewport(1280, 900);
  await send('Page.navigate', { url: 'http://localhost:5173/#/register' });
  await sleep(1000);
  await waitForSelector('#name');

  // Step 0
  await evalJs(`(() => {
    document.querySelector('#name').value = 'Siti Aminah Uji B';
    document.querySelector('#email').value = '${akunbEmail}';
    document.querySelector('#phone').value = '081234567892';
    document.querySelector('#password').value = '${password}';
    document.querySelector('#form button[type=submit]').click();
  })()`);

  // Step 1
  await waitForSelector('#business_name');
  await evalJs(`(() => {
    document.querySelector('#business_name').value = 'Warung Berkah Uji B';
    document.querySelector('#city').value = 'Bandung';
    const rad = document.querySelector('input[name=business_type][value=warung_makan]');
    if (rad) rad.checked = true;
    document.querySelector('#form button[type=submit]').click();
  })()`);

  // Step 2 (kosong, jangan seed demo!)
  await waitForSelector('input[name=seed_demo]');
  await evalJs(`(() => {
    const seed = document.querySelector('input[name=seed_demo]');
    if (seed) seed.checked = false;
    document.querySelector('#form button[type=submit]').click();
  })()`);

  await waitForSelector('#sidebar-user', 15000);
  console.log('Akun B registered successfully.');

  // Empty state pages to inspect:
  const emptyPages = [
    { name: 'dashboard', hash: '#/dashboard' },
    { name: 'bahan', hash: '#/bahan' },
    { name: 'menu', hash: '#/menu' },
    { name: 'riwayat', hash: '#/riwayat' },
    { name: 'forecast', hash: '#/forecast' },
    { name: 'rekomendasi', hash: '#/rekomendasi' },
    { name: 'evaluasi', hash: '#/evaluasi' },
  ];

  for (const p of emptyPages) {
    await setViewport(1280, 900);
    await send('Page.navigate', { url: `http://localhost:5173/${p.hash}` });
    await sleep(1500);

    const shot = `t91_empty_${p.name}_1280.png`;
    await takeScreenshot(shot);
    const findings = await runUiCheckInPage();
    recordAudit(`empty_${p.name}`, 1280, findings, shot);

    // Untuk Beranda (dashboard), periksa juga pada 768 dan 390 px untuk memeriksa checklist onboarding!
    if (p.name === 'dashboard') {
      for (const w of [768, 390]) {
        await setViewport(w, w === 390 ? 844 : 900);
        await sleep(500);
        const shotW = `t91_empty_dashboard_${w}.png`;
        await takeScreenshot(shotW);
        const findingsW = await runUiCheckInPage();
        recordAudit(`empty_dashboard`, w, findingsW, shotW);
      }
    }
  }

  // Khusus: Inspeksi mendalam elemen checklist onboarding di Beranda Akun B
  console.log('\n=== INSPEKSI MENDALAM: Checklist Onboarding di Beranda Akun B ===');
  await setViewport(1280, 900);
  await send('Page.navigate', { url: 'http://localhost:5173/#/dashboard' });
  await sleep(1500);

  const checklistDetail = await evalJs(`
    (() => {
      const toRect = r => r ? { width: Math.round(r.width), height: Math.round(r.height), left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom) } : null;
      const items = document.querySelectorAll('.list-item');
      return Array.from(items).map((item, idx) => {
        const avatar = item.querySelector('.avatar');
        const grow = item.querySelector('.grow');
        const title = item.querySelector('.title');
        const meta = item.querySelector('.meta');
        const chevron = item.querySelector('svg:last-child');
        
        return {
          idx,
          itemRect: toRect(item ? item.getBoundingClientRect() : null),
          avatarRect: toRect(avatar ? avatar.getBoundingClientRect() : null),
          growRect: toRect(grow ? grow.getBoundingClientRect() : null),
          growStyle: grow ? {
            flex: window.getComputedStyle(grow).flex,
            minWidth: window.getComputedStyle(grow).minWidth,
            width: window.getComputedStyle(grow).width,
          } : null,
          titleText: title ? title.textContent : null,
          metaText: meta ? meta.textContent : null,
          metaRect: toRect(meta ? meta.getBoundingClientRect() : null),
          metaStyle: meta ? {
            width: window.getComputedStyle(meta).width,
            whiteSpace: window.getComputedStyle(meta).whiteSpace,
          } : null,
          chevronRect: toRect(chevron ? chevron.getBoundingClientRect() : null),
          chevronAttrs: chevron ? {
            class: chevron.getAttribute('class'),
            viewBox: chevron.getAttribute('viewBox'),
            width: chevron.getAttribute('width'),
            height: chevron.getAttribute('height'),
          } : null,
          chevronComputed: chevron ? {
            display: window.getComputedStyle(chevron).display,
            width: window.getComputedStyle(chevron).width,
            height: window.getComputedStyle(chevron).height,
            flex: window.getComputedStyle(chevron).flex,
          } : null,
        };
      });
    })()
  `);
  console.log('Checklist detailed inspection:', JSON.stringify(checklistDetail, null, 2));

  // Save audit results to JSON for docs/UI_AUDIT.md generation
  const summary = {
    totalAudited: auditRecords.length,
    records: auditRecords,
    consoleLogs,
    networkErrors,
    checklistDetail,
  };
  fs.writeFileSync('tests/e2e/artifacts/audit_data.json', JSON.stringify(summary, null, 2));
  console.log('\nAudit complete! Raw data saved to tests/e2e/artifacts/audit_data.json');
  cleanup();
  process.exit(0);
}

main().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
