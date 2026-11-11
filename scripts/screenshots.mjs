// Captures the README screenshots into docs/screenshots/.
//   npm run build && npm run build:extension && node scripts/screenshots.mjs
// Starts `vite preview` for the web app and loads dist-extension/ into Chrome for Testing.
// The extension overlay is shot on a local fixture page served on the lichess.org origin
// (requests are intercepted), because the real site blocks automated browsers.
import puppeteer from 'puppeteer';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'docs', 'screenshots');
const extPath = resolve(root, 'dist-extension');
const PORT = 4174;
mkdirSync(out, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Positions (verified with Stockfish 18 lite, see README "How move scoring works").
const LEGAL = 'rn1qkbnr/ppp2p1p/3p2p1/4p3/2B1P1b1/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 0 5'; // 5.Nxe5!! (brilliant)
const OPERA = 'r3kb1r/p2nqppp/5n2/1B2p1B1/4P3/1Q6/PPP2PPP/R3K2R w KQkq - 2 12'; // Morphy's Opera Game, before 12.O-O-O
const NIMZO = 'rnbqk2r/pppp1ppp/4pn2/8/1bPP4/2N5/PP2PPPP/R1BQKBNR w KQkq - 2 4';

// Run Vite's CLI with this Node directly (no npx/shell), so kill() stops the server on every OS.
const preview = spawn(process.execPath, [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: root,
  stdio: 'ignore',
});

const browser = await puppeteer.launch({
  headless: true,
  args: [`--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`, ...(process.env.CI ? ['--no-sandbox'] : [])],
  defaultViewport: { width: 1440, height: 900 },
});

try {
  await waitForServer(`http://localhost:${PORT}/`);

  // ── 1. Analyzer: MultiPV arrows with 0–100 badges, brilliant move selected ──
  const app = await browser.newPage();
  // Force the English UI (the app otherwise follows navigator.language).
  await app.evaluateOnNewDocument(() => localStorage.setItem('livechess.locale.v1', 'en'));
  await app.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await app.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle0' });
  await setFen(app, LEGAL);
  await waitForCandidates(app, 3);
  await app.evaluate(() => document.querySelector('.variant')?.click());
  await sleep(600);
  await assertEnglish(app, 'analyzer');
  await app.screenshot({ path: join(out, 'analyzer.png') });

  // ── 2. Variants panel: MultiPV 5, coloured score bars ──
  await app.evaluate(() => [...document.querySelectorAll('.segmented button')].find((b) => b.textContent === '5')?.click());
  await setFen(app, OPERA);
  await waitForCandidates(app, 5);
  await sleep(500);
  const panel = await app.$('.variants-panel');
  await assertEnglish(app, 'variants panel');
  await panel.screenshot({ path: join(out, 'variants-panel.png') });
  await app.close();

  // ── 3. Extension overlay on an analysis board (fixture on the lichess.org origin) ──
  const tab = await browser.newPage();
  await tab.setRequestInterception(true);
  tab.on('request', (req) => {
    if (req.url() === 'https://lichess.org/analysis') req.respond({ status: 200, contentType: 'text/html', body: lichessFixture(NIMZO) });
    else if (/lichess\.org|chess\.com/.test(new URL(req.url()).hostname)) req.abort();
    else req.continue();
  });
  await tab.goto('https://lichess.org/analysis');
  await tab.waitForFunction(
    () => {
      const h = document.querySelector('livechess-analyzer-overlay');
      return h && h.dataset.status === 'done' && h.dataset.opening;
    },
    { timeout: 30000 },
  );
  await sleep(800);
  await tab.screenshot({ path: join(out, 'extension-overlay.png'), clip: { x: 0, y: 0, width: 1100, height: 760 } });
  await tab.close();

  // ── 4/5. Trainer site: section cards, then a training position after a mistake ──
  const swTarget = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().startsWith('chrome-extension://'));
  const extId = new URL(swTarget.url()).host;
  const sw = await swTarget.worker();
  await sw.evaluate(async () => {
    const { settings } = await chrome.storage.sync.get('settings');
    await chrome.storage.sync.set({ settings: { ...(settings ?? {}), locale: 'en' } });
  });
  const trainer = await browser.newPage();
  await trainer.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  await trainer.goto(`chrome-extension://${extId}/extension/trainer.html`);
  await trainer.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent === 'Start training'), { timeout: 20000 });
  await trainer.evaluate(() => [...document.querySelectorAll('.card')].find((c) => c.textContent?.includes('Indian defences'))?.click());
  await sleep(300);
  await assertEnglish(trainer, 'trainer sections');
  await trainer.screenshot({ path: join(out, 'trainer-sections.png') });

  await trainer.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent === 'Start training')?.click());
  await trainer.waitForFunction(() => document.querySelector('.move-strip')?.textContent?.includes('d4'), { timeout: 15000 });
  await sleep(600);
  // Drag a non-book move with the mouse (1...a5) to show feedback and engine hints.
  const centre = (sq) =>
    trainer.evaluate((sq) => {
      const r = document.querySelector(`.board .square[data-square="${sq}"] rect`).getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, sq);
  const from = await centre('a7');
  const to = await centre('a5');
  await trainer.mouse.move(from.x, from.y);
  await trainer.mouse.down();
  await trainer.mouse.move(to.x, to.y, { steps: 10 });
  await trainer.mouse.up();
  await trainer.waitForFunction(() => document.querySelectorAll('.hints li').length >= 3 && document.querySelector('.hints .muted')?.textContent !== 'thinking…', {
    timeout: 30000,
  });
  await sleep(800);
  await assertEnglish(trainer, 'trainer training');
  await trainer.screenshot({ path: join(out, 'trainer-training.png') });
  await trainer.close();

  console.log(`Screenshots written to ${out}`);
} finally {
  await browser.close();
  preview.kill();
}

