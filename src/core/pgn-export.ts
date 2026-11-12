import { Chess } from 'chess.js';
import type { BoardService, GameMove } from '../services/board.service';
import { START_FEN } from '../services/board.service';
import { buildCandidates } from './candidates';
import { explainMove, type Explanation } from './move-explainer';
import { MOVE_CLASS_LABEL } from './format';
import { msg, type MessageKey, type Msg } from './i18n';
import { MATED_CP, type MoveClass, type Score } from './types';
import type { PositionEval } from './analysis.manager';

/** Everything the exporter needs from a reviewed game. */
export interface AnnotatedGame {
  readonly startFen: string;
  readonly moves: readonly GameMove[];
  readonly headers: Readonly<Record<string, string>>;
  readonly classes: Readonly<Record<number, MoveClass>>;
  readonly evals: Readonly<Record<string, PositionEval>>;
}

/** Classes that get a symbol and a text comment; good and best moves only get the eval. */
const COMMENTED: ReadonlySet<MoveClass> = new Set(['brilliant', 'inaccuracy', 'mistake', 'blunder']);

/** Explanation lines that say *why* a move is bad, in order of importance. */
const REASON_KEYS: readonly MessageKey[] = [
  'ex.allowsMate',
  'ex.missesMate',
  'ex.losesPiece',
  'ex.losesPawn',
  'ex.weakensKing',
  'ex.passivePiece',
];

/**
 * Builds a PGN of the loaded game with one comment per move, for example
 * `{?! Inaccuracy: Loses a pawn. Best was Nf3 [%eval 0.35]}` or `{!! Brilliant move}`.
 * `[%eval]` uses the lichess/chess.com format, so other tools can plot the evaluation.
 * Texts follow the UI language through `tr`.
 */
export function exportAnnotatedPgn(game: AnnotatedGame, board: BoardService, tr: (m: Msg) => string): string {
  const chess = new Chess(game.startFen);
  for (const [key, value] of Object.entries(game.headers)) {
    if (key === 'FEN' || key === 'SetUp') continue;
    chess.setHeader(key, value);
  }
  if (game.startFen !== START_FEN) {
    chess.setHeader('SetUp', '1');
    chess.setHeader('FEN', game.startFen);
  }
  chess.setHeader('Annotator', 'LiveChess Analyzer (Stockfish 18)');

  for (const move of game.moves) {
    chess.move({ from: move.uci.slice(0, 2), to: move.uci.slice(2, 4), promotion: move.uci[4] });
    const comment = moveComment(game, move, board, tr);
    if (comment) chess.setComment(comment);
  }
  // No maxWidth: chess.js 1.4 wrapping can glue moves together and split [%eval] tags.
  return `${chess.pgn()}\n`;
}

export function moveComment(game: AnnotatedGame, move: GameMove, board: BoardService, tr: (m: Msg) => string): string {
  const parts: string[] = [];
  const cls = game.classes[move.ply];
  const before = game.evals[move.fenBefore];
  const after = game.evals[move.fenAfter];

  if (cls && COMMENTED.has(cls)) {
    const { label, symbol } = MOVE_CLASS_LABEL[cls];
    if (cls === 'brilliant') {
      parts.push(`${symbol} ${tr(msg('pgn.brilliant'))}`);
    } else {
      let text = `${symbol} ${tr(msg(label))}`;
      const reason = before ? mainReason(move, before, board) : null;
      if (reason) text += `: ${tr(reason)}`;
      const bestSan = before?.bestMove ? board.uciToSan(move.fenBefore, before.bestMove) : null;
      if (bestSan && before?.bestMove !== move.uci) text += `. ${tr(msg('pgn.bestWas', { san: bestSan }))}`;
      parts.push(text);
    }
  }
  if (after) {
    const ev = evalTag(after.score);
    if (ev) parts.push(ev);
  }
  // Braces would end the PGN comment early.
  return parts.join(' ').replace(/[{}]/g, '');
}

function mainReason(move: GameMove, before: PositionEval, board: BoardService): Explanation | null {
  const candidates = buildCandidates(move.fenBefore, before.lines, board, 5);
  const lines = explainMove({ fen: move.fenBefore, uci: move.uci, candidates }, board);
  for (const key of REASON_KEYS) {
    const found = lines.find((l) => l.key === key);
    if (found) return found;
  }
  return null;
}

/** `[%eval 0.35]`, `[%eval #-3]`; nothing for an already finished game. */
export function evalTag(score: Score): string | null {
  if (score.kind === 'mate') return `[%eval #${score.value}]`;
  if (Math.abs(score.value) >= MATED_CP) return null;
  return `[%eval ${(score.value / 100).toFixed(2)}]`;
}

/** File name like `Carlsen-Nepomniachtchi-2021.12.03.pgn`, or a generic one. */
export function pgnFileName(headers: Readonly<Record<string, string>>): string {
  const clean = (s: string | undefined) => (s && s !== '?' ? s.replace(/[^\p{L}\p{N}._-]+/gu, '_').slice(0, 40) : '');
  const parts = [clean(headers.White), clean(headers.Black), clean(headers.Date?.replace(/\?+/g, ''))].filter(Boolean);
  return `${parts.length >= 2 ? parts.join('-') : 'livechess-analysis'}.pgn`;
}
