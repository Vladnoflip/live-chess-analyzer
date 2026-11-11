import type { Candidate } from './candidates';
import { moveScore, winDelta } from './move-score';
import { THRESHOLDS } from './classification';
import { formatScore } from './format';
import { MATED_CP, type Color, type Score } from './types';
import type { BoardService } from '../services/board.service';

export type Tone = 'good' | 'bad' | 'info';

export interface Explanation {
  readonly text: string;
  readonly tone: Tone;
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
}

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
        ? { text: `Дебютный ход теории: ${opening.name} (${opening.eco}), ${opening.moveNumber}-й ход теории`, tone: 'good' }
        : { text: `Вне теории (дебют: ${opening.name}, ${opening.eco})`, tone: 'info' },
    );
  }

  // Verdict.
  if (cand?.brilliant) {
    out.push({ text: `Блестящий ход: жертва материала (~${pawns(tactics?.sacrificed ?? 0)}), а оценка сохраняется`, tone: 'good' });
  }
  if (cand?.rank === 1) {
    const second = candidates[1];
    if (second && second.delta > EXPLAIN.onlyMoveDelta) {
      out.push({ text: `Единственный ход: следующий вариант (${second.sanMove}) теряет ${Math.round(second.delta)} п.п. шансов`, tone: 'good' });
    } else {
      out.push({ text: 'Лучший ход', tone: 'good' });
    }
  } else if (score !== null && delta !== null && best) {
    // Labels follow the classification thresholds (win-% loss), not the score curve.
    const label =
      delta < 2 ? 'Почти не уступает лучшему' : delta < THRESHOLDS.inaccuracy ? 'Хороший ход' : delta < THRESHOLDS.mistake ? 'Неточность' : delta < THRESHOLDS.blunder ? 'Ошибка' : 'Зевок';
    const tone: Tone = delta < 2 ? 'good' : delta < THRESHOLDS.inaccuracy ? 'info' : 'bad';
    out.push({ text: `${label} (${score}/100), лучше ${best.sanMove}`, tone });
  }

  // Mates.
  if (best && after) {
    const bestMate = mateFor(mover, best.score);
    const afterMate = mateFor(mover, after);
    if (bestMate !== null && bestMate > 0 && (afterMate === null || afterMate <= 0) && cand?.rank !== 1) {
      out.push({ text: `Упускает мат в ${bestMate}`, tone: 'bad' });
    }
    if (afterMate !== null && afterMate < 0) {
      out.push({ text: `Позволяет мат в ${-afterMate}`, tone: 'bad' });
    }
  }

  const quiet = score !== null && score >= EXPLAIN.quietAbove;

  // Material.
  if (tactics && !cand?.brilliant && !quiet) {
    if (tactics.sacrificed >= EXPLAIN.pieceLoss) out.push({ text: `Теряет фигуру (~${pawns(tactics.sacrificed)})`, tone: 'bad' });
    else if (tactics.sacrificed >= EXPLAIN.pawnLoss) out.push({ text: 'Теряет пешку', tone: 'bad' });
  } else if (tactics && tactics.sacrificed >= EXPLAIN.pieceLoss && !cand?.brilliant && quiet) {
    out.push({ text: `Жертва материала (~${pawns(tactics.sacrificed)}) с сохранением оценки`, tone: 'good' });
  }

  const applied = board.applyUci(fen, uci);
  if (applied && !quiet) {
    // King safety: more enemy attacks around the mover's king.
    const before = board.kingSafety(fen, mover).zoneAttacks;
    const afterZone = board.kingSafety(applied.fen, mover).zoneAttacks;
    if (afterZone - before >= EXPLAIN.kingZoneIncrease) {
      out.push({ text: `Ослабляет короля: атак на зону короля ${before} → ${afterZone}`, tone: 'bad' });
    }
    // Mobility of the moved piece.
    const piece = san[0];
    if (piece && 'NBRQ'.includes(piece)) {
      const mob = board.pieceMobility(fen, uci);
      if (mob && mob.pieceBefore - mob.pieceAfter >= EXPLAIN.mobilityDrop) {
        out.push({ text: `Уводит фигуру с активной позиции (ходов ${mob.pieceBefore} → ${mob.pieceAfter})`, tone: 'info' });
      }
    }
  }

  if (after) out.push({ text: `Оценка после хода: ${formatScore(after)}`, tone: 'info' });
  return out;
}

/** Mate distance from the mover's side: >0 mover mates, <0 mover gets mated, null = no mate. */
function mateFor(mover: Color, score: Score): number | null {
  const sign = mover === 'w' ? 1 : -1;
  if (score.kind === 'mate') return sign * score.value;
  if (Math.abs(score.value) >= MATED_CP) return sign * score.value > 0 ? 0.5 : -0.5;
  return null;
}

function pawns(cp: number): string {
  return `${(cp / 100).toFixed(1)} пешки`;
}
