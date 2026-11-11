import { describe, expect, it } from 'vitest';
import type { Square } from 'chess.js';
import { trackPieces, type TrackedPiece } from '../src/core/piece-tracking';
import { BoardService, START_FEN } from '../src/services/board.service';

const board = new BoardService();

function counter() {
  let n = 0;
  return () => ++n;
}

function idAt(pieces: readonly TrackedPiece[], sq: string): number | undefined {
  return pieces.find((p) => p.square === sq)?.id;
}

function step(prev: TrackedPiece[], fen: string, uci: string, newId: () => number) {
  const after = board.applyUci(fen, uci)!;
  const next = trackPieces(prev, board.pieces(after.fen), { from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square }, newId);
  return { next, fen: after.fen };
}

describe('trackPieces', () => {
  it('keeps ids of pieces that did not move and moves the id with the piece', () => {
    const newId = counter();
    const start = trackPieces([], board.pieces(START_FEN), null, newId);
    expect(new Set(start.map((p) => p.id)).size).toBe(32);
    const { next } = step(start, START_FEN, 'g1f3', newId);
    expect(idAt(next, 'f3')).toBe(idAt(start, 'g1'));
    expect(idAt(next, 'e2')).toBe(idAt(start, 'e2'));
    expect(next).toHaveLength(32);
  });

  it('slides the rook too when castling', () => {
    const newId = counter();
    const fen = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
    const start = trackPieces([], board.pieces(fen), null, newId);
    const { next } = step(start, fen, 'e1g1', newId);
    expect(idAt(next, 'g1')).toBe(idAt(start, 'e1'));
    expect(idAt(next, 'f1')).toBe(idAt(start, 'h1'));
  });

  it('keeps the pawn id through promotion', () => {
    const newId = counter();
    const fen = '8/P6k/8/8/8/8/8/K7 w - - 0 1';
    const start = trackPieces([], board.pieces(fen), null, newId);
    const { next } = step(start, fen, 'a7a8q', newId);
    expect(next.find((p) => p.square === 'a8')).toMatchObject({ type: 'q', id: idAt(start, 'a7') });
  });

  it('drops the captured piece and keeps the capturer', () => {
    const newId = counter();
    const fen = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2';
    const start = trackPieces([], board.pieces(fen), null, newId);
    const { next } = step(start, fen, 'e4d5', newId);
    expect(next).toHaveLength(31);
    expect(idAt(next, 'd5')).toBe(idAt(start, 'e4'));
    expect(next.some((p) => p.id === idAt(start, 'd5'))).toBe(false);
  });

  it('matches pieces by proximity on a multi-move jump (no new ids)', () => {
    const newId = counter();
    const start = trackPieces([], board.pieces(START_FEN), null, newId);
    const game = board.parsePgn('1. e4 e5 2. Nf3 Nc6 *').moves;
    const jumped = trackPieces(start, board.pieces(game.at(-1)!.fenAfter), null, newId);
    expect(idAt(jumped, 'f3')).toBe(idAt(start, 'g1'));
    expect(idAt(jumped, 'c6')).toBe(idAt(start, 'b8'));
    expect(Math.max(...jumped.map((p) => p.id))).toBe(32);
  });

  it('is idempotent for an unchanged position', () => {
    const newId = counter();
    const start = trackPieces([], board.pieces(START_FEN), null, newId);
    expect(trackPieces(start, board.pieces(START_FEN), { from: 'e2', to: 'e4' }, newId)).toEqual(start);
  });
});
