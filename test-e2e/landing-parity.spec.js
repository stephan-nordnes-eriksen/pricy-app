// Visual + computed-style parity: the built app's logged-out landing vs the
// prototype (proto/index.html run exactly as Claude Design runs it — Babel,
// CDN dev React), switched to its "Public landing" screen.
//
// Run with: npm run test:e2e   (needs network for the prototype's CDN scripts)
const { test, expect } = require('@playwright/test');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const pixelmatch = require('pixelmatch');
const { PNG } = require('pngjs');

const REPO = path.join(__dirname, '..');
const ART = path.join(__dirname, '__artifacts__');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

function serve(dir, { spa } = {}) {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      let f = path.join(dir, p);
      if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) {
        if (!spa) { res.writeHead(404); return res.end(); }
        f = path.join(dir, 'index.html');
      }
      res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
      res.end(fs.readFileSync(f));
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

// jump all animations/transitions to their END state (not `none`, which
// would snap elements back to their pre-animation state)
const FREEZE = `
*, *::before, *::after {
  animation-duration: 0.001s !important;
  animation-delay: 0s !important;
  animation-iteration-count: 1 !important;
  transition-duration: 0.001s !important;
  transition-delay: 0s !important;
  caret-color: transparent !important;
}`;

async function settle(page) {
  await page.addStyleTag({ content: FREEZE });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(2500); // HeroDemo stage flip (1300ms) + counters
}

// per-element signature + the styles that define the look
function auditPage(page) {
  return page.evaluate(() => {
    const KEYS = ['font-family', 'font-size', 'font-weight', 'line-height', 'color',
      'background-color', 'border-top-width', 'border-top-color', 'border-top-style',
      'padding', 'margin', 'display', 'box-shadow', 'text-transform', 'letter-spacing',
      'border-radius', 'opacity', 'visibility'];
    const sig = el => {
      const cls = typeof el.className === 'string' && el.className.trim()
        ? '.' + el.className.trim().split(/\s+/).sort().join('.') : '';
      return el.tagName.toLowerCase() + cls;
    };
    return [...document.querySelectorAll('#root *')]
      .filter(el => !el.closest('[data-omelette-chrome]'))     // tweaks panel chrome
      .filter(el => !(el instanceof SVGElement) || el.tagName === 'svg') // skip svg internals
      .map(el => {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return {
          sig: sig(el),
          box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)].join(','),
          styles: KEYS.map(k => k + ':' + cs.getPropertyValue(k)).join(';'),
          text: (el.childElementCount === 0 ? (el.textContent || '').trim().slice(0, 40) : ''),
        };
      });
  });
}

test('logged-out landing is identical to the prototype', async ({ browser }) => {
  fs.mkdirSync(ART, { recursive: true });
  const appSrv = await serve(path.join(REPO, 'dist'), { spa: true });
  const protoSrv = await serve(REPO);
  const appUrl = `http://127.0.0.1:${appSrv.address().port}/`;
  const protoUrl = `http://127.0.0.1:${protoSrv.address().port}/proto/index.html`;

  try {
    // --- built app, logged out → landing ---------------------
    const app = await browser.newPage();
    await app.goto(appUrl);
    await app.waitForSelector('.app-hdr');

    // --- prototype, switched to its landing screen -----------
    const proto = await browser.newPage();
    await proto.goto(protoUrl);
    await proto.waitForSelector('#root > *', { timeout: 60_000 }); // babel compile
    await proto.evaluate(() => window.postMessage({ type: '__activate_edit_mode' }, '*'));
    await proto.waitForSelector('.twk-panel select');
    await proto.locator('.twk-panel select').first().selectOption('landing');
    await proto.waitForSelector('.app-hdr');
    await proto.evaluate(() => window.postMessage({ type: '__deactivate_edit_mode' }, '*'));
    await proto.waitForSelector('.twk-panel', { state: 'detached' });

    await settle(app);
    await settle(proto);

    // --- 1) element-by-element computed-style audit -----------
    const [a, b] = [await auditPage(app), await auditPage(proto)];
    const diffs = [];
    if (a.length !== b.length) diffs.push(`element count: app=${a.length} proto=${b.length}`);
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      for (const k of ['sig', 'box', 'styles', 'text']) {
        if (a[i][k] !== b[i][k]) {
          diffs.push(`#${i} <${b[i].sig}> ${k}:\n  app:   ${a[i][k]}\n  proto: ${b[i][k]}`);
          break;
        }
      }
      if (diffs.length >= 15) { diffs.push('… (truncated)'); break; }
    }

    // --- 2) pixel diff ----------------------------------------
    const shotA = PNG.sync.read(await app.screenshot({ fullPage: true }));
    const shotB = PNG.sync.read(await proto.screenshot({ fullPage: true }));
    fs.writeFileSync(path.join(ART, 'landing-app.png'), PNG.sync.write(shotA));
    fs.writeFileSync(path.join(ART, 'landing-proto.png'), PNG.sync.write(shotB));
    let pixelReport = '';
    if (shotA.width !== shotB.width || shotA.height !== shotB.height) {
      pixelReport = `page size differs: app ${shotA.width}x${shotA.height} vs proto ${shotB.width}x${shotB.height}`;
    } else {
      const diff = new PNG({ width: shotA.width, height: shotA.height });
      const bad = pixelmatch(shotA.data, shotB.data, diff.data, shotA.width, shotA.height, { threshold: 0.2 });
      fs.writeFileSync(path.join(ART, 'landing-diff.png'), PNG.sync.write(diff));
      const ratio = bad / (shotA.width * shotA.height);
      if (ratio > 0.002) pixelReport = `${bad} pixels differ (${(ratio * 100).toFixed(2)}%) — see test-e2e/__artifacts__/landing-diff.png`;
    }

    const report = [...diffs, pixelReport].filter(Boolean).join('\n\n');
    expect(report, `landing differs from prototype:\n${report}`).toBe('');
  } finally {
    appSrv.close();
    protoSrv.close();
  }
});
