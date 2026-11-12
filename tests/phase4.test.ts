import { describe, expect, it } from 'vitest';
import { DrillManager, DRILL_STORAGE_KEY, type KeyValueStorage } from '../src/core/drill.manager';
import { OpeningBook } from '../src/core/openings';
import { BoardService, START_FEN } from '../src/services/board.service';
import { scoreToStepColor, textColorOn, BRILLIANT_COLOR } from '../src/core/move-score';
import { ARROW, arrowShape, squareCenter } from '../src/core/arrow-geometry';
import { translateMsg } from '../src/core/i18n';

const board = new BoardService();

function line(eco: string, name: string, san: string) {
  const game = board.parsePgn(`${san} *`);
  return { eco, name, uci: game.moves.map((m) => m.uci), san: game.moves.map((m) => m.san), fens: [START_FEN, ...game.moves.map((m) => m.fenAfter)] };
}

const TREE = OpeningBook.fromLines([
  line('A45', 'Indian Defense', '1. d4 Nf6'),
  line('E20', 'Nimzo-Indian Defense', '1. d4 Nf6 2. c4 e6 3. Nc3 Bb4'),
  line('E60', "King's Indian Defense", '1. d4 Nf6 2. c4 g6'),
]);

class MemoryStorage implements KeyValueStorage {
  readonly data = new Map<string, string>();
  getItem(k: string): string | null {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.data.set(k, v);
  }
}

function drillWith(storage: KeyValueStorage | null, onLine: (l: readonly string[]) => void = () => undefined) {
  return new DrillManager({ getBook: () => TREE, board, onLine: (_s, u) => onLine(u), random: () => 0, replyDelayMs: 0, storage });
}

describe('drill progress persistence', () => {
  it('saves the line, session stats and lifetime totals', () => {
    const storage = new MemoryStorage();
    const drill = drillWith(storage);
    drill.start({ sectionId: 'indian', filter: { query: 'indian' }, userColor: 'w', maxMoves: 10 });
    drill.tryMove('e2e4'); // error
    drill.tryMove('d2d4'); // correct, book replies Nf6
    const saved = JSON.parse(storage.getItem(DRILL_STORAGE_KEY)!);
    expect(saved.session).toMatchObject({ status: 'playing', sectionId: 'indian', userColor: 'w', line: ['d2d4', 'g8f6'] });
    expect(saved.session.stats).toEqual({ positions: 2, correct: 1, errors: 1 });
    expect(saved.totals.indian).toEqual({ positions: 2, correct: 1, errors: 1, lines: 0 });
  });

  it('restores the saved line and continues it after resume()', () => {
    const storage = new MemoryStorage();
    const first = drillWith(storage);
    first.start({ sectionId: 'indian', filter: { query: 'indian' }, userColor: 'w' });
    first.tryMove('d2d4');

    const shown: (readonly string[])[] = [];
    const second = drillWith(storage, (l) => shown.push(l));
    const s = second.getState();
    expect(s.status).toBe('playing');
    expect(s.line).toEqual(['d2d4', 'g8f6']);
    expect(s.fen).toBe(board.applyUci(board.applyUci(START_FEN, 'd2d4')!.fen, 'g8f6')!.fen);
    expect(s.message?.key).toBe('drill.msg.restored');
    expect(translateMsg('ru', s.message!)).toContain('восстановлен');
    expect(shown).toEqual([]); // nothing touches the board until the trainer is opened

    second.resume();
    expect(shown.at(-1)).toEqual(['d2d4', 'g8f6']);
    expect(second.tryMove('c2c4')).toBe(true);
  });

  it('keeps lifetime totals across new lines and counts finished lines', () => {
    const storage = new MemoryStorage();
    const drill = drillWith(storage);
    drill.start({ sectionId: 'indian', filter: { query: 'indian' }, userColor: 'w', maxMoves: 1 });
    drill.tryMove('d2d4');
    expect(drill.getState().status).toBe('finished');
    drill.restart();
    drill.tryMove('d2d4');
    const totals = drillWith(storage).getState().totals.indian;
    expect(totals).toEqual({ positions: 2, correct: 2, errors: 0, lines: 2 });
  });

  it('pause() keeps the session; stop() ends it', () => {
    const storage = new MemoryStorage();
    const drill = drillWith(storage);
    drill.start({ sectionId: 'indian', filter: { query: 'indian' }, userColor: 'w' });
    drill.pause();
    expect(drillWith(storage).getState().status).toBe('playing');
    drill.stop();
    expect(drillWith(storage).getState().status).toBe('idle');
  });

  it('ignores corrupted or tampered storage', () => {
    const storage = new MemoryStorage();
    storage.setItem(DRILL_STORAGE_KEY, '{not json');
    expect(drillWith(storage).getState().status).toBe('idle');

    storage.setItem(
      DRILL_STORAGE_KEY,
      JSON.stringify({
        session: { status: 'playing', sectionId: 'nope', line: ['d2d4', 'zzzz', 'g8f6'], stats: { positions: -5 }, maxMoves: 'x' },
        totals: { indian: { positions: 3, correct: 'a' }, evil: { positions: 1 } },
      }),
    );
    const s = drillWith(storage).getState();
    expect(s.sectionId).toBe('all');
    expect(s.line).toEqual(['d2d4']); // stops at the first illegal move
    expect(s.stats.positions).toBe(0);
    expect(s.maxMoves).toBe(10);
    expect(Object.keys(s.totals)).toEqual(['indian']);
    expect(s.totals.indian).toEqual({ positions: 3, correct: 0, errors: 0, lines: 0 });
  });

  it('works without storage (blocked localStorage)', () => {
    const throwing: KeyValueStorage = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceeded');
      },
    };
    const drill = drillWith(throwing);
    drill.start({ sectionId: 'indian', filter: { query: 'indian' }, userColor: 'w' });
    expect(drill.tryMove('d2d4')).toBe(true);
  });
});

