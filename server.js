'use strict';

const http        = require('http');
const fs          = require('fs');
const path        = require('path');
const os          = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const PORT = 8787;
const ROOT = __dirname;

// Card constants (mm) — S exact gelijk aan HTML (72/25.4)
const TRIM_W_MM = 330;
const TRIM_H_MM = 200;
const BLEED_MM  = 3;
const MARGIN_MM = 7;          // marge rondom bleed voor snijtekens
const S = 72 / 25.4;         // 2.8346…  (exact zelfde als HTML)

const W_TOTAL_PX = TRIM_W_MM * S;
const W_H_PX     = TRIM_H_MM * S;
const BLEED_PX   = BLEED_MM  * S;

const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.json': 'application/json',
  '.icc':  'application/vnd.iccprofile',
};

// ─── CMYK CONVERSIE ──────────────────────────────────────────────────────────

async function convertToCMYK(pdfBuffer) {
  const uid    = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tmpIn  = path.join(os.tmpdir(), `blink-in-${uid}.pdf`);
  const tmpOut = path.join(os.tmpdir(), `blink-out-${uid}.pdf`);
  try {
    fs.writeFileSync(tmpIn, pdfBuffer);
    await execFileAsync('gs', [
      '-dBATCH', '-dNOPAUSE', '-dSAFER', '-q',
      '-sDEVICE=pdfwrite',
      '-sColorConversionStrategy=CMYK',
      '-dProcessColorModel=/DeviceCMYK',
      '-dCompatibilityLevel=1.4',
      '-dOverrideICC',                         // negeer embedded ICC van Puppeteer
      '-sDefaultCMYKProfile=default_cmyk.icc', // GS-profiel met 100% GCR → K=100 voor zwart
      '-sOutputFile=' + tmpOut,
      tmpIn,
    ]);
    return fs.readFileSync(tmpOut);
  } finally {
    try { fs.unlinkSync(tmpIn);  } catch (_) {}
    try { fs.unlinkSync(tmpOut); } catch (_) {}
  }
}

// ─── PDF EXPORT ──────────────────────────────────────────────────────────────

