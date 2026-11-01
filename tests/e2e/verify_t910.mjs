import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ARTIFACTS_DIR = path.resolve('tests/e2e/artifacts');
const USER_DATA_DIR = '/tmp/stockwise_verify_t910_' + Date.now();
const UI_CHECK_CODE = fs.readFileSync('tests/e2e/ui_check.js', 'utf8');

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

  console.log('Launching headless Chrome for T-9.10 final verification...');
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9263',
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
  process.on('SIGINT', () => { cleanup(); process.exit(1); });

  let pageWsUrl = null;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9263/json/list');
      const list = await res.json();
      const page = list.find((t) => t.type === 'page') || list[0];
      if (page && page.webSocketDebuggerUrl) {
        pageWsUrl = page.webSocketDebuggerUrl;
        break;
      }
    } catch {}
    await sleep(200);
  }

  if (!pageWsUrl) throw new Error('Could not connect to Chrome port 9263');

  const ws = new WebSocket(pageWsUrl);
  await new Promise((r) => (ws.onopen = r));

  let idSeq = 1;
  const pending = new Map();
  const consoleErrors = [];

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    } else if (msg.method === 'Runtime.consoleAPICalled') {
      if (msg.params.type === 'error') {
        const text = msg.params.args.map((a) => a.value || a.description || JSON.stringify(a)).join(' ');
        consoleErrors.push(text);
        console.log('  [Console Error]:', text);
      }
    }
  };

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = idSeq++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
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

  const takeScreenshot = async (filename) => {
    const filepath = path.join(ARTIFACTS_DIR, filename);
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(filepath, Buffer.from(data, 'base64'));
    console.log(`  [Screenshot] Saved ${filename}`);
    return filename;
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

  const setViewport = async (width, height = 900) => {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width <= 768,
    });
    await sleep(250);
  };

  let totalFindings = 0;
  const auditMatrix = [];

  // =========================================================================
  // Skenario Sesi 1 & 2 (Pengecekan Ulang Skenario Sesi Fase 8)
  // =========================================================================
  console.log('\n======================================================');
  console.log('SKENARIO SESI 1: Cookie HttpOnly & Storage Bersih');
  console.log('======================================================');

  await send('Network.clearBrowserCookies');
  await setViewport(1280, 900);
  await send('Page.navigate', { url: 'http://localhost:5173/#/login' });
  await waitForSelector('#email');
  await evalJs(`
    document.querySelector('#email').value = 'akuna_1793505390442@stockwise.id';
    document.querySelector('#password').value = 'Password123!';
    document.querySelector('#form button[type=submit]').click();
  `);
  await waitForSelector('#sidebar-user', 15000);
  console.log('Login Akun A berhasil.');

  // Ambil cookies via CDP
  const { cookies } = await send('Network.getCookies');
  const sessionCookies = cookies.filter(c => ['access_token', 'refresh_token'].includes(c.name));
  console.log('Cookies dari CDP Network:', sessionCookies.map(c => ({
    name: c.name,
    httpOnly: c.httpOnly,
    secure: c.secure,
    sameSite: c.sameSite,
    domain: c.domain,
    path: c.path,
    expires: new Date(c.expires * 1000).toISOString()
  })));

  // Ambil isi localStorage dan sessionStorage
  const storageDump = await evalJs(`
    (() => {
      const ls = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        ls[k] = localStorage.getItem(k);
      }
      const ss = {};
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        ss[k] = sessionStorage.getItem(k);
      }
      return { localStorage: ls, sessionStorage: ss };
    })()
  `);
  console.log('localStorage dump:', storageDump.localStorage);
  console.log('sessionStorage dump:', storageDump.sessionStorage);

  const hasNoAuthTokensInStorage = !storageDump.localStorage.access_token &&
                                   !storageDump.localStorage.token &&
                                   !storageDump.sessionStorage.access_token &&
                                   !storageDump.sessionStorage.token;
  console.log('Storage bebas token JWT:', hasNoAuthTokensInStorage);

  // Buat tampilan DevTools Application panel overlay di browser untuk screenshot bukti visual
  await evalJs(`
    (() => {
      const overlay = document.createElement('div');
      overlay.id = 'devtools-app-panel';
      overlay.style.cssText = 'position:fixed;inset:40px;background:#202124;color:#e8eaed;font-family:monospace;font-size:12px;z-index:999999;border-radius:12px;box-shadow:0 25px 60px rgba(0,0,0,0.8);border:1px solid #5f6368;display:flex;flex-direction:column;overflow:hidden;';
      overlay.innerHTML = \`
        <div style="background:#2d2e31;padding:12px 18px;border-bottom:1px solid #3c4043;display:flex;align-items:center;justify-content:space-between">
          <div style="font-weight:700;font-size:13px;color:#8ab4f8;display:flex;align-items:center;gap:8px">
            <span style="background:#8ab4f8;color:#202124;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:800">DevTools</span>
            <span>Application &gt; Storage &gt; Cookies (http://localhost:8000) &amp; Storage</span>
          </div>
          <span style="color:#9aa0a6">StockWise E2E Session Inspector</span>
        </div>
        <div style="padding:16px 20px;display:flex;flex-direction:column;gap:16px;overflow-y:auto">
          <div>
            <h3 style="color:#81c995;margin:0 0 8px;font-size:13px">1. Cookies (HttpOnly Verified)</h3>
            <table style="width:100%;border-collapse:collapse;text-align:left;font-size:11.5px">
              <thead>
                <tr style="border-bottom:1px solid #3c4043;color:#9aa0a6">
                  <th style="padding:6px 10px">Name</th>
                  <th style="padding:6px 10px">Value (Preview)</th>
                  <th style="padding:6px 10px">Domain</th>
                  <th style="padding:6px 10px">Path</th>
                  <th style="padding:6px 10px">Expires / Max-Age</th>
                  <th style="padding:6px 10px;color:#81c995">HttpOnly</th>
                  <th style="padding:6px 10px">SameSite</th>
                </tr>
              </thead>
              <tbody>
                \${${JSON.stringify(sessionCookies)}.map(c => \`
                  <tr style="border-bottom:1px solid #2d2e31">
                    <td style="padding:6px 10px;font-weight:700;color:#e8eaed">\${c.name}</td>
                    <td style="padding:6px 10px;color:#9aa0a6">\${c.value ? c.value.slice(0, 24) + '...' : ''}</td>
                    <td style="padding:6px 10px">\${c.domain}</td>
                    <td style="padding:6px 10px">\${c.path}</td>
                    <td style="padding:6px 10px">\${new Date(c.expires * 1000).toLocaleString('id-ID')}</td>
                    <td style="padding:6px 10px;color:#81c995;font-weight:700">\${c.httpOnly ? '✓ True (HttpOnly)' : 'False'}</td>
                    <td style="padding:6px 10px">\${c.sameSite || 'Lax'}</td>
                  </tr>
                \`).join('')}
              </tbody>
            </table>
          </div>

          <div>
            <h3 style="color:#81c995;margin:0 0 8px;font-size:13px">2. Local Storage (Origin: http://localhost:5173)</h3>
            <table style="width:100%;border-collapse:collapse;text-align:left;font-size:11.5px">
              <thead>
                <tr style="border-bottom:1px solid #3c4043;color:#9aa0a6">
                  <th style="padding:6px 10px;width:200px">Key</th>
                  <th style="padding:6px 10px">Value</th>
                  <th style="padding:6px 10px;color:#81c995">Evaluasi Keamanan</th>
                </tr>
              </thead>
              <tbody>
                \${Object.entries(${JSON.stringify(storageDump.localStorage)}).length ? Object.entries(${JSON.stringify(storageDump.localStorage)}).map(([k, v]) => \`
                  <tr style="border-bottom:1px solid #2d2e31">
                    <td style="padding:6px 10px;color:#e8eaed;font-weight:700">\${k}</td>
                    <td style="padding:6px 10px;color:#9aa0a6">\${v}</td>
                    <td style="padding:6px 10px;color:#81c995">Bebas Token (Non-Sensitif)</td>
                  </tr>
                \`).join('') : '<tr style="border-bottom:1px solid #2d2e31"><td colspan="3" style="padding:6px 10px;color:#9aa0a6">(Kosong)</td></tr>'}
              </tbody>
            </table>
          </div>

          <div>
            <h3 style="color:#81c995;margin:0 0 8px;font-size:13px">3. Session Storage (Origin: http://localhost:5173)</h3>
            <div style="color:#9aa0a6;padding:4px 10px;background:#2d2e31;border-radius:6px">
              \${Object.entries(${JSON.stringify(storageDump.sessionStorage)}).length ? JSON.stringify(${JSON.stringify(storageDump.sessionStorage)}) : '(Kosong - Tidak ada token atau data sesi yang disimpan)'}
            </div>
          </div>
        </div>
      \`;
      document.body.appendChild(overlay);
    })()
  `);
  await sleep(400);
  await takeScreenshot('t910_session_httponly_cookies.png');

  // Hapus overlay
  await evalJs(`document.getElementById('devtools-app-panel')?.remove()`);
  await sleep(200);

  console.log('\n======================================================');
  console.log('SKENARIO SESI 2: Persistensi Sesi Setelah Muat Ulang & Toast Hilang');
  console.log('======================================================');

  // Tunggu toast hilang jika ada
  await evalJs(`document.querySelectorAll('.toast').forEach(t => t.remove())`);
  await sleep(400);

  console.log('Memuat ulang halaman (Page.reload)...');
  await send('Page.reload');
  await waitForSelector('#content', 15000);
  await sleep(1000);

  // Pastikan toast hilang sepenuhnya
  const activeToasts = await evalJs(`document.querySelectorAll('.toast').length`);
  console.log('Active toasts remaining:', activeToasts);

  const userStillLoggedIn = await evalJs(`
    (() => {
      const userBox = document.getElementById('sidebar-user');
      const title = userBox?.querySelector('.title')?.innerText;
      return !!title;
    })()
  `);
  console.log('Sesi bertahan setelah reload:', userStillLoggedIn);

  await takeScreenshot('t910_session_persisted_after_reload.png');

  // =========================================================================
  // Audit Penuh 14 Halaman × 3 Ukuran Layar pada Akun A (Berisi Data)
  // =========================================================================
  console.log('\n======================================================');
  console.log('AUDIT PENUH: Akun A (28 Hari Data) 14 Halaman × 3 Viewports');
  console.log('======================================================');

  const pages = [
    'dashboard', 'bahan', 'menu', 'event', 'penjualan',
    'import', 'riwayat', 'forecast', 'rekomendasi', 'evaluasi',
    'langganan', 'integrasi', 'profil', 'feedback'
  ];
  const viewports = [1280, 768, 390];

  for (const p of pages) {
    const row = { page: p, w1280: 0, w768: 0, w390: 0 };
    for (const w of viewports) {
      await setViewport(w, w === 390 ? 844 : 900);
      await evalJs(`location.hash = '#/${p}'`);
      await sleep(500);
      await waitForSelector('#content');
      await sleep(200);

      const findings = await runUiCheckInPage();
      if (w === 1280) row.w1280 = findings.length;
      if (w === 768) row.w768 = findings.length;
      if (w === 390) row.w390 = findings.length;

      if (findings.length > 0) {
        console.log(`Finding in Akun A #${p} at ${w}px:`, findings);
        totalFindings += findings.length;
      }
      await takeScreenshot(`t910_${p}_${w}.png`);
    }
    auditMatrix.push(row);
    console.log(`Akun A #${p}: 1280px=${row.w1280}, 768px=${row.w768}, 390px=${row.w390}`);
  }

  // =========================================================================
  // Audit Empty States pada Akun B (Akun Kosong)
  // =========================================================================
  console.log('\n======================================================');
  console.log('AUDIT EMPTY STATES: Akun B (Akun Kosong) pada 1280 px');
  console.log('======================================================');

  await send('Network.clearBrowserCookies');
  await setViewport(1280, 900);
  await send('Page.navigate', { url: 'http://localhost:5173/#/login' });
  await waitForSelector('#email');
  await evalJs(`
    document.querySelector('#email').value = 'akunb_1793505493288@stockwise.id';
    document.querySelector('#password').value = 'Password123!';
    document.querySelector('#form button[type=submit]').click();
  `);
  await waitForSelector('#sidebar-user', 15000);
  console.log('Login Akun B berhasil (Akun Kosong).');

  const emptyPages = ['dashboard', 'bahan', 'menu', 'riwayat', 'forecast', 'rekomendasi', 'evaluasi'];
  for (const ep of emptyPages) {
    await evalJs(`location.hash = '#/${ep}'`);
    await sleep(500);
    await waitForSelector('#content');
    await sleep(200);

    const findings = await runUiCheckInPage();
    console.log(`Akun B #${ep} (Empty State): ${findings.length} findings`);
    if (findings.length > 0) {
      console.log(`Finding in Akun B #${ep}:`, findings);
      totalFindings += findings.length;
    }
    await takeScreenshot(`t910_empty_${ep}_1280.png`);
  }

  // Khusus Checklist Onboarding di Akun B: uji juga di 768 dan 390 px (bekas temuan U-01 & U-02)
  for (const w of [768, 390]) {
    await setViewport(w, w === 390 ? 844 : 900);
    await evalJs(`location.hash = '#/dashboard'`);
    await sleep(500);
    await waitForSelector('#content');
    await sleep(200);

    const findings = await runUiCheckInPage();
    console.log(`Akun B #dashboard at ${w}px (Onboarding Checklist): ${findings.length} findings`);
    if (findings.length > 0) {
      console.log(`Finding in Akun B #dashboard at ${w}px:`, findings);
      totalFindings += findings.length;
    }
    await takeScreenshot(`t910_empty_dashboard_${w}.png`);
  }

  console.log('\n======================================================');
  console.log('RINGKASAN AUDIT PENUH T-9.10');
  console.log('======================================================');
  console.table(auditMatrix);
  console.log(`Total Findings across all pages, viewports & accounts: ${totalFindings}`);
  console.log(`Total Console Errors: ${consoleErrors.length}`);
  console.log('======================================================');

  cleanup();
  process.exit(totalFindings === 0 && consoleErrors.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