describe('arrow colour steps', () => {
  it.each([
    [0, '#ff3b30'],
    [24, '#ff3b30'],
    [25, '#ff8a00'],
    [49, '#ff8a00'],
    [50, '#ffd400'],
    [74, '#ffd400'],
    [75, '#2fe06f'],
    [89, '#2fe06f'],
    [90, '#00a650'],
    [100, '#00a650'],
  ])('score %d -> %s', (score, hex) => {
    expect(scoreToStepColor(score)).toBe(hex);
  });

  it('brilliant is always blue', () => {
    expect(scoreToStepColor(100, true)).toBe(BRILLIANT_COLOR);
    expect(scoreToStepColor(10, true)).toBe(BRILLIANT_COLOR);
  });

  it('picks readable badge text', () => {
    expect(textColorOn('#1b1b1b')).toBe('#ffffff'); // dark background
    expect(textColorOn('#ffd400')).toBe('#1b1b1b'); // yellow
    expect(textColorOn('#00a650')).toBe('#1b1b1b'); // vivid green
    expect(textColorOn('#00bfff')).toBe('#1b1b1b'); // blue
  });
});

describe('arrow geometry', () => {
  it('maps squares for both orientations', () => {
    expect(squareCenter('a1', 'w')).toEqual({ x: 0.5, y: 7.5 });
    expect(squareCenter('a1', 'b')).toEqual({ x: 7.5, y: 0.5 });
  });

  it('draws straight arrows with the tip before the target centre', () => {
    const s = arrowShape(squareCenter('e2', 'w'), squareCenter('e4', 'w'), true);
    expect(s.shaft).toHaveLength(2);
    expect(s.head[0].x).toBeCloseTo(4.5);
    expect(s.head[0].y).toBeGreaterThan(4.5); // stops short of e4's centre (y = 4.5)
    expect(s.badge.y).toBeGreaterThan(s.head[0].y); // badge sits before the tip
    expect(Math.abs(s.badge.x - 4.5)).toBeGreaterThan(0.2); // and beside the line, not on it
  });

  it('bends knight arrows along the long leg first', () => {
    const s = arrowShape(squareCenter('g1', 'w'), squareCenter('f3', 'w'), false);
    expect(s.shaft).toHaveLength(3);
    expect(s.shaft[1]).toEqual({ x: 6.5, y: 5.5 }); // corner on g3: two squares up, then left
    const h = arrowShape(squareCenter('b1', 'w'), squareCenter('d2', 'w'), false);
    expect(h.shaft[1]).toEqual({ x: 3.5, y: 7.5 }); // corner on d1: two squares right, then up
  });

  it('keeps a gap between the tip and the target centre', () => {
    const pairs = [
      ['e2', 'e4'],
      ['g1', 'f3'],
      ['a1', 'h8'],
      ['h7', 'b1'],
    ] as const;
    for (const [from, to] of pairs) {
      for (const accent of [true, false]) {
        const target = squareCenter(to, 'w');
        const s = arrowShape(squareCenter(from, 'w'), target, accent);
        const gap = Math.hypot(s.head[0].x - target.x, s.head[0].y - target.y);
        expect(gap).toBeCloseTo(ARROW.tipGap, 5);
        expect(gap).toBeGreaterThanOrEqual(0.18);
      }
    }
  });

  it('draws a thin line (under 10% of a square) with a compact rounded head', () => {
    for (const accent of [true, false]) {
      const s = arrowShape(squareCenter('e2', 'w'), squareCenter('e4', 'w'), accent);
      expect(s.width).toBeGreaterThanOrEqual(0.06);
      expect(s.width).toBeLessThanOrEqual(0.1);
      const headWidth = Math.hypot(s.head[1].x - s.head[2].x, s.head[1].y - s.head[2].y);
      expect(headWidth).toBeLessThan(0.4);
      // Three rounded corners: one move, three curves, closed.
      expect(s.headPath.match(/Q/g)).toHaveLength(3);
      expect(s.headPath.startsWith('M')).toBe(true);
      expect(s.headPath.endsWith('Z')).toBe(true);
      expect(s.headPath).not.toMatch(/NaN/);
    }
  });

  it('starts at a ring on the source centre', () => {
    const from = squareCenter('e2', 'w');
    const s = arrowShape(from, squareCenter('e4', 'w'), false);
    expect(s.shaft[0]).toEqual(from);
    expect(s.origin).toEqual(from);
    expect(s.originRadius).toBeGreaterThan(s.width / 2);
  });

  it('frames the source and target squares of the accented arrow only', () => {
    const a = arrowShape(squareCenter('e2', 'w'), squareCenter('e4', 'w'), true);
    expect(a.frames?.from.x).toBeCloseTo(4 + ARROW.frameInset);
    expect(a.frames?.to.y).toBeCloseTo(4 + ARROW.frameInset);
    expect(a.frames?.to.size).toBeCloseTo(1 - 2 * ARROW.frameInset);
    expect(arrowShape(squareCenter('e2', 'w'), squareCenter('e4', 'w'), false).frames).toBeNull();
  });

  it('accent arrows are wider (opacity is handled by CSS and is the same for all)', () => {
    const a = arrowShape(squareCenter('e2', 'w'), squareCenter('e4', 'w'), true);
    const b = arrowShape(squareCenter('e2', 'w'), squareCenter('e4', 'w'), false);
    expect(a.width).toBeGreaterThan(b.width);
  });
});
