import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { OpeningBook, normalizeQuery, parseBookData } from '../src/core/openings';
import { DrillManager, DRILL_SECTIONS } from '../src/core/drill.manager';
import { BoardService, START_FEN } from '../src/services/board.service';
import { translateMsg, type Msg } from '../src/core/i18n';

const ru = (m: Msg | null | undefined) => (m ? translateMsg('ru', m) : '');

const board = new BoardService();

/** FEN after playing SAN moves from the start position. */
function fenAfter(san: string): string {
  return board.parsePgn(`${san} *`).moves.at(-1)?.fenAfter ?? START_FEN;
}

describe('opening book (lichess-org/chess-openings)', () => {
  let book: OpeningBook;
  beforeAll(() => {
    const raw: unknown = JSON.parse(readFileSync(new URL('../src/data/openings/openings.json', import.meta.url), 'utf8'));
    book = OpeningBook.fromData(parseBookData(raw));
  });

  it('loads all lines', () => {
    expect(book.entries.length).toBeGreaterThan(3500);
  });

  it('finds the Nimzo-Indian (E20) by position', () => {
    const op = book.openingAt(fenAfter('1. d4 Nf6 2. c4 e6 3. Nc3 Bb4'));
    expect(op).toMatchObject({ eco: 'E20', name: 'Nimzo-Indian Defense', color: 'b' });
  });

  it('recognises a transposition into the Nimzo-Indian', () => {
    expect(book.openingAt(fenAfter('1. c4 e6 2. d4 Nf6 3. Nc3 Bb4'))?.eco).toBe('E20');
  });

  it("finds the King's Gambit (C30) and the Evans Gambit (C51)", () => {
    expect(book.openingAt(fenAfter('1. e4 e5 2. f4'))).toMatchObject({ eco: 'C30', name: "King's Gambit", color: 'w' });
    expect(book.openingAt(fenAfter('1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. b4'))).toMatchObject({ eco: 'C51', name: 'Italian Game: Evans Gambit' });
  });

  it('inherits the deepest named prefix for unnamed book positions', () => {
    // After 1.d4 Nf6 2.c4 e6 3.Nc3 Bb4 4.e3 O-O the position is only a waypoint to E50.
    const op = book.openingAt(fenAfter('1. d4 Nf6 2. c4 e6 3. Nc3 Bb4 4. e3 O-O'));
    expect(op?.name.startsWith('Nimzo-Indian Defense')).toBe(true);
  });

  it('tells book moves from moves out of theory', () => {
    const nimzo = fenAfter('1. d4 Nf6 2. c4 e6 3. Nc3 Bb4');
    expect(book.isBookMove(nimzo, 'd1c2')).toBe(true); // Classical, E32+
    expect(book.isBookMove(nimzo, 'e3e4')).toBe(false);
    expect(book.isBookMove(nimzo, 'h1h2')).toBe(false);
    expect(book.inBook(nimzo)).toBe(true);
    expect(book.inBook(fenAfter('1. d4 Nf6 2. c4 e6 3. Nc3 Bb4 4. Kd2'))).toBe(false);
  });

  it('lists book moves with names, most popular first', () => {
    const moves = book.movesAt(START_FEN);
    expect(moves.slice(0, 2).map((m) => m.san).sort()).toEqual(['d4', 'e4']);
    const e4 = moves.find((m) => m.san === 'e4');
    expect(e4?.opening?.name).toBe("King's Pawn Game");
  });

  it('filters by ECO range', () => {
    const e = book.filterEntries({ ecoFrom: 'E00', ecoTo: 'E99' });
    expect(e.length).toBeGreaterThan(300);
    expect(e.every((x) => x.eco >= 'E00' && x.eco <= 'E99')).toBe(true);
    // Every E-code line starts with 1.d4 or 1.c4/1.Nf3 transpositions — never 1.e4.
    expect(book.movesAt(START_FEN, { ecoFrom: 'E00', ecoTo: 'E99' }).map((m) => m.san)).not.toContain('e4');
  });

  it('filters by name (Russian keywords) and by side', () => {
    expect(normalizeQuery('Гамбиты')).toBe('gambit');
    expect(normalizeQuery('индийская')).toBe('indian');
    const gambits = book.filterEntries({ query: 'гамбит' });
    expect(gambits.length).toBeGreaterThan(200);
    expect(gambits.every((g) => g.name.toLowerCase().includes('gambit'))).toBe(true);
    const muzio = gambits.find((g) => g.name.startsWith("King's Gambit Accepted") && g.name.includes('Muzio'));
    expect(muzio?.eco).toBe('C37');

    const sicilianBlack = book.filterEntries({ query: 'sicilian', color: 'b' });
    expect(sicilianBlack.every((s) => s.color === 'b')).toBe(true);
    // c5 dominates; a few lines reach Sicilian names via 1...e6 or 1...g6 transpositions.
    expect(book.movesAt(fenAfter('1. e4'), { query: 'sicilian' })[0]?.san).toBe('c5');
  });
});

// ── Trainer on a fixed tree ────────────────────────────────────────────────

function line(eco: string, name: string, san: string) {
  const game = board.parsePgn(`${san} *`);
  return {
    eco,
    name,
    uci: game.moves.map((m) => m.uci),
    san: game.moves.map((m) => m.san),
    fens: [START_FEN, ...game.moves.map((m) => m.fenAfter)],
  };
}

const TREE = OpeningBook.fromLines([
  line('A45', 'Indian Defense', '1. d4 Nf6'),
  line('E20', 'Nimzo-Indian Defense', '1. d4 Nf6 2. c4 e6 3. Nc3 Bb4'),
  line('E12', "Queen's Indian Defense", '1. d4 Nf6 2. c4 e6 3. Nf3 b6'),
  line('E60', "King's Indian Defense", '1. d4 Nf6 2. c4 g6'),
  line('C30', "King's Gambit", '1. e4 e5 2. f4'),
]);

