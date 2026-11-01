import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ARTIFACTS_DIR = path.resolve('tests/e2e/artifacts');
const USER_DATA_DIR = '/tmp/stockwise_verify_t98_' + Date.now();
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

  console.log('Launching headless Chrome for T-9.8 verification...');
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9261',
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
      const res = await fetch('http://127.0.0.1:9261/json/list');
      const list = await res.json();
      const page = list.find((t) => t.type === 'page') || list[0];
      if (page && page.webSocketDebuggerUrl) {
        pageWsUrl = page.webSocketDebuggerUrl;
        break;
      }
    } catch {}
    await sleep(200);
  }

  if (!pageWsUrl) throw new Error('Could not connect to Chrome port 9261');

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
  const viewports = [1280, 768, 390];

  // ==========================================
  // 1. Akun Freemium (Akun B)
  // ==========================================
  console.log('\n--- 1. Testing Freemium User (Akun B) ---');
  await send('Network.clearBrowserCookies');
  await send('Page.navigate', { url: 'http://localhost:5173/#/login' });
  await waitForSelector('#email');
  await evalJs(`
    document.querySelector('#email').value = 'akunb_1793505493288@stockwise.id';
    document.querySelector('#password').value = 'Password123!';
    document.querySelector('#form button[type=submit]').click();
  `);
  await waitForSelector('#sidebar-user', 15000);
  console.log('Akun B logged in successfully (Freemium).');

  // Verify Langganan page on Freemium
  for (const w of viewports) {
    await setViewport(w, w === 390 ? 844 : 900);
    await evalJs(`location.hash = '#/langganan'`);
    await sleep(600);
    await waitForSelector('.plan-card');
    await sleep(200);

    const findings = await runUiCheckInPage();
    console.log(`Freemium #/langganan at ${w}px: ${findings.length} findings`);
    if (findings.length > 0) {
      console.log('  Findings:', JSON.stringify(findings, null, 2));
      totalFindings += findings.length;
    }

    if (w === 1280) {
      const cardHeights = await evalJs(`
        (() => {
          const cards = document.querySelectorAll('.plan-card');
          return Array.from(cards).map(c => c.getBoundingClientRect().height);
        })()
      `);
      console.log('  Desktop plan card heights:', cardHeights);
      if (Math.abs(cardHeights[0] - cardHeights[1]) > 4) {
        console.warn('  WARNING: Plan cards have differing heights:', cardHeights);
      } else {
        console.log('  Plan cards are equal height: OK');
      }
    }

    await takeScreenshot(`t98_langganan_freemium_${w}.png`);
  }

  // Verify Integrasi page on Freemium
  for (const w of viewports) {
    await setViewport(w, w === 390 ? 844 : 900);
    await evalJs(`location.hash = '#/integrasi'`);
    await sleep(600);
    await waitForSelector('#providers-grid');
    await sleep(200);

    const findings = await runUiCheckInPage();
    console.log(`Freemium #/integrasi at ${w}px: ${findings.length} findings`);
    if (findings.length > 0) {
      console.log('  Findings:', JSON.stringify(findings, null, 2));
      totalFindings += findings.length;
    }
    await takeScreenshot(`t98_integrasi_freemium_${w}.png`);
  }

  // Verify Profil & Akun on Freemium
  for (const w of [1280, 390]) {
    await setViewport(w, w === 390 ? 844 : 900);
    await evalJs(`location.hash = '#/profil'`);
    await sleep(500);
    await waitForSelector('#pf');
    const pFindings = await runUiCheckInPage();
    console.log(`Freemium #/profil at ${w}px: ${pFindings.length} findings`);
    if (pFindings.length > 0) totalFindings += pFindings.length;
    await takeScreenshot(`t98_profil_freemium_${w}.png`);

    await evalJs(`location.hash = '#/akun'`);
    await sleep(500);
    await waitForSelector('.profile-head');
    const aFindings = await runUiCheckInPage();
    console.log(`Freemium #/akun at ${w}px: ${aFindings.length} findings`);
    if (aFindings.length > 0) totalFindings += aFindings.length;
    await takeScreenshot(`t98_akun_freemium_${w}.png`);
  }

  // Verify Feedback page & Modal
  console.log('\n--- Testing Feedback Page & Modal ---');
  await setViewport(1280, 900);
  await evalJs(`location.hash = '#/feedback'`);
  await sleep(600);
  await waitForSelector('#page-star-picker');

  // Test star picker click in page
  await evalJs(`document.querySelectorAll('#page-star-picker .star-btn')[3].click()`); // 4 stars
  await sleep(200);
  const pageRatingVal = await evalJs(`document.getElementById('direct-rating')?.value`);
  console.log('Feedback page rating after click 4th star:', pageRatingVal);

  const fbFindings = await runUiCheckInPage();
  console.log(`Feedback page at 1280px: ${fbFindings.length} findings`);
  if (fbFindings.length > 0) totalFindings += fbFindings.length;
  await takeScreenshot('t98_feedback_freemium_1280.png');

  // Open Feedback Modal
  await evalJs(`document.getElementById('open-feedback-modal')?.click()`);
  await sleep(400);
  await waitForSelector('#modal-star-picker');

  // Click 5th star in modal
  await evalJs(`document.querySelectorAll('#modal-star-picker .star-btn')[4].click()`);
  await sleep(200);

  const modalFindings = await runUiCheckInPage();
  console.log(`Feedback Modal at 1280px: ${modalFindings.length} findings`);
  if (modalFindings.length > 0) totalFindings += modalFindings.length;
  await takeScreenshot('t98_feedback_modal_1280.png');

  // Submit feedback in modal
  await evalJs(`
    const modalBtn = Array.from(document.querySelectorAll('.modal-foot button')).find(b => b.textContent.includes('Kirim'));
    if (modalBtn) modalBtn.click();
  `);
  await sleep(800);

  // Mobile feedback view
  await setViewport(390, 844);
  await evalJs(`location.hash = '#/feedback'`);
  await sleep(500);
  const fbMobileFindings = await runUiCheckInPage();
  console.log(`Feedback page at 390px: ${fbMobileFindings.length} findings`);
  if (fbMobileFindings.length > 0) totalFindings += fbMobileFindings.length;
  await takeScreenshot('t98_feedback_freemium_390.png');

  // ==========================================
  // 2. Akun Pro (Upgrade Akun A via checkout)
  // ==========================================
  console.log('\n--- 2. Testing Pro User (Akun A with Checkout Upgrade) ---');
  await send('Network.clearBrowserCookies');
  await send('Page.navigate', { url: 'http://localhost:5173/#/login' });
  await waitForSelector('#email');
  await evalJs(`
    document.querySelector('#email').value = 'akuna_1793505390442@stockwise.id';
    document.querySelector('#password').value = 'Password123!';
    document.querySelector('#form button[type=submit]').click();
  `);
  await waitForSelector('#sidebar-user', 15000);
  console.log('Akun A logged in.');

  await setViewport(1280, 900);
  await evalJs(`location.hash = '#/langganan'`);
  await sleep(600);
  await waitForSelector('.plan-card');

  const upgradeBtnExists = await evalJs(`!!document.getElementById('upgrade')`);
  if (upgradeBtnExists) {
    // Open Checkout Modal
    console.log('Opening Subscription Checkout Modal...');
    await evalJs(`document.getElementById('upgrade')?.click()`);
    await sleep(400);
    await waitForSelector('#sim-badge');
    await takeScreenshot('t98_checkout_modal_1280.png');

    // Perform Simulation Checkout
    console.log('Submitting simulation checkout...');
    await evalJs(`
      const checkoutBtn = Array.from(document.querySelectorAll('.modal-foot button')).find(b => b.textContent.includes('Tingkatkan ke Pro'));
      if (checkoutBtn) checkoutBtn.click();
    `);
    await sleep(1500);
  }

  // Verify Pro status
  const roleText = await evalJs(`document.getElementById('role-title')?.innerText`);
  console.log('Updated role title on Langganan page:', roleText);

  // Test Langganan as Pro
  for (const w of viewports) {
    await setViewport(w, w === 390 ? 844 : 900);
    await evalJs(`location.hash = '#/langganan'`);
    await sleep(600);
    await waitForSelector('.plan-card');

    const findings = await runUiCheckInPage();
    console.log(`Pro #/langganan at ${w}px: ${findings.length} findings`);
    if (findings.length > 0) totalFindings += findings.length;
    await takeScreenshot(`t98_langganan_pro_${w}.png`);
  }

  // Test Integrasi as Pro
  for (const w of viewports) {
    await setViewport(w, w === 390 ? 844 : 900);
    await evalJs(`location.hash = '#/integrasi'`);
    await sleep(600);
    await waitForSelector('#providers-grid');

    const findings = await runUiCheckInPage();
    console.log(`Pro #/integrasi at ${w}px: ${findings.length} findings`);
    if (findings.length > 0) totalFindings += findings.length;
    await takeScreenshot(`t98_integrasi_pro_${w}.png`);
  }

  // Connect MokaPOS as Pro if not already connected
  console.log('\n--- Connecting MokaPOS integration as Pro ---');
  await setViewport(1280, 900);
  await evalJs(`location.hash = '#/integrasi'`);
  await sleep(600);
  await waitForSelector('#providers-grid');

  const connectBtnExists = await evalJs(`!!document.querySelector('.connect-btn[data-connect="mokapos"]')`);
  if (connectBtnExists) {
    await evalJs(`document.querySelector('.connect-btn[data-connect="mokapos"]').click()`);
    await sleep(1000);
    await waitForSelector('.sync-btn[data-sync="mokapos"]');
  }

  // Sync MokaPOS
  console.log('MokaPOS ready. Triggering sync...');
  await evalJs(`document.querySelector('.sync-btn[data-sync="mokapos"]').click()`);
  await sleep(600);
  await waitForSelector('#providers-grid', 15000);
  await sleep(400);

  const afterSyncFindings = await runUiCheckInPage();
  console.log(`Pro #/integrasi after sync: ${afterSyncFindings.length} findings`);
  if (afterSyncFindings.length > 0) totalFindings += afterSyncFindings.length;
  await takeScreenshot('t98_integrasi_pro_connected_1280.png');

  // Verify Pro Profil & Akun
  for (const w of [1280, 390]) {
    await setViewport(w, w === 390 ? 844 : 900);
    await evalJs(`location.hash = '#/profil'`);
    await sleep(500);
    await waitForSelector('#pf');
    const pFindings = await runUiCheckInPage();
    console.log(`Pro #/profil at ${w}px: ${pFindings.length} findings`);
    if (pFindings.length > 0) totalFindings += pFindings.length;
    await takeScreenshot(`t98_profil_pro_${w}.png`);
  }

  console.log('\n==========================================');
  console.log(`Verification Complete. Total findings: ${totalFindings}`);
  console.log(`Total console errors: ${consoleErrors.length}`);
  console.log('==========================================');

  cleanup();
  process.exit(totalFindings === 0 && consoleErrors.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
