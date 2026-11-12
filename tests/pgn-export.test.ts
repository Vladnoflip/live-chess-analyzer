import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { BoardService } from '../src/services/board.service';
import { evalTag, exportAnnotatedPgn, pgnFileName, type AnnotatedGame } from '../src/core/pgn-export';
import type { PositionEval } from '../src/core/analysis.manager';
import { I18n } from '../src/core/i18n';
import { MATED_CP, type Score } from '../src/core/types';

const board = new BoardService();

function ev(score: Score, pv: string[]): PositionEval {
  return { score, bestMove: pv[0] ?? null, pv, depth: 12, multiPv: 1, lines: [{ depth: 12, multiPv: 1, score, pv }] };
}

/** 1. e4 e5 2. Nf3 Qh4?? 3. Nxh4 with hand-made evaluations. */
function blunderGame(): AnnotatedGame {
  const parsed = board.parsePgn('[White "Alice"]\n[Black "Bob"]\n[Date "2026.11.12"]\n\n1. e4 e5 2. Nf3 Qh4 3. Nxh4 *');
  const [m1, m2, m3, m4, m5] = parsed.moves;
  const evals: Record<string, PositionEval> = {
    [parsed.startFen]: ev({ kind: 'cp', value: 30 }, ['e2e4', 'e7e5']),
    [m1!.fenAfter]: ev({ kind: 'cp', value: 30 }, ['e7e5']),
    [m2!.fenAfter]: ev({ kind: 'cp', value: 35 }, ['g1f3']),
    [m3!.fenAfter]: ev({ kind: 'cp', value: 30 }, ['b8c6']),
    [m4!.fenAfter]: ev({ kind: 'cp', value: 850 }, ['f3h4']),
    [m5!.fenAfter]: ev({ kind: 'cp', value: 860 }, ['g8f6']),
  };
  return {
    startFen: parsed.startFen,
    moves: parsed.moves,
    headers: parsed.headers,
    classes: { 1: 'best', 2: 'best', 3: 'best', 4: 'blunder', 5: 'best' },
    evals,
  };
}

describe('annotated PGN export', () => {
  const en = new I18n('en');
  const ru = new I18n('ru');

  it('comments the blunder with a symbol, the reason and the best move', () => {
    const pgn = exportAnnotatedPgn(blunderGame(), board, en.text);
    expect(pgn).toContain('[White "Alice"]');
    expect(pgn).toContain('[Annotator "LiveChess Analyzer (Stockfish 18)"]');
    expect(pgn).toMatch(/Qh4 \{\?\? Blunder: Loses a piece \(~9\.0 pawns\)\. Best was Nc6 \[%eval 8\.50\]\}/);
    expect(pgn).toMatch(/Nxh4 \{\[%eval 8\.60\]\}/);
  });

  it('writes comments in the UI language', () => {
    const pgn = exportAnnotatedPgn(blunderGame(), board, ru.text);
    expect(pgn).toMatch(/\{\?\? Зевок: Теряет фигуру/);
    expect(pgn).toContain('Лучше было Nc6');
  });

  it('produces PGN that chess.js reads back with the same moves and comments', () => {
    const game = blunderGame();
    const pgn = exportAnnotatedPgn(game, board, en.text);
    const chess = new Chess();
    chess.loadPgn(pgn);
    expect(chess.history()).toEqual(game.moves.map((m) => m.san));
    expect(chess.getComments().length).toBe(game.moves.length);
  });

  it('marks brilliant moves with !!', () => {
    const game = { ...blunderGame(), classes: { 5: 'brilliant' as const } };
    expect(exportAnnotatedPgn(game, board, en.text)).toMatch(/Nxh4 \{!! Brilliant move \[%eval 8\.60\]\}/);
  });

  it('keeps a custom start position', () => {
    const fen = '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1';
    const game: AnnotatedGame = {
      startFen: fen,
      moves: [{ ply: 1, san: 'Rd8#', uci: 'd1d8', color: 'w', fenBefore: fen, fenAfter: board.applyUci(fen, 'd1d8')!.fen }],
      headers: {},
      classes: { 1: 'best' },
      evals: {},
    };
    const pgn = exportAnnotatedPgn(game, board, en.text);
    expect(pgn).toContain(`[FEN "${fen}"]`);
    expect(pgn).toContain('[SetUp "1"]');
    expect(pgn).toContain('Rd8#');
  });

  it('formats evaluations like lichess', () => {
    expect(evalTag({ kind: 'cp', value: 35 })).toBe('[%eval 0.35]');
    expect(evalTag({ kind: 'cp', value: -120 })).toBe('[%eval -1.20]');
    expect(evalTag({ kind: 'mate', value: 3 })).toBe('[%eval #3]');
    expect(evalTag({ kind: 'mate', value: -2 })).toBe('[%eval #-2]');
    expect(evalTag({ kind: 'cp', value: MATED_CP })).toBeNull();
  });

  it('builds a safe file name', () => {
    expect(pgnFileName({ White: 'Alice', Black: 'Bob', Date: '2026.11.12' })).toBe('Alice-Bob-2026.11.12.pgn');
    expect(pgnFileName({ White: 'A/B', Black: 'C:D' })).toBe('A_B-C_D.pgn');
    expect(pgnFileName({ White: '?', Black: '?' })).toBe('livechess-analysis.pgn');
    expect(pgnFileName({})).toBe('livechess-analysis.pgn');
  });
});
