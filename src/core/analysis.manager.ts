import type { Square } from 'chess.js';
import { Store } from './observable';
import { classifyMove } from './classification';
import { buildCandidates, isBrilliant, type Candidate } from './candidates';
import { moveScore } from './move-score';
import { explainMove, type Explanation, type OpeningContext } from './move-explainer';
import { MATED_CP, type EngineSettings, type MoveClass, type Score, type SearchInfo, type SearchResult } from './types';
import { BoardService, START_FEN, type BoardPiece, type GameMove } from '../services/board.service';
import { EngineService, MAX_MULTIPV, SearchCancelledError } from '../services/engine.service';

export interface AppSettings extends EngineSettings {
  /** Depth used for the full-game pass that classifies every move. */
  readonly reviewDepth: number;
  /** Number of candidate lines (MultiPV): 1, 3 or 5. */
  readonly multiPv: number;
}

export interface PositionEval {
  /** White-POV score of the best line. */
  readonly score: Score;
  readonly bestMove: string | null;
  readonly pv: readonly string[];
  readonly depth: number;
  /** All MultiPV lines, best first. */
  readonly lines: readonly SearchInfo[];
  /** MultiPV setting the eval was produced with. */
  readonly multiPv: number;
}

export type LiveStatus = 'loading' | 'idle' | 'searching' | 'done' | 'error';

export interface LiveView {
  readonly status: LiveStatus;
  readonly score: Score | null;
  readonly depth: number;
  readonly bestMoveUci: string | null;
  readonly bestMoveSan: string | null;
  readonly pvSan: readonly string[];
  readonly nodes: number | null;
  readonly nps: number | null;
  readonly elapsedMs: number;
  readonly fromCache: boolean;
  readonly error: string | null;
}

export interface ReviewProgress {
  readonly running: boolean;
  readonly done: number;
  readonly total: number;
}

export interface PlayedMoveScore {
  readonly score: number;
  readonly brilliant: boolean;
}

export interface AnalysisState {
  readonly engineName: string;
  readonly settings: AppSettings;
  readonly maxThreads: number;
  readonly multiThreaded: boolean;

  readonly startFen: string;
  readonly moves: readonly GameMove[];
  readonly headers: Readonly<Record<string, string>>;
  /** 0 = start position, n = position after the n-th half-move. */
  readonly ply: number;
  readonly fen: string;

  readonly evals: Readonly<Record<string, PositionEval>>;
  readonly classes: Readonly<Record<number, MoveClass>>;
  readonly moveScores: Readonly<Record<number, PlayedMoveScore>>;
  readonly live: LiveView;
  /** Engine candidates for the displayed position, best first. */
  readonly candidates: readonly Candidate[];
  /** Rank of the candidate the user clicked, or null. */
  readonly selectedRank: number | null;
  /** Explanation of the selected candidate, or of the move that led to this position. */
  readonly explanation: readonly Explanation[];
  readonly review: ReviewProgress | null;

  readonly fenInput: string;
  readonly fenError: string | null;
  readonly pgnError: string | null;
  readonly liveMode: boolean;
}

export interface AnalysisManagerOptions {
  readonly maxThreads: number;
  readonly multiThreaded: boolean;
  readonly debounceMs?: number;
  readonly initialSettings?: Partial<AppSettings>;
}

/** Supplies opening context for a move (plugged in by the openings module). */
export type OpeningLookup = (fenBefore: string, uci: string, ply: number) => OpeningContext | null;

const PV_DISPLAY_MOVES = 5;
const TERMINAL_DEPTH = 99;

const EMPTY_LIVE: LiveView = {
  status: 'loading',
  score: null,
  depth: 0,
  bestMoveUci: null,
  bestMoveSan: null,
  pvSan: [],
  nodes: null,
  nps: null,
  elapsedMs: 0,
  fromCache: false,
  error: null,
};

/**
 * Owns analysis state: the loaded game, the current position, the evaluation cache,
 * candidates, move scores and explanations. Drives EngineService; UI only reads state
 * and calls methods.
 */
export class AnalysisManager extends Store<AnalysisState> {
  private readonly debounceMs: number;
  private fenTimer: ReturnType<typeof setTimeout> | null = null;
  /** Bumped on every game load so a running review notices it is stale. */
  private gameGeneration = 0;
  private engineReady = false;
  private openingLookup: OpeningLookup | null = null;

