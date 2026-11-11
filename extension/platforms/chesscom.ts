import type { Square, PieceSymbol } from 'chess.js';
import type { Color } from '../../src/core/types';
import { buildFen, type LastMove } from './fen-builder';
import type { BoardSnapshot, PlacedPiece, Platform } from './types';

/**
 * chess.com renders <wc-chess-board> with one <div class="piece wp square-52"> per
 * piece (square-<file 1..8><rank 1..8>) and <div class="highlight square-xy"> for the
 * last move. Board ids tell the page type apart, which the fair-play gate relies on.
 */

// Pages where hints are allowed, paired with the board id that page must render.
// A live game against a person uses neither path nor these ids.
const ALLOWED: readonly { path: RegExp; boardId: string }[] = [
  { path: /^\/play\/computer(\/|$)/, boardId: 'board-play-computer' },
  { path: /^\/analysis(\/|$)/, boardId: 'board-analysis-board' },
];

const PIECE_RE = /^([wb])([pnbrqk])$/;
const SQUARE_RE = /^square-([1-8])([1-8])$/;

function toSquare(token: string): Square | null {
  const m = SQUARE_RE.exec(token);
  return m ? (`${'abcdefgh'[Number(m[1]) - 1]}${m[2]}` as Square) : null;
}

function findBoard(doc: Document): HTMLElement | null {
  return doc.querySelector<HTMLElement>('wc-chess-board');
}

export const chesscom: Platform = {
  id: 'chesscom',

  matchesHost: (hostname) => hostname === 'www.chess.com' || hostname === 'chess.com',

  isAllowedPage(location, doc) {
    const board = findBoard(doc);
    if (!board) return false;
    return ALLOWED.some((a) => a.path.test(location.pathname) && board.id === a.boardId);
  },

  read(doc): BoardSnapshot | null {
    const board = findBoard(doc);
    if (!board) return null;

    const placement = new Map<Square, PlacedPiece>();
    for (const el of board.querySelectorAll('.piece')) {
      let square: Square | null = null;
      let piece: PlacedPiece | null = null;
      for (const token of el.classList) {
        const p = PIECE_RE.exec(token);
        if (p) piece = { color: p[1] as Color, type: p[2] as PieceSymbol };
        square ??= toSquare(token);
      }
      if (square && piece) placement.set(square, piece);
    }
    if (placement.size === 0) return null;

    const orientation: Color = board.classList.contains('flipped') ? 'b' : 'w';
    const fen = buildFen(placement, lastMove(board, placement), turnFromMoveList(doc));
    return {
      fen,
      orientation,
      myColor: board.id === 'board-play-computer' ? orientation : null,
      boardEl: board,
    };
  },
};

/** The two highlighted squares: the occupied one is where the last move landed. */
function lastMove(board: HTMLElement, placement: ReadonlyMap<Square, PlacedPiece>): LastMove | null {
  const squares = [...board.querySelectorAll('.highlight')]
    .map((el) => [...el.classList].map(toSquare).find((s): s is Square => s !== null))
    .filter((s): s is Square => s !== undefined);
  if (squares.length !== 2) return null;
  const [a, b] = squares as [Square, Square];
  const aOcc = placement.has(a);
  const bOcc = placement.has(b);
  if (aOcc === bOcc) return null;
  return aOcc ? { from: b, to: a } : { from: a, to: b };
}

/** Fallback when highlights are missing: parity of plies in the move list. */
function turnFromMoveList(doc: Document): Color {
  const plies = doc.querySelectorAll('wc-simple-move-list .main-line-ply').length;
  return plies % 2 === 0 ? 'w' : 'b';
}
