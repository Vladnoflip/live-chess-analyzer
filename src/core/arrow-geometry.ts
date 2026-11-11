/**
 * Arrow shapes on an 8×8 board in square units (one square = 1). Shared by the app
 * board and the extension overlay so both draw identical arrows.
 */
export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface ArrowShape {
  /** Shaft polyline (2 points, or 3 for a knight's L-shaped arrow). */
  readonly shaft: readonly Point[];
  /** Arrowhead triangle. */
  readonly head: readonly [Point, Point, Point];
  /** Where the score badge goes: on the shaft, before the head. */
  readonly badge: Point;
  readonly width: number;
}

/** Centre of a square in board coordinates for the given orientation. */
export function squareCenter(square: string, orientation: 'w' | 'b'): Point {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  return orientation === 'w' ? { x: file + 0.5, y: 7 - rank + 0.5 } : { x: 7 - file + 0.5, y: rank + 0.5 };
}

export function arrowShape(from: Point, to: Point, accent: boolean): ArrowShape {
  const width = accent ? 0.2 : 0.13;
  const headLen = accent ? 0.46 : 0.36;
  const headHalf = accent ? 0.27 : 0.21;

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  // Knight moves bend: long leg first, then the short one (like on lichess).
  const knight = (Math.abs(dx) === 2 && Math.abs(dy) === 1) || (Math.abs(dx) === 1 && Math.abs(dy) === 2);
  const corner: Point | null = knight ? (Math.abs(dx) === 2 ? { x: to.x, y: from.y } : { x: from.x, y: to.y }) : null;

  const lastFrom = corner ?? from;
  const lx = to.x - lastFrom.x;
  const ly = to.y - lastFrom.y;
  const len = Math.hypot(lx, ly) || 1;
  const ux = lx / len;
  const uy = ly / len;

  // Tip stops short of the centre so the target piece stays visible.
  const tip = { x: to.x - ux * 0.16, y: to.y - uy * 0.16 };
  const base = { x: tip.x - ux * headLen, y: tip.y - uy * headLen };
  const head: [Point, Point, Point] = [
    tip,
    { x: base.x - uy * headHalf, y: base.y + ux * headHalf },
    { x: base.x + uy * headHalf, y: base.y - ux * headHalf },
  ];
  // Shaft starts slightly off the source centre and runs into the head's base.
  const sx = (corner ?? to).x - from.x;
  const sy = (corner ?? to).y - from.y;
  const slen = Math.hypot(sx, sy) || 1;
  const start = { x: from.x + (sx / slen) * 0.12, y: from.y + (sy / slen) * 0.12 };
  const shaftEnd = { x: base.x + ux * 0.05, y: base.y + uy * 0.05 };
  const shaft = corner ? [start, corner, shaftEnd] : [start, shaftEnd];

  // Badge sits on the last segment, 0.32 squares before the head (or mid-way on short arrows).
  const segLen = Math.hypot(base.x - lastFrom.x, base.y - lastFrom.y);
  const back = Math.min(0.32, segLen / 2);
  const badge = { x: base.x - ux * back, y: base.y - uy * back };
  return { shaft, head, badge, width };
}

export function pointsAttr(points: readonly Point[]): string {
  return points.map((p) => `${round(p.x)},${round(p.y)}`).join(' ');
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
