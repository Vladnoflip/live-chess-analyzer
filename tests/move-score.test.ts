import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { moveScore, scoreFromDelta, scoreToColor, winDelta, BRILLIANT_COLOR } from '../src/core/move-score';
import { whiteWinChance } from '../src/core/classification';
import { buildCandidates, isBrilliant } from '../src/core/candidates';
import { explainMove } from '../src/core/move-explainer';
import { parseUciLine, toWhitePov } from '../src/services/uci.parser';
import { boardService } from '../src/services/board.service';
import type { Score, SearchInfo } from '../src/core/types';
import { translateMsg, type Msg } from '../src/core/i18n';

const cp = (value: number): Score => ({ kind: 'cp', value });
const mate = (value: number): Score => ({ kind: 'mate', value });

describe('win probability (Lichess formula)', () => {
  it('matches hand-computed values', () => {
    expect(whiteWinChance(cp(0))).toBeCloseTo(50, 5);
    // 50 + 50 * (2 / (1 + e^(-0.368208)) - 1) = 59.10
    expect(whiteWinChance(cp(100))).toBeCloseTo(59.1, 1);
    expect(whiteWinChance(cp(-300))).toBeCloseTo(24.9, 1);
    expect(whiteWinChance(mate(4))).toBe(100);
    expect(whiteWinChance(mate(-4))).toBe(0);
  });
});

describe('scoreFromDelta', () => {
  it.each([
    [0, 100],
    [2, 90],
    [5, 75],
    [10, 55],
    [15, 40],
    [20, 25],
    [30, 10],
    [40, 0],
    [55, 0],
  ])('delta %d pp -> %d', (delta, score) => {
    expect(scoreFromDelta(delta)).toBe(score);
  });

  it('interpolates linearly between anchors', () => {
    expect(scoreFromDelta(1)).toBe(95);
    expect(scoreFromDelta(3.5)).toBe(83); // 82.5
    expect(scoreFromDelta(7.5)).toBe(65);
    expect(scoreFromDelta(12.5)).toBe(48); // 47.5
    expect(scoreFromDelta(25)).toBe(18); // 17.5
    expect(scoreFromDelta(35)).toBe(5);
  });

  it('treats negative/NaN deltas as no loss', () => {
    expect(scoreFromDelta(-3)).toBe(100);
    expect(scoreFromDelta(Number.NaN)).toBe(100);
  });

  it('is monotonically non-increasing', () => {
    let prev = 101;
    for (let d = 0; d <= 50; d += 0.5) {
      const s = scoreFromDelta(d);
      expect(s).toBeLessThanOrEqual(prev);
      prev = s;
    }
  });
});

describe('moveScore on pre-computed engine evaluations', () => {
  // Evaluations from Stockfish 18 lite with MultiPV 3: tests/fixtures/stockfish18-multipv3.log
  // (after 1.e4 e5 2.Nf3 Nc6 3.Bc4, depth 12) and the Legal-mate position (depth 16).
  it.each([
    ['Nf6 vs Bc5 (Italian, Black), delta 1.56pp', 'b', cp(16), cp(33), 92],
    ['Nf6 vs d6 (Italian, Black), delta 2.39pp', 'b', cp(16), cp(42), 88],
    ['Nxe5 vs d4 (Legal), delta 5.36pp', 'w', cp(166), cp(104), 74],
    ['Nxe5 vs h3 (Legal), delta 8.50pp', 'w', cp(166), cp(69), 61],
    ['dropping a piece, delta 30.62pp', 'w', cp(100), cp(-250), 9],
    ['missing a mate, still winning, delta 13.69pp', 'w', mate(3), cp(500), 44],
  ] as const)('%s', (_name, mover, best, cand, expected) => {
    expect(moveScore(mover, best, cand)).toBe(expected);
  });

  it('gives 100 when the candidate is as good as the best', () => {
    expect(moveScore('w', cp(40), cp(40))).toBe(100);
    expect(winDelta('b', cp(-40), cp(-40))).toBe(0);
  });
});