  constructor(
    private readonly engine: EngineService,
    private readonly board: BoardService,
    options: AnalysisManagerOptions,
  ) {
    const settings: AppSettings = {
      depth: 18,
      threads: options.multiThreaded ? Math.max(1, Math.min(4, options.maxThreads - 1)) : 1,
      hashMb: 64,
      reviewDepth: 12,
      multiPv: 3,
      ...options.initialSettings,
    };
    super({
      engineName: 'Stockfish 18',
      settings,
      maxThreads: options.multiThreaded ? options.maxThreads : 1,
      multiThreaded: options.multiThreaded,
      startFen: START_FEN,
      moves: [],
      headers: {},
      ply: 0,
      fen: START_FEN,
      evals: {},
      classes: {},
      moveScores: {},
      live: EMPTY_LIVE,
      candidates: [],
      selectedRank: null,
      explanation: [],
      review: null,
      fenInput: START_FEN,
      fenError: null,
      pgnError: null,
      liveMode: true,
    });
    this.debounceMs = options.debounceMs ?? 400;
    this.engine.events.subscribe((event) => {
      if (event.type === 'info') this.onEngineInfo(event.fen, event.lines, event.elapsedMs);
      if (event.type === 'error') this.setLive({ status: 'error', error: event.error.message });
    });
  }

