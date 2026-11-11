import type { Square } from 'chess.js';
import type { Color } from '../../src/core/types';
import type { Placement } from './types';

export interface LastMove {
  readonly from: Square;
  readonly to: Square;
}

const FILES = 'abcdefgh';

/**
 * Builds a FEN from what the DOM shows. The DOM has no side-to-move, castling or
 * en-passant fields, so they are inferred:
 *  - side to move: opposite of the colour of the piece that just landed on `lastMove.to`;
 *    White when there is no last move (start position);
 *  - castling: king and rook still on their home squares (can be wrong if they moved
 *    and came back — harmless for analysis);
 *  - en passant: the last move was a pawn double step and an enemy pawn can capture.
 * Move counters are not visible and are set to "0 1"; the engine doesn't need them.
 */
export function buildFen(placement: Placement, lastMove: LastMove | null, fallbackTurn: Color = 'w'): string {
  const rows: string[] = [];
  for (let rank = 8; rank >= 1; rank--) {
    let row = '';
    let empty = 0;
    for (const file of FILES) {
      const piece = placement.get(`${file}${rank}` as Square);
      if (!piece) {
        empty++;
        continue;
      }
      if (empty) row += String(empty);
      empty = 0;
      row += piece.color === 'w' ? piece.type.toUpperCase() : piece.type;
    }
    rows.push(empty ? row + String(empty) : row);
  }

  const mover = lastMove ? placement.get(lastMove.to)?.color : undefined;
  const turn: Color = mover ? (mover === 'w' ? 'b' : 'w') : fallbackTurn;

  return `${rows.join('/')} ${turn} ${castling(placement)} ${enPassant(placement, lastMove, turn)} 0 1`;
}

function has(placement: Placement, sq: Square, color: Color, type: string): boolean {
  const p = placement.get(sq);
  return !!p && p.color === color && p.type === type;
}

function castling(placement: Placement): string {
  let s = '';
  if (has(placement, 'e1', 'w', 'k')) {
    if (has(placement, 'h1', 'w', 'r')) s += 'K';
    if (has(placement, 'a1', 'w', 'r')) s += 'Q';
  }
  if (has(placement, 'e8', 'b', 'k')) {
    if (has(placement, 'h8', 'b', 'r')) s += 'k';
    if (has(placement, 'a8', 'b', 'r')) s += 'q';
  }
  return s || '-';
}

function enPassant(placement: Placement, lastMove: LastMove | null, turn: Color): string {
  if (!lastMove) return '-';
  const piece = placement.get(lastMove.to);
  if (!piece || piece.type !== 'p' || lastMove.from[0] !== lastMove.to[0]) return '-';
  const fromRank = Number(lastMove.from[1]);
  const toRank = Number(lastMove.to[1]);
  if (Math.abs(fromRank - toRank) !== 2) return '-';

  const file = FILES.indexOf(lastMove.to[0] as string);
  const capturable = [file - 1, file + 1].some(
    (f) => f >= 0 && f < 8 && has(placement, `${FILES[f]}${toRank}` as Square, turn, 'p'),
  );
  return capturable ? `${lastMove.to[0]}${(fromRank + toRank) / 2}` : '-';
}
