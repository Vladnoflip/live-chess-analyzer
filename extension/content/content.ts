import type { Square } from 'chess.js';
import { boardService } from '../../src/services/board.service';
import { platformFor, type BoardSnapshot } from '../platforms';
import { FONTS, loadSettings, onSettingsChanged, type ExtensionSettings } from '../shared/settings';
import { isObject, type ContentMessage, type EngineUpdate, type TabMessage } from '../shared/messages';
import { Overlay, type OverlayArrow } from './overlay';
import { buildCandidates, type Candidate } from '../../src/core/candidates';
import { loadOpeningBook, type OpeningBook } from '../../src/core/openings';

/**
 * Polls the board every POLL_MS. Polling beats MutationObserver here: lichess keeps
 * the FEN in an <input>'s value (property changes aren't mutations), chess.com is an
 * SPA that replaces the board element on navigation, and piece animations fire
 * dozens of mutations per move. A string compare every 150 ms is cheap.
 */
const POLL_MS = 150;
/** New positions are sent at most once per this interval; also absorbs mid-animation states. */
const DEBOUNCE_MS = 200;

const platform = platformFor(location.hostname);
const VERSION = chrome.runtime.getManifest().version;
const LOG_PREFIX = '[LiveChess Analyzer]';

/** Each distinct error is logged once, so a failing tick can't flood the console or fail silently. */
const reported = new Set<string>();
function report(where: string, e: unknown): void {
  const text = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  const key = `${where}|${text}`;
  if (reported.has(key)) return;
  reported.add(key);
  console.error(`${LOG_PREFIX} ${where} failed (v${VERSION}):`, e);
}

if (platform) {
  console.info(`${LOG_PREFIX} content script v${VERSION} loaded on ${location.hostname} (overlay only on analysis boards and bot games)`);
  start().catch((e: unknown) => report('start', e));
}

