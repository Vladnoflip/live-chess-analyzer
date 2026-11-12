import { describe, expect, it } from 'vitest';
import { BoardService, type ParsedGame } from '../src/services/board.service';
import { GUESS_TOLERANCE_CP, GuessManager, moverCp } from '../src/core/guess.manager';
import { MATED_CP, type Score } from '../src/core/types';
import { AnalysisManager } from '../src/core/analysis.manager';
import { EngineService } from '../src/services/engine.service';
import { NodeTransport } from './node.transport';

const board = new BoardService();
const GAME = board.parsePgn('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *');

/** Fake engine: White-POV scores by FEN; unknown positions are 0.00. */
function setup(_game: ParsedGame, scores: Record<string, number> = {}) {
  const shown: number[] = [];
  const loaded: ParsedGame[] = [];
  const evaluated: string[] = [];
  const guess = new GuessManager({
    board,
    load: (g) => loaded.push(g),
    goTo: (ply) => shown.push(ply),
    evaluate: async (fen) => {
      evaluated.push(fen);
      return { kind: 'cp', value: scores[fen] ?? 0 };
    },
    wait: async () => {},
  });
  return { guess, shown, loaded, evaluated };
}

const fenAfter = (fen: string, uci: string) => board.applyUci(fen, uci)!.fen;

describe('guess the move', () => {
  it('starts at the first move of the chosen side, playing the opponent first', () => {
    const w = setup(GAME);
    expect(w.guess.start(GAME, 'w')).toBe(true);
    expect(w.guess.getState()).toMatchObject({ status: 'guessing', ply: 0, total: 3 });
    expect(w.loaded).toHaveLength(1);

    const b = setup(GAME);
    b.guess.start(GAME, 'b');
    expect(b.guess.getState()).toMatchObject({ status: 'guessing', ply: 1, total: 3, side: 'b' });
    expect(b.shown).toEqual([1]); // 1. e4 is shown, Black to move
  });

  it('accepts the game move without asking the engine', async () => {
    const { guess, evaluated } = setup(GAME);
    guess.start(GAME, 'w');
    await guess.guess('e2e4');
    expect(evaluated).toEqual([]);
    expect(guess.getState().status).toBe('feedback');
    expect(guess.getState().last).toMatchObject({ verdict: 'match', userSan: 'e4', gameSan: 'e4' });
  });

  it('accepts another move that is at most 0.50 worse', async () => {
    const start = GAME.startFen;
    const { guess, evaluated } = setup(GAME, {
      [GAME.moves[0]!.fenAfter]: 30, // 1. e4
      [fenAfter(start, 'd2d4')]: 30 - GUESS_TOLERANCE_CP, // exactly at the limit
    });
    guess.start(GAME, 'w');
    await guess.guess('d2d4');
    expect(evaluated).toHaveLength(2);
    expect(guess.getState().last).toMatchObject({ verdict: 'good', userSan: 'd4', gameSan: 'e4', lossCp: GUESS_TOLERANCE_CP });
  });

  it('shows the game move and both evaluations after a miss', async () => {
    const start = GAME.startFen;
    const { guess } = setup(GAME, { [GAME.moves[0]!.fenAfter]: 30, [fenAfter(start, 'f2f3')]: -40 });
    guess.start(GAME, 'w');
    await guess.guess('f2f3');
    const last = guess.getState().last!;
    expect(last.verdict).toBe('miss');
    expect(last.gameSan).toBe('e4');
    expect(last.gameScore).toEqual({ kind: 'cp', value: 30 });
    expect(last.userScore).toEqual({ kind: 'cp', value: -40 });
    expect(last.lossCp).toBe(70);
  });

  it('judges Black from Black’s point of view', async () => {
    const before = GAME.moves[1]!.fenBefore;
    // White-POV +0.30 after 1...e5; 1...f6 gives White +1.20 → 0.90 worse for Black.
    const { guess } = setup(GAME, { [GAME.moves[1]!.fenAfter]: 30, [fenAfter(before, 'f7f6')]: 120, [fenAfter(before, 'c7c5')]: 60 });
    guess.start(GAME, 'b');
    await guess.guess('f7f6');
    expect(guess.getState().last).toMatchObject({ verdict: 'miss', lossCp: 90 });
    guess.stop();
    guess.start(GAME, 'b');
    await guess.guess('c7c5');
    expect(guess.getState().last).toMatchObject({ verdict: 'good', lossCp: 30 });
  });

  it('plays the game move and the reply, then finishes with a score', async () => {
    const { guess, shown } = setup(GAME, { [fenAfter(GAME.startFen, 'a2a3')]: -200, [GAME.moves[0]!.fenAfter]: 30 });
    guess.start(GAME, 'w');
    await guess.guess('a2a3'); // miss
    await guess.next();
    expect(shown.slice(-2)).toEqual([1, 2]); // 1. e4 (game move), then 1...e5
    expect(guess.getState()).toMatchObject({ status: 'guessing', ply: 2 });
    await guess.guess('g1f3');
    await guess.next();
    await guess.guess('f1b5');
    await guess.next();
    const s = guess.getState();
    expect(s.status).toBe('finished');
    expect(s.results.map((r) => r.verdict)).toEqual(['miss', 'match', 'match']);
    expect(guess.accuracy()).toBe(67);
    expect(shown.at(-1)).toBe(GAME.moves.length);
  });

  it('ignores illegal moves and moves outside the guessing phase', async () => {
    const { guess } = setup(GAME);
    await guess.guess('e2e4'); // not started
    expect(guess.getState().status).toBe('idle');
    guess.start(GAME, 'w');
    await guess.guess('e2e5');
    expect(guess.getState().status).toBe('guessing');
  });

  it('refuses a side with no moves and reports engine failures', async () => {
    const one = board.parsePgn('1. e4 *');
    const { guess } = setup(one);
    expect(guess.start(one, 'b')).toBe(false);
    expect(guess.getState().error?.key).toBe('guess.error.noMoves');

    const failing = new GuessManager({
      board,
      load: () => {},
      goTo: () => {},
      evaluate: async () => {
        throw new Error('engine down');
      },
    });
    failing.start(GAME, 'w');
    await failing.guess('d2d4');
    expect(failing.getState()).toMatchObject({ status: 'guessing', error: { key: 'guess.error.engine' } });
  });

  it('ranks mates by distance', () => {
    const mate = (value: number): Score => ({ kind: 'mate', value });
    expect(moverCp(mate(1), 'w')).toBeGreaterThan(moverCp(mate(3), 'w'));
    expect(moverCp(mate(-2), 'w')).toBeLessThan(-MATED_CP + 10);
    expect(moverCp(mate(-2), 'b')).toBeGreaterThan(MATED_CP - 10);
    expect(moverCp({ kind: 'cp', value: 50 }, 'b')).toBe(-50);
  });
});

