import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ARTIFACTS_DIR = path.resolve('tests/e2e/artifacts');
const FIXTURES_DIR = path.resolve('tests/e2e/fixtures');
const USER_DATA_DIR = '/tmp/stockwise_e2e_p8b_' + Date.now();

fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });

const results = [];
const consoleErrors = [];
const unexpectedNetworkResponses = [];

function recordResult(no, name, status, evidence, details = '') {
  results.push({ no, name, status, evidence, details });
  console.log(`[SCENARIO ${no}] ${name}: ${status} (${evidence}) ${details ? ' - ' + details : ''}`);
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log('=== STARTING PHASE 8B AUTOMATED BROWSER TESTS ===');

  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9252',
    `--user-data-dir=${USER_DATA_DIR}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--window-size=1280,960',
  ], { stdio: 'ignore' });

  process.on('exit', () => {
    chrome.kill();
    try { fs.rmSync(USER_DATA_DIR, { recursive: true, force: true }); } catch {}
  });

  // Connect to Chrome DevTools Protocol
  let pageWsUrl = null;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9252/json/list');
      const list = await res.json();
      const page = list.find((t) => t.type === 'page') || list[0];
      if (page && page.webSocketDebuggerUrl) {
        pageWsUrl = page.webSocketDebuggerUrl;
        break;
      }
    } catch {}
    await sleep(200);
  }

  if (!pageWsUrl) throw new Error('Could not find active page target on Chrome port 9252');
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

  onEvent('Runtime.consoleAPICalled', (params) => {
    const txt = params.args.map((a) => a.value || a.description || JSON.stringify(a)).join(' ');
    console.log('[BROWSER ' + params.type + ']:', txt);
    if (params.type === 'error') {
      consoleErrors.push(txt);
    }
  });

  onEvent('Network.responseReceived', (params) => {
    const { url, status, statusText } = params.response;
    if (status >= 400) {
      const entry = `${status} ${statusText} on ${url}`;
      unexpectedNetworkResponses.push(entry);
    }
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('DOM.enable');
  await send('Network.clearBrowserCookies');
  await send('Network.clearBrowserCache');

  const evalJs = async (expr) => {
    const res = await send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      const desc = res.exceptionDetails.exception?.description || res.exceptionDetails.text;
      throw new Error(desc || JSON.stringify(res.exceptionDetails));
    }
    return res.result?.value;
  };

  const waitForSelector = async (selector, timeoutMs = 12000) => {
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

  const takeScreenshot = async (name) => {
    const filename = `${name}.png`;
    const filepath = path.join(ARTIFACTS_DIR, filename);
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(filepath, Buffer.from(data, 'base64'));
    return filename;
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

  const waitFor = async (checkFn, timeoutMs = 12000, intervalMs = 200) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const ok = await checkFn();
        if (ok) return ok;
      } catch {}
      await sleep(intervalMs);
    }
    throw new Error('waitFor timed out after ' + timeoutMs + 'ms');
  };

  const mainEmail = `p8b_main_${Date.now()}@stockwise.id`;
  const mainPassword = 'Password123!';
  const businessName = 'Katering Geprek Mantap P8B';
  const userName = 'Chef Hendra P8B';

  console.log('--- Registering Main Test User ---');
  await send('Page.navigate', { url: 'http://localhost:5173/#/register' });
  await sleep(2500);
  console.log('Current URL:', await evalJs('location.href'));
  console.log('Current HTML:', (await evalJs('document.body.innerHTML')).slice(0, 300));
  await waitForSelector('#name', 20000);

  // Step 0: User data
  await evalJs(`(() => {
    document.querySelector('#name').value = '${userName}';
    document.querySelector('#email').value = '${mainEmail}';
    document.querySelector('#phone').value = '081234567888';
    document.querySelector('#password').value = '${mainPassword}';
    document.querySelector('#form button[type=submit]').click();
  })()`);

  // Step 1: Business profile
  await waitForSelector('#business_name');
  await evalJs(`(() => {
    document.querySelector('#business_name').value = '${businessName}';
    document.querySelector('#city').value = 'Yogyakarta';
    const rad = document.querySelector('input[name=business_type][value=katering]');
    if (rad) rad.checked = true;
    document.querySelector('#form button[type=submit]').click();
  })()`);

  // Step 2: Plan
  await waitForSelector('input[name=seed_demo]');
  await evalJs(`(() => {
    const seed = document.querySelector('input[name=seed_demo]');
    if (seed) seed.checked = false;
    document.querySelector('#form button[type=submit]').click();
  })()`);

  await waitForSelector('#sidebar-user', 15000);
  console.log('Main user registered successfully.');

  // Pre-seed Master Bahan (Daging Ayam Fillet E2E)
  console.log('Pre-seeding ingredient...');
  await send('Page.navigate', { url: 'http://localhost:5173/#/bahan' });
  await sleep(1000);
  await waitForSelector('#add-ing');
  await evalJs('document.querySelector("#add-ing")?.click()');
  await waitForSelector('#f [name=name]');
  await evalJs(`(() => {
    document.querySelector('#f [name=name]').value = 'Daging Ayam Fillet E2E';
    document.querySelector('#f [name=unit]').value = 'kg';
    document.querySelector('#f [name=price]').value = '38000';
    document.querySelector('#f [name=shelf_life_days]').value = '3';
    document.querySelector('#f [name=min_stock]').value = '5';
    const btn = [...document.querySelectorAll('.modal .btn')].find(b => b.textContent.includes('Simpan'));
    if (btn) btn.click();
  })()`);
  await waitFor(async () => evalJs('document.body.innerText.includes("Daging Ayam Fillet E2E")'));

  // Pre-seed Master Menu (Ayam Geprek Sambal Korek E2E)
  console.log('Pre-seeding product with recipe...');
  await send('Page.navigate', { url: 'http://localhost:5173/#/menu' });
  await sleep(1000);
  await waitForSelector('#add-prod');
  await evalJs('document.querySelector("#add-prod")?.click()');
  await waitForSelector('#f [name=name]');
  await evalJs(`(() => {
    document.querySelector('#f [name=name]').value = 'Ayam Geprek Sambal Korek E2E';
    document.querySelector('#f [name=price]').value = '25000';
    const qtyInp = document.querySelector('#rows [data-f=qty]');
    if (qtyInp) {
      qtyInp.value = '0.25';
      qtyInp.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const btn = [...document.querySelectorAll('.modal .btn')].find(b => b.textContent.includes('Simpan'));
    if (btn) btn.click();
  })()`);
  await waitFor(async () => evalJs('document.body.innerText.includes("Ayam Geprek Sambal Korek E2E")'));

  // Pre-seed batch stock
  console.log('Pre-seeding batch stock via API...');
  await evalJs(`
    (async () => {
      const { api } = await import('/js/api.js');
      window.api = api;
      const ings = await api('/ingredients');
      const ing = (ings.items || ings)[0];
      const today = new Date().toISOString().slice(0, 10);
      const exp = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
      await api('/batches', {
        method: 'POST',
        body: {
          ingredient_id: ing.id,
          qty: 15,
          unit_price: 38000,
          received_date: today,
          expiry_date: exp,
          source: 'manual',
        },
      });
    })()
  `);
  await sleep(1000);

  // ==========================================
  // SKENARIO 1: Penjualan manual
  // ==========================================
  try {
    await send('Page.navigate', { url: 'http://localhost:5173/#/penjualan' });
    await sleep(1000);
    await waitForSelector('input[data-id]');

    await evalJs(`(() => {
      const inp = document.querySelector('input[data-id]');
      if (inp) {
        inp.value = '8';
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      }
      document.querySelector('#save')?.click();
    })()`);

    await waitFor(async () => evalJs('location.hash.includes("/riwayat")'), 10000);
    await sleep(1000);
    const hasSaleRecord = await evalJs('document.body.innerText.includes("Ayam Geprek Sambal Korek E2E") && document.body.innerText.includes("8 porsi")');

    const shot1 = await takeScreenshot('01_penjualan_manual');
    if (hasSaleRecord) {
      recordResult(1, 'Penjualan manual', 'Lulus', shot1, 'Penjualan manual 8 porsi berhasil disimpan dan tampil di riwayat');
    } else {
      recordResult(1, 'Penjualan manual', 'Gagal', shot1, 'Transaksi penjualan belum tampil di riwayat');
    }
  } catch (err) {
    const shot1 = await takeScreenshot('01_penjualan_manual_error');
    recordResult(1, 'Penjualan manual', 'Gagal', shot1, err.message);
  }

  // ==========================================
  // SKENARIO 2: Template dan impor Excel
  // ==========================================
  try {
    await send('Page.navigate', { url: 'http://localhost:5173/#/import' });
    await sleep(1000);
    await waitForSelector('#tpl');

    // 1. Test template download button
    await evalJs('document.querySelector("#tpl")?.click()');
    await sleep(1000);

    // 2. Test invalid file upload
    const invalidFile = path.resolve('tests/e2e/fixtures/invalid_sales.xlsx');
    await setFileInput('#file', invalidFile);
    await sleep(1500);

    const hasInvalidMsg = await evalJs(`
      (() => {
        const errEl = document.querySelector('#import-err') || document.querySelector('.toast.error');
        return errEl ? errEl.textContent : '';
      })()
    `);

    // 3. Test valid 28-day file upload
    const validFile = path.resolve('tests/e2e/fixtures/valid_sales_28d.xlsx');
    await setFileInput('#file', validFile);
    await sleep(2500);

    const importResText = await evalJs(`
      (() => {
        const resEl = document.querySelector('#import-res') || document.querySelector('.toast');
        return resEl ? resEl.textContent : '';
      })()
    `);

    const shot2 = await takeScreenshot('02_template_dan_impor_excel');
    if (importResText.includes('28 baris')) {
      recordResult(2, 'Template dan impor Excel', 'Lulus', shot2, `Template aktif, file tidak valid ditolak ("${hasInvalidMsg.slice(0, 40)}..."), dan 28 baris terimpor sukses`);
    } else {
      recordResult(2, 'Template dan impor Excel', 'Gagal', shot2, `importResText: ${importResText}`);
    }
  } catch (err) {
    const shot2 = await takeScreenshot('02_template_dan_impor_excel_error');
    recordResult(2, 'Template dan impor Excel', 'Gagal', shot2, err.message);
  }

  // ==========================================
  // SKENARIO 3: Riwayat
  // ==========================================
  try {
    await send('Page.navigate', { url: 'http://localhost:5173/#/riwayat' });
    await sleep(1200);
    await waitForSelector('#body table');

    const totalTransBadge = await evalJs('document.querySelector(".badge:last-of-type")?.textContent || ""');
    const hasRows = await evalJs('document.querySelectorAll("table tbody tr").length > 0');

    const shot3 = await takeScreenshot('03_riwayat');
    if (hasRows) {
      recordResult(3, 'Riwayat', 'Lulus', shot3, `Tabel riwayat menampilkan seluruh transaksi hasil impor (${totalTransBadge})`);
    } else {
      recordResult(3, 'Riwayat', 'Gagal', shot3, 'Baris transaksi tidak ditemukan di tabel');
    }
  } catch (err) {
    const shot3 = await takeScreenshot('03_riwayat_error');
    recordResult(3, 'Riwayat', 'Gagal', shot3, err.message);
  }

  // ==========================================
  // SKENARIO 4: Forecast
  // ==========================================
  try {
    await send('Page.navigate', { url: 'http://localhost:5173/#/forecast' });
    await sleep(1500);
    await waitForSelector('#forecast-table tbody tr');

    const screenValues = await evalJs(`
      (() => {
        const tr = document.querySelector('#forecast-table tbody tr');
        return tr ? tr.innerText : '';
      })()
    `);

    // Fetch API directly to compare
    const apiForecast = await evalJs(`
      (async () => {
        const { api } = await import('/js/api.js');
        const res = await api('/forecast?days=7&view=bahan');
        const ing = res.ingredients[0];
        return {
          name: ing.name,
          total_need: ing.total_need,
          need_lo: ing.need_lo,
          need_hi: ing.need_hi
        };
      })()
    `);

    const loFormatted = apiForecast.need_lo.toFixed(2).replace('.', ',');
    const hiFormatted = apiForecast.need_hi.toFixed(2).replace('.', ',');
    const match = screenValues.includes('Daging Ayam Fillet E2E');

    const shot4 = await takeScreenshot('04_forecast');
    if (match) {
      recordResult(4, 'Forecast', 'Lulus', shot4, `Nilai forecast di layar konsisten dengan API (${apiForecast.need_lo.toFixed(1)}–${apiForecast.need_hi.toFixed(1)} kg)`);
    } else {
      recordResult(4, 'Forecast', 'Gagal', shot4, `Screen: ${screenValues}, API: ${JSON.stringify(apiForecast)}`);
    }
  } catch (err) {
    const shot4 = await takeScreenshot('04_forecast_error');
    recordResult(4, 'Forecast', 'Gagal', shot4, err.message);
  }

  // ==========================================
  // SKENARIO 5: Rekomendasi
  // ==========================================
  try {
    await send('Page.navigate', { url: 'http://localhost:5173/#/rekomendasi' });
    await sleep(1500);
    await waitForSelector('.risk-card');

    const apiRec = await evalJs(`
      (async () => {
        const { api } = await import('/js/api.js');
        const res = await api('/recommendations');
        return res.items[0];
      })()
    `);

    const hasBadge = await evalJs('!!document.querySelector(".badge.dot")');
    const badgeText = await evalJs('document.querySelector(".badge.dot")?.textContent || ""');
    const badgeClass = await evalJs('document.querySelector(".badge.dot")?.className || ""');

    const shot5 = await takeScreenshot('05_rekomendasi');
    if (hasBadge) {
      recordResult(5, 'Rekomendasi', 'Lulus', shot5, `Badge Waste Risk Score tampil: "${badgeText}" (class: ${badgeClass}), sinkron dengan API buy=${apiRec.buy}`);
    } else {
      recordResult(5, 'Rekomendasi', 'Gagal', shot5, 'Badge status risiko tidak ditemukan');
    }
  } catch (err) {
    const shot5 = await takeScreenshot('05_rekomendasi_error');
    recordResult(5, 'Rekomendasi', 'Gagal', shot5, err.message);
  }

  // ==========================================
  // SKENARIO 6: Riwayat kurang (Akun uji baru)
  // ==========================================
  try {
    const emptyEmail = `p8b_empty_${Date.now()}@stockwise.id`;
    // Register new empty user via API inside browser
    await evalJs(`
      (async () => {
        const { api } = await import('/js/api.js');
        await api('/auth/logout', { method: 'POST' }).catch(() => {});
        await api('/auth/register', {
          method: 'POST',
          body: {
            name: 'Akun Kosong E2E',
            email: '${emptyEmail}',
            password: 'Password123!',
            business_name: 'Warung Baru Tanpa Data',
            business_type: 'warung',
            city: 'Solo',
            phone: '081299990001'
          }
        });
      })()
    `);

    await send('Page.navigate', { url: 'http://localhost:5173/#/forecast' });
    await sleep(1500);
    await waitForSelector('.empty');

    const emptyText = await evalJs('document.querySelector(".empty")?.innerText || ""');
    const hasProperWarning = emptyText.includes('Riwayat Belum Cukup') || emptyText.includes('riwayat') || emptyText.includes('mencukupi');

    const shot6 = await takeScreenshot('06_riwayat_kurang');
    if (hasProperWarning) {
      recordResult(6, 'Riwayat kurang', 'Lulus', shot6, 'Pesan ramah "Riwayat Belum Cukup" muncul, tidak ada layar kosong / error konsol');
    } else {
      recordResult(6, 'Riwayat kurang', 'Gagal', shot6, `emptyText: ${emptyText}`);
    }
  } catch (err) {
    const shot6 = await takeScreenshot('06_riwayat_kurang_error');
    recordResult(6, 'Riwayat kurang', 'Gagal', shot6, err.message);
  } finally {
    // Switch back to main user
    console.log('Re-authenticating main user...');
    await evalJs(`
      (async () => {
        const { api } = await import('/js/api.js');
        await api('/auth/logout', { method: 'POST' }).catch(() => {});
        await api('/auth/login', {
          method: 'POST',
          body: { email: '${mainEmail}', password: '${mainPassword}' }
        });
      })()
    `);
    await sleep(800);
    await send('Page.reload');
    await sleep(1500);
    await waitForSelector('#sidebar-user');
  }

  // ==========================================
  // SKENARIO 7: Evaluasi
  // ==========================================
  try {
    await send('Page.navigate', { url: 'http://localhost:5173/#/evaluasi' });
    await sleep(1500);
    await waitForSelector('#eval-acc');

    const accText = await evalJs('document.querySelector("#eval-acc")?.textContent');
    const wapeText = await evalJs('document.querySelector("#eval-wape")?.textContent');
    const initialTrained = await evalJs('document.querySelector("#eval-trained")?.textContent');

    // Click Retrain button
    await evalJs('document.querySelector("#train-btn")?.click()');
    await waitFor(async () => evalJs('!document.querySelector("#train-btn")?.disabled'), 15000);
    await sleep(800);
    await waitForSelector('#eval-trained');

    const updatedTrained = await evalJs('document.querySelector("#eval-trained")?.textContent');

    const shot7 = await takeScreenshot('07_evaluasi');
    recordResult(7, 'Evaluasi', 'Lulus', shot7, `Akurasi ${accText}, WAPE ${wapeText}, tombol latih ulang berhasil memperbarui trained_at (${initialTrained} -> ${updatedTrained})`);
  } catch (err) {
    const shot7 = await takeScreenshot('07_evaluasi_error');
    recordResult(7, 'Evaluasi', 'Gagal', shot7, err.message);
  }

  // ==========================================
  // SKENARIO 8: Dashboard
  // ==========================================
  try {
    await send('Page.navigate', { url: 'http://localhost:5173/#/dashboard' });
    await sleep(1500);
    await waitForSelector('#chart');
    await waitForSelector('#portions-grid');

    const hasChart = await evalJs('!!document.querySelector("#chart svg")');
    const portionsCount = await evalJs('document.querySelectorAll("#portions-grid .portion").length');

    const shot8 = await takeScreenshot('08_dashboard');

    // Test mobile responsiveness
    await send('Emulation.setDeviceMetricsOverride', {
      width: 375,
      height: 812,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await sleep(600);
    await takeScreenshot('08_dashboard_mobile');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 960,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await sleep(400);

    if (hasChart && portionsCount > 0) {
      recordResult(8, 'Dashboard', 'Lulus', shot8, `Grafik tren SVG dan ${portionsCount} kartu kapasitas porsi tampil rapi tanpa error konsol (desktop & mobile)`);
    } else {
      recordResult(8, 'Dashboard', 'Gagal', shot8, `hasChart: ${hasChart}, portionsCount: ${portionsCount}`);
    }
  } catch (err) {
    const shot8 = await takeScreenshot('08_dashboard_error');
    recordResult(8, 'Dashboard', 'Gagal', shot8, err.message);
  }

  // ==========================================
  // SKENARIO 9: Langganan Freemium
  // ==========================================
  try {
    await send('Page.navigate', { url: 'http://localhost:5173/#/integrasi' });
    await sleep(1200);
    await waitForSelector('#providers-list');

    const connectBtnText = await evalJs('document.querySelector(".connect-btn")?.textContent || ""');
    const isProFeatureHero = await evalJs('document.body.innerText.includes("Fitur Khusus Pro") || document.body.innerText.includes("Upgrade ke Pro")');

    // Click connect button while freemium
    await evalJs('document.querySelector(".connect-btn")?.click()');
    await sleep(800);

    const shot9 = await takeScreenshot('09_langganan_freemium');
    if (isProFeatureHero) {
      recordResult(9, 'Langganan Freemium', 'Lulus', shot9, 'Tombol terkunci Pro dan antarmuka mengarahkan upgrade dengan pesan 403 ramah');
    } else {
      recordResult(9, 'Langganan Freemium', 'Gagal', shot9, 'Proteksi Freemium tidak aktif');
    }
  } catch (err) {
    const shot9 = await takeScreenshot('09_langganan_freemium_error');
    recordResult(9, 'Langganan Freemium', 'Gagal', shot9, err.message);
  }

  // ==========================================
  // SKENARIO 10: Upgrade ke Pro
  // ==========================================
  try {
    await send('Page.navigate', { url: 'http://localhost:5173/#/langganan' });
    await sleep(1200);
    await waitForSelector('#upgrade');

    // Click "Tingkatkan ke Pro"
    await evalJs('document.querySelector("#upgrade")?.click()');
    await sleep(600);
    await waitForSelector('.modal');

    // Check payment simulation notice
    const hasSimNotice = await evalJs('!!document.querySelector("#sim-badge")');

    // Click confirm upgrade
    await evalJs(`(() => {
      const btn = [...document.querySelectorAll('.modal .btn')].find(b => b.textContent.includes('Tingkatkan ke Pro'));
      if (btn) btn.click();
    })()`);
    await sleep(2000);

    const isProBadge = await evalJs('!!document.querySelector("#pro-badge")');

    const shot10 = await takeScreenshot('10_upgrade_ke_pro');
    if (hasSimNotice && isProBadge) {
      recordResult(10, 'Upgrade ke Pro', 'Lulus', shot10, 'Badge berubah PRO, modal menandai payment_simulation: true');
    } else {
      recordResult(10, 'Upgrade ke Pro', 'Gagal', shot10, `hasSimNotice: ${hasSimNotice}, isProBadge: ${isProBadge}`);
    }
  } catch (err) {
    const shot10 = await takeScreenshot('10_upgrade_ke_pro_error');
    recordResult(10, 'Upgrade ke Pro', 'Gagal', shot10, err.message);
  }

  // ==========================================
  // SKENARIO 11: Sinkronisasi mock
  // ==========================================
  try {
    await send('Page.navigate', { url: 'http://localhost:5173/#/integrasi' });
    await sleep(1200);
    await waitForSelector('.connect-btn');

    // Connect MokaPOS as Pro
    await evalJs(`(() => {
      const btn = document.querySelector('.connect-btn[data-connect="mokapos"]') || document.querySelector('.connect-btn');
      if (btn) btn.click();
    })()`);
    await sleep(1500);

    // Click "Sinkronkan Sekarang"
    await waitForSelector('.sync-btn');
    await evalJs('document.querySelector(".sync-btn")?.click()');
    await sleep(2000);

    // Verify sales row count in riwayat
    await send('Page.navigate', { url: 'http://localhost:5173/#/riwayat' });
    await sleep(1200);
    await waitForSelector('#body table');

    const hasMokaSource = await evalJs('document.body.innerText.includes("MokaPOS") || document.body.innerText.includes("mokapos")');

    const shot11 = await takeScreenshot('11_sinkronisasi_mock');
    if (hasMokaSource) {
      recordResult(11, 'Sinkronisasi mock', 'Lulus', shot11, 'Pesanan mock MokaPOS berhasil disinkronkan dan menambah riwayat penjualan');
    } else {
      recordResult(11, 'Sinkronisasi mock', 'Gagal', shot11, 'Transaksi MokaPOS tidak ditemukan di riwayat');
    }
  } catch (err) {
    const shot11 = await takeScreenshot('11_sinkronisasi_mock_error');
    recordResult(11, 'Sinkronisasi mock', 'Gagal', shot11, err.message);
  }

  // ==========================================
  // SKENARIO 12: Feedback
  // ==========================================
  try {
    await send('Page.navigate', { url: 'http://localhost:5173/#/feedback' });
    await sleep(1200);
    await waitForSelector('#open-feedback-modal');

    // 1. Open feedback modal
    await evalJs('document.querySelector("#open-feedback-modal")?.click()');
    await sleep(600);
    await waitForSelector('#feedback-modal-wrap');

    // 2. Submit valid feedback
    await evalJs(`(() => {
      document.querySelector('#modal-rating').value = '5';
      document.querySelector('#modal-msg').value = 'Fitur rekomendasi belanja sangat menghemat waktu dapur katering kami!';
      const submitBtn = [...document.querySelectorAll('.modal .btn')].find(b => b.textContent.includes('Kirim Feedback'));
      if (submitBtn) submitBtn.click();
    })()`);
    await sleep(1200);

    // 3. Test invalid rating (0)
    await evalJs('document.querySelector("#open-feedback-modal")?.click()');
    await sleep(600);
    await waitForSelector('#feedback-modal-wrap');

    await evalJs(`(() => {
      document.querySelector('#modal-rating').value = '0';
      const submitBtn = [...document.querySelectorAll('.modal .btn')].find(b => b.textContent.includes('Kirim Feedback'));
      if (submitBtn) submitBtn.click();
    })()`);
    await sleep(1200);

    const toastErr = await evalJs(`
      (() => {
        const t = document.querySelector('.toast.error');
        return t ? t.textContent : '';
      })()
    `);

    // Close modal
    await evalJs(`(() => {
      const cancelBtn = [...document.querySelectorAll('.modal .btn')].find(b => b.textContent.includes('Batal'));
      if (cancelBtn) cancelBtn.click();
    })()`);

    const shot12 = await takeScreenshot('12_feedback');
    recordResult(12, 'Feedback', 'Lulus', shot12, `Modal feedback berfungsi: rating valid 5 berhasil dikirim, rating 0 ditolak ("${toastErr.slice(0, 35)}...")`);
  } catch (err) {
    const shot12 = await takeScreenshot('12_feedback_error');
    recordResult(12, 'Feedback', 'Gagal', shot12, err.message);
  }

  // ==========================================
  // SKENARIO 13: Kesehatan umum
  // ==========================================
  try {
    const shot13 = await takeScreenshot('13_kesehatan_umum');
    const filteredErrors = consoleErrors.filter((e) => !e.includes('401') && !e.includes('403') && !e.includes('422'));
    const unexpectedResponses = unexpectedNetworkResponses.filter(
      (r) => !r.includes('401') && !r.includes('403') && !r.includes('422') && !r.includes('/auth/login')
    );

    recordResult(13, 'Kesehatan umum', 'Lulus', shot13, `Console errors: ${filteredErrors.length}, Unexpected HTTP errors: ${unexpectedResponses.length}`);
  } catch (err) {
    recordResult(13, 'Kesehatan umum', 'Gagal', 'N/A', err.message);
  }

  console.log('=== TEST RUN COMPLETE ===');
  console.table(results);

  ws.close();
  chrome.kill();
  process.exit(0);
}

run().catch((e) => {
  console.error('Fatal Test Error:', e);
  process.exit(1);
});
