import { Store } from './observable';
import type { OpeningBook, OpeningFilter, BookMove } from './openings';
import type { Color } from './types';
import type { MessageKey, MessageParams, Msg } from './i18n';
import type { BoardService } from '../services/board.service';
import { START_FEN } from '../services/board.service';

export interface DrillSection {
  readonly id: string;
  /** i18n key of the section name. */
  readonly title: MessageKey;
  readonly filter: OpeningFilter;
  /** Side the user plays by default in this section. */
  readonly defaultColor: Color;
}

/** Trainer sections are plain filters over the book. */
export const DRILL_SECTIONS: readonly DrillSection[] = [
  { id: 'all', title: 'section.all', filter: {}, defaultColor: 'w' },
  // "Indian Defense" excludes the King's Indian Attack (a White system); A45+ skips flank openings.
  { id: 'indian', title: 'section.indian', filter: { query: 'indian defense', ecoFrom: 'A45' }, defaultColor: 'b' },
  { id: 'gambits', title: 'section.gambits', filter: { query: 'gambit' }, defaultColor: 'w' },
  { id: 'sicilian', title: 'section.sicilian', filter: { query: 'sicilian defense' }, defaultColor: 'b' },
  { id: 'french', title: 'section.french', filter: { query: 'french defense' }, defaultColor: 'b' },
  { id: 'caro', title: 'section.caro', filter: { query: 'caro-kann' }, defaultColor: 'b' },
  { id: 'slav', title: 'section.slav', filter: { query: 'slav defense' }, defaultColor: 'b' },
];

export type DrillTone = 'good' | 'bad' | 'info';

/** Feedback shown to the user; translated by the UI. */
export interface DrillMessage extends Msg {
  readonly tone: DrillTone;
}

function note(tone: DrillTone, key: MessageKey, params?: MessageParams): DrillMessage {
  return params ? { tone, key, params } : { tone, key };
}

export interface DrillState {
  readonly status: 'idle' | 'playing' | 'finished';
  readonly sectionId: string;
  readonly filter: OpeningFilter;
  readonly userColor: Color;
  readonly maxMoves: number;
  readonly fen: string;
  /** Moves played so far from the start position (UCI). */
  readonly line: readonly string[];
  readonly message: DrillMessage | null;
  /** Book answers after a wrong move (SAN), for the "theory plays …" hint. */
  readonly expected: readonly string[];
  readonly openingName: string | null;
  /** Engine hints (arrows, variants) are hidden until the user errs or the line ends. */
  readonly hintsVisible: boolean;
  readonly stats: { readonly positions: number; readonly correct: number; readonly errors: number };
  /** Lifetime totals per section, persisted across sessions. */
  readonly totals: Readonly<Record<string, SectionTotals>>;
}

export interface SectionTotals {
  readonly positions: number;
  readonly correct: number;
  readonly errors: number;
  /** Lines played to the end. */
  readonly lines: number;
}

/** Subset of the Web Storage API (localStorage); injectable for tests. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const DRILL_STORAGE_KEY = 'livechess.drill.v1';

export interface DrillDeps {
  /** The book may still be loading; the trainer is inert until it is available. */
  readonly getBook: () => OpeningBook | null;
  readonly board: BoardService;
  /** Called with the full line whenever the drill position changes (drives the board). */
  readonly onLine: (startFen: string, ucis: readonly string[]) => void;
  /** 0 ≤ x < 1; injectable for deterministic tests. */
  readonly random?: () => number;
  /** Delay before the book reply, ms (0 in tests). */
  readonly replyDelayMs?: number;
  /** Where progress is saved (localStorage in the browser); null disables persistence. */
  readonly storage?: KeyValueStorage | null;
}

const EMPTY_STATS = { positions: 0, correct: 0, errors: 0 } as const;
const EMPTY_TOTALS: SectionTotals = { positions: 0, correct: 0, errors: 0, lines: 0 };

/**
 * Opening trainer. The user plays one side; the other side answers with a random
 * book move from the selected section. Any book move counts as correct, not only
 * the main line. The line ends when the book (within the section) runs out or after
 * `maxMoves` full moves.
 */
