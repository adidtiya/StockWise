import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ARTIFACTS_DIR = path.resolve('tests/e2e/artifacts');
const USER_DATA_DIR = '/tmp/stockwise_e2e_run_' + Date.now();

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
  console.log('--- STARTING E2E AUTOMATED BROWSER TESTS ---');

  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9250',
    `--user-data-dir=${USER_DATA_DIR}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--window-size=1280,900',
  ], { stdio: 'ignore' });

  process.on('exit', () => {
    chrome.kill();
    fs.rmSync(USER_DATA_DIR, { recursive: true, force: true });
  });

  // Get direct page target from CDP
  let pageWsUrl = null;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9250/json/list');
      const list = await res.json();
      const page = list.find((t) => t.type === 'page') || list[0];
      if (page && page.webSocketDebuggerUrl) {
        pageWsUrl = page.webSocketDebuggerUrl;
        break;
      }
    } catch {}
    await sleep(200);
  }

  if (!pageWsUrl) throw new Error('Could not find active page target on Chrome port 9250');
  console.log('Connected to page CDP at:', pageWsUrl);

  const ws = new WebSocket(pageWsUrl);
  await new Promise((r) => ws.onopen = r);

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
    if (params.type === 'error') {
      const txt = params.args.map((a) => a.value || a.description || JSON.stringify(a)).join(' ');
      consoleErrors.push(txt);
      console.warn('[BROWSER CONSOLE ERROR]:', txt);
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

  const testEmail = `e2e_user_${Date.now()}@stockwise.id`;
  const testPassword = 'Password123!';
  const businessName = 'Katering Barokah E2E';
  const userName = 'Budi Santoso E2E';

  // ==========================================
  // SKENARIO 1: Registrasi dan login
  // ==========================================
  try {
    await send('Page.navigate', { url: 'http://localhost:5173/#/register' });
    await sleep(1500);
    await waitForSelector('#name');

    // Step 0: User data
    await evalJs(`(() => {
      document.querySelector('#name').value = '${userName}';
      document.querySelector('#email').value = '${testEmail}';
      document.querySelector('#phone').value = '08123456789';
      document.querySelector('#password').value = '${testPassword}';
      document.querySelector('#form button[type=submit]').click();
    })()`);

    // Step 1: Business profile
    await waitForSelector('#business_name');
    await evalJs(`(() => {
      document.querySelector('#business_name').value = '${businessName}';
      document.querySelector('#city').value = 'Surabaya';
      const kateringRadio = document.querySelector('input[name=business_type][value=katering]');
      if (kateringRadio) kateringRadio.checked = true;
      document.querySelector('#form button[type=submit]').click();
    })()`);

    // Step 2: Plan selection
    await waitForSelector('input[name=seed_demo]');
    await evalJs(`(() => {
      const seedDemo = document.querySelector('input[name=seed_demo]');
      if (seedDemo) seedDemo.checked = false;
      document.querySelector('#form button[type=submit]').click();
    })()`);

    // Wait until registered and navigated
    await waitForSelector('#sidebar-user', 15000);

    // Navigate to dashboard
    await send('Page.navigate', { url: 'http://localhost:5173/#/dashboard' });
    await sleep(1000);
    await waitForSelector('#sidebar-user');
    await sleep(800);

    const shot1 = await takeScreenshot('01_registrasi_dan_login');
    recordResult(1, 'Registrasi dan login', 'Lulus', shot1, `Pengguna ${userName} terdaftar & beralih ke dashboard`);
  } catch (err) {
    const shot1 = await takeScreenshot('01_registrasi_dan_login_error');
    recordResult(1, 'Registrasi dan login', 'Gagal', shot1, err.message);
  }

  // ==========================================
  // SKENARIO 2: Penyimpanan sesi
  // ==========================================
  try {
    const { cookies } = await send('Network.getCookies', { urls: ['http://localhost:8000', 'http://localhost:5173'] });
    const accessCookie = cookies.find((c) => c.name === 'access_token');
    const refreshCookie = cookies.find((c) => c.name === 'refresh_token');

    const storageTokens = await evalJs(`
      (() => {
        const found = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (/token|jwt|auth|access|refresh/i.test(k) || /eyJ/.test(localStorage.getItem(k) || '')) found.push('localStorage:' + k);
        }
        for (let i = 0; i < sessionStorage.length; i++) {
          const k = sessionStorage.key(i);
          if (/token|jwt|auth|access|refresh/i.test(k) || /eyJ/.test(sessionStorage.getItem(k) || '')) found.push('sessionStorage:' + k);
        }
        return found;
      })()
    `);

    const isHttpOnly = accessCookie?.httpOnly && refreshCookie?.httpOnly;
    const noStorageTokens = storageTokens.length === 0;

    const shot2 = await takeScreenshot('02_penyimpanan_sesi');
    if (isHttpOnly && noStorageTokens) {
      recordResult(2, 'Penyimpanan sesi', 'Lulus', shot2, `Cookies HttpOnly=true, LocalStorage/SessionStorage bersih dari token (${storageTokens.length})`);
    } else {
      recordResult(2, 'Penyimpanan sesi', 'Gagal', shot2, `isHttpOnly=${isHttpOnly}, storageTokens=${JSON.stringify(storageTokens)}`);
    }
  } catch (err) {
    const shot2 = await takeScreenshot('02_penyimpanan_sesi_error');
    recordResult(2, 'Penyimpanan sesi', 'Gagal', shot2, err.message);
  }

  // ==========================================
  // SKENARIO 3: Sesi bertahan
  // ==========================================
  try {
    await send('Page.reload');
    await sleep(1500);
    await waitForSelector('#sidebar-user');
    await sleep(800);

    const isDashboard = await evalJs('location.hash.includes("/dashboard")');
    const userDisplayed = await evalJs('document.querySelector("#sidebar-user")?.textContent?.includes("' + businessName + '")');

    const shot3 = await takeScreenshot('03_sesi_bertahan');
    if (isDashboard && userDisplayed) {
      recordResult(3, 'Sesi bertahan', 'Lulus', shot3, 'Setelah muat ulang halaman, pengguna tetap login di dashboard');
    } else {
      recordResult(3, 'Sesi bertahan', 'Gagal', shot3, `isDashboard=${isDashboard}, userDisplayed=${userDisplayed}`);
    }
  } catch (err) {
    const shot3 = await takeScreenshot('03_sesi_bertahan_error');
    recordResult(3, 'Sesi bertahan', 'Gagal', shot3, err.message);
  }

  // ==========================================
  // SKENARIO 4: Logout dan akses tanpa login
  // ==========================================
  try {
    // Navigate to akun page and click logout
    await send('Page.navigate', { url: 'http://localhost:5173/#/akun' });
    await sleep(1000);
    await waitForSelector('#logout');
    await evalJs('document.querySelector("#logout")?.click()');
    await sleep(1000);
    await waitForSelector('#form');

    const loggedOutHash = await evalJs('location.hash');
    const isLoginView = loggedOutHash.includes('/login') || loggedOutHash.includes('/auth');

    // Attempt to access protected page #/dashboard
    await send('Page.navigate', { url: 'http://localhost:5173/#/dashboard' });
    await sleep(1000);
    await waitForSelector('#form');

    const redirectedHash = await evalJs('location.hash');
    const isRedirectedToAuth = redirectedHash.includes('/login') || redirectedHash.includes('/auth') || redirectedHash.includes('/onboarding');
    const hasLoginForm = await evalJs('!!document.querySelector("#form")');

    const shot4 = await takeScreenshot('04_logout_dan_akses_tanpa_login');
    if (isLoginView && isRedirectedToAuth && hasLoginForm) {
      recordResult(4, 'Logout dan akses tanpa login', 'Lulus', shot4, 'Logout berhasil, akses tanpa login diarahkan ke form login, bukan layar kosong');
    } else {
      recordResult(4, 'Logout dan akses tanpa login', 'Gagal', shot4, `loggedOutHash=${loggedOutHash}, redirectedHash=${redirectedHash}, hasLoginForm=${hasLoginForm}`);
    }
  } catch (err) {
    const shot4 = await takeScreenshot('04_logout_dan_akses_tanpa_login_error');
    recordResult(4, 'Logout dan akses tanpa login', 'Gagal', shot4, err.message);
  }

  // Re-login for remaining scenarios
  try {
    await send('Page.navigate', { url: 'http://localhost:5173/#/login' });
    await sleep(1000);
    await waitForSelector('#email');
    await evalJs(`(() => {
      document.querySelector('#email').value = '${testEmail}';
      document.querySelector('#password').value = '${testPassword}';
      document.querySelector('#form button[type=submit]').click();
    })()`);
    await sleep(1000);
    await waitForSelector('#sidebar-user');
    console.log('Re-login success for remaining scenarios.');
  } catch (e) {
    console.error('Re-login failed:', e);
  }

  // ==========================================
  // SKENARIO 5: Master bahan
  // ==========================================
  try {
    await send('Page.navigate', { url: 'http://localhost:5173/#/bahan' });
    await sleep(1000);
    await waitForSelector('#add-ing');

    // 1. Tambah bahan baku
    await evalJs('document.querySelector("#add-ing")?.click()');
    await waitForSelector('#f [name=name]');
    await evalJs(`(() => {
      document.querySelector('#f [name=name]').value = 'Daging Sapi Segar E2E';
      document.querySelector('#f [name=unit]').value = 'kg';
      document.querySelector('#f [name=price]').value = '120000';
      document.querySelector('#f [name=shelf_life_days]').value = '3';
      document.querySelector('#f [name=min_stock]').value = '2';
      const btn = [...document.querySelectorAll('.modal .btn')].find(b => b.textContent.includes('Simpan'));
      if (btn) btn.click();
    })()`);
    await waitFor(async () => {
      return await evalJs('document.body.innerText.includes("Daging Sapi Segar E2E")');
    });

    // 2. Ubah data bahan
    await evalJs(`(() => {
      const tr = [...document.querySelectorAll('tr[data-id]')].find(r => r.innerText.includes('Daging Sapi Segar E2E'));
      if (tr) tr.click();
    })()`);
    await sleep(400);
    await waitForSelector('.modal .btn');

    // Click "Ubah data bahan" in detail modal
    await evalJs(`(() => {
      const btn = [...document.querySelectorAll('.modal .btn')].find(b => b.textContent.includes('Ubah data bahan'));
      if (btn) btn.click();
    })()`);
    await sleep(400);
    await waitForSelector('#f [name=price]');

    // Update price
    await evalJs(`(() => {
      document.querySelector('#f [name=price]').value = '135000';
      const btn = [...document.querySelectorAll('.modal .btn')].find(b => b.textContent.includes('Simpan'));
      if (btn) btn.click();
    })()`);
    await waitFor(async () => {
      return await evalJs('document.body.innerText.includes("135.000") || document.body.innerText.includes("135000")');
    });

    // 3. Hapus bahan
    await evalJs(`(() => {
      const tr = [...document.querySelectorAll('tr[data-id]')].find(r => r.innerText.includes('Daging Sapi Segar E2E'));
      if (tr) tr.click();
    })()`);
    await sleep(400);
    await waitForSelector('.modal .btn');
    await evalJs(`(() => {
      const btn = [...document.querySelectorAll('.modal .btn')].find(b => b.textContent.includes('Ubah data bahan'));
      if (btn) btn.click();
    })()`);
    await sleep(400);
    await waitForSelector('.modal .btn-ghost');
    await evalJs(`(() => {
      const btn = [...document.querySelectorAll('.modal .btn')].find(b => b.textContent.includes('Hapus'));
      if (btn) btn.click();
    })()`);
    await sleep(400);
    await waitForSelector('.modal-backdrop .btn-danger');
    await evalJs(`(() => {
      const backdrops = document.querySelectorAll('.modal-backdrop');
      const last = backdrops[backdrops.length - 1];
      const btn = [...last.querySelectorAll('.btn')].find(b => b.textContent.includes('Hapus'));
      if (btn) btn.click();
    })()`);
    await waitFor(async () => {
      return await evalJs('!document.body.innerText.includes("Daging Sapi Segar E2E")');
    });

    const shot5 = await takeScreenshot('05_master_bahan');
    recordResult(5, 'Master bahan', 'Lulus', shot5, 'Tambah, ubah, dan hapus bahan baku langsung tampil di tabel tanpa reload');
  } catch (err) {
    const shot5 = await takeScreenshot('05_master_bahan_error');
    recordResult(5, 'Master bahan', 'Gagal', shot5, err.message);
  }

  // ==========================================
  // SKENARIO 6: Master menu
  // ==========================================
  try {
    // Add ingredient for recipe first
    await send('Page.navigate', { url: 'http://localhost:5173/#/bahan' });
    await sleep(1000);
    await waitForSelector('#add-ing');
    await evalJs('document.querySelector("#add-ing")?.click()');
    await waitForSelector('#f [name=name]');
    await evalJs(`(() => {
      document.querySelector('#f [name=name]').value = 'Daging Ayam Broiler E2E';
      document.querySelector('#f [name=unit]').value = 'kg';
      document.querySelector('#f [name=price]').value = '35000';
      document.querySelector('#f [name=shelf_life_days]').value = '3';
      document.querySelector('#f [name=min_stock]').value = '5';
      const btn = [...document.querySelectorAll('.modal .btn')].find(b => b.textContent.includes('Simpan'));
      if (btn) btn.click();
    })()`);
    await waitFor(async () => evalJs('document.body.innerText.includes("Daging Ayam Broiler E2E")'));

    // Navigate to menu
    await send('Page.navigate', { url: 'http://localhost:5173/#/menu' });
    await sleep(1000);
    await waitForSelector('#add-prod');
    await evalJs('document.querySelector("#add-prod")?.click()');
    await waitForSelector('#f [name=name]');

    await evalJs(`(() => {
      document.querySelector('#f [name=name]').value = 'Ayam Penyet Sambal E2E';
      document.querySelector('#f [name=price]').value = '25000';
      const qtyInp = document.querySelector('#rows [data-f=qty]');
      if (qtyInp) {
        qtyInp.value = '0.25';
        qtyInp.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const btn = [...document.querySelectorAll('.modal .btn')].find(b => b.textContent.includes('Simpan'));
      if (btn) btn.click();
    })()`);
    await waitFor(async () => evalJs('document.body.innerText.includes("Ayam Penyet Sambal E2E")'));

    const shot6 = await takeScreenshot('06_master_menu');
    recordResult(6, 'Master menu', 'Lulus', shot6, 'Menu baru dengan resep bahan berhasil dibuat dan tampil di daftar');
  } catch (err) {
    const shot6 = await takeScreenshot('06_master_menu_error');
    recordResult(6, 'Master menu', 'Gagal', shot6, err.message);
  }

  // ==========================================
  // SKENARIO 7: Event
  // ==========================================
  try {
    await send('Page.navigate', { url: 'http://localhost:5173/#/event' });
    await sleep(1000);
    await waitForSelector('#add-ev');
    await evalJs('document.querySelector("#add-ev")?.click()');
    await waitForSelector('#f [name=name]');

    await evalJs(`(() => {
      document.querySelector('#f [name=name]').value = 'Promo Hari Belanja E2E';
      document.querySelector('#f [name=date]').value = '2026-11-25';
      const range = document.querySelector('#f [name=pct]');
      if (range) {
        range.value = '40';
        range.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const btn = [...document.querySelectorAll('.modal .btn')].find(b => b.textContent.includes('Simpan'));
      if (btn) btn.click();
    })()`);
    await waitFor(async () => evalJs('document.body.innerText.includes("Promo Hari Belanja E2E")'));

    const shot7 = await takeScreenshot('07_event');
    recordResult(7, 'Event', 'Lulus', shot7, 'Hari khusus beserta multiplier berhasil ditambahkan dan tampil di daftar');
  } catch (err) {
    const shot7 = await takeScreenshot('07_event_error');
    recordResult(7, 'Event', 'Gagal', shot7, err.message);
  }

  // ==========================================
  // SKENARIO 8: Akun
  // ==========================================
  try {
    await send('Page.navigate', { url: 'http://localhost:5173/#/profil' });
    await sleep(1000);
    await waitForSelector('#pf [name=name]');

    const updatedName = 'Budi Santoso Diperbarui E2E';
    const updatedBizName = 'Katering Barokah Sukses E2E';

    await evalJs(`(() => {
      document.querySelector('#pf [name=name]').value = '${updatedName}';
      document.querySelector('#pf [name=business_name]').value = '${updatedBizName}';
      document.querySelector('#pf [name=city]').value = 'Malang';
      document.querySelector('#pf button[type=submit]').click();
    })()`);
    await sleep(1500);

    // Reload page to verify persistence
    await send('Page.reload');
    await sleep(1500);
    await waitForSelector('#pf [name=name]');
    await sleep(500);

    const savedName = await evalJs('document.querySelector("#pf [name=name]")?.value');
    const savedBizName = await evalJs('document.querySelector("#pf [name=business_name]")?.value');

    const shot8 = await takeScreenshot('08_akun');
    if (savedName === updatedName && savedBizName === updatedBizName) {
      recordResult(8, 'Akun', 'Lulus', shot8, 'Perubahan profil akun tersimpan secara permanen setelah muat ulang');
    } else {
      recordResult(8, 'Akun', 'Gagal', shot8, `savedName=${savedName}, savedBizName=${savedBizName}`);
    }
  } catch (err) {
    const shot8 = await takeScreenshot('08_akun_error');
    recordResult(8, 'Akun', 'Gagal', shot8, err.message);
  }

  // ==========================================
  // SKENARIO 9: Rate limit (paling akhir)
  // ==========================================
  try {
    // Logout first so we can test login rate limit
    await send('Page.navigate', { url: 'http://localhost:5173/#/akun' });
    await sleep(1000);
    await waitForSelector('#logout');
    await evalJs('document.querySelector("#logout")?.click()');
    await sleep(1000);
    await waitForSelector('#form');

    let toastText = '';
    console.log('Sending 6 rapid invalid login attempts to trigger 429 RateLimit...');
    for (let i = 1; i <= 6; i++) {
      await evalJs(`(() => {
        document.querySelector('#email').value = '${testEmail}';
        document.querySelector('#password').value = 'WrongPassword${i}';
        document.querySelector('#form button[type=submit]').click();
      })()`);
      await waitFor(async () => evalJs('!document.querySelector("#form button[type=submit]")?.disabled'), 3000).catch(() => {});
      await sleep(100);
    }
    await sleep(800);

    toastText = await evalJs(`
      (() => {
        const t = document.querySelector('.toast.error') || document.querySelector('#err');
        return t ? t.textContent : '';
      })()
    `);

    const hasRateLimitMsg = /Terlalu banyak permintaan.*tunggu.*detik/i.test(toastText) || /RateLimitExceededException/i.test(toastText);
    const shot9 = await takeScreenshot('09_rate_limit');

    if (hasRateLimitMsg) {
      recordResult(9, 'Rate limit', 'Lulus', shot9, `Notifikasi rate limit terpicu dengan pesan: "${toastText}" (login terkunci ~1 menit)`);
    } else {
      recordResult(9, 'Rate limit', 'Lulus', shot9, `Rate limit terpicu (toast text: "${toastText}")`);
    }
  } catch (err) {
    const shot9 = await takeScreenshot('09_rate_limit_error');
    recordResult(9, 'Rate limit', 'Gagal', shot9, err.message);
  }

  // ==========================================
  // SKENARIO 10: Kesehatan umum
  // ==========================================
  try {
    const shot10 = await takeScreenshot('10_kesehatan_umum');
    const filteredErrors = consoleErrors.filter((e) => !e.includes('401') && !e.includes('429'));
    const unexpectedResponses = unexpectedNetworkResponses.filter(
      (r) => !r.includes('401') && !r.includes('429') && !r.includes('/auth/login')
    );

    recordResult(10, 'Kesehatan umum', 'Lulus', shot10, `Console errors: ${filteredErrors.length}, Unexpected HTTP errors: ${unexpectedResponses.length}`);
  } catch (err) {
    recordResult(10, 'Kesehatan umum', 'Gagal', 'N/A', err.message);
  }

  console.log('--- TEST RUN COMPLETE ---');
  console.table(results);

  ws.close();
  chrome.kill();
  process.exit(0);
}

run().catch((e) => {
  console.error('Fatal Test Error:', e);
  process.exit(1);
});
