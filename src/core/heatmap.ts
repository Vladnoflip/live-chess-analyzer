import type { Square } from 'chess.js';
import type { GameMove } from '../services/board.service';
import type { MoveClass } from './types';

/** Move classes that count towards the heatmap. */
export const HEATMAP_CLASSES: ReadonlySet<MoveClass> = new Set(['mistake', 'blunder']);

export interface HeatCell {
  readonly square: Square;
  /** Mistakes and blunders whose move landed on this square. */
  readonly count: number;
  /** count / max count, 0..1. */
  readonly intensity: number;
}

/**
 * Squares where the reviewed game's mistakes and blunders were played to (the
 * destination square of each bad move), optionally only for one side.
 */
export function mistakeHeatmap(
  moves: readonly GameMove[],
  classes: Readonly<Record<number, MoveClass>>,
  side: 'w' | 'b' | 'both' = 'both',
): HeatCell[] {
  const counts = new Map<Square, number>();
  for (const move of moves) {
    const cls = classes[move.ply];
    if (!cls || !HEATMAP_CLASSES.has(cls)) continue;
    if (side !== 'both' && move.color !== side) continue;
    const to = move.uci.slice(2, 4) as Square;
    counts.set(to, (counts.get(to) ?? 0) + 1);
  }
  const max = Math.max(0, ...counts.values());
  return [...counts.entries()]
    .map(([square, count]) => ({ square, count, intensity: max ? count / max : 0 }))
    .sort((a, b) => b.count - a.count || a.square.localeCompare(b.square));
}

/** Semi-transparent red: rarely = light tint, most often = deep red. */
export function heatColor(intensity: number): string {
  const t = Math.min(1, Math.max(0, intensity));
  const alpha = 0.18 + 0.47 * t;
  const green = Math.round(120 * (1 - t));
  return `rgba(255, ${green}, ${Math.round(green / 2)}, ${alpha.toFixed(2)})`;
}
