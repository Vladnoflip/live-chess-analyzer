import { describe, expect, it } from 'vitest';
import { Store } from '../src/core/observable';
import { bindSounds, soundForSan, SoundService, type SoundKind } from '../src/services/sound.service';
import { BoardService, type GameMove } from '../src/services/board.service';

describe('soundForSan', () => {
  it.each([
    ['e4', 'move'],
    ['Nf3', 'move'],
    ['exd5', 'capture'],
    ['Bxf7', 'capture'],
    ['O-O', 'castle'],
    ['O-O-O', 'castle'],
    ['a8=Q', 'promote'],
    ['bxa8=Q', 'promote'],
    ['Bxf7+', 'check'],
    ['O-O+', 'check'],
    ['Qh4#', 'mate'],
    ['bxa8=Q#', 'mate'],
  ] as const)('%s -> %s', (san, kind) => {
    expect(soundForSan(san)).toBe(kind);
  });
});

type MovesState = { ply: number; moves: readonly GameMove[] };
class FakeMoves extends Store<MovesState> {
  set(s: Partial<MovesState>): void {
    this.setState(s);
  }
}
class FakeDrill extends Store<{ stats: { errors: number } }> {
  err(n: number): void {
    this.setState({ stats: { errors: n } });
  }
}

const game = new BoardService().parsePgn('1. e4 d5 2. exd5 Qxd5 3. Nc3 Qa5 4. d4 Nf6 5. Bd2 Bf5 6. Bc4 e6 7. Qe2 Bb4 8. O-O-O Bxc3 9. Bxc3 Qa4 *').moves;

function setup() {
  const played: SoundKind[] = [];
  const moves = new FakeMoves({ ply: 0, moves: game });
  const drill = new FakeDrill({ stats: { errors: 0 } });
  bindSounds({ play: (k) => played.push(k) }, moves, drill);
  return { played, moves, drill };
}

describe('bindSounds', () => {
  it('plays once per single step forward, with the right kind', () => {
    const { played, moves } = setup();
    moves.set({ ply: 1 }); // e4
    moves.set({ ply: 2 }); // d5
    moves.set({ ply: 3 }); // exd5
    expect(played).toEqual(['move', 'move', 'capture']);
  });

  it('stays silent on jumps, going back and repeated state updates', () => {
    const { played, moves } = setup();
    moves.set({ ply: 5 });
    moves.set({ ply: 4 });
    moves.set({ ply: 4 });
    expect(played).toEqual([]);
    moves.set({ ply: 5 });
    expect(played).toEqual(['move']); // Nc3
  });

  it('plays castling', () => {
    const { played, moves } = setup();
    moves.set({ ply: 14 });
    moves.set({ ply: 15 }); // O-O-O
    expect(played).toEqual(['castle']);
  });

  it('is silent when a different game replaces the current one at the same ply', () => {
    const { played, moves } = setup();
    moves.set({ ply: 3 });
    played.length = 0;
    const other = new BoardService().parsePgn('1. d4 d5 2. c4 e6 3. Nc3 Nf6 *').moves;
    moves.set({ moves: other, ply: 4 }); // unrelated position
    expect(played).toEqual([]);
  });

  it('plays the error tone on trainer mistakes', () => {
    const { played, drill } = setup();
    drill.err(1);
    drill.err(1);
    drill.err(0); // new line resets stats
    drill.err(1);
    expect(played).toEqual(['error', 'error']);
  });
});

describe('SoundService settings', () => {
  it('persists enabled/volume and ignores junk', () => {
    const data = new Map<string, string>();
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
    const a = new SoundService(storage);
    expect(a.getState()).toEqual({ enabled: true, volume: 70 });
    a.update({ enabled: false, volume: 40 });
    expect(new SoundService(storage).getState()).toEqual({ enabled: false, volume: 40 });
    data.set('livechess.sound.v1', '{"enabled":"yes","volume":999}');
    expect(new SoundService(storage).getState()).toEqual({ enabled: true, volume: 70 });
  });

  it('does nothing without Web Audio (Node) instead of throwing', () => {
    const s = new SoundService();
    expect(() => s.play('move')).not.toThrow();
    expect(() => s.unlock()).not.toThrow();
  });
});

