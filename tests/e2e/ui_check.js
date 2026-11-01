/**
 * ui_check.js - StockWise E2E UI Checker
 * 
 * Fungsi ini dapat ditempelkan langsung ke konsol browser DevTools.
 * Mengembalikan array temuan (findings).
 * 
 * Empat pemeriksaan:
 * (a) SVG lebih dari 64 px (kecuali grafik dan ilustrasi yang disengaja)
 * (b) Overflow horizontal (scrollWidth > innerWidth)
 * (c) Elemen teks panjang (> 30 karakter) pada elemen sempit (< 120 px)
 * (d) Gambar atau font yang gagal dimuat
 */
function runUiCheck() {
  const findings = [];

  function getSelector(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return '';
    if (el.id) return `#${el.id}`;
    let sel = el.tagName.toLowerCase();
    if (el.className && typeof el.className === 'string') {
      const cls = el.className.trim().split(/\s+/).filter(c => c && !c.startsWith('ng-')).slice(0, 3).join('.');
      if (cls) sel += `.${cls}`;
    }
    if (el.parentElement && el.parentElement !== document.body && el.parentElement !== document.documentElement) {
      const parentSel = el.parentElement.id ? `#${el.parentElement.id}` : el.parentElement.tagName.toLowerCase() + (el.parentElement.className && typeof el.parentElement.className === 'string' ? '.' + el.parentElement.className.trim().split(/\s+/)[0] : '');
      return `${parentSel} > ${sel}`;
    }
    return sel;
  }

  // 1. Pemeriksaan (a): Elemen SVG > 64 px (grafik dan ilustrasi yang disengaja dikecualikan)
  const svgs = document.querySelectorAll('svg');
  for (const svg of svgs) {
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    if (rect.width > 64 || rect.height > 64) {
      // Periksa apakah ini grafik atau ilustrasi yang disengaja:
      // - .onb-art (ilustrasi onboarding)
      // - svg.chart atau .chart-card / .chart-wrap (grafik tren penjualan / analitik)
      const isIntentional = svg.closest('.onb-art') ||
                            svg.classList.contains('chart') ||
                            svg.closest('.chart-card') ||
                            svg.closest('.chart-wrap');
      if (!isIntentional) {
        findings.push({
          type: 'svg_oversized',
          severity: 'Tinggi',
          element: getSelector(svg),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          message: `Ikon SVG berukuran lebih dari 64 px (${Math.round(rect.width)}x${Math.round(rect.height)} px): ${getSelector(svg)}`,
        });
      }
    }
  }

  // 2. Pemeriksaan (b): Overflow horizontal (scrollWidth dokumen > innerWidth)
  const docScrollWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
  const winInnerWidth = window.innerWidth;
  if (docScrollWidth > winInnerWidth + 1) { // toleransi subpixel 1px
    const overflowEls = [];
    for (const el of document.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if ((r.right > winInnerWidth + 1 || r.left < -1) && r.width > 0 && r.height > 0) {
        overflowEls.push({
          selector: getSelector(el),
          right: Math.round(r.right),
          left: Math.round(r.left),
          width: Math.round(r.width),
        });
      }
    }
    findings.push({
      type: 'horizontal_overflow',
      severity: 'Kritis',
      docScrollWidth,
      winInnerWidth,
      overflowElements: overflowEls.slice(0, 5),
      message: `Halaman mengalami horizontal overflow: scrollWidth (${docScrollWidth} px) > innerWidth (${winInnerWidth} px)`,
    });
  }

  // 3. Pemeriksaan (c): Elemen teks yang lebarnya < 120 px padahal teksnya > 30 karakter
  for (const el of document.querySelectorAll('*')) {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;

    // Hanya evaluasi kontainer teks atau daun (tanpa elemen turunan display: block/flex/grid)
    const hasBlockChild = Array.from(el.children).some(child => {
      const cs = window.getComputedStyle(child);
      return cs.display === 'block' || cs.display === 'flex' || cs.display === 'grid';
    });
    if (hasBlockChild) continue;

    const text = el.textContent ? el.textContent.trim().replace(/\s+/g, ' ') : '';
    if (text.length > 30 && rect.width < 120) {
      findings.push({
        type: 'narrow_text',
        severity: 'Tinggi',
        element: getSelector(el),
        width: Math.round(rect.width),
        textLength: text.length,
        textPreview: text.slice(0, 50),
        message: `Teks panjang (${text.length} karakter) pada elemen sempit (${Math.round(rect.width)} px < 120 px): "${text.slice(0, 35)}..." pada ${getSelector(el)}`,
      });
    }
  }

  // 4. Pemeriksaan (d): Gambar atau font yang gagal dimuat
  for (const img of document.querySelectorAll('img')) {
    if (!img.complete || img.naturalWidth === 0) {
      if (img.src && !img.src.startsWith('data:')) {
        findings.push({
          type: 'broken_image',
          severity: 'Tinggi',
          element: getSelector(img),
          src: img.src,
          message: `Gambar gagal dimuat: ${img.src} pada ${getSelector(img)}`,
        });
      }
    }
  }

  if (document.fonts) {
    for (const font of document.fonts) {
      if (font.status === 'error') {
        findings.push({
          type: 'broken_font',
          severity: 'Tinggi',
          family: font.family,
          message: `Font gagal dimuat: ${font.family} (${font.weight} ${font.style})`,
        });
      }
    }
  }

  if (window.performance && window.performance.getEntriesByType) {
    const resources = window.performance.getEntriesByType('resource');
    for (const r of resources) {
      const isAsset = r.initiatorType === 'img' ||
                      r.initiatorType === 'css' ||
                      r.initiatorType === 'link' ||
                      r.initiatorType === 'font' ||
                      /\.(woff2?|ttf|otf|eot|png|jpe?g|gif|svg|webp|ico|css)(\?.*)?$/i.test(r.name);
      if (isAsset && r.responseStatus >= 400) {
        findings.push({
          type: 'failed_asset',
          severity: 'Tinggi',
          url: r.name,
          status: r.responseStatus,
          message: `Aset gambar/font/CSS gagal dimuat dengan status HTTP ${r.responseStatus}: ${r.name}`,
        });
      }
    }
  }

  return findings;
}

// Ekspos ke global window dan kembalikan hasil bila dievaluasi langsung di konsol
if (typeof window !== 'undefined') {
  window.runUiCheck = runUiCheck;
}
runUiCheck();
