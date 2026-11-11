import { describe, expect, it } from 'vitest';
import { classifyMove, whiteWinChance } from '../src/core/classification';
import { formatScore } from '../src/core/format';
import { MATED_CP } from '../src/core/types';

const cp = (value: number) => ({ kind: 'cp', value }) as const;
const mate = (value: number) => ({ kind: 'mate', value }) as const;

describe('whiteWinChance', () => {
  it('is 50% at equality and symmetric', () => {
    expect(whiteWinChance(cp(0))).toBeCloseTo(50);
    expect(whiteWinChance(cp(300)) + whiteWinChance(cp(-300))).toBeCloseTo(100);
  });

  it('saturates for mates', () => {
    expect(whiteWinChance(mate(3))).toBe(100);
    expect(whiteWinChance(mate(-1))).toBe(0);
    expect(whiteWinChance(cp(-MATED_CP))).toBe(0);
  });
});

describe('classifyMove', () => {
  const base = { mover: 'w' as const, playedUci: 'e2e4', bestUci: 'd2d4' };

  it('marks the engine move as best', () => {
    expect(classifyMove({ ...base, bestUci: 'e2e4', before: cp(30), after: cp(-200) })).toBe('best');
  });

  it('grades by win-probability drop for the mover', () => {
    expect(classifyMove({ ...base, before: cp(30), after: cp(20) })).toBe('good');
    expect(classifyMove({ ...base, before: cp(30), after: cp(-100) })).toBe('inaccuracy');
    expect(classifyMove({ ...base, before: cp(30), after: cp(-250) })).toBe('mistake');
    expect(classifyMove({ ...base, before: cp(30), after: cp(-500) })).toBe('blunder');
  });

  it('works from Black’s perspective', () => {
    const black = { mover: 'b' as const, playedUci: 'e7e5', bestUci: 'c7c5' };
    expect(classifyMove({ ...black, before: cp(30), after: cp(40) })).toBe('good');
    expect(classifyMove({ ...black, before: cp(-30), after: cp(500) })).toBe('blunder');
  });

  it('does not flag small drops in an already winning position', () => {
    expect(classifyMove({ ...base, before: cp(900), after: cp(600) })).toBe('good');
  });

  it('flags walking into a forced mate as a blunder', () => {
    expect(classifyMove({ ...base, before: cp(0), after: mate(-2) })).toBe('blunder');
  });
});

describe('formatScore', () => {
  it('formats centipawns, mates and finished games', () => {
    expect(formatScore(cp(35))).toBe('+0.35');
    expect(formatScore(cp(-120))).toBe('-1.20');
    expect(formatScore(mate(3))).toBe('#3');
    expect(formatScore(mate(-2))).toBe('#-2');
    expect(formatScore(cp(MATED_CP))).toBe('1-0');
    expect(formatScore(null)).toBe('…');
  });
});
