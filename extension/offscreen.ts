// Hosts Stockfish. Offscreen documents only get chrome.runtime, so settings come in
// as `configure` commands from the background worker.
import { EngineService, SearchCancelledError } from '../src/services/engine.service';
import { WorkerTransport, engineScriptUrl, pickEngineFlavor } from '../src/services/engine.transport';
import type { SearchInfo } from '../src/core/types';
import { isObject, type EngineUpdate, type OffscreenCommand, type OffscreenEvent } from './shared/messages';

const INFO_THROTTLE_MS = 100;

const flavor = pickEngineFlavor();
const engine = new EngineService(new WorkerTransport(engineScriptUrl(flavor, chrome.runtime.getURL('/'))));
void engine.init({ threads: 1, hashMb: 32, multiPv: 3 }).catch((e: unknown) => post({ target: 'background', type: 'engine-error', tabId: null, message: errorText(e) }));

let current: { tabId: number; fen: string } | null = null;
let lastInfoSentAt = 0;

engine.events.subscribe((event) => {
  if (event.type !== 'info' || !current || event.fen !== current.fen) return;
  const now = performance.now();
  if (now - lastInfoSentAt < INFO_THROTTLE_MS) return;
  lastInfoSentAt = now;
  post({ target: 'background', type: 'engine-update', tabId: current.tabId, update: toUpdate(event.fen, event.info, event.lines, event.elapsedMs, false, null) });
});

chrome.runtime.onMessage.addListener((raw: unknown) => {
  if (!isObject(raw) || raw.target !== 'offscreen') return;
  const msg = raw as OffscreenCommand;
  switch (msg.type) {
    case 'analyze':
      analyze(msg.tabId, msg.fen, msg.depth);
      break;
    case 'configure':
      // The single-threaded build ignores Threads > 1 anyway; keep the UCI option honest.
      void engine.configure({ threads: flavor === 'lite-multi' ? msg.threads : 1, hashMb: msg.hashMb, multiPv: msg.multiPv });
      break;
    case 'stop':
      current = null;
      engine.stop();
      break;
  }
});

function analyze(tabId: number, fen: string, depth: number): void {
  current = { tabId, fen };
  lastInfoSentAt = 0;
  engine.analyze(fen, { depth }).then(
    (result) => {
      if (current?.fen === fen) current = null;
      const info = result.info;
      post({
        target: 'background',
        type: 'engine-update',
        tabId,
        update: info
          ? toUpdate(fen, info, result.lines, result.elapsedMs, true, result.bestMove)
          : { fen, score: null, depth: 0, bestMove: result.bestMove, pv: [], lines: [], elapsedMs: result.elapsedMs, final: true },
      });
    },
    (e: unknown) => {
      if (e instanceof SearchCancelledError) return;
      post({ target: 'background', type: 'engine-error', tabId, message: errorText(e) });
    },
  );
}

function toUpdate(
  fen: string,
  info: SearchInfo,
  lines: readonly SearchInfo[],
  elapsedMs: number,
  final: boolean,
  bestMove: string | null,
): EngineUpdate {
  return {
    fen,
    score: info.score,
    depth: info.depth,
    bestMove: bestMove ?? info.pv[0] ?? null,
    pv: info.pv.slice(0, 6),
    lines: lines.map((l) => ({ ...l, pv: l.pv.slice(0, 6) })),
    elapsedMs,
    final,
  };
}

function post(event: OffscreenEvent): void {
  chrome.runtime.sendMessage(event).catch(() => {
    // Background worker may be restarting; the next update will get through.
  });
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
