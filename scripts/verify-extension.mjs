// End-to-end test of the built extension (content → background → offscreen → Stockfish → overlay).
//
// Real chess.com / lichess pages sit behind bot protection that blocks automated
// browsers, so requests to those hosts are intercepted and answered with local
// fixture pages reproducing their board DOM. The content script still runs on the
// real origin, and nothing is sent to either site.
//
// Usage: npm run build:extension && node scripts/verify-extension.mjs [screenshotDir]
import puppeteer from 'puppeteer';
import { mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const extPath = resolve(root, 'dist-extension');
const shotDir = resolve(process.argv[2] ?? join(root, 'e2e-screenshots'));
mkdirSync(shotDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

// ── fixtures ──────────────────────────────────────────────────────────────
const START = [];
'rnbqkbnr'.split('').forEach((t, i) => {
  const f = 'abcdefgh'[i];
  START.push([`${f}1`, 'w', t], [`${f}2`, 'w', 'p'], [`${f}7`, 'b', 'p'], [`${f}8`, 'b', t]);
});

const page = (body) =>
  `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#302e2b}
  .board,cg-board{position:absolute;left:120px;top:60px;width:584px;height:584px;display:block;
  background:repeating-conic-gradient(#b58863 0 25%,#f0d9b5 0 50%) 0 0/146px 146px}</style></head><body>${body}</body></html>`;

function chesscomPage(boardId, { flipped = false } = {}) {
  const pieces = START.map(([sq, c, t]) => `<div class="piece ${c}${t} square-${'abcdefgh'.indexOf(sq[0]) + 1}${sq[1]}"></div>`);
  return page(`<wc-chess-board id="${boardId}" class="board${flipped ? ' flipped' : ''}">${pieces.join('')}</wc-chess-board>`);
}

function lichessPage(fen) {
  return page(`<div class="cg-wrap orientation-white"><cg-container><cg-board></cg-board></cg-container></div>
    <div class="copyables"><div class="pair"><input class="copyable" value="${fen}"></div></div>`);
}

const MATE_W = '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1';
const NIMZO = 'rnbqk2r/pppp1ppp/4pn2/8/1bPP4/2N5/PP2PPPP/R1BQKBNR w KQkq - 2 4';
const LEGAL = 'rn1qkbnr/ppp2p1p/3p2p1/4p3/2B1P1b1/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 0 5';
const MATE_B = '3r2k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1';

const ROUTES = {
  'https://lichess.org/analysis': lichessPage(MATE_W),
  'https://lichess.org/analysis/nimzo': lichessPage(NIMZO),
  'https://lichess.org/analysis/legal': lichessPage(LEGAL),
  'https://lichess.org/AbCdEfGh': lichessPage(MATE_W), // a game page: same board, must stay dark
  'https://www.chess.com/play/computer': chesscomPage('board-play-computer'),
  'https://www.chess.com/play/computer?black': chesscomPage('board-play-computer', { flipped: true }),
  'https://www.chess.com/game/live/123456': chesscomPage('board-single'),
};

// Same steps as scoreToStepColor in src/core/move-score.ts (covered by tests/phase4.test.ts).
const STEPS = [[90, '#1fbf5a'], [75, '#7bdc4f'], [50, '#ffd93d'], [25, '#ff9a2e'], [0, '#ff4d4f']];
const scoreToColor = (score) => STEPS.find(([min]) => score >= min)[1];

// ── static checks of the built extension ─────────────────────────────────
{
  const manifest = JSON.parse(readFileSync(join(extPath, 'manifest.json'), 'utf8'));
  const refs = [
    manifest.background?.service_worker,
    manifest.action?.default_popup,
    ...(manifest.content_scripts ?? []).flatMap((c) => [...(c.js ?? []), ...(c.css ?? [])]),
    ...Object.values(manifest.icons ?? {}),
    ...(manifest.web_accessible_resources ?? []).flatMap((w) => w.resources.filter((r) => !r.includes('*'))),
  ].filter(Boolean);
  // The content-script loader imports the real bundle by URL; that file must exist too.
  for (const js of (manifest.content_scripts ?? []).flatMap((c) => c.js ?? [])) {
    const loader = readFileSync(join(extPath, js), 'utf8');
    for (const m of loader.matchAll(/getURL\("([^"]+)"\)/g)) refs.push(m[1]);
  }
  const missingFiles = refs.filter((r) => { try { statSync(join(extPath, r)); return false; } catch { return true; } });
  check('every file referenced by the manifest exists', refs.length > 3 && missingFiles.length === 0, missingFiles.join(', ') || `${refs.length} files`);
  check('manifest version matches package.json', manifest.version === JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version, manifest.version);
  check('manifest permissions are only storage + offscreen', JSON.stringify([...manifest.permissions].sort()) === '["offscreen","storage"]', JSON.stringify(manifest.permissions));
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/[.](js|html)$/.test(name)) files.push(p);
    }
  };
  walk(extPath);
  const leaking = files.filter((p) => readFileSync(p, 'utf8').includes('lichess.org/api'));
  check('the lichess game import is not bundled into the extension', leaking.length === 0, leaking.join(', '));
}