describe('guess the move with the real engine (integration)', () => {
  it('accepts a sound alternative and rejects a blunder', async () => {
    const engine = new EngineService(new NodeTransport());
    const manager = new AnalysisManager(engine, board, { maxThreads: 1, multiThreaded: false, initialSettings: { depth: 8, hashMb: 16, multiPv: 1 } });
    try {
      await manager.init();
      // 1. e4 e5 2. Nf3: guess White's 2nd move.
      const game = board.parsePgn('1. e4 e5 2. Nf3 Nc6 *');
      const guess = new GuessManager({
        board,
        load: (g) => manager.loadGame(g),
        goTo: (ply) => manager.goTo(ply),
        evaluate: (fen) => manager.evaluate(fen, 10),
        wait: async () => {},
      });
      guess.start(game, 'w');
      await guess.guess('e2e4');
      await guess.next();
      expect(manager.getState().ply).toBe(2);
      await guess.guess('b1c3'); // 2. Nc3 is fine
      expect(guess.getState().last?.verdict).toBe('good');
      guess.stop();
      guess.start(game, 'w');
      await guess.guess('e2e4');
      await guess.next();
      await guess.guess('e1e2'); // 2. Ke2 — clearly worse than Nf3
      expect(guess.getState().last?.verdict).toBe('miss');
      expect(guess.getState().last?.gameSan).toBe('Nf3');
    } finally {
      manager.dispose();
    }
  });
});
