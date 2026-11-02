import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ARTIFACTS_DIR = path.resolve('tests/e2e/artifacts');
const USER_DATA_DIR = '/tmp/stockwise_verify_t94_' + Date.now();
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

  console.log('Launching headless Chrome for T-9.4 verification...');
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9257',
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
      const res = await fetch('http://127.0.0.1:9257/json/list');
      const list = await res.json();
      const page = list.find((t) => t.type === 'page') || list[0];
      if (page && page.webSocketDebuggerUrl) {
        pageWsUrl = page.webSocketDebuggerUrl;
        break;
      }
    } catch {}
    await sleep(200);
  }

  if (!pageWsUrl) throw new Error('Could not connect to Chrome port 9257');

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

  console.log('\n--- 1. Testing Login Form Errors & Loading State ---');
  await send('Network.clearBrowserCookies');
  await send('Page.navigate', { url: 'http://localhost:5173/#/login' });
  await waitForSelector('#email');

  // Test empty submit validation
  await evalJs(`document.querySelector('#form button[type=submit]').click()`);
  await sleep(200);
  const emptyErr = await evalJs(`document.querySelector('#err').textContent`);
  console.log('Empty submit inline error:', emptyErr);
  if (!emptyErr.includes('wajib diisi')) {
    throw new Error('Empty form validation inline error failed!');
  }

  // Test wrong password
  await evalJs(`
    document.querySelector('#email').value = 'akuna_1793505390442@stockwise.id';
    document.querySelector('#password').value = 'WrongPassword999!';
    document.querySelector('#form button[type=submit]').click();
  `);
  await sleep(1000);
  await waitForSelector('#err');
  const wrongPassErr = await evalJs(`document.querySelector('#err').textContent`);
  console.log('Wrong password inline error:', wrongPassErr);
  if (!wrongPassErr) {
    throw new Error('Wrong password inline error not shown in #err!');
  }
  await takeScreenshot('t94_login_error_1280.png');

  console.log('\n--- 2. Testing Register Form Duplicate Email Error ---');
  await send('Page.navigate', { url: 'http://localhost:5173/#/register' });
  await waitForSelector('#name');

  // Step 0 with duplicate email
  await evalJs(`
    document.querySelector('#name').value = 'Uji Duplikat';
    document.querySelector('#email').value = 'akuna_1793505390442@stockwise.id';
    document.querySelector('#phone').value = '081234567891';
    document.querySelector('#password').value = 'Password123!';
    document.querySelector('#form button[type=submit]').click();
  `);
  await waitForSelector('#business_name');

  // Step 1
  await evalJs(`
    document.querySelector('#business_name').value = 'Bisnis Duplikat';
    document.querySelector('#city').value = 'Bandung';
    document.querySelector('#form button[type=submit]').click();
  `);
  await waitForSelector('input[name=seed_demo]');

  // Step 2
  await evalJs(`
    document.querySelector('input[name=seed_demo]').checked = false;
    document.querySelector('#form button[type=submit]').click();
  `);
  await sleep(1200);

  // Expect redirect back to step 0 with email error
  await waitForSelector('#err');
  const dupEmailErr = await evalJs(`document.querySelector('#err').textContent`);
  console.log('Duplicate email inline error:', dupEmailErr);
  if (!dupEmailErr || !dupEmailErr.toLowerCase().includes('email')) {
    throw new Error('Duplicate email inline error check failed!');
  }
  await takeScreenshot('t94_register_error_1280.png');

  console.log('\n--- 3. Testing Empty Dashboard Checklist Onboarding Across Viewports ---');
  // Login as Akun B (empty account)
  await send('Page.navigate', { url: 'http://localhost:5173/#/login' });
  await waitForSelector('#email');
  await evalJs(`
    document.querySelector('#email').value = 'akunb_1793505493288@stockwise.id';
    document.querySelector('#password').value = 'Password123!';
    document.querySelector('#form button[type=submit]').click();
  `);
  await waitForSelector('#sidebar-user', 15000);
  console.log('Akun B logged in successfully.');

  await evalJs(`location.hash = '#/dashboard'`);
  await sleep(600);
  await waitForSelector('.list-item');

  let checklistTotalFindings = 0;
  for (const width of [1280, 768, 390]) {
    await setViewport(width, width === 390 ? 844 : 900);
    await sleep(400);

    const checklistData = await evalJs(`
      (() => {
        const items = Array.from(document.querySelectorAll('.list-item')).map(item => {
          const title = item.querySelector('.title')?.textContent.trim();
          const meta = item.querySelector('.meta')?.textContent.trim();
          const svg = item.querySelector('svg:last-child');
          const svgR = svg?.getBoundingClientRect();
          const metaR = item.querySelector('.meta')?.getBoundingClientRect();
          return {
            title,
            meta,
            svgWidth: svgR?.width,
            svgHeight: svgR?.height,
            metaWidth: metaR?.width,
            metaHeight: metaR?.height,
          };
        });
        return items;
      })()
    `);
    console.log(`\nViewPort ${width}px checklist items:`, JSON.stringify(checklistData, null, 2));

    const findings = await runUiCheckInPage();
    console.log(`ui_check at ${width}px: ${findings.length} findings`);
    if (findings.length > 0) {
      console.log('  Findings:', JSON.stringify(findings, null, 2));
      checklistTotalFindings += findings.length;
    }

    await takeScreenshot(`t94_dashboard_${width}.png`);
  }

  console.log('\n=== T-9.4 VERIFICATION SUMMARY ===');
  console.log(`Total checklist ui_check findings: ${checklistTotalFindings}`);
  if (checklistTotalFindings > 0) {
    throw new Error(`T-9.4 verification failed with ${checklistTotalFindings} findings!`);
  }

  console.log('>>> T-9.4 VERIFICATION PASSED SUCCESSFULLY! <<<');
  cleanup();
  process.exit(0);
}

main().catch((err) => {
  console.error('\n*** ERROR in verify_t94 ***', err);
  process.exit(1);
});
