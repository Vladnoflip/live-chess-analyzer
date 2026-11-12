import { Store } from './observable';
import { msg, type Msg } from './i18n';
import { MATED_CP, type Color, type Score } from './types';
import type { BoardService, ParsedGame } from '../services/board.service';

/**
 * "Guess the move": replays a game and asks the user to find each move of one side.
 * A guess succeeds when it is the move that was played, or when Stockfish rates it no
 * more than GUESS_TOLERANCE_CP (0.50 pawns) worse than that move for the side to move.
 * Otherwise the game move and both evaluations are shown. Framework-free: the board and
 * the engine come in as callbacks.
 */
export const GUESS_TOLERANCE_CP = 50;
export const GUESS_DEPTH = 12;
/** Pause between the guessed move and the opponent's reply, so both are seen sliding. */
export const GUESS_REPLY_DELAY_MS = 450;

export type GuessVerdict = 'match' | 'good' | 'miss';
export type GuessStatus = 'idle' | 'guessing' | 'checking' | 'feedback' | 'finished';

export interface GuessResult {
  /** Half-move number of the game move that was to be guessed (1-based). */
  readonly ply: number;
  readonly fenBefore: string;
  readonly userUci: string;
  readonly userSan: string;
  readonly gameUci: string;
  readonly gameSan: string;
  readonly verdict: GuessVerdict;
  /** White-POV evaluations after each move; null for an exact match. */
  readonly userScore: Score | null;
  readonly gameScore: Score | null;
  /** How much worse the guess is than the game move for the mover, in centipawns (≤ 0 = better). */
  readonly lossCp: number | null;
}

export interface GuessState {
  readonly status: GuessStatus;
  readonly side: Color;
  /** Position shown: number of half-moves already played. */
  readonly ply: number;
  /** Moves the user has to guess in this game. */
  readonly total: number;
  readonly results: readonly GuessResult[];
  readonly last: GuessResult | null;
  readonly error: Msg | null;
  readonly headers: Readonly<Record<string, string>>;
}

export interface GuessDeps {
  readonly board: BoardService;
  /** Shows a game on the board (called once per start). */
  load(game: ParsedGame): void;
  /** Shows the position after `ply` half-moves of the loaded game. */
  goTo(ply: number): void;
  /** White-POV evaluation of a position. */
  evaluate(fen: string): Promise<Score>;
  wait?(ms: number): Promise<void>;
}

const IDLE: GuessState = { status: 'idle', side: 'w', ply: 0, total: 0, results: [], last: null, error: null, headers: {} };

export class GuessManager extends Store<GuessState> {
  private game: ParsedGame | null = null;
  /** Bumped on start/stop so late engine answers are ignored. */
  private generation = 0;

  constructor(private readonly deps: GuessDeps) {
    super(IDLE);
  }

  start(game: ParsedGame, side: Color): boolean {
    this.generation++;
    const total = game.moves.filter((m) => m.color === side).length;
    if (total === 0) {
      this.setState({ ...IDLE, error: msg('guess.error.noMoves') });
      return false;
    }
    this.game = game;
    this.deps.load(game);
    this.setState({ ...IDLE, status: 'guessing', side, total, headers: game.headers });
    // Play the opponent's moves until it is the user's turn.
    this.advanceTo(this.firstUserPly(0));
    return true;
  }

  stop(): void {
    this.generation++;
    this.game = null;
    this.setState(IDLE);
  }

  /** The user's move (UCI) in the shown position. */
  async guess(uci: string): Promise<void> {
    const game = this.game;
    const { status, ply } = this.getState();
    if (!game || status !== 'guessing') return;
    const move = game.moves[ply];
    if (!move) return;
    const { board } = this.deps;
    const userSan = board.uciToSan(move.fenBefore, uci);
    const applied = board.applyUci(move.fenBefore, uci);
    if (!userSan || !applied) return;

    const base = { ply: move.ply, fenBefore: move.fenBefore, userUci: uci, userSan, gameUci: move.uci, gameSan: move.san };
    if (uci === move.uci) {
      this.finishGuess({ ...base, verdict: 'match', userScore: null, gameScore: null, lossCp: null });
      return;
    }

    const generation = this.generation;
    this.setState({ status: 'checking', error: null });
    try {
      const gameScore = await this.deps.evaluate(move.fenAfter);
      const userScore = await this.deps.evaluate(applied.fen);
      if (generation !== this.generation) return;
      const lossCp = moverCp(gameScore, move.color) - moverCp(userScore, move.color);
      const verdict: GuessVerdict = lossCp <= GUESS_TOLERANCE_CP ? 'good' : 'miss';
      this.finishGuess({ ...base, verdict, userScore, gameScore, lossCp });
    } catch {
      if (generation !== this.generation) return;
      this.setState({ status: 'guessing', error: msg('guess.error.engine') });
    }
  }

  /** After the feedback: plays the game move and the reply, then asks for the next move. */
  async next(): Promise<void> {
    const game = this.game;
    const { status, ply } = this.getState();
    if (!game || status !== 'feedback') return;
    const generation = this.generation;
    const nextUser = this.firstUserPly(ply + 1);
    this.deps.goTo(ply + 1);
    if (nextUser > ply + 1) {
      await (this.deps.wait ?? defaultWait)(GUESS_REPLY_DELAY_MS);
      if (generation !== this.generation) return;
    }
    this.advanceTo(nextUser);
  }

  /** Share of moves found (match or good), 0..100. */
  accuracy(): number {
    const { results } = this.getState();
    if (results.length === 0) return 0;
    return Math.round((100 * results.filter((r) => r.verdict !== 'miss').length) / results.length);
  }

  private finishGuess(result: GuessResult): void {
    this.setState((s) => ({ status: 'feedback', last: result, results: [...s.results, result], error: null }));
  }

  private advanceTo(ply: number): void {
    const game = this.game;
    if (!game) return;
    if (ply >= game.moves.length) {
      this.deps.goTo(game.moves.length);
      this.setState({ status: 'finished', ply: game.moves.length, last: this.getState().last });
      return;
    }
    this.deps.goTo(ply);
    this.setState({ status: 'guessing', ply, last: null });
  }

  /** First ply ≥ `from` where the user's side is to move (moves.length if none). */
  private firstUserPly(from: number): number {
    const moves = this.game?.moves ?? [];
    let p = from;
    while (p < moves.length && moves[p]?.color !== this.getState().side) p++;
    return p;
  }
}

/** Centipawns from the mover's point of view; mates are worth more the sooner they come. */
export function moverCp(score: Score, mover: Color): number {
  const sign = mover === 'w' ? 1 : -1;
  if (score.kind === 'mate') {
    const v = score.value > 0 ? MATED_CP - score.value : -MATED_CP - score.value;
    return sign * v;
  }
  return sign * score.value;
}

function defaultWait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