async function start(): Promise<void> {
  const p = platform!;
  let settings: ExtensionSettings = await loadSettings();
  const overlay = new Overlay();

  let sentFen: string | null = null;
  let pendingFen: string | null = null;
  let pendingTimer: ReturnType<typeof setTimeout> | null = null;
  let latest: EngineUpdate | null = null;
  let errored = false;
  let active = false;
  let book: OpeningBook | null = null;
  let bookRequested = false;
  // Candidates are recomputed only when a new engine update arrives.
  let candidatesFor: EngineUpdate | null = null;
  let candidates: Candidate[] = [];
  // Last refused page/board, logged once (see tick).
  let refusedKey: string | null = null;

  onSettingsChanged((s) => {
    const searchChanged = s.depth !== settings.depth || s.multiPv !== settings.multiPv;
    settings = s;
    if (searchChanged) sentFen = null; // re-request with the new depth / MultiPV
  });

  chrome.runtime.onMessage.addListener((raw: unknown) => {
    if (!isObject(raw)) return;
    const msg = raw as TabMessage;
    if (msg.type === 'engine-update') {
      // Ignore results for a position we've already moved past.
      if (msg.update.fen !== sentFen) return;
      latest = msg.update;
      errored = false;
    } else if (msg.type === 'engine-error') {
      errored = true;
    }
  });

  const send = (msg: ContentMessage) => {
    try {
      void chrome.runtime.sendMessage(msg).catch(() => undefined);
    } catch {
      // Extension was reloaded: this content script is orphaned.
      clearInterval(timer);
      overlay.destroy();
    }
  };

  const deactivate = () => {
    overlay.hide();
    if (pendingTimer) clearTimeout(pendingTimer);
    pendingTimer = null;
    pendingFen = null;
    if (active && sentFen) send({ type: 'stop' });
    sentFen = null;
    latest = null;
    active = false;
  };

  const tick = () => {
    if (!settings.enabled) return deactivate();
    if (!p.isAllowedPage(location, document)) {
      // Say once per page/board why the overlay stays off, so a changed chess.com URL or
      // board id can be reported precisely. The gate itself is unchanged.
      const board = p.describeBoard(document);
      const key = `${location.pathname}|${board ?? ''}`;
      if (board && key !== refusedKey) {
        refusedKey = key;
        console.info(
          `${LOG_PREFIX} idle on ${location.pathname}: ${board} is not an analysis board or a game against a bot (games against people are never analysed)`,
        );
      }
      return deactivate();
    }
    refusedKey = null;
    const snap = p.read(document);
    if (!snap) return deactivate();
    active = true;
    if (settings.showOpening && !bookRequested) {
      // The book ships inside the extension bundle; nothing is fetched from the network.
      bookRequested = true;
      void loadOpeningBook().then((b) => (book = b), () => undefined);
    }

    const valid = boardService.validate(snap.fen);
    // An invalid FEN is usually a frame mid-animation; keep the previous drawing.
    if (valid.ok && valid.fen !== sentFen && valid.fen !== pendingFen) {
      pendingFen = valid.fen;
      if (pendingTimer) clearTimeout(pendingTimer);
      pendingTimer = setTimeout(() => {
        pendingTimer = null;
        sentFen = pendingFen;
        pendingFen = null;
        if (sentFen) send({ type: 'analyze', fen: sentFen });
      }, DEBOUNCE_MS);
    }
    draw(snap, valid.ok ? valid.fen : null);
  };

  // Draw state of the last drawn FEN (no game history on the page, so no threefold check).
  let drawFen: string | null = null;
  let isDrawn = false;

  const draw = (snap: BoardSnapshot, fen: string | null) => {
    const rect = snap.boardEl.getBoundingClientRect();
    if (rect.width === 0) return overlay.hide();
    const fresh = latest !== null && fen !== null && latest.fen === fen;
    const turn = fen ? boardService.turn(fen) : null;
    const myTurnOk = !settings.onlyMyTurn || snap.myColor === null || turn === snap.myColor;
    if (fresh && candidatesFor !== latest) {
      candidatesFor = latest;
      candidates = buildCandidates(latest!.fen, latest!.lines, boardService);
    }
    const shown = fresh ? candidates : [];
    const hints = myTurnOk && fresh;
    const arrows: OverlayArrow[] =
      settings.showArrow && hints
        ? shown.map((c) => ({ ...squares(c.uciMove), color: c.color, score: c.moveScore, accent: c.rank === 1, glow: c.brilliant }))
        : [];
    if (fen !== drawFen) {
      drawFen = fen;
      try {
        isDrawn = fen ? boardService.isDraw(fen) : false;
      } catch (e) {
        // Draw detection is cosmetic (grey bar); never let it break the overlay.
        isDrawn = false;
        report('draw detection', e);
      }
    }
    const opening = settings.showOpening && book && fen && book.inBook(fen) ? book.openingAt(fen) : null;
    overlay.render({
      rect,
      orientation: snap.orientation,
      // Keep the previous score while the new position is being searched — less flicker.
      score: latest?.score ?? null,
      draw: isDrawn,
      loading: !fresh || !latest!.final,
      error: errored,
      showBar: settings.showEvalBar,
      arrows,
      lines: settings.showPanel && hints ? shown.map((c) => ({ san: c.sanMove, score: c.score, moveScore: c.moveScore, color: c.color, brilliant: c.brilliant })) : null,
      opening: opening ? `${opening.name}, ${opening.eco}` : null,
      font: FONTS[settings.fontFamily].stack,
      fontScale: settings.fontScale / 100,
    });
  };

  // One bad frame (odd DOM mid-animation, an unexpected position) must not stop the overlay.
  const safeTick = () => {
    try {
      tick();
    } catch (e) {
      report('tick', e);
    }
  };
  const timer = setInterval(safeTick, POLL_MS);
  safeTick();
}

function squares(uci: string): { from: Square; to: Square } {
  return { from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square };
}
