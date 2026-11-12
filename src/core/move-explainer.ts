import type { Candidate } from './candidates';
import { moveScore, winDelta } from './move-score';
import { THRESHOLDS } from './classification';
import { formatScore } from './format';
import { MATED_CP, type Color, type Score } from './types';
import type { BoardService, DrawReason } from '../services/board.service';
import type { MessageKey, MessageParams, Msg } from './i18n';

export type Tone = 'good' | 'bad' | 'info';

/** One line of the explanation: a translatable message plus how to colour it. */
export interface Explanation extends Msg {
  readonly tone: Tone;
}

function line(key: MessageKey, tone: Tone, params?: MessageParams): Explanation {
  return params ? { key, params, tone } : { key, tone };
}

export interface OpeningContext {
  readonly name: string;
  readonly eco: string;
  /** The move itself is a book move from the position before it. */
  readonly inBook: boolean;
  /** Full-move number of this move within the book line. */
  readonly moveNumber: number;
}

export interface ExplainInput {
  /** Position before the move. */
  readonly fen: string;
  readonly uci: string;
  /** Engine candidates for `fen`, best first (may not contain `uci`). */
  readonly candidates: readonly Candidate[];
  /** White-POV evaluation after the move, used when the move isn't among the candidates. */
  readonly afterScore?: Score | null;
  readonly opening?: OpeningContext | null;
  /** The move ends the game in a draw (stalemate, insufficient material, 50 moves, repetition). */
  readonly drawAfter?: DrawReason | null;
}

const DRAW_KEY: Record<DrawReason, MessageKey> = {
  stalemate: 'ex.draw.stalemate',
  insufficient: 'ex.draw.insufficient',
  fifty: 'ex.draw.fifty',
  threefold: 'ex.draw.threefold',
};

/** Thresholds of the heuristics below; documented in README. */
export const EXPLAIN = {
  onlyMoveDelta: 15,
  pieceLoss: 250,
  pawnLoss: 90,
  kingZoneIncrease: 2,
  mobilityDrop: 3,
  /** Heuristics that describe a weakness are suppressed for moves scoring at least this. */
  quietAbove: 90,
} as const;

/**
 * Short textual explanation of a move built from engine lines and static chess.js
 * heuristics (no language model). Returns lines in display order.
 */
export function explainMove(input: ExplainInput, board: BoardService): Explanation[] {
  const { fen, uci, candidates, opening } = input;
  const out: Explanation[] = [];
  const mover = board.turn(fen);
  const san = board.uciToSan(fen, uci);
  if (!san) return out;

  const best = candidates[0];
  const cand = candidates.find((c) => c.uciMove === uci);
  const after = cand?.score ?? input.afterScore ?? null;
  const score = cand ? cand.moveScore : best && after ? moveScore(mover, best.score, after) : null;
  const delta = cand ? cand.delta : best && after ? winDelta(mover, best.score, after) : null;
  const tactics = cand?.tactics ?? board.tactics(fen, uci);

  if (opening) {
    out.push(
      opening.inBook
        ? line('ex.bookMove', 'good', { name: opening.name, eco: opening.eco, n: opening.moveNumber })
        : line('ex.outOfBook', 'info', { name: opening.name, eco: opening.eco }),
    );
  }

  // Verdict.
  if (cand?.brilliant) {
    out.push(line('ex.brilliant', 'good', { pawns: pawns(tactics?.sacrificed ?? 0) }));
  }
  if (cand?.rank === 1) {
    const second = candidates[1];
    if (second && second.delta > EXPLAIN.onlyMoveDelta) {
      out.push(line('ex.onlyMove', 'good', { san: second.sanMove, delta: Math.round(second.delta) }));
    } else {
      out.push(line('ex.best', 'good'));
    }
  } else if (score !== null && delta !== null && best) {
    // Labels follow the classification thresholds (win-% loss), not the score curve.
    const key: MessageKey =
      delta < 2
        ? 'ex.verdict.nearBest'
        : delta < THRESHOLDS.inaccuracy
          ? 'ex.verdict.good'
          : delta < THRESHOLDS.mistake
            ? 'ex.verdict.inaccuracy'
            : delta < THRESHOLDS.blunder
              ? 'ex.verdict.mistake'
              : 'ex.verdict.blunder';
    const tone: Tone = delta < 2 ? 'good' : delta < THRESHOLDS.inaccuracy ? 'info' : 'bad';
    out.push(line(key, tone, { score, best: best.sanMove }));
  }

  // Mates.
  if (best && after) {
    const bestMate = mateFor(mover, best.score);
    const afterMate = mateFor(mover, after);
    if (bestMate !== null && bestMate > 0 && (afterMate === null || afterMate <= 0) && cand?.rank !== 1) {
      out.push(line('ex.missesMate', 'bad', { n: bestMate }));
    }
    if (afterMate !== null && afterMate < 0) {
      out.push(line('ex.allowsMate', 'bad', { n: -afterMate }));
    }
  }

  const quiet = score !== null && score >= EXPLAIN.quietAbove;

  // Material.
  if (tactics && !cand?.brilliant && !quiet) {
    if (tactics.sacrificed >= EXPLAIN.pieceLoss) out.push(line('ex.losesPiece', 'bad', { pawns: pawns(tactics.sacrificed) }));
    else if (tactics.sacrificed >= EXPLAIN.pawnLoss) out.push(line('ex.losesPawn', 'bad'));
  } else if (tactics && tactics.sacrificed >= EXPLAIN.pieceLoss && !cand?.brilliant && quiet) {
    out.push(line('ex.sacrifice', 'good', { pawns: pawns(tactics.sacrificed) }));
  }

  const applied = board.applyUci(fen, uci);
  if (applied && !quiet) {
    // King safety: more enemy attacks around the mover's king.
    const before = board.kingSafety(fen, mover).zoneAttacks;
    const afterZone = board.kingSafety(applied.fen, mover).zoneAttacks;
    if (afterZone - before >= EXPLAIN.kingZoneIncrease) {
      out.push(line('ex.weakensKing', 'bad', { before, after: afterZone }));
    }
    // Mobility of the moved piece.
    const piece = san[0];
    if (piece && 'NBRQ'.includes(piece)) {
      const mob = board.pieceMobility(fen, uci);
      if (mob && mob.pieceBefore - mob.pieceAfter >= EXPLAIN.mobilityDrop) {
        out.push(line('ex.passivePiece', 'info', { before: mob.pieceBefore, after: mob.pieceAfter }));
      }
    }
  }

  if (input.drawAfter) {
    out.push(line(DRAW_KEY[input.drawAfter], 'info'));
    out.push(line('ex.evalAfter', 'info', { score: formatScore({ kind: 'cp', value: 0 }) }));
  } else if (after) out.push(line('ex.evalAfter', 'info', { score: formatScore(after) }));
  return out;
}

/** Mate distance from the mover's side: >0 mover mates, <0 mover gets mated, null = no mate. */
function mateFor(mover: Color, score: Score): number | null {
  const sign = mover === 'w' ? 1 : -1;
  if (score.kind === 'mate') return sign * score.value;
  if (Math.abs(score.value) >= MATED_CP) return sign * score.value > 0 ? 0.5 : -0.5;
  return null;
}

/** Centipawns as pawns with one decimal; the unit word lives in the message. */
function pawns(cp: number): string {
  return (cp / 100).toFixed(1);
}
