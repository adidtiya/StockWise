import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ARTIFACTS_DIR = path.resolve('tests/e2e/artifacts');
const USER_DATA_DIR = '/tmp/stockwise_verify_t95_' + Date.now();
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

  console.log('Launching headless Chrome for T-9.5 verification...');
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9258',
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
      const res = await fetch('http://127.0.0.1:9258/json/list');
      const list = await res.json();
      const page = list.find((t) => t.type === 'page') || list[0];
      if (page && page.webSocketDebuggerUrl) {
        pageWsUrl = page.webSocketDebuggerUrl;
        break;
      }
    } catch {}
    await sleep(200);
  }

  if (!pageWsUrl) throw new Error('Could not connect to Chrome port 9258');

  const ws = new WebSocket(pageWsUrl);
  await new Promise((r) => (ws.onopen = r));

  let idSeq = 1;
  const pending = new Map();
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
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
  const masterPages = ['bahan', 'menu', 'event'];
  const viewports = [1280, 768, 390];

  // 1. Akun A (Data Uji)
  console.log('\n--- 1. Testing Akun A (dengan data master) ---');
  await send('Network.clearBrowserCookies');
  await send('Page.navigate', { url: 'http://localhost:5173/#/login' });
  await waitForSelector('#email');
  await evalJs(`
    document.querySelector('#email').value = 'akuna_1793505390442@stockwise.id';
    document.querySelector('#password').value = 'Password123!';
    document.querySelector('#form button[type=submit]').click();
  `);
  await waitForSelector('#sidebar-user', 15000);
  console.log('Akun A logged in successfully.');

  for (const p of masterPages) {
    for (const w of viewports) {
      await setViewport(w, w === 390 ? 844 : 900);
      await evalJs(`location.hash = '#/${p}'`);
      await sleep(600);
      await waitForSelector('#content');
      await sleep(300);

      const findings = await runUiCheckInPage();
      console.log(`Akun A #${p} at ${w}px: ${findings.length} findings`);
      if (findings.length > 0) {
        console.log('  Findings:', JSON.stringify(findings, null, 2));
        totalFindings += findings.length;
      }
      await takeScreenshot(`t95_${p}_${w}.png`);
    }
  }

  // Check modals for Akun A at 1280px
  await setViewport(1280, 900);
  // Modal Bahan
  await evalJs(`location.hash = '#/bahan'`);
  await sleep(500);
  await waitForSelector('#add-ing');
  await evalJs(`document.getElementById('add-ing').click()`);
  await waitForSelector('.modal');
  await sleep(300);
  await takeScreenshot('t95_modal_bahan_1280.png');
  await evalJs(`document.querySelector('.modal [data-close]').click()`);
  await sleep(300);

  // Modal Menu
  await evalJs(`location.hash = '#/menu'`);
  await sleep(500);
  await waitForSelector('#add-prod');
  await evalJs(`document.getElementById('add-prod').click()`);
  await waitForSelector('.modal');
  await sleep(300);
  await takeScreenshot('t95_modal_menu_1280.png');
  await evalJs(`document.querySelector('.modal [data-close]').click()`);
  await sleep(300);

  // Modal Event
  await evalJs(`location.hash = '#/event'`);
  await sleep(500);
  await waitForSelector('#add-ev');
  await evalJs(`document.getElementById('add-ev').click()`);
  await waitForSelector('.modal');
  await sleep(300);
  await takeScreenshot('t95_modal_event_1280.png');
  await evalJs(`document.querySelector('.modal [data-close]').click()`);
  await sleep(300);

  // 2. Akun B (Akun Kosong - Empty States)
  console.log('\n--- 2. Testing Akun B (Empty States Data Master) ---');
  await send('Network.clearBrowserCookies');
  await send('Page.navigate', { url: 'http://localhost:5173/#/login' });
  await waitForSelector('#email');
  await evalJs(`
    document.querySelector('#email').value = 'akunb_1793505493288@stockwise.id';
    document.querySelector('#password').value = 'Password123!';
    document.querySelector('#form button[type=submit]').click();
  `);
  await waitForSelector('#sidebar-user', 15000);
  console.log('Akun B logged in successfully.');

  for (const p of masterPages) {
    for (const w of viewports) {
      await setViewport(w, w === 390 ? 844 : 900);
      await evalJs(`location.hash = '#/${p}'`);
      await sleep(600);
      await waitForSelector('.empty');
      await sleep(300);

      const findings = await runUiCheckInPage();
      console.log(`Akun B (empty) #${p} at ${w}px: ${findings.length} findings`);
      if (findings.length > 0) {
        console.log('  Findings:', JSON.stringify(findings, null, 2));
        totalFindings += findings.length;
      }
      await takeScreenshot(`t95_${p}_empty_${w}.png`);
    }
  }

  console.log('\n=== T-9.5 VERIFICATION SUMMARY ===');
  console.log(`Total Master Data ui_check findings: ${totalFindings}`);
  if (totalFindings > 0) {
    throw new Error(`T-9.5 verification failed with ${totalFindings} findings!`);
  }

  console.log('>>> T-9.5 VERIFICATION PASSED SUCCESSFULLY! <<<');
  cleanup();
  process.exit(0);
}

main().catch((err) => {
  console.error('\n*** ERROR in verify_t95 ***', err);
  process.exit(1);
});