// ── run ───────────────────────────────────────────────────────────────────
const browser = await puppeteer.launch({
  headless: true,
  // GitHub-hosted Ubuntu runners block the Chrome sandbox (AppArmor user namespaces).
  args: [`--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`, ...(process.env.CI ? ["--no-sandbox"] : [])],
  defaultViewport: { width: 1000, height: 720 },
});

// Uncaught exceptions anywhere (page incl. the content script's isolated world, service
// worker, offscreen document, popup, trainer) and console errors from the extension.
const runtimeErrors = [];
const contentInfo = [];
const watch = async (target) => {
  // The service worker is watched through puppeteer's own session below (a second session closes it).
  if (!['page', 'other'].includes(target.type())) return;
  try {
    const session = await target.createCDPSession();
    const where = `${target.type()} ${target.url().replace(/^chrome-extension:\/\/[^/]+/, 'ext:')}`;
    session.on('Runtime.exceptionThrown', (e) => runtimeErrors.push(`${where}: ${e.exceptionDetails.exception?.description ?? e.exceptionDetails.text}`));
    session.on('Runtime.consoleAPICalled', (e) => {
      const text = e.args.map((a) => a.value ?? a.description ?? '').join(' ');
      if (text.includes('[LiveChess Analyzer] content script v')) contentInfo.push(text);
      if (e.type === 'error' && (target.url().startsWith('chrome-extension://') || text.includes('[LiveChess Analyzer]'))) runtimeErrors.push(`${where}: console.error ${text}`);
    });
    await session.send('Runtime.enable');
  } catch {
    // Target closed before we could attach.
  }
};
browser.on('targetcreated', watch);
for (const t of browser.targets()) await watch(t);

