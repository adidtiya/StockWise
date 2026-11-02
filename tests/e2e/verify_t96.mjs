import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ARTIFACTS_DIR = path.resolve('tests/e2e/artifacts');
const USER_DATA_DIR = '/tmp/stockwise_verify_t96_' + Date.now();
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

  console.log('Launching headless Chrome for T-9.6 verification...');
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9259',
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
      const res = await fetch('http://127.0.0.1:9259/json/list');
      const list = await res.json();
      const page = list.find((t) => t.type === 'page') || list[0];
      if (page && page.webSocketDebuggerUrl) {
        pageWsUrl = page.webSocketDebuggerUrl;
        break;
      }
    } catch {}
    await sleep(200);
  }

  if (!pageWsUrl) throw new Error('Could not connect to Chrome port 9259');

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

  // Login Akun A
  console.log('\nLogging in with Akun A...');
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

  const txPages = ['penjualan', 'import', 'riwayat'];
  const viewports = [1280, 768, 390];

  console.log('\n--- 1. Testing Transaction Pages Across Viewports ---');
  for (const p of txPages) {
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
      await takeScreenshot(`t96_${p}_${w}.png`);
    }
  }

  // 2. Test Excel Import with Invalid File
  console.log('\n--- 2. Testing Excel Import with Invalid File ---');
  await setViewport(1280, 900);
  await evalJs(`location.hash = '#/import'`);
  await sleep(600);
  await waitForSelector('#file');

  const invalidFilePath = path.resolve('tests/e2e/fixtures/invalid_sales.xlsx');
  const { root } = await send('DOM.getDocument');
  const { nodeId: fileInputNodeId } = await send('DOM.querySelector', {
    nodeId: root.nodeId,
    selector: '#file',
  });

  await send('DOM.setFileInputFiles', {
    nodeId: fileInputNodeId,
    files: [invalidFilePath],
  });

  await waitForSelector('#import-err', 10000);
  await sleep(400);
  const errMsg = await evalJs(`document.querySelector('#import-err').textContent`);
  console.log('Invalid file error message:', errMsg.slice(0, 120) + '...');
  await takeScreenshot('t96_import_error_1280.png');

  const invalidFindings = await runUiCheckInPage();
  console.log(`ui_check on import error state: ${invalidFindings.length} findings`);
  totalFindings += invalidFindings.length;

  // 3. Test Excel Import with Valid File
  console.log('\n--- 3. Testing Excel Import with Valid File ---');
  await waitForSelector('#file');
  const doc2 = await send('DOM.getDocument');
  const { nodeId: fileInputNodeId2 } = await send('DOM.querySelector', {
    nodeId: doc2.root.nodeId,
    selector: '#file',
  });
  const validFilePath = path.resolve('tests/e2e/fixtures/valid_sales_28d.xlsx');
  await send('DOM.setFileInputFiles', {
    nodeId: fileInputNodeId2,
    files: [validFilePath],
  });
  await evalJs(`document.querySelector('#file').dispatchEvent(new Event('change', { bubbles: true }))`);

  const startWait = Date.now();
  let importSuccess = false;
  while (Date.now() - startWait < 15000) {
    const hasRes = await evalJs(`!!document.querySelector('#import-res')`);
    const hasErr = await evalJs(`!!document.querySelector('#import-err')`);
    if (hasRes) {
      importSuccess = true;
      break;
    }
    if (hasErr) {
      const errText = await evalJs(`document.querySelector('#import-err').textContent`);
      console.log('IMPORT RETURNED ERROR IN STEP 3:', errText);
      break;
    }
    await sleep(300);
  }

  if (!importSuccess) {
    throw new Error('Valid file import did not show #import-res!');
  }
  await sleep(500);
  const resMsg = await evalJs(`document.querySelector('#import-res').textContent`);
  console.log('Valid file success message:', resMsg.replace(/\s+/g, ' ').slice(0, 120) + '...');
  await takeScreenshot('t96_import_success_1280.png');

  const validFindings = await runUiCheckInPage();
  console.log(`ui_check on import success state: ${validFindings.length} findings`);
  totalFindings += validFindings.length;

  console.log('\n=== T-9.6 VERIFICATION SUMMARY ===');
  console.log(`Total ui_check findings: ${totalFindings}`);
  if (totalFindings > 0) {
    throw new Error(`T-9.6 verification failed with ${totalFindings} findings!`);
  }

  console.log('>>> T-9.6 VERIFICATION PASSED SUCCESSFULLY! <<<');
  cleanup();
  process.exit(0);
}

main().catch((err) => {
  console.error('\n*** ERROR in verify_t96 ***', err);
  process.exit(1);
});