async function generatePDF(state, bleed) {
  const puppeteer = require('puppeteer');
  const { PDFDocument, PDFName, rgb } = require('pdf-lib');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'],
  });

  let browserClosed = false;
  try {
    const page = await browser.newPage();
    page.on('pageerror', err => console.error('PAGEERROR:', err.message));

    // Print-media triggert body.is-printing CSS (sidebar hide, layout reset)
    await page.emulateMediaType('print');
    await page.goto(`http://localhost:${PORT}/?print=1`, { waitUntil: 'networkidle0', timeout: 30000 });

    // Haal paginamaten op uit de HTML zelf (voorkomt mismatch met server S-waarde)
    // W, bleedPx, S zijn const — niet op window, wel direct als identifier
    const dims = await page.evaluate(() => ({
      totPx: W.total,
      hPx:   W.h,
      bpx:   bleedPx,
      S:     S,
    }));
    console.log('Kaartmaten uit HTML:', dims);

    const wCss = bleed ? dims.totPx + 2 * dims.bpx : dims.totPx;
    const hCss = bleed ? dims.hPx   + 2 * dims.bpx : dims.hPx;
    const marginCssPx = bleed ? MARGIN_MM * dims.S : 0;

    // Viewport breed genoeg voor kaart + bleed + snijteken-marge.
    // HTML gebruikt nu PX_PER_MM=96/25.4 zodat 1 CSS px = 1/96 inch,
    // wat direct overeenkomt met Chromiums standaard PDF-rendering (geen scale nodig).
    // deviceScaleFactor: 3 → rasterafbeeldingen renderen op ~288dpi (3 × 96dpi)
    await page.setViewport({
      width:  Math.ceil(wCss + 2 * marginCssPx) + 10,
      height: Math.ceil(hCss + 2 * marginCssPx) + 10,
      deviceScaleFactor: 3,
    });

    // State + render + bleed + opruimen gidselementen
    await page.evaluate((st, bleedOn, marginCssPx) => {
      Object.assign(window.st, st);
      window.st.naam = '';
      window.render();

      const toggle = document.getElementById('bleedToggle');
      if (toggle) { toggle.checked = bleedOn; window.toggleBleed(bleedOn); }

      // Gidselementen verwijderen
      document.querySelectorAll('.panel-rug, .panel-mid').forEach(el => el.style.borderRight = 'none');
      ['adresInner', 'adresBox'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });
      // logoBox alleen verbergen als er nog geen logo geladen is (placeholder zichtbaar)
      const logoBox = document.getElementById('logoBox');
      if (logoBox && logoBox.querySelector('#logoTxt')) logoBox.style.display = 'none';
      const cropSvg = document.getElementById('cropSvg');
      if (cropSvg) cropSvg.style.display = 'none';
      const gradHandle = document.getElementById('gradHandle');
      if (gradHandle) gradHandle.style.display = 'none';
      const guideLine = document.getElementById('guideLine');
      if (guideLine) guideLine.style.display = 'none';

      // Box-shadow van spread verwijderen (valt anders over de bleed)
      const spreadEl = document.getElementById('spread');
      if (spreadEl) spreadEl.style.boxShadow = 'none';

      // Panels overflow:hidden (blinkertjes scale(1.2) mogen niet uitlopen)
      document.querySelectorAll('.panel').forEach(el => el.style.overflow = 'hidden');

      // Bleed blinkertjes: panels overflow:visible + clip-path per panel zodat scale(1.2)
      // uitloopt in exact de bleed-zone, zonder spillover naar buurbpanels.
      if (bleedOn) {
        const bpx = bleedPx;
        document.querySelectorAll('.panel').forEach(el => el.style.overflow = 'visible');

        // Panels uitbreiden in hun bleed-richting zodat background-color de bleed vult.
        // clip-path alleen negatief waar geen width/height-extensie is (= boven bij alle panels).
        const rugP = document.getElementById('panelRug');
        if (rugP) {
          // Uitbreiden in alle 4 bleed-richtingen + overflow:hidden ipv clipPath.
          // overflow:hidden clips exact op de paneel-grenzen zodat blinkertjes
          // niet verder dan de bleed uitlopen, maar WEL zichtbaar zijn in de bleed.
          rugP.style.marginLeft = '-' + bpx + 'px';
          rugP.style.marginTop  = '-' + bpx + 'px';
          rugP.style.width      = (W.rug + bpx) + 'px';
          rugP.style.height     = (W.h + 2 * bpx) + 'px';
          rugP.style.overflow   = 'hidden';
          rugP.style.clipPath   = '';
          const grad = document.getElementById('cadeauGrad');
          if (grad) {
            grad.style.left = '0'; grad.style.top = '0';
            grad.style.right = '0'; grad.style.bottom = '0';
            // Stop verschuiven met bpx omdat het panel bpx omhoog is uitgebreid
            const adjStop = ((window.gradTop || 87.9) + bpx).toFixed(2);
            grad.style.background = `linear-gradient(to bottom, transparent ${adjStop}px, #fff ${adjStop}px, transparent 100%)`;
          }
        }
        const midP = document.getElementById('panelMid');
        if (midP) {
          midP.style.height   = (W.h + bpx) + 'px';
          midP.style.clipPath = `inset(${-bpx}px 0px 0px 0px)`;
        }
        const rightP = document.getElementById('panelRight');
        if (rightP) {
          rightP.style.height   = (W.h + bpx) + 'px';
          rightP.style.clipPath = `inset(${-bpx}px 0px 0px 0px)`;
          rightP.style.overflow = 'visible';
        }
        // blinkRight binnen panelRight houden maar omhoog verschuiven met bpx zodat
        // de SVG de bleed-zone bereikt. panelRight's clipPath bepaalt de zichtbare grens.
        const blinkRightEl = document.getElementById('blinkRight');
        if (blinkRightEl) {
          blinkRightEl.style.top      = (-bpx) + 'px';
          blinkRightEl.style.height   = (W.h + 2 * bpx) + 'px';
          blinkRightEl.style.overflow = 'visible';
        }

        // vpClip uitbreiden voor blinkMid (blinkRight heeft eigen container nu)
        const vbExt = bpx / (W.mid / 614.39) + 4;
        const bMidEl = document.getElementById('blinkMid');
        if (bMidEl) {
          const svgEl = bMidEl.querySelector('svg');
          if (svgEl) {
            svgEl.style.overflow = 'visible';
            svgEl.querySelectorAll('clipPath rect').forEach(function(r) {
              if (parseFloat(r.getAttribute('y') || '0') > -1) {
                var h = parseFloat(r.getAttribute('height') || '0');
                r.setAttribute('y', (-vbExt).toFixed(2));
                r.setAttribute('height', (h + vbExt).toFixed(2));
              }
            });
          }
        }
        // Spread uitbreiden + goudkleurige achtergrond zodat background-color de bleed vult
        const spreadEl2 = document.getElementById('spread');
        if (spreadEl2) {
          spreadEl2.style.width      = (W.total + bpx) + 'px';
          spreadEl2.style.height     = (W.h     + bpx) + 'px';
          spreadEl2.style.background = window.st.bgKleur;
        }
      }

      // WitteHoek naar spread-niveau: kan dan buiten panelRight bloeden
      const bpx = bleedPx;
      const totPx = W.total;
      const hPx   = W.h;
      const wh = document.getElementById('witteHoek');
      const sp = document.getElementById('spread');
      if (wh && sp) {
        wh.style.left   = (totPx - 84 * S) + 'px';
        wh.style.top    = (hPx   - 56 * S) + 'px';
        wh.style.right  = 'auto';
        wh.style.bottom = 'auto';
        sp.style.overflow = 'visible';
        sp.appendChild(wh);
      }

      // SpreadOuter: positie relative + marge = snijteken-marge + bleed
      const outer = document.getElementById('spreadOuter');
      if (outer) {
        outer.style.setProperty('position', 'relative', 'important');
        outer.style.setProperty('overflow', 'visible', 'important');
        const bpx2 = bleedOn ? bleedPx : 0;
        outer.style.marginLeft = (marginCssPx + bpx2) + 'px';
        outer.style.marginTop  = (marginCssPx + bpx2) + 'px';
        outer.style.breakInside = 'avoid';
        outer.style.pageBreakInside = 'avoid';
      }
    }, state, bleed, marginCssPx);

    // Zonder dit schaalt Chrome's print-renderer content kleiner als de scrollWidth
    // de papierbreedte overschrijdt (shrink-to-fit). De scale(1.2) blink-overlays
    // steken buiten het papier uit en veroorzaken zo een krimp van ~2%, waardoor de
    // rechter bleed wit bleef. Met overflow-x:hidden!important verdwijnt de extra
    // scrollbreedte en verschijnt de rechter bleed correct.
    await page.evaluate(() => {
      document.documentElement.style.setProperty('overflow-x', 'hidden', 'important');
      document.body.style.setProperty('overflow-x', 'hidden', 'important');
    });

    // Wacht op font/SVG rendering
    await new Promise(r => setTimeout(r, 800));

    // Vector PDF via Puppeteer (tekst blijft vector/ingesloten font)
    const pgWMm = (wCss + 2 * marginCssPx) / dims.S;
    const pgHMm = (hCss + 2 * marginCssPx) / dims.S;
    // scale:1 (default) — de zoom:96/72 op root zorgt al dat 1 CSS px = 1/72 inch.
    // scale>1 zou content rechts/onder wegknippen; zoom op root doet dat niet.
    const pdfRaw = await page.pdf({
      width:           `${pgWMm}mm`,
      height:          `${pgHMm}mm`,
      printBackground: true,
      margin:          { top: '0', right: '0', bottom: '0', left: '0' },
    });
    console.log(`PDF buitenkant: ${pgWMm.toFixed(1)}×${pgHMm.toFixed(1)} mm`);

    // ── Binnenkant (pagina 2) ───────────────────────────────────────────────
    await page.evaluate((st, bleedOn) => {
      Object.assign(window.st, st);

      // Velden die de drukker invult — leeg in PDF, alleen zichtbaar in preview
      window.st.binnenUrl        = '';
      window.st.binnenGeldig     = '';
      window.st.binnenCode       = '';
      window.st.binnenWachtwoord = '';

      // Wissel view: toon binnenkant, verberg buitenkant
      const spreadEl    = document.getElementById('spread');
      const spreadBinEl = document.getElementById('spreadBinnen');
      if (spreadEl)    spreadEl.style.display    = 'none';
      if (spreadBinEl) spreadBinEl.style.display = '';

      // Patch applyGradBackground vóór renderBinnen zodat élke aanroep (ook intern)
      // de bleed-compensatie meeneemt — anders overschrijft renderBinnen de correctie.
      if (bleedOn) {
        const _bpx = bleedPx;
        window.applyGradBackground = function() {
          const stop = (window.st.gradTop + _bpx).toFixed(2);
          const css  = `linear-gradient(to bottom, transparent ${stop}px, #fff ${stop}px, transparent 100%)`;
          const gm = document.getElementById('binnenGradMid');
          if (gm) gm.style.background = css;
          const gr = document.getElementById('binnenGradRechts');
          if (gr) gr.style.background = css;
        };
      }

      window.renderBinnen();
      if (typeof window.layoutBinnenElements === 'function') window.layoutBinnenElements();

      // Box-shadow verwijderen
      if (spreadBinEl) spreadBinEl.style.boxShadow = 'none';


      if (bleedOn) {
        const bpx = bleedPx;

        // binnenLinks (uiterst links): uitbreiden links + boven + onder
        const blEl = document.getElementById('binnenLinks');
        if (blEl) {
          blEl.style.marginLeft = '-' + bpx + 'px';
          blEl.style.marginTop  = '-' + bpx + 'px';
          blEl.style.width      = (Math.round(140 * S) + bpx) + 'px';
          blEl.style.height     = (Math.round(200 * S) + 2 * bpx) + 'px';
          blEl.style.overflow   = 'hidden';
        }

        // binnenMidden: uitbreiden boven + onder
        const bmEl = document.getElementById('binnenMidden');
        if (bmEl) {
          bmEl.style.marginTop = '-' + bpx + 'px';
          bmEl.style.height    = (Math.round(200 * S) + 2 * bpx) + 'px';
          bmEl.style.overflow  = 'hidden';
        }

        // binnenRechts (uiterst rechts): uitbreiden rechts + boven + onder
        const brEl = document.getElementById('binnenRechts');
        if (brEl) {
          brEl.style.marginTop = '-' + bpx + 'px';
          brEl.style.width     = (Math.round(50 * S) + bpx) + 'px';
          brEl.style.height    = (Math.round(200 * S) + 2 * bpx) + 'px';
          brEl.style.overflow  = 'visible'; // loginVeld/wachtwoordVeld bloeden 3mm uit
          const bblEl = document.getElementById('blinkBinnenRechts');
          if (bblEl) bblEl.style.overflow = 'hidden';
        }

        // Gradient-stop compenseren voor marginTop bleed-offset op binnenMidden en binnenRechts.
        // Zonder compensatie staan de gradients 3mm (= bpx) hoger dan op de buitenkant.
        const _gradStop = ((window.gradTop || st.gradTop || 87.9) + bpx).toFixed(2);
        const _gradCss  = `linear-gradient(to bottom, transparent ${_gradStop}px, #fff ${_gradStop}px, transparent 100%)`;
        const _bgmEl = document.getElementById('binnenGradMid');
        if (_bgmEl) _bgmEl.style.background = _gradCss;
        const _bgrEl = document.getElementById('binnenGradRechts');
        if (_bgrEl) _bgrEl.style.background = _gradCss;

        // spreadBinnen uitbreiden zodat achtergrond de bleed-zone vult
        if (spreadBinEl) {
          spreadBinEl.style.width  = (Math.round(330 * S) + bpx) + 'px';
          spreadBinEl.style.height = (Math.round(200 * S) + bpx) + 'px';
        }
      }
    }, state, bleed);

    await new Promise(r => setTimeout(r, 800));

    const pdfRawBinnen = await page.pdf({
      width:           `${pgWMm}mm`,
      height:          `${pgHMm}mm`,
      printBackground: true,
      margin:          { top: '0', right: '0', bottom: '0', left: '0' },
    });
    console.log(`PDF binnenkant: ${pgWMm.toFixed(1)}×${pgHMm.toFixed(1)} mm`);

    await browser.close();
    browserClosed = true;

    // ── CMYK conversie via Ghostscript (zwart → K=100) ─────────────────────
    let cmykConverted = false;
    try {
      pdfRaw       = Buffer.from(await convertToCMYK(pdfRaw));
      pdfRawBinnen = Buffer.from(await convertToCMYK(pdfRawBinnen));
      cmykConverted = true;
      console.log('Ghostscript CMYK conversie geslaagd');
    } catch (e) {
      console.warn('Ghostscript niet beschikbaar, RGB-fallback:', e.message);
    }

    // ── Build PDF ──────────────────────────────────────────────────────────
    const MM2PT   = 72 / 25.4;
    const trimWMm = dims.totPx / dims.S;   // 330mm
    const trimHMm = dims.hPx   / dims.S;   // 200mm
    const bleedMm = dims.bpx   / dims.S;   // 3mm

    const cWMm = bleed ? trimWMm + 2 * bleedMm : trimWMm;
    const cHMm = bleed ? trimHMm + 2 * bleedMm : trimHMm;
    const cWPt = cWMm * MM2PT;
    const cHPt = cHMm * MM2PT;

    const marginPt = bleed ? MARGIN_MM * MM2PT : 0;
    const pgWPt = cWPt + 2 * marginPt;
    const pgHPt = cHPt + 2 * marginPt;

    // Laad Puppeteer vector-PDF en voeg metadata toe via pdf-lib
    const pdfDoc  = await PDFDocument.load(pdfRaw);
    const pdfPage = pdfDoc.getPages()[0];

    const bleedPt = bleedMm * MM2PT;
    const trimL = marginPt + bleedPt;
    const trimR = pgWPt - marginPt - bleedPt;
    const trimB = marginPt + bleedPt;
    const trimT = pgHPt  - marginPt - bleedPt;
    const gap   = 2 * MM2PT;
    const len   = 5 * MM2PT;
    const black = rgb(0, 0, 0);
    const marks = [
      // linksonder
      [trimL - gap, trimB, trimL - gap - len, trimB],
      [trimL, trimB - gap, trimL, trimB - gap - len],
      // rechtsboven
      [trimR + gap, trimT, trimR + gap + len, trimT],
      [trimR, trimT + gap, trimR, trimT + gap + len],
      // linksboven
      [trimL - gap, trimT, trimL - gap - len, trimT],
      [trimL, trimT + gap, trimL, trimT + gap + len],
      // rechtsonder
      [trimR + gap, trimB, trimR + gap + len, trimB],
      [trimR, trimB - gap, trimR, trimB - gap - len],
    ];

    const applyTrimAndMarks = (p) => {
      p.node.set(PDFName.of('TrimBox'),  pdfDoc.context.obj([trimL, trimB, trimR, trimT]));
      p.node.set(PDFName.of('BleedBox'), pdfDoc.context.obj([marginPt, marginPt, pgWPt - marginPt, pgHPt - marginPt]));
      for (const [x1, y1, x2, y2] of marks) {
        p.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, color: black, thickness: 0.5 });
      }
    };

    if (bleed) {
      // TrimBox / BleedBox + snijtekens op pagina 1 (buitenkant)
      applyTrimAndMarks(pdfPage);
    }

    // ── Binnenkant samenvoegen als pagina 2 ────────────────────────────────
    const pdfDocBinnen = await PDFDocument.load(pdfRawBinnen);
    const [binnenPage] = await pdfDoc.copyPages(pdfDocBinnen, [0]);
    pdfDoc.addPage(binnenPage);
    if (bleed) {
      applyTrimAndMarks(pdfDoc.getPages()[1]);
    }

    // Embed sRGB ICC profile als OutputIntent (alleen bij RGB-fallback)
    if (cmykConverted) {
      console.log('CMYK PDF — sRGB ICC-embedding overgeslagen');
    }
    const iccCandidates = cmykConverted ? [] : [
      path.join(__dirname, 'assets', 'icc', 'sRGB_IEC61966-2-1_black_scaled.icc'),
      '/System/Library/ColorSync/Profiles/sRGB Profile.icc',
      '/System/Library/ColorSync/Profiles/Generic RGB Profile.icc',
    ];
    for (const iccPath of iccCandidates) {
      if (fs.existsSync(iccPath)) {
        try {
          const iccData  = fs.readFileSync(iccPath);
          const iccStream = pdfDoc.context.stream(iccData, { N: 3 });
          const iccRef    = pdfDoc.context.register(iccStream);
          const oiDict    = pdfDoc.context.obj({
            Type: 'OutputIntent', S: 'GTS_PDFA1',
            OutputConditionIdentifier: 'sRGB IEC61966-2.1',
            DestOutputProfile: iccRef,
          });
          pdfDoc.catalog.set(PDFName.of('OutputIntents'),
            pdfDoc.context.obj([pdfDoc.context.register(oiDict)]));
          console.log('ICC ingebed:', iccPath);
        } catch (e) {
          console.warn('ICC embed overgeslagen:', e.message);
        }
        break;
      }
    }

    return Buffer.from(await pdfDoc.save());

  } catch (err) {
    if (!browserClosed) await browser.close().catch(() => {});
    throw err;
  }
}

