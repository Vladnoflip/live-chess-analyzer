import { Emitter } from '../core/observable';
import type { SearchInfo, SearchResult } from '../core/types';
import type { UciTransport } from './engine.transport';
import { parseUciLine, toWhitePov, type RawInfo, type UciMessage } from './uci.parser';

export type EngineEvent =
  | {
      readonly type: 'info';
      readonly fen: string;
      /** Main line (multipv 1). */
      readonly info: SearchInfo;
      /** Latest line per MultiPV rank, ordered by rank. */
      readonly lines: readonly SearchInfo[];
      readonly elapsedMs: number;
    }
  | { readonly type: 'bestmove'; readonly result: SearchResult }
  | { readonly type: 'error'; readonly error: Error };

export class SearchCancelledError extends Error {
  constructor() {
    super('Search cancelled');
    this.name = 'SearchCancelledError';
  }
}

export interface EngineOptions {
  threads?: number;
  hashMb?: number;
  /** Number of candidate lines (UCI MultiPV), 1..MAX_MULTIPV. */
  multiPv?: number;
}

export const MAX_MULTIPV = 5;

interface ActiveSearch {
  readonly fen: string;
  readonly sideToMove: 'w' | 'b';
  readonly startedAt: number;
  lastInfo: SearchInfo | null;
  readonly lines: Map<number, SearchInfo>;
  cancelled: boolean;
  stopSent: boolean;
  resolve(result: SearchResult): void;
  reject(error: Error): void;
}

const INIT_TIMEOUT_MS = 30_000;

/**
 * Talks UCI to a Stockfish instance. Knows nothing about games or move quality.
 *
 * All commands are serialised through a queue, because UCI forbids sending
 * `position`/`go`/`setoption` while a search is running. A new `analyze()` call
 * interrupts the running search (`stop`), waits for its `bestmove`, and only then
 * starts — the interrupted call rejects with SearchCancelledError.
 */
export class EngineService {
  readonly events = new Emitter<EngineEvent>();

  private readonly lineListeners = new Set<(msg: UciMessage) => void>();
  private queue: Promise<unknown> = Promise.resolve();
  private active: ActiveSearch | null = null;
  private searchTicket = 0;
  private ready: Promise<string> | null = null;
  private disposed = false;
  engineName = 'Stockfish';

  constructor(private readonly transport: UciTransport) {
    transport.onLine((line) => this.handleLine(line));
    transport.onError((error) => {
      this.events.emit({ type: 'error', error });
      this.active?.reject(error);
      this.active = null;
    });
  }

  /** Performs the UCI handshake. Safe to call multiple times. */
  init(options: EngineOptions = {}): Promise<string> {
    this.ready ??= this.enqueue(async () => {
      const name = new Promise<string>((resolve) => {
        const off = this.onMessage((msg) => {
          if (msg.type === 'id' && msg.key === 'name') this.engineName = msg.value;
          if (msg.type === 'uciok') {
            off();
            resolve(this.engineName);
          }
        });
      });
      this.transport.send('uci');
      await withTimeout(name, INIT_TIMEOUT_MS, 'Stockfish не ответил на "uci"');
      this.sendOptions(options);
      await this.isReady();
      return this.engineName;
    });
    return this.ready;
  }

  /** Changes Threads / Hash. Interrupts any running search. */
  configure(options: EngineOptions): Promise<void> {
    this.interrupt();
    return this.enqueue(async () => {
      this.sendOptions(options);
      await this.isReady();
    });
  }

  /** Clears the hash table between unrelated positions/games. */
  newGame(): Promise<void> {
    this.interrupt();
    return this.enqueue(async () => {
      this.transport.send('ucinewgame');
      await this.isReady();
    });
  }

  analyze(fen: string, { depth }: { depth: number }): Promise<SearchResult> {
    const ticket = ++this.searchTicket;
    this.interrupt();
    return this.enqueue(() => {
      // A newer analyze() arrived while we were waiting in the queue.
      if (ticket !== this.searchTicket || this.disposed) return Promise.reject(new SearchCancelledError());
      return this.runSearch(fen, depth);
    });
  }