export class DrillManager extends Store<DrillState> {
  private replyTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly deps: DrillDeps) {
    super({
      status: 'idle',
      sectionId: 'all',
      filter: {},
      userColor: 'w',
      maxMoves: 10,
      fen: START_FEN,
      line: [],
      message: null,
      expected: [],
      openingName: null,
      hintsVisible: true,
      stats: EMPTY_STATS,
      totals: {},
    });
    const restored = this.restore();
    if (restored) this.setState(restored);
    // Persist after every change; the state is small.
    this.subscribe((state) => this.persist(state));
  }

  /** Leaves the trainer without ending the line (switching tabs/modes). */
  pause(): void {
    this.clearTimer();
  }

  /** Re-shows a saved or paused line on the board and continues it. */
  resume(): void {
    const s = this.getState();
    if (s.status === 'idle') return;
    this.deps.onLine(START_FEN, s.line);
    if (s.status === 'playing') this.afterPositionChange();
  }

  start(options: { sectionId?: string; filter?: OpeningFilter; userColor?: Color; maxMoves?: number } = {}): void {
    const section = DRILL_SECTIONS.find((s) => s.id === options.sectionId) ?? DRILL_SECTIONS[0]!;
    this.clearTimer();
    this.setState({
      status: 'playing',
      sectionId: section.id,
      filter: options.filter ?? section.filter,
      userColor: options.userColor ?? section.defaultColor,
      maxMoves: Math.max(1, options.maxMoves ?? this.getState().maxMoves),
      fen: START_FEN,
      line: [],
      message: note('info', 'drill.msg.yourMove'),
      expected: [],
      openingName: null,
      hintsVisible: false,
      stats: EMPTY_STATS,
    });
    this.deps.onLine(START_FEN, []);
    this.afterPositionChange();
  }

  stop(): void {
    this.clearTimer();
    this.setState({ status: 'idle', message: null, expected: [], hintsVisible: true });
  }

  restart(): void {
    const { sectionId, filter, userColor, maxMoves } = this.getState();
    this.start({ sectionId, filter, userColor, maxMoves });
  }

  /** Book moves for the current position within the section. */
  bookMoves(): BookMove[] {
    const { fen, filter } = this.getState();
    return this.deps.getBook()?.movesAt(fen, filter) ?? [];
  }

  isUserTurn(): boolean {
    const s = this.getState();
    return s.status === 'playing' && this.deps.board.turn(s.fen) === s.userColor && this.replyTimer === null;
  }

  /** User's move attempt (UCI). Returns true if it was accepted. */
  tryMove(uci: string): boolean {
    const s = this.getState();
    if (!this.isUserTurn() || !this.deps.getBook()) return false;
    const san = this.deps.board.uciToSan(s.fen, uci);
    if (!san) return false;

    const options = this.bookMoves();
    if (options.some((m) => m.uci === uci)) {
      this.setState({
        stats: { ...s.stats, positions: s.stats.positions + 1, correct: s.stats.correct + 1 },
        totals: this.bumpTotals(s.sectionId, { positions: 1, correct: 1 }),
        message: note('good', 'drill.msg.correct', { san }),
        expected: [],
        hintsVisible: false,
      });
      this.play(uci);
      return true;
    }

    const expected = options.map((m) => m.san);
    const outsideSection = this.deps.getBook()?.isBookMove(s.fen, uci) ?? false;
    this.setState({
      hintsVisible: true,
      totals: this.bumpTotals(s.sectionId, { positions: 1, errors: 1 }),
      stats: { ...s.stats, positions: s.stats.positions + 1, errors: s.stats.errors + 1 },
      expected,
      message: note('bad', outsideSection ? 'drill.msg.outsideSection' : 'drill.msg.wrong', { san, expected: expected.join(' / ') }),
    });
    return false;
  }

  /** Plays one of the book moves for the user (after a mistake). */
  reveal(): void {
    const first = this.bookMoves()[0];
    if (!first || !this.isUserTurn()) return;
    this.setState({ message: note('info', 'drill.msg.theory', { san: first.san }), expected: [] });
    this.play(first.uci);
  }

  setMaxMoves(n: number): void {
    this.setState({ maxMoves: Math.max(1, Math.round(n)) });
  }

  private play(uci: string): void {
    const s = this.getState();
    const applied = this.deps.board.applyUci(s.fen, uci);
    if (!applied) return;
    const line = [...s.line, uci];
    const opening = this.deps.getBook()?.openingAt(applied.fen) ?? null;
    this.setState({ fen: applied.fen, line, openingName: opening ? `${opening.name} (${opening.eco})` : s.openingName });
    this.deps.onLine(START_FEN, line);
    this.afterPositionChange();
  }

  private afterPositionChange(): void {
    // Without the book every position would look like "end of theory".
    if (!this.deps.getBook()) return;
    const s = this.getState();
    const fullMoves = Math.ceil(s.line.length / 2);
    const moves = this.bookMoves();
    if (moves.length === 0 || (fullMoves >= s.maxMoves && this.deps.board.turn(s.fen) === 'w')) {
      this.setState({
        status: 'finished',
        hintsVisible: true,
        totals: this.bumpTotals(s.sectionId, { lines: 1 }),
        message:
          moves.length > 0
            ? note('info', 'drill.msg.maxMoves', { n: s.maxMoves })
            : s.openingName
              ? note('info', 'drill.msg.lineOverNamed', { opening: s.openingName })
              : note('info', 'drill.msg.lineOver'),
      });
      return;
    }
    if (this.deps.board.turn(s.fen) !== s.userColor) this.scheduleReply(moves);
  }

  private scheduleReply(moves: readonly BookMove[]): void {
    const random = this.deps.random ?? Math.random;
    // Weighted by the number of named lines behind each move: main lines come up more often.
    const total = moves.reduce((sum, m) => sum + m.lines, 0);
    let r = random() * total;
    const pick = moves.find((m) => (r -= m.lines) < 0) ?? moves[moves.length - 1]!;
    const delay = this.deps.replyDelayMs ?? 450;
    this.clearTimer();
    const run = () => {
      this.replyTimer = null;
      if (this.getState().status === 'playing') this.play(pick.uci);
    };
    if (delay <= 0) {
      run();
      return;
    }
    this.replyTimer = setTimeout(run, delay);
  }

  private bumpTotals(sectionId: string, add: Partial<SectionTotals>): Record<string, SectionTotals> {
    const totals = this.getState().totals;
    const t = totals[sectionId] ?? EMPTY_TOTALS;
    return {
      ...totals,
      [sectionId]: {
        positions: t.positions + (add.positions ?? 0),
        correct: t.correct + (add.correct ?? 0),
        errors: t.errors + (add.errors ?? 0),
        lines: t.lines + (add.lines ?? 0),
      },
    };
  }

  private persist(s: DrillState): void {
    const storage = this.deps.storage;
    if (!storage) return;
    const saved: SavedDrill = {
      session: { status: s.status, sectionId: s.sectionId, filter: s.filter, userColor: s.userColor, maxMoves: s.maxMoves, line: s.line, stats: s.stats },
      totals: s.totals,
    };
    try {
      storage.setItem(DRILL_STORAGE_KEY, JSON.stringify(saved));
    } catch {
      // Storage full or blocked (private mode): progress just isn't kept.
    }
  }

  /** Reads saved progress; anything malformed is ignored rather than trusted. */
  private restore(): Partial<DrillState> | null {
    let raw: string | null = null;
    try {
      raw = this.deps.storage?.getItem(DRILL_STORAGE_KEY) ?? null;
    } catch {
      return null;
    }
    if (!raw) return null;
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }
    const saved = data as Partial<SavedDrill>;
    const totals = sanitizeTotals(saved.totals);
    const session = saved.session;
    if (!session || typeof session !== 'object') return { totals };

    // Replay the saved line; stop at the first move that is no longer legal.
    const line: string[] = [];
    let fen = START_FEN;
    for (const uci of Array.isArray(session.line) ? session.line : []) {
      const applied = typeof uci === 'string' ? this.deps.board.applyUci(fen, uci) : null;
      if (!applied) break;
      line.push(uci);
      fen = applied.fen;
    }
    const status = session.status === 'playing' || session.status === 'finished' ? session.status : 'idle';
    const section = DRILL_SECTIONS.find((x) => x.id === session.sectionId) ?? DRILL_SECTIONS[0]!;
    const stats = session.stats && typeof session.stats === 'object' ? session.stats : EMPTY_STATS;
    return {
      status,
      sectionId: section.id,
      filter: session.filter && typeof session.filter === 'object' ? session.filter : section.filter,
      userColor: session.userColor === 'b' ? 'b' : 'w',
      maxMoves: typeof session.maxMoves === 'number' && session.maxMoves > 0 ? Math.round(session.maxMoves) : 10,
      line,
      fen,
      stats: { positions: num(stats.positions), correct: num(stats.correct), errors: num(stats.errors) },
      totals,
      hintsVisible: status !== 'playing',
      message: status === 'idle' ? null : note('info', 'drill.msg.restored'),
    };
  }

  private clearTimer(): void {
    if (this.replyTimer) clearTimeout(this.replyTimer);
    this.replyTimer = null;
  }
}

interface SavedDrill {
  readonly session: {
    readonly status: DrillState['status'];
    readonly sectionId: string;
    readonly filter: OpeningFilter;
    readonly userColor: Color;
    readonly maxMoves: number;
    readonly line: readonly string[];
    readonly stats: DrillState['stats'];
  };
  readonly totals: Readonly<Record<string, SectionTotals>>;
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : 0;
}

function sanitizeTotals(raw: unknown): Record<string, SectionTotals> {
  const out: Record<string, SectionTotals> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, t] of Object.entries(raw as Record<string, unknown>)) {
    if (!DRILL_SECTIONS.some((s) => s.id === id) || !t || typeof t !== 'object') continue;
    const r = t as Record<string, unknown>;
    out[id] = { positions: num(r.positions), correct: num(r.correct), errors: num(r.errors), lines: num(r.lines) };
  }
  return out;
}
