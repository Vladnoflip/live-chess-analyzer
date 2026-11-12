// Manual smoke test on the LIVE lichess analysis board (not run in CI: it needs the
// network, and lichess may rate-limit automated browsers). Loads dist-extension into
// Chrome for Testing, opens https://lichess.org/analysis and reports the overlay state
// plus any uncaught exception or extension console error.
//
//   npm run build:extension && npm run smoke:lichess
//
// chess.com cannot be checked this way: it answers automated browsers with 403.
import puppeteer from 'puppeteer';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const extPath = resolve(root, 'dist-extension');
const url = process.argv[2] ?? 'https://lichess.org/analysis';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  headless: true,
  args: [`--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`, ...(process.env.CI ? ['--no-sandbox'] : [])],
  defaultViewport: { width: 1200, height: 800 },
});

const errors = [];
const info = [];
const watch = async (target) => {
  if (!['page', 'other'].includes(target.type())) return;
  try {
    const session = await target.createCDPSession();
    const where = `${target.type()} ${target.url().slice(0, 70)}`;
    session.on('Runtime.exceptionThrown', (e) => errors.push(`${where}: ${e.exceptionDetails.exception?.description ?? e.exceptionDetails.text}`));
    session.on('Runtime.consoleAPICalled', (e) => {
      const text = e.args.map((a) => a.value ?? a.description ?? '').join(' ');
      if (text.includes('[LiveChess Analyzer]')) (e.type === 'error' ? errors : info).push(text);
    });
    await session.send('Runtime.enable');
  } catch {
    // Target closed.
  }
};
browser.on('targetcreated', watch);

let ok = false;
try {
  const page = await browser.newPage();
  await watch(page.target());
  console.log(`Opening ${url} …`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  let state = null;
  for (let i = 0; i < 60; i++) {
    state = await page.evaluate(() => {
      const host = document.querySelector('livechess-analyzer-overlay');
      return host ? { ...host.dataset, display: host.style.display } : null;
    });
    if (state?.status === 'done' && Number(state.arrows) > 0) break;
    await sleep(500);
  }
  console.log('Content script:', info[0] ?? '(no start message: the content script did not load)');
  console.log('Overlay state:', JSON.stringify(state));
  console.log('Errors:', errors.length ? `\n  ${errors.join('\n  ')}` : 'none');
  ok = state?.status === 'done' && Number(state.arrows) > 0 && errors.length === 0;
  await page.screenshot({ path: join(root, 'smoke-lichess.png') });
  console.log(`Screenshot: ${join(root, 'smoke-lichess.png')}`);
} finally {
  await browser.close();
}
console.log(ok ? '\nSMOKE OK: overlay drawn on the live site.' : '\nSMOKE FAILED.');
process.exit(ok ? 0 : 1);
