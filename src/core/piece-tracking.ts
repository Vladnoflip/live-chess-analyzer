import type { Square } from 'chess.js';
import type { BoardPiece } from '../services/board.service';

/** A piece with a stable id that survives moves, so the UI can slide it instead of re-creating it. */
export interface TrackedPiece extends BoardPiece {
  readonly id: number;
}

function distance(a: Square, b: Square): number {
  return Math.abs(a.charCodeAt(0) - b.charCodeAt(0)) + Math.abs(Number(a[1]) - Number(b[1]));
}

/**
 * Gives every piece of `next` the id of the piece it most likely came from in `prev`:
 *  1. same square, same piece → unchanged;
 *  2. the last move's destination inherits from its origin (covers promotion, where the type changes);
 *  3. remaining pieces pair up with the nearest unmatched piece of the same colour and type
 *     (the rook in castling, or several pieces when jumping through a game);
 *  4. anything left gets a fresh id and simply appears; unmatched old pieces were captured.
 */
export function trackPieces(
  prev: readonly TrackedPiece[],
  next: readonly BoardPiece[],
  lastMove: { from: Square; to: Square } | null,
  newId: () => number,
): TrackedPiece[] {
  const freeOld = new Map<Square, TrackedPiece>(prev.map((p) => [p.square, p]));
  const assigned = new Map<Square, number>();

  for (const p of next) {
    const old = freeOld.get(p.square);
    if (old && old.color === p.color && old.type === p.type) {
      assigned.set(p.square, old.id);
      freeOld.delete(p.square);
    }
  }

  if (lastMove && !assigned.has(lastMove.to)) {
    const moved = next.find((p) => p.square === lastMove.to);
    const origin = freeOld.get(lastMove.from);
    if (moved && origin && origin.color === moved.color) {
      assigned.set(moved.square, origin.id);
      freeOld.delete(lastMove.from);
    }
  }

  for (const p of next) {
    if (assigned.has(p.square)) continue;
    let best: TrackedPiece | null = null;
    for (const old of freeOld.values()) {
      if (old.color !== p.color || old.type !== p.type) continue;
      if (!best || distance(old.square, p.square) < distance(best.square, p.square)) best = old;
    }
    if (best) {
      assigned.set(p.square, best.id);
      freeOld.delete(best.square);
    }
  }

  return next.map((p) => ({ ...p, id: assigned.get(p.square) ?? newId() }));
}
