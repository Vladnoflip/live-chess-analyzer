import { MATED_CP, type Color, type MoveClass, type Score } from './types';

/**
 * Win probability (0..100) for White, from a White-POV score.
 * Logistic model fitted on Lichess games — the same curve Lichess uses for its
 * accuracy metric. Comparing win% instead of raw centipawns means that dropping
 * from +9 to +6 in a won position is not flagged as a blunder.
 */
export function whiteWinChance(score: Score): number {
  if (score.kind === 'mate') return score.value > 0 ? 100 : 0;
  if (Math.abs(score.value) >= MATED_CP) return score.value > 0 ? 100 : 0;
  const cp = Math.max(-1000, Math.min(1000, score.value));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

export function winChanceFor(color: Color, score: Score): number {
  const w = whiteWinChance(score);
  return color === 'w' ? w : 100 - w;
}

/** Win% drop thresholds (Lichess uses the same values). */
export const THRESHOLDS = { inaccuracy: 10, mistake: 20, blunder: 30 } as const;

export interface ClassifyInput {
  readonly mover: Color;
  readonly playedUci: string;
  /** Engine's best move in the position before the move. */
  readonly bestUci: string | null;
  /** White-POV evaluation before the move. */
  readonly before: Score;
  /** White-POV evaluation after the move. */
  readonly after: Score;
}

export function classifyMove({ mover, playedUci, bestUci, before, after }: ClassifyInput): Exclude<MoveClass, 'brilliant'> {
  if (bestUci !== null && playedUci === bestUci) return 'best';
  const drop = winChanceFor(mover, before) - winChanceFor(mover, after);
  if (drop >= THRESHOLDS.blunder) return 'blunder';
  if (drop >= THRESHOLDS.mistake) return 'mistake';
  if (drop >= THRESHOLDS.inaccuracy) return 'inaccuracy';
  return 'good';
}
