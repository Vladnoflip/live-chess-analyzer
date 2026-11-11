import type { Score, SearchInfo } from '../../src/core/types';

/** Engine output for one position, sent to the tab that asked for it. */
export interface EngineUpdate {
  readonly fen: string;
  /** White-POV score. */
  readonly score: Score | null;
  readonly depth: number;
  readonly bestMove: string | null;
  readonly pv: readonly string[];
  /** All MultiPV lines (White POV), best first; PVs trimmed for messaging. */
  readonly lines: readonly SearchInfo[];
  readonly elapsedMs: number;
  /** false while the search is still streaming. */
  readonly final: boolean;
}

// content → background
export type ContentMessage = { readonly type: 'analyze'; readonly fen: string } | { readonly type: 'stop' };

// background → offscreen
export type OffscreenCommand =
  | { readonly target: 'offscreen'; readonly type: 'analyze'; readonly tabId: number; readonly fen: string; readonly depth: number }
  | { readonly target: 'offscreen'; readonly type: 'configure'; readonly threads: number; readonly hashMb: number; readonly multiPv: number }
  | { readonly target: 'offscreen'; readonly type: 'stop' };

// offscreen → background
export type OffscreenEvent =
  | { readonly target: 'background'; readonly type: 'engine-update'; readonly tabId: number; readonly update: EngineUpdate }
  | { readonly target: 'background'; readonly type: 'engine-error'; readonly tabId: number | null; readonly message: string };

// background → content
export type TabMessage =
  | { readonly type: 'engine-update'; readonly update: EngineUpdate }
  | { readonly type: 'engine-error'; readonly message: string };

export function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}