describe('scoreToColor', () => {
  it.each([
    [0, '#e74c3c'],
    [25, '#e67e22'],
    [50, '#f1c40f'],
    [75, '#2ecc71'],
    [100, '#00bfff'],
  ])('score %d -> %s', (score, hex) => {
    expect(scoreToColor(score)).toBe(hex);
  });

  it('interpolates in RGB between stops', () => {
    // Halfway between #f1c40f (241,196,15) and #2ecc71 (46,204,113) = (144,200,64).
    expect(scoreToColor(62.5)).toBe('#90c840');
  });

  it('clamps out-of-range scores', () => {
    expect(scoreToColor(-20)).toBe('#e74c3c');
    expect(scoreToColor(140)).toBe('#00bfff');
  });

  it('always uses the brilliant colour for brilliant moves', () => {
    expect(scoreToColor(30, true)).toBe(BRILLIANT_COLOR);
  });
});

describe('MultiPV parsing of real Stockfish output', () => {
  const FEN = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3';
  const lines = new Map<number, SearchInfo>();
  const log = readFileSync(new URL('./fixtures/stockfish18-multipv3.log', import.meta.url), 'utf8');
  for (const raw of log.split(/\r?\n/)) {
    const msg = parseUciLine(raw);
    if (msg.type === 'info' && !msg.info.bound) lines.set(msg.info.multiPv, { ...msg.info, score: toWhitePov(msg.info.score, 'b') });
  }
  const sorted = [...lines.values()].sort((a, b) => a.multiPv - b.multiPv);

  it('reads three lines at the final depth with nodes/nps/time', () => {
    expect(sorted.map((l) => [l.multiPv, l.depth, l.pv[0], l.score])).toEqual([
      [1, 12, 'g8f6', cp(16)],
      [2, 12, 'f8c5', cp(33)],
      [3, 12, 'd7d6', cp(42)],
    ]);
    expect(sorted[0]).toMatchObject({ nodes: 167563, nps: 604920, timeMs: 277 });
  });

  it('builds ranked candidates with scores and colours', () => {
    const cands = buildCandidates(FEN, sorted, boardService);
    expect(cands.map((c) => [c.rank, c.sanMove, c.evalCp, c.moveScore])).toEqual([
      [1, 'Nf6', 16, 100],
      [2, 'Bc5', 33, 92],
      [3, 'd6', 42, 88],
    ]);
    // Arrow/row colours use the step scale: a non-brilliant best move is dark green.
    expect(cands.map((c) => c.color)).toEqual(['#00a650', '#00a650', '#2fe06f']);
    expect(cands.every((c) => !c.brilliant)).toBe(true);
  });
});

describe('brilliant flag', () => {
  // 1.e4 e5 2.Nf3 d6 3.Bc4 Bg4 4.Nc3 g6: 5.Nxe5! leaves the queen en prise (Legal's mate).
  const LEGAL = 'rn1qkbnr/ppp2p1p/3p2p1/4p3/2B1P1b1/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 0 5';
  // 1.e4 e5 2.Nf3 Nc6 3.Bc4 Nd4: 4.Nxe5? only grabs a pawn and walks into 4...Qg5.
  const BLACKBURNE = 'r1bqkbnr/pppp1ppp/8/4p3/2BnP3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';

  it('flags the best move that sacrifices material and keeps the advantage', () => {
    const t = boardService.tactics(LEGAL, 'f3e5');
    expect(t).toMatchObject({ moveSee: -220, opponentBestCapture: 570 });
    expect(isBrilliant(1, 'w', cp(166), t)).toBe(true);
  });

  it('does not flag it when it is not the best move or the eval collapses', () => {
    const t = boardService.tactics(LEGAL, 'f3e5');
    expect(isBrilliant(2, 'w', cp(166), t)).toBe(false);
    expect(isBrilliant(1, 'w', cp(20), t)).toBe(false);
  });

  it('does not flag Nxe5 in the Blackburne-Shilling trap (no sacrifice by SEE)', () => {
    const t = boardService.tactics(BLACKBURNE, 'f3e5');
    expect(t?.sacrificed).toBe(0);
    expect(isBrilliant(1, 'w', cp(100), t)).toBe(false);
  });

  it('accepts a kept forced mate as "advantage"', () => {
    expect(isBrilliant(1, 'b', mate(-3), { moveSee: -900, opponentBestCapture: 0, sacrificed: 900 })).toBe(true);
  });
});

