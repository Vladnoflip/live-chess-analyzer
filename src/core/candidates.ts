import { moveScore, scoreToStepColor, winDelta } from './move-score';
import type { Color, Score, SearchInfo } from './types';
import type { BoardService, TacticalSummary } from '../services/board.service';

/** One engine candidate move, ready for display. Scores are from White's point of view. */
export interface Candidate {
  readonly rank: number;
  readonly uciMove: string;
  readonly sanMove: string;
  /** White-POV centipawns, or null for a mate score. */
  readonly evalCp: number | null;
  /** White-POV mate distance (positive: White mates), or null. */
  readonly evalMate: number | null;
  readonly score: Score;
  readonly pvLine: readonly string[];
  readonly pvSan: readonly string[];
  readonly depth: number;
  /** 0..100 relative to the best line. */
  readonly moveScore: number;
  /** Win-probability loss vs the best line, percentage points. */
  readonly delta: number;
  readonly brilliant: boolean;
  readonly color: string;
  readonly tactics: TacticalSummary | null;
}

/** A sacrifice must risk at least a minor piece's worth, so pawn gambits don't qualify. */
export const BRILLIANT_MIN_SACRIFICE = 200;
/** The mover must still stand at least this well after the sacrifice (centipawns). */
export const BRILLIANT_MIN_EVAL = 50;

/**
 * Brilliant = the best move that gives up material (SEE says the moved piece is lost,
 * or something is left en prise) while the evaluation stays ≥ +0.50 for the mover or
 * keeps a forced mate.
 */
export function isBrilliant(rank: number, mover: Color, score: Score, tactics: TacticalSummary | null): boolean {
  if (rank !== 1 || !tactics || tactics.sacrificed < BRILLIANT_MIN_SACRIFICE) return false;
  return holdsAdvantage(mover, score);
}

function holdsAdvantage(mover: Color, score: Score): boolean {
  const sign = mover === 'w' ? 1 : -1;
  if (score.kind === 'mate') return sign * score.value > 0;
  return sign * score.value >= BRILLIANT_MIN_EVAL;
}

/** Turns engine lines (White POV, ordered by rank) into scored candidates. */
export function buildCandidates(fen: string, lines: readonly SearchInfo[], board: BoardService, pvPreview = 5): Candidate[] {
  const best = lines[0];
  if (!best) return [];
  const mover = board.turn(fen);
  const result: Candidate[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const uci = line.pv[0];
    if (!uci || seen.has(uci)) continue;
    seen.add(uci);
    const pvSan = board.uciLineToSan(fen, line.pv, pvPreview);
    if (pvSan.length === 0) continue;
    const rank = result.length + 1;
    const tactics = cachedTactics(board, fen, uci);
    const brilliant = isBrilliant(rank, mover, line.score, tactics);
    const score = rank === 1 ? 100 : moveScore(mover, best.score, line.score);
    result.push({
      rank,
      uciMove: uci,
      sanMove: pvSan[0]!,
      evalCp: line.score.kind === 'cp' ? line.score.value : null,
      evalMate: line.score.kind === 'mate' ? line.score.value : null,
      score: line.score,
      pvLine: line.pv,
      pvSan,
      depth: line.depth,
      moveScore: score,
      delta: rank === 1 ? 0 : winDelta(mover, best.score, line.score),
      brilliant,
      color: scoreToStepColor(score, brilliant),
      tactics,
    });
  }
  return result;
}


// SEE runs on every streamed engine update; positions repeat, so memoise.
const tacticsCache = new Map<string, TacticalSummary | null>();
function cachedTactics(board: BoardService, fen: string, uci: string): TacticalSummary | null {
  const key = `${fen}|${uci}`;
  if (tacticsCache.has(key)) return tacticsCache.get(key) ?? null;
  const t = board.tactics(fen, uci);
  tacticsCache.set(key, t);
  if (tacticsCache.size > 2000) tacticsCache.delete(tacticsCache.keys().next().value as string);
  return t;
}
