/** Engine score. `cp` = centipawns, `mate` = moves to mate (negative: getting mated). */
export type Score =
  | { readonly kind: 'cp'; readonly value: number }
  | { readonly kind: 'mate'; readonly value: number };

export type Color = 'w' | 'b';

export type MoveClass = 'brilliant' | 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

export interface EngineSettings {
  readonly depth: number;
  readonly threads: number;
  readonly hashMb: number;
}

/** One `info` line from the engine, already normalised to White's point of view. */
export interface SearchInfo {
  readonly depth: number;
  readonly selDepth?: number;
  readonly multiPv: number;
  /** Score from White's perspective. */
  readonly score: Score;
  readonly bound?: 'lower' | 'upper';
  readonly nodes?: number;
  readonly nps?: number;
  readonly timeMs?: number;
  readonly pv: readonly string[];
}

export interface SearchResult {
  readonly fen: string;
  readonly bestMove: string | null;
  readonly ponder: string | null;
  /** Last complete info line of the principal variation (may be null for terminal positions). */
  readonly info: SearchInfo | null;
  /** All MultiPV lines, ordered by rank (lines[0] is the main line). */
  readonly lines: readonly SearchInfo[];
  /** Wall-clock time from `go` to `bestmove`. */
  readonly elapsedMs: number;
}

/**
 * Centipawn value for a position that is already checkmate. UCI reports it as
 * "mate 0", whose sign is lost once converted to White's POV, so it becomes ±MATED_CP.
 */
export const MATED_CP = 100_000;