// ─── STATS ───────────────────────────────────────────────────────────────────

const STATS_FILE = process.env.STATS_FILE || path.join(__dirname, 'stats.json');

let downloads = [];
try {
  if (fs.existsSync(STATS_FILE)) {
    downloads = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
    console.log(`Stats geladen: ${downloads.length} downloads`);
  }
} catch (e) {
  console.warn('Stats laden mislukt:', e.message);
}

function logDownload() {
  downloads.push(new Date().toISOString());
  try { fs.writeFileSync(STATS_FILE, JSON.stringify(downloads)); } catch (e) { console.warn('Stats opslaan mislukt:', e.message); }
}

function statsHtml() {
  const byDay = {};
  for (const ts of downloads) {
    const day = ts.slice(0, 10);
    byDay[day] = (byDay[day] || 0) + 1;
  }
  const rows = Object.entries(byDay).sort().reverse()
    .map(([d, n]) => `<tr><td>${d}</td><td>${n}</td></tr>`).join('');
  const recent = downloads.slice(-20).reverse()
    .map(ts => `<li>${new Date(ts).toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' })}</li>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>Blink stats</title>
  <style>body{font-family:sans-serif;max-width:600px;margin:40px auto;color:#333}
  table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:8px 12px}
  th{background:#f5f5f5}h1{color:#c8a84b}</style></head><body>
  <h1>Cadeaukaart configurator</h1>
  <p><strong>Totaal downloads:</strong> ${downloads.length}</p>
  <h2>Per dag</h2>
  <table><tr><th>Datum</th><th>Downloads</th></tr>${rows || '<tr><td colspan=2>Nog geen downloads</td></tr>'}</table>
  <h2>Recente downloads</h2>
  <ul>${recent || '<li>Nog geen downloads</li>'}</ul>
  <p style="color:#999;font-size:12px">Statistieken worden permanent bewaard.</p>
  </body></html>`;
}

// ─── PDF TOKEN STORE (in-memory, auto-expire 5 min) ─────────────────────────

const pdfStore = new Map();

function storePDF(buf) {
  const crypto = require('crypto');
  const token  = crypto.randomBytes(16).toString('hex');
  pdfStore.set(token, buf);
  setTimeout(() => pdfStore.delete(token), 5 * 60 * 1000);
  return token;
}

// ─── HTTP SERVER ─────────────────────────────────────────────────────────────

http.createServer((req, res) => {

  if (req.method === 'POST' && req.url === '/export-pdf') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { state, bleed } = JSON.parse(body);
        console.log('PDF genereren… bleed:', bleed);
        const pdfBuf = await generatePDF(state, bleed);
        const token  = storePDF(pdfBuf);
        logDownload();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ token }));
        console.log(`PDF klaar (${(pdfBuf.length / 1024).toFixed(0)} KB)`);
      } catch (err) {
        console.error('Export mislukt:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (req.method === 'GET' && req.url === '/stats') {
    const STATS_PASS = process.env.STATS_PASSWORD || 'blink2026';
    const auth = req.headers['authorization'] || '';
    const [type, encoded] = auth.split(' ');
    const valid = type === 'Basic' &&
      Buffer.from(encoded || '', 'base64').toString() === `blink:${STATS_PASS}`;
    if (!valid) {
      res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Blink stats"' });
      res.end('Geen toegang');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(statsHtml());
    return;
  }

  if (req.method === 'GET' && req.url === '/beeldbank') {
    const dir = path.join(ROOT, 'assets', 'beeldbank');
    fs.readdir(dir, (err, files) => {
      if (err) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('[]'); return; }
      const imgs = files
        .filter(f => /\.(jpe?g|png|webp|gif)$/i.test(f))
        .map(f => '/assets/beeldbank/' + f);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(imgs));
    });
    return;
  }

  if (req.method === 'GET' && req.url.startsWith('/download/')) {
    const token = req.url.slice('/download/'.length);
    const buf   = pdfStore.get(token);
    if (!buf) { res.writeHead(404); res.end('Token niet gevonden of verlopen'); return; }
    pdfStore.delete(token);
    res.writeHead(200, {
      'Content-Type':        'application/pdf',
      'Content-Disposition': 'attachment; filename="blink-cadeaukaart.pdf"',
      'Content-Length':      buf.length,
    });
    res.end(buf);
    return;
  }

  const urlPath = req.url.split('?')[0];
  let filePath = path.join(ROOT, urlPath === '/' ? '/cadeaukaart-configurator.html' : urlPath);
  const ext = path.extname(filePath).toLowerCase();
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, {
      'Content-Type':  MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });

}).listen(PORT, () => console.log(`Server op http://localhost:${PORT}`));
