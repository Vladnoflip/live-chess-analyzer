import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EngineService, SearchCancelledError } from '../src/services/engine.service';
import { AnalysisManager } from '../src/core/analysis.manager';
import { BoardService, START_FEN } from '../src/services/board.service';
import { MATED_CP, type SearchInfo } from '../src/core/types';
import { NodeTransport } from './node.transport';
import { buildCandidates, isBrilliant } from '../src/core/candidates';
import { moveScore } from '../src/core/move-score';
import { classifyMove } from '../src/core/classification';

/**
 * Runs the real Stockfish 18 lite WASM build (same file the browser loads) through
 * EngineService. Expected values were pre-computed with this engine and chosen to be
 * stable across hardware: forced mates and positions with a single winning move.
 */
const POSITIONS = {
  // Back-rank mate: 1. Rd8#
  whiteMateIn1: { fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', best: 'd1d8', score: { kind: 'mate', value: 1 } },
  // Same idea for Black: 1... Rd1#. White-POV score must be negative.
  blackMateIn1: { fen: '3r2k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1', best: 'd8d1', score: { kind: 'mate', value: -1 } },
  // 1. e4 e5 2. Nf3 Qh4?? — White wins the queen with 3. Nxh4.
  hangingQueen: { fen: 'rnb1kbnr/pppp1ppp/8/4p3/4P2q/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3', best: 'f3h4', minCp: 600 },
} as const;

const DEPTH = 14;

describe('EngineService ↔ Stockfish 18 (integration)', () => {
  let engine: EngineService;

  beforeAll(async () => {
    engine = new EngineService(new NodeTransport());
    const name = await engine.init({ threads: 1, hashMb: 16 });
    expect(name).toMatch(/Stockfish 18/);
  });

  afterAll(() => engine.dispose());

  it('finds a mate in one for White', async () => {
    const { fen, best, score } = POSITIONS.whiteMateIn1;
    const result = await engine.analyze(fen, { depth: DEPTH });
    expect(result.bestMove).toBe(best);
    expect(result.info?.score).toEqual(score);
  });

  it('reports Black’s mate from White’s point of view', async () => {
    const { fen, best, score } = POSITIONS.blackMateIn1;
    const result = await engine.analyze(fen, { depth: DEPTH });
    expect(result.bestMove).toBe(best);
    expect(result.info?.score).toEqual(score);
  });

  it('wins the hanging queen with a large positive evaluation', async () => {
    const { fen, best, minCp } = POSITIONS.hangingQueen;
    const result = await engine.analyze(fen, { depth: DEPTH });
    expect(result.bestMove).toBe(best);
    expect(result.info?.score.kind).toBe('cp');
    expect(result.info?.score.value).toBeGreaterThan(minCp);
    expect(result.info?.pv[0]).toBe(best);
    expect(result.info?.depth).toBeGreaterThanOrEqual(DEPTH);
  });

  it('evaluates the start position as roughly equal', async () => {
    const result = await engine.analyze(START_FEN, { depth: 12 });
    expect(result.info?.score.kind).toBe('cp');
    expect(Math.abs(result.info?.score.value ?? 999)).toBeLessThan(80);
    expect(['e2e4', 'd2d4', 'g1f3', 'c2c4', 'e2e3']).toContain(result.bestMove);
  });

  it('streams info events during the search', async () => {
    const infos: SearchInfo[] = [];
    const off = engine.events.subscribe((e) => {
      if (e.type === 'info') infos.push(e.info);
    });
    await engine.analyze(POSITIONS.hangingQueen.fen, { depth: 10 });
    off();
    expect(infos.length).toBeGreaterThan(3);
    const depths = infos.map((i) => i.depth);
    expect(depths).toEqual([...depths].sort((a, b) => a - b));
  });

  it('cancels a running search when a new one starts', async () => {
    const first = engine.analyze(START_FEN, { depth: 40 });
    const second = engine.analyze(POSITIONS.whiteMateIn1.fen, { depth: 10 });
    await expect(first).rejects.toBeInstanceOf(SearchCancelledError);
    const result = await second;
    expect(result.fen).toBe(POSITIONS.whiteMateIn1.fen);
    expect(result.bestMove).toBe('d1d8');
  });

  it('handles an already-checkmated position', async () => {
    const mated = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3';
    const result = await engine.analyze(mated, { depth: 5 });
    expect(result.bestMove).toBeNull();
    expect(result.info?.score).toEqual({ kind: 'cp', value: -MATED_CP });
  });

  it('reports stalemate as cp 0, not mate 0', async () => {
    const stalemate = '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1';
    const result = await engine.analyze(stalemate, { depth: 5 });
    expect(result.bestMove).toBeNull();
    expect(result.info?.score).toEqual({ kind: 'cp', value: 0 });
  });
});

describe('AnalysisManager with the real engine (integration)', () => {
  it('reviews a game and flags the blunder', async () => {
    const engine = new EngineService(new NodeTransport());
    const manager = new AnalysisManager(engine, new BoardService(), {
      maxThreads: 1,
      multiThreaded: false,
      initialSettings: { depth: 10, reviewDepth: 10, hashMb: 16 },
    });
    try {
      await manager.init();
      expect(manager.loadPgn('1. e4 e5 2. Nf3 Qh4 3. Nxh4 *')).toBe(true);
      await manager.reviewGame();

      const { classes, evals, moves } = manager.getState();
      expect(Object.keys(classes)).toHaveLength(moves.length);
      expect(classes[4]).toBe('blunder'); // 2... Qh4??
      expect(classes[5]).toBe('best'); // 3. Nxh4
      expect(evals[moves[4]!.fenAfter]?.score.value).toBeGreaterThan(600);
    } finally {
      manager.dispose();
    }
  });

  it('shows a repeated position as a draw at 0.00 without asking the engine', async () => {
    const engine = new EngineService(new NodeTransport());
    const manager = new AnalysisManager(engine, new BoardService(), {
      maxThreads: 1,
      multiThreaded: false,
      initialSettings: { depth: 8, reviewDepth: 8, hashMb: 16 },
    });
    try {
      await manager.init();
      expect(manager.loadPgn('1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8 *')).toBe(true);
      manager.goTo(8);
      const s = manager.getState();
      expect(s.drawReason).toBe('threefold');
      expect(s.live.score).toEqual({ kind: 'cp', value: 0 });
      expect(s.live.status).toBe('done');
      manager.goTo(4);
      expect(manager.getState().drawReason).toBeNull();
    } finally {
      manager.dispose();
    }
  });
});

describe('MultiPV with the real engine (integration)', () => {
  const ITALIAN = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3';
  const LEGAL = 'rn1qkbnr/ppp2p1p/3p2p1/4p3/2B1P1b1/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 0 5';
  let engine: EngineService;
  const board = new BoardService();

  beforeAll(async () => {
    engine = new EngineService(new NodeTransport());
    await engine.init({ threads: 1, hashMb: 16, multiPv: 3 });
  });
  afterAll(() => engine.dispose());

  it('returns three ranked lines after 1.e4 e5 2.Nf3 Nc6 3.Bc4', async () => {
    const result = await engine.analyze(ITALIAN, { depth: 14 });
    expect(result.lines).toHaveLength(3);
    expect(result.lines.map((l) => l.multiPv)).toEqual([1, 2, 3]);
    // Pre-computed: Nf6 and Bc5 are the top two, within a few centipawns of each other.
    expect(['g8f6', 'f8c5']).toContain(result.bestMove);
    expect(result.lines[0]!.pv[0]).toBe(result.bestMove);

    const cands = buildCandidates(ITALIAN, result.lines, board);
    expect(cands.map((c) => c.rank)).toEqual([1, 2, 3]);
    expect(cands[0]!.moveScore).toBe(100);
    // Black to move: White-POV evals ascend, i.e. Black's evaluations descend by rank.
    const blackPov = cands.map((c) => -(c.evalCp ?? 0));
    expect(blackPov).toEqual([...blackPov].sort((a, b) => b - a));
    expect(cands.map((c) => c.moveScore)).toEqual([...cands.map((c) => c.moveScore)].sort((a, b) => b - a));
    expect(cands.some((c) => c.brilliant)).toBe(false);
  });

  it('flags Legal’s 5.Nxe5! as brilliant', async () => {
    const result = await engine.analyze(LEGAL, { depth: 16 });
    const cands = buildCandidates(LEGAL, result.lines, board);
    expect(cands[0]!.uciMove).toBe('f3e5');
    expect(cands[0]!.brilliant).toBe(true);
    expect(cands[0]!.color).toBe('#00bfff');
    expect(cands.slice(1).every((c) => !c.brilliant)).toBe(true);
  });

  it('switches MultiPV at runtime', async () => {
    await engine.configure({ multiPv: 1 });
    const one = await engine.analyze(ITALIAN, { depth: 8 });
    expect(one.lines).toHaveLength(1);
    await engine.configure({ multiPv: 5 });
    const five = await engine.analyze(ITALIAN, { depth: 8 });
    expect(five.lines).toHaveLength(5);
    await engine.configure({ multiPv: 3 });
  });
});

describe('Blackburne–Shilling trap (integration)', () => {
  // 1.e4 e5 2.Nf3 Nc6 3.Bc4 Nd4 4.Nxe5?: the refutation 4...Qg5! only shows up around
  // depth 18+ (pre-computed at depth 20: +1.09 before, Black +0.72 after).
  const BEFORE = 'r1bqkbnr/pppp1ppp/8/4p3/2BnP3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
  const AFTER = 'r1bqkbnr/pppp1ppp/8/4N3/2BnP3/8/PPPP1PPP/RNBQK2R b KQkq - 0 4';

  it('4.Nxe5? is not brilliant, scores below 75 and is classified as an error', async () => {
    const engine = new EngineService(new NodeTransport());
    const board = new BoardService();
    try {
      await engine.init({ threads: 1, hashMb: 32, multiPv: 3 });
      const before = await engine.analyze(BEFORE, { depth: 20 });
      const after = await engine.analyze(AFTER, { depth: 20 });
      expect(before.bestMove).not.toBe('f3e5');
      const cands = buildCandidates(BEFORE, before.lines, board);
      expect(cands.find((c) => c.uciMove === 'f3e5')).toBeUndefined(); // not even top-3
      expect(after.bestMove).toBe('d8g5');

      const score = moveScore('w', before.info!.score, after.info!.score);
      expect(score).toBeLessThan(75);
      const cls = classifyMove({ mover: 'w', playedUci: 'f3e5', bestUci: before.bestMove, before: before.info!.score, after: after.info!.score });
      expect(['inaccuracy', 'mistake', 'blunder']).toContain(cls);
      expect(isBrilliant(1, 'w', after.info!.score, board.tactics(BEFORE, 'f3e5'))).toBe(false);
    } finally {
      engine.dispose();
    }
  }, 60_000);
});