  /** Stops the running search; its analyze() promise rejects with SearchCancelledError. */
  stop(): void {
    this.searchTicket++;
    this.interrupt();
  }

  get isSearching(): boolean {
    return this.active !== null && !this.active.cancelled;
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
    this.transport.send('quit');
    this.transport.terminate();
  }

  private runSearch(fen: string, depth: number): Promise<SearchResult> {
    return new Promise<SearchResult>((resolve, reject) => {
      this.active = {
        fen,
        sideToMove: fen.split(' ')[1] === 'b' ? 'b' : 'w',
        startedAt: now(),
        lastInfo: null,
        lines: new Map(),
        cancelled: false,
        stopSent: false,
        resolve,
        reject,
      };
      this.transport.send(`position fen ${fen}`);
      this.transport.send(`go depth ${Math.max(1, Math.round(depth))}`);
    });
  }

  private interrupt(): void {
    const search = this.active;
    if (!search || search.stopSent) return;
    search.cancelled = true;
    search.stopSent = true;
    this.transport.send('stop');
  }

  private sendOptions({ threads, hashMb, multiPv }: EngineOptions): void {
    if (multiPv !== undefined) {
      this.transport.send(`setoption name MultiPV value ${Math.min(MAX_MULTIPV, Math.max(1, Math.round(multiPv)))}`);
    }
    if (threads !== undefined) this.transport.send(`setoption name Threads value ${Math.max(1, Math.round(threads))}`);
    if (hashMb !== undefined) this.transport.send(`setoption name Hash value ${Math.max(1, Math.round(hashMb))}`);
  }

  private isReady(): Promise<void> {
    return new Promise<void>((resolve) => {
      const off = this.onMessage((msg) => {
        if (msg.type === 'readyok') {
          off();
          resolve();
        }
      });
      this.transport.send('isready');
    });
  }

  private handleLine(line: string): void {
    const msg = parseUciLine(line);
    for (const listener of [...this.lineListeners]) listener(msg);

    const search = this.active;
    if (!search) return;

    if (msg.type === 'info') {
      // Bound scores are aspiration-window artefacts that flicker; wait for the exact score.
      if (msg.info.bound) return;
      const info = normaliseInfo(msg.info, search.sideToMove);
      search.lines.set(info.multiPv, info);
      if (info.multiPv === 1) search.lastInfo = info;
      if (!search.cancelled && search.lastInfo) {
        this.events.emit({
          type: 'info',
          fen: search.fen,
          info: search.lastInfo,
          lines: sortedLines(search.lines),
          elapsedMs: now() - search.startedAt,
        });
      }
    } else if (msg.type === 'bestmove') {
      this.active = null;
      if (search.cancelled) {
        search.reject(new SearchCancelledError());
        return;
      }
      const result: SearchResult = {
        fen: search.fen,
        bestMove: msg.move,
        ponder: msg.ponder,
        info: search.lastInfo,
        lines: sortedLines(search.lines),
        elapsedMs: now() - search.startedAt,
      };
      this.events.emit({ type: 'bestmove', result });
      search.resolve(result);
    }
  }

  private onMessage(listener: (msg: UciMessage) => void): () => void {
    this.lineListeners.add(listener);
    return () => this.lineListeners.delete(listener);
  }

  private enqueue<T>(op: () => Promise<T>): Promise<T> {
    const run = this.queue.then(op, op);
    this.queue = run.catch(() => undefined);
    return run;
  }
}

function sortedLines(lines: ReadonlyMap<number, SearchInfo>): SearchInfo[] {
  return [...lines.values()].sort((a, b) => a.multiPv - b.multiPv);
}

function normaliseInfo(raw: RawInfo, sideToMove: 'w' | 'b'): SearchInfo {
  return { ...raw, score: toWhitePov(raw.score, sideToMove) };
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}
