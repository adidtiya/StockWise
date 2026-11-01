import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ARTIFACTS_DIR = path.resolve('tests/e2e/artifacts');
const USER_DATA_DIR = '/tmp/stockwise_verify_t97_' + Date.now();
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

  console.log('Launching headless Chrome for T-9.7 verification...');
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9260',
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
      const res = await fetch('http://127.0.0.1:9260/json/list');
      const list = await res.json();
      const page = list.find((t) => t.type === 'page') || list[0];
      if (page && page.webSocketDebuggerUrl) {
        pageWsUrl = page.webSocketDebuggerUrl;
        break;
      }
    } catch {}
    await sleep(200);
  }

  if (!pageWsUrl) throw new Error('Could not connect to Chrome port 9260');

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
  const analyticsPages = ['dashboard', 'forecast', 'rekomendasi', 'evaluasi'];
  const viewports = [1280, 768, 390];

  // 1. Akun A (28 hari data latih)
  console.log('\n--- 1. Testing Analytics Pages with Akun A (28-day Data) ---');
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

  for (const p of analyticsPages) {
    for (const w of viewports) {
      await setViewport(w, w === 390 ? 844 : 900);
      await evalJs(`location.hash = '#/${p}'`);
      await sleep(700);
      await waitForSelector('#content');
      await sleep(300);

      const findings = await runUiCheckInPage();
      console.log(`Akun A #${p} at ${w}px: ${findings.length} findings`);
      if (findings.length > 0) {
        console.log('  Findings:', JSON.stringify(findings, null, 2));
        totalFindings += findings.length;
      }
      await takeScreenshot(`t97_${p}_${w}.png`);
    }
  }

  // 2. Test Retrain Model on Evaluasi
  console.log('\n--- 2. Testing Retrain Model on Evaluasi ---');
  await setViewport(1280, 900);
  await evalJs(`location.hash = '#/evaluasi'`);
  await sleep(600);
  await waitForSelector('#train-btn');

  console.log('Triggering Latih Ulang Model...');
  await evalJs(`document.getElementById('train-btn').click()`);
  await sleep(400);
  const isLoading = await evalJs(`document.getElementById('train-btn')?.classList.contains('loading')`);
  console.log('Train button is in loading state:', isLoading);

  // Wait for completion (loading removed)
  const startWait = Date.now();
  while (Date.now() - startWait < 15000) {
    const stillLoading = await evalJs(`document.getElementById('train-btn')?.classList.contains('loading')`);
    if (!stillLoading) break;
    await sleep(200);
  }
  await sleep(500);
  await takeScreenshot('t97_evaluasi_trained_1280.png');
  const retrainFindings = await runUiCheckInPage();
  console.log(`ui_check after retrain: ${retrainFindings.length} findings`);
  totalFindings += retrainFindings.length;

  // 3. Akun B (Empty States - Riwayat Belum Cukup)
  console.log('\n--- 3. Testing Analytics Pages with Akun B (Empty States) ---');
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

  for (const p of ['dashboard', 'forecast', 'rekomendasi']) {
    await setViewport(1280, 900);
    await evalJs(`location.hash = '#/${p}'`);
    await sleep(600);

    const hasEmptyOrChecklist = await evalJs(`
      !!document.querySelector('.empty') || !!document.querySelector('.list-item')
    `);
    console.log(`Akun B #${p} has empty/checklist: ${hasEmptyOrChecklist}`);
    if (!hasEmptyOrChecklist) {
      throw new Error(`Akun B #${p} did not show empty state or checklist!`);
    }

    const findings = await runUiCheckInPage();
    console.log(`Akun B #${p} at 1280px: ${findings.length} findings`);
    totalFindings += findings.length;
    await takeScreenshot(`t97_empty_${p}_1280.png`);
  }

  console.log('\n=== T-9.7 VERIFICATION SUMMARY ===');
  console.log(`Total ui_check findings: ${totalFindings}`);
  console.log(`Total unexpected console errors: ${consoleErrors.length}`);
  if (consoleErrors.length > 0) {
    console.log('Console errors:', JSON.stringify(consoleErrors, null, 2));
  }

  if (totalFindings > 0) {
    throw new Error(`T-9.7 verification failed with ${totalFindings} findings!`);
  }
  if (consoleErrors.length > 0) {
    throw new Error(`T-9.7 verification failed with ${consoleErrors.length} console errors!`);
  }

  console.log('>>> T-9.7 VERIFICATION PASSED SUCCESSFULLY! <<<');
  cleanup();
  process.exit(0);
}

main().catch((err) => {
  console.error('\n*** ERROR in verify_t97 ***', err);
  process.exit(1);
});