/** Screenshots must show the English UI only. */
async function assertEnglish(page, what) {
  // The language picker lists Russian by its own name (endonym); that is expected.
  const sample = await page.evaluate(() => (document.body.innerText.replace(/Русский/g, '').match(/[^\n]*[А-Яа-яЁё][^\n]*/) ?? [null])[0]);
  if (sample) throw new Error(`Russian text on the ${what} screenshot: ${sample}`);
}

async function waitForServer(url) {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      // not up yet
    }
    await sleep(500);
  }
  throw new Error(`vite preview did not start on ${url}`);
}

async function setFen(page, fen) {
  await page.evaluate((fen) => {
    const ta = document.querySelector('.fen-input');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, fen);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }, fen);
}

async function waitForCandidates(page, n) {
  await page.waitForFunction(
    (n) => document.querySelector('.status')?.textContent?.startsWith('Done') && document.querySelectorAll('.variant').length >= n,
    { timeout: 60000 },
    n,
  );
}

/** Minimal page with lichess's analysis-board DOM (cg-board + copyable FEN), styled with cburnett pieces. */
function lichessFixture(fen) {
  const svg = (name) => `url("data:image/svg+xml;base64,${readFileSync(join(root, 'src/assets/pieces/cburnett', `${name}.svg`)).toString('base64')}")`;
  const names = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
  const sq = 80;
  const pieces = [];
  fen.split(' ')[0].split('/').forEach((row, r) => {
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) {
        f += Number(ch);
        continue;
      }
      const color = ch === ch.toUpperCase() ? 'white' : 'black';
      pieces.push(`<piece class="${color} ${names[ch.toLowerCase()]}" style="transform: translate(${f * sq}px, ${r * sq}px);"></piece>`);
      f++;
    }
  });
  const pieceCss = Object.entries(names)
    .flatMap(([k, n]) => [
      `piece.white.${n}{background-image:${svg('w' + k.toUpperCase())}}`,
      `piece.black.${n}{background-image:${svg('b' + k.toUpperCase())}}`,
    ])
    .join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Analysis board (fixture)</title><style>
    body{margin:0;background:#161512;color:#bababa;font:14px system-ui,sans-serif}
    header{height:44px;background:#262421;display:flex;align-items:center;padding:0 24px;font-weight:600;color:#ddd}
    .cg-wrap{position:absolute;left:96px;top:92px;width:${sq * 8}px;height:${sq * 8}px}
    cg-board{position:absolute;inset:0;display:block;background:repeating-conic-gradient(#b58863 0 25%,#f0d9b5 0 50%) 0 0/${sq * 2}px ${sq * 2}px}
    piece{position:absolute;width:${sq}px;height:${sq}px;background-size:cover}
    ${pieceCss}
    .copyables{position:absolute;left:96px;top:${92 + sq * 8 + 12}px}
    .copyables input{width:${sq * 8 - 12}px;background:#262421;border:1px solid #404040;color:#bababa;padding:6px;font:12px monospace}
  </style></head><body><header>Analysis board — local fixture with the lichess DOM structure</header>
  <div class="cg-wrap orientation-white"><cg-container><cg-board>${pieces.join('')}</cg-board></cg-container></div>
  <div class="copyables"><div class="pair"><input class="copyable" value="${fen}"></div></div></body></html>`;
}
