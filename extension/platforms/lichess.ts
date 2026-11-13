import type { Square, PieceSymbol } from 'chess.js';
import type { Color } from '../../src/core/types';
import { buildFen, type LastMove } from './fen-builder';
import type { BoardSnapshot, PlacedPiece, Platform } from './types';

/**
 * lichess (chessground): <cg-board> contains <piece class="white knight"> positioned
 * with `transform: translate(x, y)`. On the analysis page the exact FEN is also shown
 * in `.copyables input.copyable`, which is preferred because it carries side to move.
 * The square key chessground stores on elements (`cgKey`) is a page-world JS property
 * and isn't visible from a content script, hence the coordinate maths.
 */

const ALLOWED_PATH = /^\/analysis(\/|$)/;

const TYPES: Record<string, PieceSymbol> = { pawn: 'p', knight: 'n', bishop: 'b', rook: 'r', queen: 'q', king: 'k' };
const TRANSLATE_RE = /translate\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)px\s*\)/;

export const lichess: Platform = {
  id: 'lichess',

  matchesHost: (hostname) => hostname === 'lichess.org',

  isAllowedPage(location, doc) {
    return ALLOWED_PATH.test(location.pathname) && doc.querySelector('cg-board') !== null;
  },

  describeBoard(doc) {
    return doc.querySelector('cg-board') ? 'cg-board' : null;
  },

  read(doc): BoardSnapshot | null {
    const board = doc.querySelector<HTMLElement>('cg-board');
    const wrap = doc.querySelector<HTMLElement>('.cg-wrap');
    if (!board) return null;
    const orientation: Color = wrap?.classList.contains('orientation-black') ? 'b' : 'w';

    const fenInput = doc.querySelector<HTMLInputElement>('.copyables input.copyable');
    const fenFromInput = fenInput?.value.trim();
    const fen = fenFromInput && fenFromInput.split(' ').length >= 4 ? fenFromInput : fenFromPieces(board, orientation);
    if (!fen) return null;
    return { fen, orientation, myColor: null, boardEl: board };
  },
};

function squareAt(el: Element, size: number, orientation: Color): Square | null {
  const m = TRANSLATE_RE.exec(el.getAttribute('style') ?? '');
  if (!m || size <= 0) return null;
  const col = Math.round(Number(m[1]) / size);
  const row = Math.round(Number(m[2]) / size);
  if (col < 0 || col > 7 || row < 0 || row > 7) return null;
  const file = orientation === 'w' ? col : 7 - col;
  const rank = orientation === 'w' ? 8 - row : row + 1;
  return `${'abcdefgh'[file]}${rank}` as Square;
}

function fenFromPieces(board: HTMLElement, orientation: Color): string | null {
  const size = board.getBoundingClientRect().width / 8;
  const placement = new Map<Square, PlacedPiece>();
  for (const el of board.querySelectorAll('piece')) {
    // ghost = drag shadow, fading = captured piece animating out.
    if (el.classList.contains('ghost') || el.classList.contains('fading')) continue;
    const color: Color | null = el.classList.contains('white') ? 'w' : el.classList.contains('black') ? 'b' : null;
    const type = [...el.classList].map((c) => TYPES[c]).find((t) => t !== undefined);
    const square = squareAt(el, size, orientation);
    if (color && type && square) placement.set(square, { color, type });
  }
  if (placement.size === 0) return null;

  const last = [...board.querySelectorAll('square.last-move')]
    .map((el) => squareAt(el, size, orientation))
    .filter((s): s is Square => s !== null);
  let move: LastMove | null = null;
  if (last.length === 2) {
    const [a, b] = last as [Square, Square];
    if (placement.has(a) !== placement.has(b)) move = placement.has(a) ? { from: b, to: a } : { from: a, to: b };
  }
  return buildFen(placement, move);
}