  async init(): Promise<void> {
    const { threads, hashMb, multiPv } = this.getState().settings;
    try {
      const name = await this.engine.init({ threads, hashMb, multiPv });
      this.engineReady = true;
      this.setState({ engineName: name });
      this.analyzeCurrent();
    } catch (e) {
      this.setLive({ status: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  }

  dispose(): void {
    if (this.fenTimer) clearTimeout(this.fenTimer);
    this.engine.dispose();
  }

  setOpeningLookup(lookup: OpeningLookup | null): void {
    this.openingLookup = lookup;
    this.refreshExplanation();
  }

  // ───────────────────────────── loading positions ─────────────────────────────

  /** Text-field input. In live mode the position is (re)analysed after a debounce. */
  setFenInput(text: string): void {
    this.setState({ fenInput: text });
    if (this.fenTimer) clearTimeout(this.fenTimer);
    if (!this.getState().liveMode) return;
    this.fenTimer = setTimeout(() => {
      this.fenTimer = null;
      this.submitFen();
    }, this.debounceMs);
  }

  submitFen(): boolean {
    const input = this.getState().fenInput;
    const result = this.board.validate(input);
    if (!result.ok) {
      this.setState({ fenError: result.error });
      return false;
    }
    this.setState({ fenError: null });
    if (result.fen !== this.getState().fen || this.getState().moves.length > 0) this.loadFen(result.fen);
    return true;
  }

  setLiveMode(on: boolean): void {
    this.setState({ liveMode: on });
  }

  loadFen(fen: string): void {
    this.resetGame(fen, [], {});
  }

  loadPgn(pgn: string): boolean {
    try {
      const game = this.board.parsePgn(pgn);
      this.resetGame(game.startFen, game.moves, game.headers);
      this.setState({ pgnError: null });
      return true;
    } catch (e) {
      this.setState({ pgnError: e instanceof Error ? e.message : String(e) });
      return false;
    }
  }

  /** Loads a line given as UCI moves from `startFen` and shows its final position. */
  loadUciLine(startFen: string, ucis: readonly string[]): boolean {
    const moves: GameMove[] = [];
    let fen = startFen;
    for (const uci of ucis) {
      const applied = this.board.applyUci(fen, uci);
      if (!applied) return false;
      moves.push({ ply: moves.length + 1, san: applied.san, uci, color: this.board.turn(fen), fenBefore: fen, fenAfter: applied.fen });
      fen = applied.fen;
    }
    const sameStart = startFen === this.getState().startFen;
    const prefix = sameStart && moves.every((m, i) => this.getState().moves[i]?.uci === m.uci);
    if (prefix) {
      this.setState({ moves });
      this.goTo(moves.length);
    } else {
      this.resetGame(startFen, moves, {});
      this.goTo(moves.length);
    }
    return true;
  }

  private resetGame(startFen: string, moves: readonly GameMove[], headers: Readonly<Record<string, string>>): void {
    this.gameGeneration++;
    this.setState({
      startFen,
      moves,
      headers,
      ply: 0,
      fen: startFen,
      fenInput: startFen,
      fenError: null,
      classes: {},
      moveScores: {},
      review: null,
      selectedRank: null,
    });
    if (this.engineReady) void this.engine.newGame();
    this.analyzeCurrent();
  }

  // ───────────────────────────── navigation / moves ─────────────────────────────

  goTo(ply: number): void {
    const { moves } = this.getState();
    const target = Math.max(0, Math.min(moves.length, ply));
    const fen = target === 0 ? this.getState().startFen : (moves[target - 1]?.fenAfter ?? this.getState().startFen);
    this.setState({ ply: target, fen, fenInput: fen, fenError: null, selectedRank: null, candidates: [] });
    this.analyzeCurrent();
  }

  next(): void {
    this.goTo(this.getState().ply + 1);
  }

  prev(): void {
    this.goTo(this.getState().ply - 1);
  }

  /** Pieces of the displayed position. */
  pieces(): BoardPiece[] {
    return this.board.pieces(this.getState().fen);
  }

  /** Squares of the move that led to the displayed position. */
  lastMove(): { from: Square; to: Square } | null {
    const { ply, moves } = this.getState();
    const move = moves[ply - 1];
    return move ? uciSquares(move.uci) : null;
  }

  /** Arrow for the engine's best move in the displayed position. */
  bestMoveArrow(): { from: Square; to: Square } | null {
    const uci = this.getState().live.bestMoveUci;
    return uci ? uciSquares(uci) : null;
  }

  /** Arrows for all candidates; the selected one (or the best) is accented. */
  candidateArrows(): CandidateArrow[] {
    const { candidates, selectedRank } = this.getState();
    const accent = selectedRank ?? 1;
    return candidates
      .map((c) => ({ ...uciSquares(c.uciMove), color: c.color, rank: c.rank, score: c.moveScore, accent: c.rank === accent, glow: c.brilliant }))
      .sort((a, b) => Number(a.accent) - Number(b.accent) || b.rank - a.rank);
  }

  /** First moves of the selected candidate's PV, numbered, for on-board preview. */
  pvPreview(maxMoves = 3): PvMark[] {
    const { candidates, selectedRank } = this.getState();
    const cand = candidates.find((c) => c.rank === selectedRank);
    if (!cand) return [];
    return cand.pvLine.slice(0, maxMoves).map((uci, i) => ({ ...uciSquares(uci), index: i + 1 }));
  }

  selectCandidate(rank: number | null): void {
    const next = rank === this.getState().selectedRank ? null : rank;
    this.setState({ selectedRank: next });
    this.refreshExplanation();
  }

  /** Legal destination squares for a piece on `from` in the current position. */
  targetsFrom(from: Square): Square[] {
    return this.board.legalMoves(this.getState().fen, from).map((m) => m.to);
  }

  /** UCI of the legal move from→to in the current position (queen on promotion), or null. */
  resolveMove(from: Square, to: Square): string | null {
    const move = this.board
      .legalMoves(this.getState().fen, from)
      .filter((m) => m.to === to)
      .find((m) => !m.promotion || m.promotion === 'q');
    return move?.uci ?? null;
  }

  /**
   * Plays a move on the board. Moves after the current ply are discarded
   * (no variation tree). Under-promotion isn't offered: pawns promote to a queen.
   */
  playMove(from: Square, to: Square): boolean {
    const uci = this.resolveMove(from, to);
    return uci ? this.playUci(uci) : false;
  }

  playUci(uci: string): boolean {
    const { fen, ply, moves } = this.getState();
    const applied = this.board.applyUci(fen, uci);
    if (!applied) return false;

    const next = moves[ply];
    if (next && next.uci === uci) {
      this.goTo(ply + 1);
      return true;
    }
    const newMove: GameMove = { ply: ply + 1, san: applied.san, uci, color: this.board.turn(fen), fenBefore: fen, fenAfter: applied.fen };
    const keep = <T>(rec: Readonly<Record<number, T>>) =>
      Object.fromEntries(Object.entries(rec).filter(([p]) => Number(p) <= ply)) as Record<number, T>;
    this.setState({ moves: [...moves.slice(0, ply), newMove], classes: keep(this.getState().classes), moveScores: keep(this.getState().moveScores) });
    this.goTo(ply + 1);
    return true;
  }

  // ───────────────────────────── settings ─────────────────────────────

  updateSettings(patch: Partial<AppSettings>): void {
    const prev = this.getState().settings;
    const settings: AppSettings = { ...prev, ...patch, multiPv: Math.min(MAX_MULTIPV, Math.max(1, patch.multiPv ?? prev.multiPv)) };
    this.setState({ settings });

    const engineChanged = settings.threads !== prev.threads || settings.hashMb !== prev.hashMb || settings.multiPv !== prev.multiPv;
    if (engineChanged && this.engineReady) {
      void this.engine
        .configure({ threads: settings.threads, hashMb: settings.hashMb, multiPv: settings.multiPv })
        .then(() => this.analyzeCurrent());
    } else if (settings.depth !== prev.depth) {
      this.analyzeCurrent();
    }
  }

  // ───────────────────────────── analysis ─────────────────────────────

  /** Analyses the displayed position, reusing the cache when it is deep and wide enough. */
  analyzeCurrent(): void {
    const { fen, settings, review } = this.getState();

    const terminal = this.terminalEval(fen);
    if (terminal) {
      this.storeEval(fen, terminal);
      this.showEval(fen, terminal, 0, true);
      return;
    }

    const cached = this.getState().evals[fen];
    if (cached && cached.depth >= settings.depth && cached.multiPv >= settings.multiPv) {
      this.showEval(fen, cached, 0, true);
      return;
    }
    if (cached) this.showEval(fen, cached, 0, true, 'searching');
    else {
      this.setLive({ ...EMPTY_LIVE, status: this.engineReady ? 'searching' : 'loading' });
      this.setState({ candidates: [] });
      this.refreshExplanation();
    }

    // While the full-game review owns the engine, it will fill the cache for us.
    if (!this.engineReady || review?.running) return;

    this.engine.analyze(fen, { depth: settings.depth }).then(
      (result) => {
        const ev = this.evalFromResult(result, settings.multiPv);
        if (!ev) return;
        this.storeEval(fen, ev);
        if (this.getState().fen === fen) this.showEval(fen, ev, result.elapsedMs, false);
      },
      (e: unknown) => {
        if (e instanceof SearchCancelledError) return;
        this.setLive({ status: 'error', error: e instanceof Error ? e.message : String(e) });
      },
    );
  }

  /** Evaluates every position of the loaded game at `reviewDepth` and classifies all moves. */
  async reviewGame(): Promise<void> {
    const generation = this.gameGeneration;
    const { startFen, moves, settings } = this.getState();
    const fens = [startFen, ...moves.map((m) => m.fenAfter)];
    if (!this.engineReady || moves.length === 0) return;

    this.engine.stop();
    this.setState({ review: { running: true, done: 0, total: fens.length } });

    try {
      for (let i = 0; i < fens.length; i++) {
        if (generation !== this.gameGeneration || !this.getState().review?.running) return;
        const fen = fens[i] as string;
        const cached = this.getState().evals[fen];
        if (!cached || cached.depth < settings.reviewDepth) {
          const terminal = this.terminalEval(fen);
          if (terminal) {
            this.storeEval(fen, terminal);
          } else {
            const ev = this.evalFromResult(await this.engine.analyze(fen, { depth: settings.reviewDepth }), settings.multiPv);
            if (ev) this.storeEval(fen, ev);
          }
        }
        this.setState({ review: { running: true, done: i + 1, total: fens.length } });
      }
    } catch (e) {
      if (!(e instanceof SearchCancelledError)) {
        this.setLive({ status: 'error', error: e instanceof Error ? e.message : String(e) });
      }
    } finally {
      if (generation === this.gameGeneration) {
        const review = this.getState().review;
        this.setState({ review: review ? { ...review, running: false } : null });
        this.analyzeCurrent();
      }
    }
  }

  cancelReview(): void {
    const review = this.getState().review;
    if (!review?.running) return;
    this.setState({ review: { ...review, running: false } });
    this.engine.stop();
  }

  // ───────────────────────────── internals ─────────────────────────────

  private evalFromResult(result: SearchResult, multiPv: number): PositionEval | null {
    if (!result.info) return null;
    return {
      score: result.info.score,
      bestMove: result.bestMove,
      pv: result.info.pv,
      depth: result.info.depth,
      lines: result.lines.length ? result.lines : [result.info],
      multiPv,
    };
  }

  private onEngineInfo(fen: string, lines: readonly SearchInfo[], elapsedMs: number): void {
    const main = lines[0];
    if (fen !== this.getState().fen || !main || main.pv.length === 0) return;
    this.setLive({
      status: 'searching',
      score: main.score,
      depth: main.depth,
      ...this.lineView(fen, main.pv),
      nodes: main.nodes ?? null,
      nps: main.nps ?? null,
      elapsedMs,
      fromCache: false,
      error: null,
    });
    this.setState({ candidates: buildCandidates(fen, lines, this.board, PV_DISPLAY_MOVES) });
  }

  private showEval(fen: string, ev: PositionEval, elapsedMs: number, fromCache: boolean, status: LiveStatus = 'done'): void {
    this.setLive({
      status,
      score: ev.score,
      depth: ev.depth === TERMINAL_DEPTH ? 0 : ev.depth,
      ...this.lineView(fen, ev.pv.length ? ev.pv : ev.bestMove ? [ev.bestMove] : []),
      // A fresh result keeps the node counters from the last streamed info line.
      ...(fromCache ? { nodes: null, nps: null } : {}),
      elapsedMs,
      fromCache,
      error: null,
    });
    this.setState({ candidates: buildCandidates(fen, ev.lines, this.board, PV_DISPLAY_MOVES) });
    this.refreshExplanation();
  }

  private lineView(fen: string, pv: readonly string[]): Pick<LiveView, 'bestMoveUci' | 'bestMoveSan' | 'pvSan'> {
    const pvSan = this.board.uciLineToSan(fen, pv, PV_DISPLAY_MOVES);
    return { bestMoveUci: pv[0] ?? null, bestMoveSan: pvSan[0] ?? null, pvSan };
  }

  private setLive(patch: Partial<LiveView>): void {
    this.setState((s) => ({ live: { ...s.live, ...patch } }));
  }

  /** Explains the selected candidate, or else the move that led to the displayed position. */
  private refreshExplanation(): void {
    const { fen, ply, moves, candidates, selectedRank, evals } = this.getState();
    const selected = candidates.find((c) => c.rank === selectedRank);
    if (selected) {
      const opening = this.openingLookup?.(fen, selected.uciMove, ply + 1) ?? null;
      this.setState({ explanation: explainMove({ fen, uci: selected.uciMove, candidates, opening }, this.board) });
      return;
    }
    const move = moves[ply - 1];
    if (!move) {
      this.setState({ explanation: [] });
      return;
    }
    const before = evals[move.fenBefore];
    const after = evals[move.fenAfter];
    const prevCandidates = before ? buildCandidates(move.fenBefore, before.lines, this.board, PV_DISPLAY_MOVES) : [];
    const opening = this.openingLookup?.(move.fenBefore, move.uci, move.ply) ?? null;
    this.setState({
      explanation: explainMove(
        { fen: move.fenBefore, uci: move.uci, candidates: prevCandidates, afterScore: after?.score ?? null, opening },
        this.board,
      ),
    });
  }

  private storeEval(fen: string, ev: PositionEval): void {
    const prev = this.getState().evals[fen];
    if (prev && prev.depth > ev.depth && prev.multiPv >= ev.multiPv) return;
    const evals = { ...this.getState().evals, [fen]: ev };
    this.setState({ evals, ...this.computeMoveQuality(evals) });
  }

  private computeMoveQuality(evals: Readonly<Record<string, PositionEval>>): Pick<AnalysisState, 'classes' | 'moveScores'> {
    const classes: Record<number, MoveClass> = {};
    const moveScores: Record<number, PlayedMoveScore> = {};
    for (const move of this.getState().moves) {
      const before = evals[move.fenBefore];
      const after = evals[move.fenAfter];
      if (!before || !after) continue;
      const isBest = before.bestMove === move.uci;
      // Played move's own evaluation is the eval of the position it led to.
      const score = isBest ? 100 : moveScore(move.color, before.score, after.score);
      const brilliant = isBest && isBrilliant(1, move.color, after.score, this.board.tactics(move.fenBefore, move.uci));
      moveScores[move.ply] = { score, brilliant };
      classes[move.ply] = brilliant
        ? 'brilliant'
        : classifyMove({ mover: move.color, playedUci: move.uci, bestUci: before.bestMove, before: before.score, after: after.score });
    }
    return { classes, moveScores };
  }

  private terminalEval(fen: string): PositionEval | null {
    const status = this.board.status(fen);
    if (status === 'ongoing') return null;
    const value = status === 'checkmate' ? (this.board.turn(fen) === 'w' ? -MATED_CP : MATED_CP) : 0;
    return { score: { kind: 'cp', value }, bestMove: null, pv: [], depth: TERMINAL_DEPTH, lines: [], multiPv: MAX_MULTIPV };
  }
}

export interface CandidateArrow {
  readonly from: Square;
  readonly to: Square;
  readonly color: string;
  readonly rank: number;
  /** 0..100 move score shown in the badge. */
  readonly score: number;
  readonly accent: boolean;
  readonly glow: boolean;
}

export interface PvMark {
  readonly from: Square;
  readonly to: Square;
  readonly index: number;
}

function uciSquares(uci: string): { from: Square; to: Square } {
  return { from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square };
}
