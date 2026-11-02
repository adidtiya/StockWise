import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ARTIFACTS_DIR = path.resolve('tests/e2e/artifacts');
const USER_DATA_DIR = '/tmp/stockwise_verify_t93_' + Date.now();
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

// WCAG contrast calculation
function getLuminance(r, g, b) {
  const a = [r, g, b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

function parseRgb(colorStr) {
  const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return [0, 0, 0];
  return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
}

function contrastRatio(rgb1, rgb2) {
  const lum1 = getLuminance(...rgb1);
  const lum2 = getLuminance(...rgb2);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}

async function main() {
  await ensureFrontendServer();

  console.log('Launching headless Chrome for T-9.3 verification...');
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9256',
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
      const res = await fetch('http://127.0.0.1:9256/json/list');
      const list = await res.json();
      const page = list.find((t) => t.type === 'page') || list[0];
      if (page && page.webSocketDebuggerUrl) {
        pageWsUrl = page.webSocketDebuggerUrl;
        break;
      }
    } catch {}
    await sleep(200);
  }

  if (!pageWsUrl) throw new Error('Could not connect to Chrome port 9256');

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

  await setViewport(1280, 900);

  // 1. Login with Akun A
  console.log('Logging in with Akun A...');
  await send('Page.navigate', { url: 'http://localhost:5173/#/login' });
  await waitForSelector('#email');
  await evalJs(`
    document.querySelector('#email').value = 'akuna_1793505390442@stockwise.id';
    document.querySelector('#password').value = 'Password123!';
    document.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  `);
  await waitForSelector('#sidebar-user', 15000);
  console.log('Akun A logged in successfully.');

  // 2. Check 1280px ui_check on all 14 pages
  const pages = [
    'dashboard',
    'bahan',
    'menu',
    'penjualan',
    'import',
    'riwayat',
    'forecast',
    'rekomendasi',
    'evaluasi',
    'langganan',
    'akun',
  ];

  console.log('\n--- Checking ui_check on all authenticated pages at 1280px ---');
  let totalFindings = 0;
  for (const page of pages) {
    await evalJs(`location.hash = '#/${page}'`);
    await sleep(600);
    await waitForSelector('#content');
    await sleep(400);
    const findings = await runUiCheckInPage();
    console.log(`Page #${page} at 1280px: ${findings.length} findings`);
    if (findings.length > 0) {
      console.log('  Findings:', JSON.stringify(findings, null, 2));
      totalFindings += findings.length;
    }
  }

  // 3. Test Toasts
  console.log('\n--- Testing Toasts ---');
  await evalJs(`
    import('./js/ui.js').then(ui => {
      ui.toast('Stok bahan berhasil diperbarui!', 'success');
      setTimeout(() => ui.toast('Peringatan: Stok ayam mendekati batas minimum!', 'warning'), 150);
      setTimeout(() => ui.toast('Gagal menghubungi server penyedia POS', 'error'), 300);
    });
  `);
  await sleep(600);
  await waitForSelector('.toast.warning');
  await takeScreenshot('t93_toast_1280.png');

  // Verify toast styles
  const toastDetails = await evalJs(`
    (() => {
      const toasts = Array.from(document.querySelectorAll('.toast')).map(t => {
        const cs = window.getComputedStyle(t);
        const r = t.getBoundingClientRect();
        return {
          text: t.textContent,
          className: t.className,
          bg: cs.backgroundColor,
          color: cs.color,
          width: r.width,
          height: r.height,
        };
      });
      const box = document.getElementById('toasts');
      const boxCs = window.getComputedStyle(box);
      return {
        toasts,
        boxZIndex: boxCs.zIndex,
        boxPointerEvents: boxCs.pointerEvents,
      };
    })()
  `);
  console.log('Toast details:', JSON.stringify(toastDetails, null, 2));

  // 4. Test Modal
  console.log('\n--- Testing Modal ---');
  // Open modal via Tambah Bahan button on /bahan
  await evalJs(`location.hash = '#/bahan'`);
  await sleep(600);
  await waitForSelector('#add-ing');
  await evalJs(`document.getElementById('add-ing').click()`);
  await waitForSelector('.modal');
  await sleep(300);

  const modalOpenClass = await evalJs(`document.body.classList.contains('modal-open')`);
  const bodyOverflow = await evalJs(`window.getComputedStyle(document.body).overflow`);
  console.log(`Modal open class on body: ${modalOpenClass}, body overflow: ${bodyOverflow}`);
  if (!modalOpenClass || bodyOverflow !== 'hidden') {
    throw new Error('body.modal-open overflow hidden check failed!');
  }

  await takeScreenshot('t93_modal_1280.png');

  // Test closing modal with Escape
  console.log('Closing modal with Escape key...');
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(300);
  const modalClosed = await evalJs(`!document.querySelector('.modal')`);
  const bodyRestored = await evalJs(`!document.body.classList.contains('modal-open')`);
  console.log(`Modal closed: ${modalClosed}, body.modal-open removed: ${bodyRestored}`);
  if (!modalClosed || !bodyRestored) {
    throw new Error('Modal Escape close failed!');
  }

  // 5. Test Table
  console.log('\n--- Testing Table ---');
  await evalJs(`location.hash = '#/bahan'`);
  await sleep(600);
  await waitForSelector('table.table');
  const tableCheck = await evalJs(`
    (() => {
      const table = document.querySelector('table.table');
      const ths = Array.from(table.querySelectorAll('th'));
      const numTds = Array.from(table.querySelectorAll('td.num'));
      const wrap = document.querySelector('.table-wrap');
      const wrapCs = window.getComputedStyle(wrap);
      return {
        hasTable: !!table,
        numHeaders: ths.length,
        numTdCount: numTds.length,
        wrapOverflowX: wrapCs.overflowX,
        tableWidth: table.getBoundingClientRect().width,
        firstNumAlign: numTds.length ? window.getComputedStyle(numTds[0]).textAlign : null,
      };
    })()
  `);
  console.log('Table details:', JSON.stringify(tableCheck, null, 2));
  await takeScreenshot('t93_table_1280.png');

  // 6. Test Badges and contrast
  console.log('\n--- Testing Badges & Contrast ---');
  // Inject sample badges into a temporary element on page to test all variants
  const badgeReport = await evalJs(`
    (() => {
      const testDiv = document.createElement('div');
      testDiv.id = 'badge-test-container';
      testDiv.style.cssText = 'position:fixed;top:80px;right:20px;z-index:9999;background:#fff;padding:16px;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.15);display:flex;flex-wrap:wrap;gap:8px;max-width:400px;';
      testDiv.innerHTML = \`
        <span class="badge dot ok">Aman (ok)</span>
        <span class="badge dot low">Risiko Rendah (low)</span>
        <span class="badge dot mid">Risiko Sedang (mid)</span>
        <span class="badge dot high">Risiko Tinggi (high)</span>
        <span class="badge info">Tahan Lama (info)</span>
        <span class="badge brand">Brand Tag</span>
        <span class="badge pro">PRO</span>
        <span class="badge">Default Badge</span>
      \`;
      document.body.appendChild(testDiv);

      return Array.from(testDiv.querySelectorAll('.badge')).map(el => {
        const cs = window.getComputedStyle(el);
        return {
          name: el.className,
          text: el.textContent.trim(),
          color: cs.color,
          bg: cs.backgroundColor,
          height: cs.height,
        };
      });
    })()
  `);

  console.log('Badge Report:');
  let badgeContrastFailures = 0;
  for (const b of badgeReport) {
    const textRgb = parseRgb(b.color);
    const bgRgb = parseRgb(b.bg);
    let ratio = contrastRatio(textRgb, bgRgb);
    // For PRO with gradient background, test against yellow/amber (#fbbf24 = 251,191,36)
    if (b.name.includes('pro')) {
      ratio = contrastRatio(textRgb, [251, 191, 36]);
    }
    console.log(`  ${b.name} ("${b.text}"): Text ${b.color} on BG ${b.bg} => Ratio: ${ratio.toFixed(2)}:1 (Pass: ${ratio >= 4.5})`);
    if (ratio < 4.5) {
      badgeContrastFailures++;
    }
  }

  await takeScreenshot('t93_badges_1280.png');
  // Remove test div
  await evalJs(`document.getElementById('badge-test-container')?.remove()`);

  // 7. Test Empty State on Akun B
  console.log('\n--- Testing Empty State with Akun B ---');
  // Clear cookies and login as Akun B
  await send('Network.clearBrowserCookies');
  await send('Page.navigate', { url: 'http://localhost:5173/#/login' });
  await waitForSelector('#email');
  await evalJs(`
    document.querySelector('#email').value = 'akunb_1793505493288@stockwise.id';
    document.querySelector('#password').value = 'Password123!';
    document.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  `);
  await waitForSelector('#sidebar-user', 15000);
  console.log('Akun B logged in successfully.');

  // Navigate to /forecast (empty state because no sales history)
  await evalJs(`location.hash = '#/forecast'`);
  await sleep(600);
  await waitForSelector('.empty');
  await sleep(400);

  const emptyCheck = await evalJs(`
    (() => {
      const el = document.querySelector('.empty');
      const svg = el ? el.querySelector('svg') : null;
      const b = el ? el.querySelector('b') : null;
      const p = el ? el.querySelector('p') : null;
      const svgR = svg ? svg.getBoundingClientRect() : null;
      return {
        hasEmpty: !!el,
        title: b ? b.textContent : null,
        desc: p ? p.textContent : null,
        svgWidth: svgR ? svgR.width : null,
        svgHeight: svgR ? svgR.height : null,
      };
    })()
  `);
  console.log('Empty state details:', JSON.stringify(emptyCheck, null, 2));
  await takeScreenshot('t93_empty_1280.png');

  // Verify ui_check on empty state
  const emptyFindings = await runUiCheckInPage();
  console.log(`ui_check on empty /forecast: ${emptyFindings.length} findings`);
  totalFindings += emptyFindings.length;

  console.log('\n=== T-9.3 VERIFICATION SUMMARY ===');
  console.log(`Total ui_check findings at 1280px: ${totalFindings}`);
  console.log(`Badge contrast failures: ${badgeContrastFailures}`);

  if (totalFindings > 0) {
    throw new Error(`T-9.3 verification failed with ${totalFindings} findings!`);
  }
  if (badgeContrastFailures > 0) {
    throw new Error(`T-9.3 verification failed with ${badgeContrastFailures} badge contrast failures!`);
  }

  console.log('>>> T-9.3 VERIFICATION PASSED SUCCESSFULLY! <<<');
  cleanup();
  process.exit(0);
}

main().catch((err) => {
  console.error('\n*** ERROR in verify_t93 ***', err);
  process.exit(1);
});