try {
  const swTarget = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().startsWith('chrome-extension://'));
  const sw = await swTarget.worker();
  check('service worker started', !!sw);
  sw.client.on('Runtime.exceptionThrown', (e) => runtimeErrors.push(`service_worker: ${e.exceptionDetails.exception?.description ?? e.exceptionDetails.text}`));
  sw.client.on('Runtime.consoleAPICalled', (e) => {
    if (e.type === 'error') runtimeErrors.push(`service_worker: console.error ${e.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
  });
  const extId = new URL(swTarget.url()).host;
  // Right after start-up the worker may not expose chrome.storage yet.
  for (let i = 0; i < 50 && !(await sw.evaluate(() => typeof chrome !== 'undefined' && !!chrome.storage)); i++) await sleep(100);
  const setSetting = (patch) =>
    sw.evaluate(async (patch) => {
      const { settings } = await chrome.storage.sync.get('settings');
      await chrome.storage.sync.set({ settings: { ...(settings ?? {}), ...patch } });
    }, patch);
  // Run the suite with the English UI regardless of the machine's language.
  await setSetting({ locale: 'en' });

  // Popup is localized from the dictionaries (data-i18n), in both languages.
  const popup = await browser.newPage();
  await popup.goto(`chrome-extension://${extId}/extension/popup.html`);
  await popup.waitForFunction(() => document.querySelector('#openTrainer')?.textContent?.length > 0);
  const popupEn = await popup.evaluate(() => ({ trainer: document.querySelector('#openTrainer').textContent, lang: document.documentElement.lang }));
  check('popup: English texts', popupEn.trainer === 'Open the opening trainer ↗' && popupEn.lang === 'en', JSON.stringify(popupEn));
  await popup.select('#locale', 'ru');
  const popupRu = await popup.evaluate(() => ({ trainer: document.querySelector('#openTrainer').textContent, lang: document.documentElement.lang }));
  check('popup: switching to Russian applies immediately', popupRu.trainer === 'Открыть тренажёр дебютов ↗' && popupRu.lang === 'ru', JSON.stringify(popupRu));
  await popup.select('#locale', 'en');
  await sleep(200);
  const support = await popup.evaluate(() => {
    const a = document.querySelector('#support');
    return { href: a?.href, target: a?.target, rel: a?.rel, text: a?.textContent?.trim() };
  });
  const themeOptions = await popup.evaluate(() => [...document.querySelectorAll('#boardTheme option')].map((o) => `${o.value}:${o.textContent}`));
  check('popup: board theme choice (Classic, Wood, Neon, Soft)', themeOptions.join() === 'classic:Classic,wood:Wood,neon:Neon,soft:Soft', themeOptions.join());
  await popup.select('#boardTheme', 'neon');
  await sleep(200);
  const savedTheme = await sw.evaluate(async () => (await chrome.storage.sync.get('settings')).settings?.boardTheme);
  check('popup: board theme is saved to settings', savedTheme === 'neon', String(savedTheme));
  check('popup: support link opens the Boosty page in a new tab', support.href === 'https://boosty.to/vladnoflip/donate' && support.target === '_blank' && support.rel.includes('noopener') && support.text?.includes('Support the Project'), JSON.stringify(support));
  await popup.close();

  const tab = await browser.newPage();
  await tab.setRequestInterception(true);
  tab.on('request', (req) => {
    const html = ROUTES[req.url()];
    if (html) req.respond({ status: 200, contentType: 'text/html', body: html });
    else if (/chess\.com|lichess\.org/.test(new URL(req.url()).hostname)) req.abort();
    else req.continue();
  });

  const state = () =>
    tab.evaluate(() => {
      const h = document.querySelector('livechess-analyzer-overlay');
      if (!h) return { shown: 'absent' };
      return {
        shown: h.style.display === 'none' ? 'hidden' : 'visible',
        status: h.dataset.status,
        arrow: h.dataset.arrow,
        arrows: Number(h.dataset.arrows ?? 0),
        lines: h.dataset.lines ? JSON.parse(h.dataset.lines) : [],
        opening: h.dataset.opening ?? '',
        badges: Number(h.dataset.badges ?? 0),
        font: h.dataset.font ?? '',
      };
    });
  const waitDone = async (timeout = 15000) => {
    const t0 = Date.now();
    let s = await state();
    while (Date.now() - t0 < timeout && !(s.shown === 'visible' && s.status === 'done')) {
      await sleep(200);
      s = await state();
    }
    return { ...s, ms: Date.now() - t0 };
  };

  // 1. lichess analysis: mate in one for White.
  await tab.goto('https://lichess.org/analysis');
  let s = await waitDone();
  check('lichess /analysis: engine result drawn', s.status === 'done', `${s.ms} ms`);
  check('lichess /analysis: arrow is Rd8# (d1d8)', s.arrow === 'd1d8', s.arrow);
  check('every arrow has a score badge', s.badges === s.arrows && s.badges > 0, `${s.badges} badges / ${s.arrows} arrows`);
  const off = browser.targets().find((t) => t.url().includes('offscreen.html'));
  check('offscreen document hosts the engine', !!off);
  if (off) check('offscreen is cross-origin isolated (multi-threaded)', await (await off.asPage()).evaluate(() => crossOriginIsolated));
  await tab.screenshot({ path: join(shotDir, 'lichess-analysis.png') });
  check('out-of-book position: no opening indicator', s.opening === '', JSON.stringify(s.opening));

  // 1b. MultiPV=3 in a book position: three arrows, three coloured rows, opening label.
  await tab.goto('https://lichess.org/analysis/nimzo');
  s = await waitDone();
  check('MultiPV=3: three arrows drawn', s.arrows === 3, String(s.arrows));
  check('variants panel shows three rows', s.lines.length === 3, JSON.stringify(s.lines));
  const colorsOk = s.lines.every(([, score, color], i) => color === scoreToColor(score));
  check('row colours follow the score steps', colorsOk && s.lines[0][1] === 100, JSON.stringify(s.lines.map((l) => l.slice(1))));
  const scores = s.lines.map((l) => l[1]);
  check('scores are ordered best first', scores.every((v, i) => i === 0 || v <= scores[i - 1]), scores.join(' '));
  check('opening indicator shown in theory', s.opening === 'Nimzo-Indian Defense, E20', s.opening);
  await tab.screenshot({ path: join(shotDir, 'lichess-nimzo-multipv.png') });

  // 1c. Distinct scores: Legal's 5.Nxe5!! (brilliant, blue) vs clearly weaker alternatives.
  await tab.goto('https://lichess.org/analysis/legal');
  s = await waitDone(20000);
  const [first, ...rest] = s.lines;
  check('brilliant best move is blue and marked', first?.[0] === 'Nxe5' && first?.[2] === '#33b8ff', JSON.stringify(first));
  check('weaker lines get step colours below 100', rest.length === 2 && rest.every(([, sc, col]) => sc < 95 && col === scoreToColor(sc)) && new Set(s.lines.map((l) => l[2])).size >= 2, JSON.stringify(rest));
  await tab.screenshot({ path: join(shotDir, 'lichess-legal-multipv.png') });

  // 2. Position change is picked up by polling and re-analysed.
  await tab.evaluate((fen) => {
    document.querySelector('.copyables input').value = fen;
  }, MATE_B);
  await sleep(300);
  const t0 = Date.now();
  while (Date.now() - t0 < 15000 && (await state()).arrow !== 'd8d1') await sleep(200);
  s = await state();
  check('FEN change triggers re-analysis (Rd1#, d8d1)', s.arrow === 'd8d1', `${Date.now() - t0} ms`);

  // 3. Same position again → served from cache almost instantly.
  await tab.evaluate((fen) => {
    document.querySelector('.copyables input').value = fen;
  }, MATE_W);
  const t1 = Date.now();
  while (Date.now() - t1 < 5000 && (await state()).arrow !== 'd1d8') await sleep(50);
  check('revisited position comes from cache', (await state()).arrow === 'd1d8', `${Date.now() - t1} ms`);

  // 4. lichess game page: the gate must keep the overlay off.
  await tab.goto('https://lichess.org/AbCdEfGh');
  await sleep(1500);
  s = await state();
  check('lichess game page: overlay not shown', s.shown !== 'visible', s.shown);

  // 5. chess.com bot game.
  await tab.goto('https://www.chess.com/play/computer');
  s = await waitDone();
  check('chess.com /play/computer: overlay with best move', s.status === 'done' && /^[a-h][1-8][a-h][1-8]$/.test(s.arrow ?? ''), s.arrow);
  await tab.screenshot({ path: join(shotDir, 'chesscom-bot.png') });

  // 6. "Only on my turn": playing Black, White to move → no arrow, eval still shown.
  await sw.evaluate(async () => {
    const { settings } = await chrome.storage.sync.get('settings');
    await chrome.storage.sync.set({ settings: { ...(settings ?? {}), onlyMyTurn: true } });
  });
  await tab.goto('https://www.chess.com/play/computer?black');
  s = await waitDone();
  check('"only my turn": no arrow on the bot’s turn', s.status === 'done' && s.arrow === '', JSON.stringify(s));

  // 8. Font setting reaches the overlay.
  await sw.evaluate(async () => {
    const { settings } = await chrome.storage.sync.get('settings');
    await chrome.storage.sync.set({ settings: { ...(settings ?? {}), onlyMyTurn: false, fontFamily: 'serif', fontScale: 115 } });
  });
  await tab.goto('https://lichess.org/analysis/nimzo');
  s = await waitDone();
  check('font setting applied to the overlay', s.font.includes('Georgia'), s.font);

  // 9. Trainer site inside the extension.
  const trainer = await browser.newPage();
  await trainer.goto(`chrome-extension://${extId}/extension/trainer.html`);
  await trainer.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent === 'Start training'), { timeout: 15000 });
  await trainer.evaluate(() => {
    // Sections are grouped into tabs: open "Indian", then the broad Indian-defences card.
    [...document.querySelectorAll('.group-tabs button')].find((b) => b.textContent?.startsWith('Indian'))?.click();
  });
  await sleep(100);
  const cards = await trainer.evaluate(() => [...document.querySelectorAll('.card .card-title')].map((c) => c.textContent));
  const counts = await trainer.evaluate(() => [...document.querySelectorAll('.card .card-lines')].map((c) => c.textContent));
  check('trainer: Indian tab lists its sections with line counts', cards.includes('Nimzo-Indian Defence') && counts.length === cards.length && counts.every((c) => /\d+ lines/.test(c ?? '')), `${cards.join(', ')} | ${counts.join(', ')}`);
  await trainer.evaluate(() => {
    [...document.querySelectorAll('.card')].find((c) => c.textContent?.includes('All Indian defences'))?.click();
  });
  await trainer.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent === 'Start training')?.click());
  await trainer.waitForFunction(() => document.querySelector('.move-strip')?.textContent?.includes('d4'), { timeout: 10000 });
  const pieces = await trainer.evaluate(() => document.querySelectorAll('image.piece').length);
  const trainerTheme = await trainer.evaluate(() => {
    const b = document.querySelector('svg.board');
    return { theme: b?.dataset.theme, dark: b ? getComputedStyle(b.querySelector('.sq-dark')).fill : '' };
  });
  check('trainer: board uses the theme chosen in the popup', trainerTheme.theme === 'neon' && trainerTheme.dark === 'rgb(52, 59, 134)', JSON.stringify(trainerTheme));
  await setSetting({ boardTheme: 'soft' });
  await trainer.waitForFunction(() => document.querySelector('svg.board')?.dataset.theme === 'soft', { timeout: 5000 }).catch(() => {});
  check('trainer: theme follows settings changes live', (await trainer.evaluate(() => document.querySelector('svg.board')?.dataset.theme)) === 'soft');
  check('trainer: board with cburnett pieces, book move played for White', pieces === 32, `${pieces} pieces`);
  await trainer.screenshot({ path: join(shotDir, 'trainer-start.png') });

  // A wrong move as Black (1...a5) reveals engine hints with badges.
  // Real mouse drag-and-drop (a7 -> a5), not a synthetic click.
  const centre = (sq) =>
    trainer.evaluate((sq) => {
      const r = document.querySelector(`.board .square[data-square="${sq}"] rect`).getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, sq);
  const a7 = await centre('a7');
  const a5 = await centre('a5');
  await trainer.mouse.move(a7.x, a7.y);
  await trainer.mouse.down();
  await trainer.mouse.move(a5.x, a5.y, { steps: 8 });
  const midDrag = await trainer.evaluate(() => !!document.querySelector('.piece-in-hand'));
  await trainer.mouse.up();
  check('trainer: piece follows the mouse while dragging', midDrag);
  await trainer.waitForFunction(() => document.querySelectorAll('.arrow-badge').length > 0, { timeout: 20000 });
  const fb = await trainer.evaluate(() => ({
    bad: !!document.querySelector('.feedback.tone-bad'),
    text: document.querySelector('.feedback-text')?.textContent,
    badges: document.querySelectorAll('.arrow-badge').length,
    hints: document.querySelectorAll('.hints li').length,
  }));
  check('trainer: wrong move -> feedback and engine hints with badges', fb.bad && fb.badges > 0 && fb.hints > 0, JSON.stringify(fb));
  await trainer.screenshot({ path: join(shotDir, 'trainer-mistake.png') });

  // Progress survives a reload.
  await trainer.reload();
  await trainer.waitForFunction(() => document.querySelector('.move-strip')?.textContent?.includes('d4'), { timeout: 15000 });
  const restored = await trainer.evaluate(() => ({
    text: document.querySelector('.feedback-text')?.textContent,
    errors: document.querySelector('.stats .bad')?.textContent,
  }));
  const trainerCyrillic = await trainer.evaluate(() => /[А-Яа-яЁё]/.test(document.body.innerText));
  check('trainer: English UI has no Russian text', !trainerCyrillic);
  check('trainer: progress restored after reload', restored.text?.includes('Progress restored') && restored.errors === '1', JSON.stringify(restored));
  await trainer.close();

  // 7. chess.com live game against a person: nothing.
  await tab.goto('https://www.chess.com/game/live/123456');
  await sleep(1500);
  s = await state();
  check('chess.com /game/live: overlay not shown', s.shown !== 'visible', s.shown);

  check('content script announced itself in the page console', contentInfo.some((t) => t.includes(`v${JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version}`)), contentInfo[0] ?? 'no message');
  check('no uncaught exceptions or extension console errors in any context', runtimeErrors.length === 0, runtimeErrors.slice(0, 5).join(' | '));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed. Screenshots: ${shotDir}`);
process.exit(failed ? 1 : 0);
