// cburnett piece set by Colin M.L. Burnett (GPLv2+), as used on lichess.org.
import wK from '../assets/pieces/cburnett/wK.svg';
import wQ from '../assets/pieces/cburnett/wQ.svg';
import wR from '../assets/pieces/cburnett/wR.svg';
import wB from '../assets/pieces/cburnett/wB.svg';
import wN from '../assets/pieces/cburnett/wN.svg';
import wP from '../assets/pieces/cburnett/wP.svg';
import bK from '../assets/pieces/cburnett/bK.svg';
import bQ from '../assets/pieces/cburnett/bQ.svg';
import bR from '../assets/pieces/cburnett/bR.svg';
import bB from '../assets/pieces/cburnett/bB.svg';
import bN from '../assets/pieces/cburnett/bN.svg';
import bP from '../assets/pieces/cburnett/bP.svg';
import type { PieceSymbol } from 'chess.js';
import type { Color } from '../core/types';

const SET: Record<Color, Record<PieceSymbol, string>> = {
  w: { k: wK, q: wQ, r: wR, b: wB, n: wN, p: wP },
  b: { k: bK, q: bQ, r: bR, b: bB, n: bN, p: bP },
};

export function pieceImage(color: Color, type: PieceSymbol): string {
  return SET[color][type];
}