describe('DrillManager on a fixed tree', () => {
  function setup(random = 0) {
    const lines: string[][] = [];
    const drill = new DrillManager({
      getBook: () => TREE,
      board,
      onLine: (_start, ucis) => lines.push([...ucis]),
      random: () => random,
      replyDelayMs: 0,
    });
    return { drill, lines };
  }

  it('plays the book reply after a correct move (user = White)', () => {
    const { drill } = setup(0);
    drill.start({ filter: { query: 'indian' }, userColor: 'w' });
    expect(drill.isUserTurn()).toBe(true);
    expect(drill.tryMove('d2d4')).toBe(true);
    const s = drill.getState();
    expect(s.message).toEqual({ tone: 'good', key: 'drill.msg.correct', params: { san: 'd4' } });
    expect(ru(s.message)).toBe('Верно: d4');
    expect(translateMsg('en', s.message!)).toBe('Correct: d4');
    expect(s.line).toEqual(['d2d4', 'g8f6']); // only book reply in the section
    expect(s.stats).toEqual({ positions: 1, correct: 1, errors: 0 });
    expect(s.openingName).toBe('Indian Defense (A45)');
  });

  it('accepts any book move, not only the main line', () => {
    const { drill } = setup(0);
    drill.start({ filter: { query: 'indian' }, userColor: 'w' });
    drill.tryMove('d2d4');
    drill.tryMove('c2c4');
    // Black answered 2...e6 or 2...g6; with e6 both 3.Nc3 and 3.Nf3 are book.
    const s = drill.getState();
    if (s.line.at(-1) === 'e7e6') {
      expect(drill.tryMove('g1f3')).toBe(true);
      expect(drill.getState().line.at(-1)).toBe('b7b6');
    } else {
      expect(s.status).toBe('finished');
    }
  });

  it('rejects a non-book move with the expected message and lets the user retry', () => {
    const { drill } = setup(0);
    drill.start({ filter: { query: 'indian' }, userColor: 'w' });
    expect(drill.tryMove('e2e4')).toBe(false);
    const s = drill.getState();
    expect(s.message?.tone).toBe('bad');
    expect(ru(s.message)).toContain('теория играет d4');
    expect(translateMsg('en', s.message!)).toBe('e4 is a book move, but it leaves the section. Theory here: d4');
    expect(s.expected).toEqual(['d4']);
    expect(s.stats.errors).toBe(1);
    expect(s.line).toEqual([]); // the wrong move is not played
    expect(drill.tryMove('d2d4')).toBe(true);
  });

  it('explains a book move that leaves the selected section', () => {
    const { drill } = setup(0);
    drill.start({ filter: { query: 'indian' }, userColor: 'w' });
    expect(drill.tryMove('e2e4')).toBe(false);
    // e4 IS in the whole book (King's Gambit line) but not in "indian".
    expect(ru(drill.getState().message)).toContain('за пределы раздела');
  });

  it('starts with the book move when the user plays Black', () => {
    const { drill, lines } = setup(0);
    drill.start({ filter: { query: 'indian' }, userColor: 'b' });
    expect(lines.at(-1)).toEqual(['d2d4']);
    expect(drill.tryMove('g8f6')).toBe(true);
  });

  it('finishes when the book runs out', () => {
    const { drill } = setup(0);
    drill.start({ filter: { query: "king's gambit" }, userColor: 'b' });
    expect(drill.tryMove('e7e5')).toBe(true);
    const s = drill.getState();
    expect(s.line).toEqual(['e2e4', 'e7e5', 'f2f4']);
    expect(s.status).toBe('finished');
    expect(ru(s.message)).toContain("King's Gambit");
  });

  it('finishes after maxMoves full moves', () => {
    const { drill } = setup(0);
    drill.start({ userColor: 'w', maxMoves: 1 });
    drill.tryMove('d2d4');
    expect(drill.getState().status).toBe('finished');
    expect(ru(drill.getState().message)).toBe('Пройдено ходов: 1');
    expect(translateMsg('en', drill.getState().message!)).toBe('Moves completed: 1');
  });
});

describe('drill sections on the real book', () => {
  it('"Индийские защиты" starts with 1.d4 (or 1.c4/1.Nf3 transpositions), never flank openings', () => {
    const raw: unknown = JSON.parse(readFileSync(new URL('../src/data/openings/openings.json', import.meta.url), 'utf8'));
    const book = OpeningBook.fromData(parseBookData(raw));
    const indian = DRILL_SECTIONS.find((s) => s.id === 'indian')!;
    const first = book.movesAt(START_FEN, indian.filter).map((m) => m.san);
    expect(first[0]).toBe('d4');
    expect(first).not.toContain('b4');
    expect(first).not.toContain('e4');
  });

  it('opponent replies are weighted towards popular lines', () => {
    const picks: string[] = [];
    for (const r of [0, 0.5, 0.99]) {
      const drill = new DrillManager({ getBook: () => TREE, board, onLine: () => undefined, random: () => r, replyDelayMs: 0 });
      drill.start({ filter: { query: 'indian' }, userColor: 'w' });
      drill.tryMove('d2d4');
      drill.tryMove('c2c4');
      picks.push(drill.getState().line[3] ?? '');
    }
    // After 1.d4 Nf6 2.c4: e6 carries two named lines, g6 one.
    expect(picks).toEqual(['e7e6', 'e7e6', 'g7g6']);
  });
});
