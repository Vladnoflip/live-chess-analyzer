import { describe, expect, it } from 'vitest';
import { BoardService, START_FEN } from '../src/services/board.service';

const board = new BoardService();

describe('BoardService.validate', () => {
  it('accepts the start position', () => {
    expect(board.validate(START_FEN)).toEqual({ ok: true, fen: START_FEN });
  });

  it('normalises surrounding and repeated whitespace', () => {
    const messy = `  ${START_FEN.replace(/ /g, '   ')}\n`;
    expect(board.validate(messy)).toEqual({ ok: true, fen: START_FEN });
  });

  it.each([
    ['empty string', ''],
    ['garbage', 'hello world'],
    ['missing fields', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR'],
    ['rank with 9 squares', 'rnbqkbnr/ppppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'],
    ['bad side to move', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR x KQkq - 0 1'],
    ['bad piece letter', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNX w KQkq - 0 1'],
    ['bad en-passant square', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq e5 0 1'],
  ])('rejects %s', (_name, fen) => {
    expect(board.validate(fen).ok).toBe(false);
  });

  it('rejects a position without a black king', () => {
    const r = board.validate('8/8/8/8/8/8/8/4K3 w - - 0 1');
    expect(r.ok).toBe(false);
  });

  it('rejects two white kings', () => {
    const r = board.validate('4k3/8/8/8/8/8/8/K3K3 w - - 0 1');
    expect(r.ok).toBe(false);
  });

  it('rejects pawns on the back rank', () => {
    const r = board.validate('P3k3/8/8/8/8/8/8/4K3 w - - 0 1');
    expect(r.ok).toBe(false);
  });

  it('rejects positions where the side not to move is in check', () => {
    // White to move, but the black king on e8 is attacked by the rook on e1.
    const r = board.validate('4k3/8/8/8/8/8/8/K3R3 w - - 0 1');
    expect(r).toMatchObject({ ok: false, error: { key: 'fen.sideNotToMoveInCheck' } });
  });

  it('accepts the side to move being in check', () => {
    expect(board.validate('4k3/8/8/8/8/8/8/K3R3 b - - 0 1').ok).toBe(true);
  });
});

describe('BoardService position queries', () => {
  it('reads side to move', () => {
    expect(board.turn(START_FEN)).toBe('w');
    expect(board.turn('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1')).toBe('b');
  });

  it('lists 32 pieces in the start position', () => {
    const pieces = board.pieces(START_FEN);
    expect(pieces).toHaveLength(32);
    expect(pieces).toContainEqual({ square: 'e1', type: 'k', color: 'w' });
    expect(pieces).toContainEqual({ square: 'd8', type: 'q', color: 'b' });
  });

  it('generates 20 legal moves from the start position', () => {
    expect(board.legalMoves(START_FEN)).toHaveLength(20);
  });

  it('generates legal moves for a single square', () => {
    const moves = board.legalMoves(START_FEN, 'g1').map((m) => m.uci).sort();
    expect(moves).toEqual(['g1f3', 'g1h3']);
  });

  it('does not allow moving a pinned piece', () => {
    // Knight on e2 pinned by the rook on e8 against the king on e1.
    expect(board.legalMoves('4r1k1/8/8/8/8/8/4N3/4K3 w - - 0 1', 'e2')).toEqual([]);
  });

  it('includes all four promotions', () => {
    const promos = board.legalMoves('8/P6k/8/8/8/8/8/K7 w - - 0 1', 'a7').map((m) => m.promotion);
    expect(promos.sort()).toEqual(['b', 'n', 'q', 'r']);
  });

  it('detects checkmate, stalemate and insufficient material', () => {
    expect(board.status('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3')).toBe('checkmate');
    expect(board.status('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')).toBe('stalemate');
    expect(board.status('8/8/4k3/8/8/4K3/8/8 w - - 0 1')).toBe('draw');
    expect(board.status(START_FEN)).toBe('ongoing');
  });
});

describe('BoardService move conversion', () => {
  it('applies a UCI move', () => {
    const r = board.applyUci(START_FEN, 'e2e4');
    expect(r?.san).toBe('e4');
    // chess.js only records an en-passant square when the capture is actually possible.
    expect(r?.fen).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
  });

  it('returns null for illegal or malformed UCI', () => {
    expect(board.applyUci(START_FEN, 'e2e5')).toBeNull();
    expect(board.applyUci(START_FEN, 'zz')).toBeNull();
  });

  it('converts promotions and castling', () => {
    expect(board.uciToSan('8/P6k/8/8/8/8/8/K7 w - - 0 1', 'a7a8n')).toBe('a8=N');
    expect(board.uciToSan('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'e1g1')).toBe('O-O');
  });

  it('converts a PV to SAN and stops at the first illegal move', () => {
    expect(board.uciLineToSan(START_FEN, ['e2e4', 'e7e5', 'g1f3', 'b8c6'])).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
    expect(board.uciLineToSan(START_FEN, ['e2e4', 'e2e4', 'g1f3'])).toEqual(['e4']);
    expect(board.uciLineToSan(START_FEN, ['e2e4', 'e7e5', 'g1f3'], 2)).toEqual(['e4', 'e5']);
  });
});

describe('BoardService.parsePgn', () => {
  it('parses headers and moves', () => {
    const pgn = `[Event "Test"]
[White "Alice"]
[Black "Bob"]
[Result "0-1"]

1. f3 e5 2. g4 Qh4# 0-1`;
    const game = board.parsePgn(pgn);
    expect(game.headers.White).toBe('Alice');
    expect(game.startFen).toBe(START_FEN);
    expect(game.moves.map((m) => m.san)).toEqual(['f3', 'e5', 'g4', 'Qh4#']);
    expect(game.moves[3]).toMatchObject({ ply: 4, uci: 'd8h4', color: 'b' });
    expect(game.moves[1]?.fenBefore).toBe(game.moves[0]?.fenAfter);
    expect(board.status(game.moves[3]!.fenAfter)).toBe('checkmate');
  });

  it('supports a custom start position via [FEN]', () => {
    const fen = '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1';
    const game = board.parsePgn(`[SetUp "1"]\n[FEN "${fen}"]\n\n1. e4 Kd7 *`);
    expect(game.startFen).toBe(fen);
    expect(game.moves).toHaveLength(2);
  });

  it('throws a readable error on illegal moves', () => {
    expect(() => board.parsePgn('1. e4 e5 2. Ke3 *')).toThrow(/PGN/);
  });
});
