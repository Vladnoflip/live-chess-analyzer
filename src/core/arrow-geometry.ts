/**
 * Arrow shapes on an 8×8 board in square units (one square = 1). Shared by the app
 * board, the trainer site and the extension overlay, so all of them draw identical
 * arrows: a thin line that starts at a small ring on the source square, a compact head
 * with softly rounded corners that stops short of the target piece, and (for the best
 * or selected move) rounded frames around the source and target squares. Knight moves
 * bend into an L.
 */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Rounded frame around a square: top-left corner and size in squares. */
export interface SquareFrame {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly radius: number;
}

export interface ArrowShape {
  /** Line polyline (2 points, or 3 for a knight's L-shaped arrow); stroke it with round caps and joins. */
  readonly shaft: readonly Point[];
  /** Arrowhead triangle: tip, then the two base corners. */
  readonly head: readonly [Point, Point, Point];
  /** SVG path data of the head with rounded corners; fill it, no stroke. */
  readonly headPath: string;
  /** Ring marking the start of the move (centre of the source square). */
  readonly origin: Point;
  readonly originRadius: number;
  /** Frames around the source and target squares (accented arrows only, else null). */
  readonly frames: { readonly from: SquareFrame; readonly to: SquareFrame } | null;
  /** Centre of the score badge: on the line, just before the head. */
  readonly badge: Point;
  /** The badge itself: a small rectangle with slightly rounded corners (top-left corner). */
  readonly badgeBox: BadgeBox;
  /** Line width in squares. */
  readonly width: number;
}

export interface BadgeBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly radius: number;
}

/** Arrow proportions in squares. */
export const ARROW = {
  width: { normal: 0.07, accent: 0.09 },
  headLength: { normal: 0.27, accent: 0.32 },
  headHalfWidth: { normal: 0.15, accent: 0.18 },
  originRadius: { normal: 0.075, accent: 0.095 },
  /** Distance from the target centre to the tip, so the piece stays visible. */
  tipGap: 0.3,
  /** Square frames: inset from the square edge and corner radius. */
  frameInset: 0.05,
  frameRadius: 0.14,
  /** Score badge: rounded rectangle sized to the number of digits. */
  badge: { height: 0.22, charWidth: 0.09, padding: 0.1, radius: 0.05, gap: 0.03 },
  /** Corner rounding of the head as a fraction of the adjacent edges. */
  tipRounding: 0.12,
  baseRounding: 0.22,
} as const;

/** Centre of a square in board coordinates for the given orientation. */
export function squareCenter(square: string, orientation: 'w' | 'b'): Point {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  return orientation === 'w' ? { x: file + 0.5, y: 7 - rank + 0.5 } : { x: 7 - file + 0.5, y: rank + 0.5 };
}

/** Badge width and height for a label such as "7", "64" or "100". */
export function badgeSize(label: string): { width: number; height: number } {
  const { height, charWidth, padding } = ARROW.badge;
  return { width: padding + charWidth * Math.max(1, label.length), height };
}

export function arrowShape(from: Point, to: Point, accent: boolean, badgeLabel = '100'): ArrowShape {
  const kind = accent ? 'accent' : 'normal';
  const width = ARROW.width[kind];
  const headLen = ARROW.headLength[kind];
  const headHalf = ARROW.headHalfWidth[kind];

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  // Knight moves bend: long leg first, then the short one.
  const knight = (Math.abs(dx) === 2 && Math.abs(dy) === 1) || (Math.abs(dx) === 1 && Math.abs(dy) === 2);
  const corner: Point | null = knight ? (Math.abs(dx) === 2 ? { x: to.x, y: from.y } : { x: from.x, y: to.y }) : null;

  const lastFrom = corner ?? from;
  const lx = to.x - lastFrom.x;
  const ly = to.y - lastFrom.y;
  const len = Math.hypot(lx, ly) || 1;
  const ux = lx / len;
  const uy = ly / len;

  // Tip stops short of the centre so the target piece stays visible.
  const tip = { x: to.x - ux * ARROW.tipGap, y: to.y - uy * ARROW.tipGap };
  const base = { x: tip.x - ux * headLen, y: tip.y - uy * headLen };
  const head: [Point, Point, Point] = [
    tip,
    { x: base.x - uy * headHalf, y: base.y + ux * headHalf },
    { x: base.x + uy * headHalf, y: base.y - ux * headHalf },
  ];

  // The line starts at the ring and runs a little into the head so there is no seam.
  const shaftEnd = { x: base.x + ux * 0.06, y: base.y + uy * 0.06 };
  const shaft = corner ? [from, corner, shaftEnd] : [from, shaftEnd];

  const frame = (c: Point): SquareFrame => ({
    x: c.x - 0.5 + ARROW.frameInset,
    y: c.y - 0.5 + ARROW.frameInset,
    size: 1 - 2 * ARROW.frameInset,
    radius: ARROW.frameRadius,
  });

  // Badge sits beside the last segment, level with the head's base, so the thin line
  // and the head stay visible even on one-square moves.
  // Badge sits on the line just before the head (mid-way on short arrows).
  const size = badgeSize(badgeLabel);
  const along = (Math.abs(ux) * size.width + Math.abs(uy) * size.height) / 2;
  const segLen = Math.hypot(base.x - lastFrom.x, base.y - lastFrom.y);
  const back = Math.min(along + ARROW.badge.gap, segLen / 2);
  const badge = { x: base.x - ux * back, y: base.y - uy * back };
  const badgeBox: BadgeBox = {
    x: badge.x - size.width / 2,
    y: badge.y - size.height / 2,
    width: size.width,
    height: size.height,
    radius: ARROW.badge.radius,
  };
  return {
    shaft,
    head,
    headPath: roundedTrianglePath(head),
    origin: from,
    originRadius: ARROW.originRadius[kind],
    frames: accent ? { from: frame(from), to: frame(to) } : null,
    badge,
    badgeBox,
    width,
  };
}

/**
 * Closed path through a triangle whose corners are replaced by quadratic curves.
 * The tip is rounded less than the base corners, so the arrow still looks sharp.
 */
export function roundedTrianglePath(points: readonly [Point, Point, Point]): string {
  const rounding = [ARROW.tipRounding, ARROW.baseRounding, ARROW.baseRounding];
  const parts: string[] = [];
  for (let i = 0; i < 3; i++) {
    const v = points[i] as Point;
    const prev = points[(i + 2) % 3] as Point;
    const next = points[(i + 1) % 3] as Point;
    const t = rounding[i] as number;
    const a = lerp(v, prev, t);
    const b = lerp(v, next, t);
    parts.push(`${i === 0 ? 'M' : 'L'}${fmt(a)}Q${fmt(v)} ${fmt(b)}`);
  }
  return `${parts.join('')}Z`;
}

export function pointsAttr(points: readonly Point[]): string {
  return points.map((p) => `${round(p.x)},${round(p.y)}`).join(' ');
}

function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function fmt(p: Point): string {
  return `${round(p.x)} ${round(p.y)}`;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
