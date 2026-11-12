import { winChanceFor } from './classification';
import type { Color, Score } from './types';

/**
 * 100-point move score from the win-probability loss (percentage points) relative to
 * the best move. Piecewise-linear through these anchor points:
 *
 *   delta (pp):  0    2    5   10   15   20   30   40+
 *   score:     100   90   75   55   40   25   10    0
 *
 * Steep at the start (−5 per pp up to 2 pp, then −5 per pp to 5 pp, −4 to 10 pp, −3 to
 * 20 pp), so only near-equal alternatives stay in the 90s; an inaccuracy (10–20 pp)
 * lands at 55–25, a mistake (20–30 pp) at 25–10, a blunder (30+ pp) at 10–0.
 */
export const SCORE_ANCHORS: readonly (readonly [delta: number, score: number])[] = [
  [0, 100],
  [2, 90],
  [5, 75],
  [10, 55],
  [15, 40],
  [20, 25],
  [30, 10],
  [40, 0],
];

export function scoreFromDelta(delta: number): number {
  if (!Number.isFinite(delta) || delta <= 0) return 100;
  for (let i = 1; i < SCORE_ANCHORS.length; i++) {
    const [d1, s1] = SCORE_ANCHORS[i] as readonly [number, number];
    const [d0, s0] = SCORE_ANCHORS[i - 1] as readonly [number, number];
    if (delta <= d1) return Math.round(s0 + ((delta - d0) / (d1 - d0)) * (s1 - s0));
  }
  return 0;
}

/** Win-probability loss of `candidate` vs `best`, from the mover's point of view (≥ 0). */
export function winDelta(mover: Color, best: Score, candidate: Score): number {
  return Math.max(0, winChanceFor(mover, best) - winChanceFor(mover, candidate));
}

export function moveScore(mover: Color, best: Score, candidate: Score): number {
  return scoreFromDelta(winDelta(mover, best, candidate));
}

// ───────────────────────────── colour scale ─────────────────────────────

export const BRILLIANT_COLOR = '#33b8ff';

/** Gradient stops; colours are interpolated linearly in RGB between neighbours. */
export const COLOR_STOPS: readonly (readonly [score: number, hex: string])[] = [
  [0, '#e74c3c'],
  [25, '#e67e22'],
  [50, '#f1c40f'],
  [75, '#2ecc71'],
  [100, '#33b8ff'],
];

export function scoreToColor(score: number, brilliant = false): string {
  if (brilliant) return BRILLIANT_COLOR;
  const s = Math.max(0, Math.min(100, Number.isFinite(score) ? score : 0));
  for (let i = 1; i < COLOR_STOPS.length; i++) {
    const [s1, c1] = COLOR_STOPS[i] as readonly [number, string];
    const [s0, c0] = COLOR_STOPS[i - 1] as readonly [number, string];
    if (s <= s1) return mixHex(c0, c1, (s - s0) / (s1 - s0));
  }
  return COLOR_STOPS[COLOR_STOPS.length - 1]![1];
}

function mixHex(a: string, b: string, t: number): string {
  const pa = parseHex(a);
  const pb = parseHex(b);
  const ch = (i: number) => Math.round(pa[i]! + (pb[i]! - pa[i]!) * t).toString(16).padStart(2, '0');
  return `#${ch(0)}${ch(1)}${ch(2)}`;
}

function parseHex(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// ───────────────────────────── arrow colour steps ─────────────────────────────

/**
 * Discrete arrow colours (and the matching variant rows): a move's arrow shows which
 * band it falls into rather than a blend. Bright tones with a faint glow. Brilliant moves are always blue.
 */
export const ARROW_STEPS: readonly (readonly [minScore: number, hex: string, label: string])[] = [
  [90, '#1fbf5a', 'green'],
  [75, '#7bdc4f', 'light green'],
  [50, '#ffd93d', 'yellow'],
  [25, '#ff9a2e', 'orange'],
  [0, '#ff4d4f', 'red'],
];

export function scoreToStepColor(score: number, brilliant = false): string {
  if (brilliant) return BRILLIANT_COLOR;
  const s = Number.isFinite(score) ? score : 0;
  return (ARROW_STEPS.find(([min]) => s >= min) ?? ARROW_STEPS[ARROW_STEPS.length - 1]!)[1];
}

/** Dark or white text, whichever reads better on `hex` (WCAG relative luminance). */
export function textColorOn(hex: string): string {
  const [r, g, b] = parseHex(hex).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // 0.179 is where black and white text have equal contrast ratios.
  return luminance > 0.179 ? '#1b1b1b' : '#ffffff';
}
