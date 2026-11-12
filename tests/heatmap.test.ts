import { describe, expect, it } from 'vitest';
import { BoardService } from '../src/services/board.service';
import { heatColor, mistakeHeatmap } from '../src/core/heatmap';
import type { MoveClass } from '../src/core/types';

const board = new BoardService();
const game = board.parsePgn('1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# *');

describe('mistake heatmap', () => {
  it('counts the destination squares of mistakes and blunders only', () => {
    const classes: Record<number, MoveClass> = { 1: 'best', 3: 'inaccuracy', 4: 'mistake', 6: 'blunder', 7: 'best' };
    const cells = mistakeHeatmap(game.moves, classes);
    expect(cells.map((c) => [c.square, c.count])).toEqual([
      ['c6', 1],
      ['f6', 1],
    ]);
    expect(cells.every((c) => c.intensity === 1)).toBe(true);
  });

  it('gets redder the more often a square is hit', () => {
    const repeated = board.parsePgn('1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8 5. Nf3 *');
    const classes: Record<number, MoveClass> = { 1: 'mistake', 5: 'blunder', 9: 'mistake', 2: 'blunder' };
    const cells = mistakeHeatmap(repeated.moves, classes);
    expect(cells[0]).toEqual({ square: 'f3', count: 3, intensity: 1 });
    expect(cells[1]).toMatchObject({ square: 'f6', count: 1 });
    expect(cells[1]!.intensity).toBeCloseTo(1 / 3);
    const alpha = (c: string) => Number(c.match(/([\d.]+)\)$/)![1]);
    expect(alpha(heatColor(1))).toBeGreaterThan(alpha(heatColor(cells[1]!.intensity)));
    expect(heatColor(1)).toBe('rgba(255, 0, 0, 0.65)');
  });

  it('can be limited to one side and is empty without errors', () => {
    const repeated = board.parsePgn('1. Nf3 Nf6 2. Ng1 Ng8 *');
    const classes: Record<number, MoveClass> = { 1: 'mistake', 2: 'blunder' };
    expect(mistakeHeatmap(repeated.moves, classes, 'w').map((c) => c.square)).toEqual(['f3']);
    expect(mistakeHeatmap(repeated.moves, classes, 'b').map((c) => c.square)).toEqual(['f6']);
    expect(mistakeHeatmap(repeated.moves, {})).toEqual([]);
  });
});
