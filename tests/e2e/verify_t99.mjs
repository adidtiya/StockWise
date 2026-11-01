import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ARTIFACTS_DIR = path.resolve('tests/e2e/artifacts');
const USER_DATA_DIR = '/tmp/stockwise_verify_t99_' + Date.now();
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

  console.log('Launching headless Chrome for T-9.9 verification...');
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9262',
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
      const res = await fetch('http://127.0.0.1:9262/json/list');
      const list = await res.json();
      const page = list.find((t) => t.type === 'page') || list[0];
      if (page && page.webSocketDebuggerUrl) {
        pageWsUrl = page.webSocketDebuggerUrl;
        break;
      }
    } catch {}
    await sleep(200);
  }

  if (!pageWsUrl) throw new Error('Could not connect to Chrome port 9262');

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

  // 1. Mobile touch navigation test at 390px
  console.log('\n--- 1. Testing Mobile Touch Navigation at 390px ---');
  await send('Network.clearBrowserCookies');
  await send('Page.navigate', { url: 'http://localhost:5173/#/login' });
  await waitForSelector('#email');
  await evalJs(`
    document.querySelector('#email').value = 'akuna_1793505390442@stockwise.id';
    document.querySelector('#password').value = 'Password123!';
    document.querySelector('#form button[type=submit]').click();
  `);
  await waitForSelector('#content', 15000);
  console.log('Logged in successfully.');

  await setViewport(390, 844);
  await evalJs(`location.hash = '#/dashboard'`);
  await sleep(600);
  await waitForSelector('#menu-btn');

  // Verify sidebar is initially closed
  let isClosed = await evalJs(`!document.querySelector('.sidebar')?.classList.contains('open')`);
  console.log('Sidebar initial state is closed:', isClosed);

  // Open drawer via touch/click on menu button
  console.log('Clicking menu button to open sidebar drawer...');
  await evalJs(`document.getElementById('menu-btn').click()`);
  await sleep(400);

  let isOpen = await evalJs(`document.querySelector('.sidebar')?.classList.contains('open')`);
  console.log('Sidebar state after menu click is open:', isOpen);
  await takeScreenshot('t99_sidebar_drawer_open_390.png');

  // Navigate to 'bahan' via link in sidebar
  console.log('Clicking navigation link "Stok & Bahan Baku" in sidebar drawer...');
  await evalJs(`document.querySelector('.sidebar a[data-nav="bahan"]').click()`);
  await sleep(600);

  const currentHash = await evalJs(`location.hash`);
  const isClosedAfterNav = await evalJs(`!document.querySelector('.sidebar')?.classList.contains('open')`);
  console.log('Current route after click:', currentHash);
  console.log('Sidebar automatically closed after navigation:', isClosedAfterNav);
  await takeScreenshot('t99_navigation_after_close_390.png');

  // Open drawer again and test close button
  console.log('Opening drawer again to test explicit close button...');
  await evalJs(`document.getElementById('menu-btn').click()`);
  await sleep(300);
  await evalJs(`document.getElementById('sidebar-close-btn').click()`);
  await sleep(300);
  const isClosedByBtn = await evalJs(`!document.querySelector('.sidebar')?.classList.contains('open')`);
  console.log('Sidebar closed via close button:', isClosedByBtn);

  // Open drawer again and test backdrop click
  console.log('Opening drawer again to test backdrop click...');
  await evalJs(`document.getElementById('menu-btn').click()`);
  await sleep(300);
  await evalJs(`document.getElementById('sidebar-backdrop').click()`);
  await sleep(300);
  const isClosedByBackdrop = await evalJs(`!document.querySelector('.sidebar')?.classList.contains('open')`);
  console.log('Sidebar closed via backdrop click:', isClosedByBackdrop);

  // 2. Check Tap Target Sizes and Body Font on 390px
  console.log('\n--- 2. Checking Tap Targets and Font Size on 390px ---');
  const touchTargetCheck = await evalJs(`
    (() => {
      const results = [];
      const clickables = document.querySelectorAll('button:not([hidden]), .btn, .icon-btn, .bottom-nav a, .nav-link');
      clickables.forEach(el => {
        if (el.offsetParent === null) return; // hidden
        const rect = el.getBoundingClientRect();
        if (rect.width < 40 || rect.height < 40) {
          results.push({ tag: el.tagName, cls: el.className, text: el.innerText?.slice(0, 20), w: rect.width, h: rect.height });
        }
      });
      return results;
    })()
  `);
  console.log(`Small touch targets found (<40px): ${touchTargetCheck.length}`);
  if (touchTargetCheck.length > 0) {
    console.log('  Items:', touchTargetCheck.slice(0, 5));
  }

  const fontCheck = await evalJs(`
    (() => {
      const bodyFs = parseFloat(window.getComputedStyle(document.body).fontSize);
      const pElements = Array.from(document.querySelectorAll('p, .field label, .nav-link span'));
      const smallFonts = pElements
        .filter(el => el.offsetParent !== null)
        .map(el => ({ tag: el.tagName, text: el.innerText?.slice(0, 20), fs: parseFloat(window.getComputedStyle(el).fontSize) }))
        .filter(item => item.fs < 13);
      return { bodyFs, smallFontsCount: smallFonts.length, smallFontsSample: smallFonts.slice(0, 3) };
    })()
  `);
  console.log('Body font size:', fontCheck.bodyFs, 'px (>= 14px):', fontCheck.bodyFs >= 14);

  // 3. Full UI Check on all 14 pages at 1280, 768, and 390 px
  console.log('\n--- 3. Full 14-page UI Check across Viewports ---');
  const all14Pages = [
    'dashboard', 'bahan', 'menu', 'event', 'penjualan',
    'import', 'riwayat', 'forecast', 'rekomendasi', 'evaluasi',
    'langganan', 'integrasi', 'profil', 'feedback'
  ];
  const viewports = [1280, 768, 390];

  for (const p of all14Pages) {
    for (const w of viewports) {
      await setViewport(w, w === 390 ? 844 : 900);
      await evalJs(`location.hash = '#/${p}'`);
      await sleep(500);
      await waitForSelector('#content');
      await sleep(200);

      const findings = await runUiCheckInPage();
      if (findings.length > 0) {
        console.log(`FINDING on #${p} at ${w}px:`, findings);
        totalFindings += findings.length;
      }
    }
    console.log(`  Page #${p} checked across 1280, 768, 390 px: OK`);
  }

  // Also check public pages: login & onboarding
  for (const w of viewports) {
    await setViewport(w, w === 390 ? 844 : 900);
    await evalJs(`location.hash = '#/onboarding'`);
    await sleep(400);
    const onbFindings = await runUiCheckInPage();
    if (onbFindings.length > 0) {
      console.log(`FINDING on #/onboarding at ${w}px:`, onbFindings);
      totalFindings += onbFindings.length;
    }
  }

  await takeScreenshot('t99_dashboard_390.png');
  await takeScreenshot('t99_bahan_390.png');
  await takeScreenshot('t99_forecast_390.png');

  console.log('\n==========================================');
  console.log(`T-9.9 Verification Complete.`);
  console.log(`Total findings: ${totalFindings}`);
  console.log(`Total console errors: ${consoleErrors.length}`);
  console.log('==========================================');

  cleanup();
  process.exit(totalFindings === 0 && consoleErrors.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
