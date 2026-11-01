import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ARTIFACTS_DIR = path.resolve('tests/e2e/artifacts');
const USER_DATA_DIR = '/tmp/stockwise_verify_t92_' + Date.now();
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
  console.log('Launching Chrome for T-9.2 verification...');
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9255',
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

  let pageWsUrl = null;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9255/json/list');
      const list = await res.json();
      const page = list.find((t) => t.type === 'page') || list[0];
      if (page && page.webSocketDebuggerUrl) {
        pageWsUrl = page.webSocketDebuggerUrl;
        break;
      }
    } catch {}
    await sleep(200);
  }

  if (!pageWsUrl) throw new Error('Could not connect to Chrome port 9255');

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

  await send('Page.enable');
  await send('DOM.enable');
  await send('Runtime.enable');
  await send('Network.enable');

  // Hard reload with cache and cookies cleared
  await send('Network.clearBrowserCache');
  await send('Network.clearBrowserCookies');

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

  const setViewport = async (width, height = 900) => {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width <= 768,
    });
    await sleep(300);
  };

  const takeScreenshot = async (filename) => {
    const filepath = path.join(ARTIFACTS_DIR, filename);
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(filepath, Buffer.from(data, 'base64'));
    console.log(`  Saved screenshot: ${filename}`);
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

  // Register fresh empty test user
  const email = `verify_t92_${Date.now()}@stockwise.id`;
  console.log('Registering fresh user for T-9.2 check:', email);

  await setViewport(1280, 900);
  await send('Page.navigate', { url: 'http://localhost:5173/#/register' });
  await sleep(1500);
  await waitForSelector('#name');

  // Step 0
  await evalJs(`(() => {
    document.querySelector('#name').value = 'Verifikasi T92';
    document.querySelector('#email').value = '${email}';
    document.querySelector('#phone').value = '081234567899';
    document.querySelector('#password').value = 'Password123!';
    document.querySelector('#form button[type=submit]').click();
  })()`);
  await waitForSelector('#business_name');

  // Step 1
  await evalJs(`(() => {
    document.querySelector('#business_name').value = 'Bisnis Baru T92';
    document.querySelector('#city').value = 'Semarang';
    const rad = document.querySelector('input[name=business_type][value=katering]');
    if (rad) rad.checked = true;
    document.querySelector('#form button[type=submit]').click();
  })()`);
  await waitForSelector('input[name=seed_demo]');

  // Step 2 (empty, no demo)
  await evalJs(`(() => {
    const seed = document.querySelector('input[name=seed_demo]');
    if (seed) seed.checked = false;
    document.querySelector('#form button[type=submit]').click();
  })()`);
  await waitForSelector('#sidebar-user');

  console.log('\n--- VERIFIKASI BERANDA (Checklist Onboarding) ---');
  for (const w of [1280, 768, 390]) {
    await setViewport(w, w === 390 ? 844 : 900);
    await send('Page.navigate', { url: 'http://localhost:5173/#/dashboard' });
    await sleep(1000);

    const shot = `t92_empty_dashboard_${w}.png`;
    await takeScreenshot(shot);

    const findings = await runUiCheckInPage();
    console.log(`ui_check on dashboard @ ${w}px -> ${findings.length} findings:`, JSON.stringify(findings));

    const metrics = await evalJs(`
      (() => {
        const items = document.querySelectorAll('.list-item');
        return Array.from(items).map((item, idx) => {
          const chevron = item.querySelector('svg:last-child');
          const meta = item.querySelector('.meta');
          const title = item.querySelector('.title');
          const grow = item.querySelector('.grow');
          return {
            idx,
            chevronSize: chevron ? { width: Math.round(chevron.getBoundingClientRect().width), height: Math.round(chevron.getBoundingClientRect().height) } : null,
            metaWidth: meta ? Math.round(meta.getBoundingClientRect().width) : null,
            metaHeight: meta ? Math.round(meta.getBoundingClientRect().height) : null,
            titleText: title ? title.textContent : null,
            titleWidth: title ? Math.round(title.getBoundingClientRect().width) : null,
            growWidth: grow ? Math.round(grow.getBoundingClientRect().width) : null,
          };
        });
      })()
    `);
    console.log(`Dashboard Checklist Metrics @ ${w}px:`, JSON.stringify(metrics, null, 2));

    // Assert criteria
    if (w === 1280) {
      for (const m of metrics.slice(1)) { // skip sidebar item if present
        if (m.chevronSize) {
          if (m.chevronSize.width > 24 || m.chevronSize.height > 24) {
            throw new Error(`Criteria failed: Chevron size is ${m.chevronSize.width}x${m.chevronSize.height}, expected <= 24px`);
          }
        }
        if (m.metaWidth !== null && m.metaWidth < 200) {
          throw new Error(`Criteria failed: Meta width is ${m.metaWidth}px, expected >= 200px`);
        }
      }
    }
  }

  console.log('\n--- VERIFIKASI 5 HALAMAN BERBEDA (Regression Check) ---');
  const otherPages = [
    { name: 'bahan', hash: '#/bahan' },
    { name: 'menu', hash: '#/menu' },
    { name: 'penjualan', hash: '#/penjualan' },
    { name: 'forecast', hash: '#/forecast' },
    { name: 'akun', hash: '#/akun' },
  ];

  for (const p of otherPages) {
    for (const w of [1280, 390]) {
      await setViewport(w, w === 390 ? 844 : 900);
      await send('Page.navigate', { url: `http://localhost:5173/${p.hash}` });
      await sleep(1000);

      const shot = `t92_${p.name}_${w}.png`;
      await takeScreenshot(shot);

      const findings = await runUiCheckInPage();
      console.log(`ui_check on ${p.name} @ ${w}px -> ${findings.length} findings:`, JSON.stringify(findings));

      const svgBig = findings.filter(f => f.type === 'svg_oversized');
      if (svgBig.length > 0) {
        throw new Error(`Regression: Found oversized SVG on ${p.name} @ ${w}px: ` + JSON.stringify(svgBig));
      }
    }
  }

  console.log('\n=== T-9.2 ALL CRITERIA VERIFIED SUCCESSFULLY! ===');
  cleanup();
  process.exit(0);
}

main().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