describe('explainMove', () => {
  const line = (rank: number, uci: string, score: Score): SearchInfo => ({ depth: 16, multiPv: rank, score, pv: [uci] });
  // Explanations are messages; assert on the Russian rendering (and English where noted).
  const ru = (m: Msg) => translateMsg('ru', m);
  const texts = (xs: readonly Msg[]) => xs.map(ru).join(' | ');

  it('marks a best move with a large gap as the only move', () => {
    const fen = '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1';
    const cands = buildCandidates(fen, [line(1, 'd1d8', mate(1)), line(2, 'g2g3', cp(0))], boardService);
    const ex = explainMove({ fen, uci: 'd1d8', candidates: cands }, boardService);
    expect(ex[0]).toMatchObject({ key: 'ex.onlyMove', tone: 'good' });
    expect(ru(ex[0]!)).toContain('Единственный ход');
    expect(translateMsg('en', ex[0]!)).toBe('Only move: the next variation (g3) loses 50 pp of winning chances');
  });

  it('reports a missed mate', () => {
    const fen = '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1';
    const cands = buildCandidates(fen, [line(1, 'd1d8', mate(1)), line(2, 'g2g3', cp(0))], boardService);
    const ex = explainMove({ fen, uci: 'g2g3', candidates: cands }, boardService);
    expect(texts(ex)).toContain('Упускает мат в 1');
    expect(ex.find((e) => ru(e).startsWith('Зевок'))?.tone).toBe('bad');
  });

  it('explains the Legal sacrifice as brilliant', () => {
    const fen = 'rn1qkbnr/ppp2p1p/3p2p1/4p3/2B1P1b1/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 0 5';
    const cands = buildCandidates(fen, [line(1, 'f3e5', cp(166)), line(2, 'd2d4', cp(104)), line(3, 'h2h3', cp(69))], boardService);
    expect(cands[0]!.brilliant).toBe(true);
    expect(cands[0]!.color).toBe('#00bfff');
    const ex = explainMove({ fen, uci: 'f3e5', candidates: cands }, boardService);
    expect(texts(ex)).toContain('Блестящий ход');
    expect(texts(ex)).not.toContain('Теряет');
  });

  it('flags losing a piece', () => {
    // 1.e4 e5 2.Nf3 Nc6 3.Bc4 Nf6: 4.Bxf7+? Kxf7 gives a bishop for a pawn.
    const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
    const cands = buildCandidates(fen, [line(1, 'f3g5', cp(40)), line(2, 'd2d3', cp(20))], boardService);
    const ex = explainMove({ fen, uci: 'c4f7', candidates: cands, afterScore: cp(-150) }, boardService);
    expect(texts(ex)).toContain('Теряет фигуру');
  });

  it('flags a king weakening and a retreat from an active square', () => {
    // The knight on f3 shields both the f-file (Qf6 -> f2) and the long diagonal (Bb7 -> g2).
    const fen = 'r5k1/pbp3pp/1p1p1q2/8/3P4/2PB1N2/PP3PPP/3Q1RK1 w - - 0 1';
    const cands = buildCandidates(fen, [line(1, 'd3c4', cp(483)), line(2, 'd4d5', cp(480)), line(3, 'f3e1', cp(250))], boardService);
    const ex = explainMove({ fen, uci: 'f3e1', candidates: cands }, boardService);
    expect(texts(ex)).toContain('Ослабляет короля: атак на зону короля 0 → 2');
    expect(texts(ex)).toContain('Уводит фигуру с активной позиции (ходов 5 → 2)');
  });

  it('includes opening context', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1';
    const ex = explainMove(
      { fen, uci: 'g8f6', candidates: [], opening: { name: 'Indian Defense', eco: 'A45', inBook: true, moveNumber: 1 } },
      boardService,
    );
    expect(ex[0]).toEqual({ key: 'ex.bookMove', params: { name: 'Indian Defense', eco: 'A45', n: 1 }, tone: 'good' });
    expect(ru(ex[0]!)).toBe('Дебютный ход теории: Indian Defense (A45), 1-й ход теории');
    expect(translateMsg('en', ex[0]!)).toBe('Book move: Indian Defense (A45), theory move 1');
  });
});
