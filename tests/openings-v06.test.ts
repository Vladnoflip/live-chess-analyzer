import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { OpeningBook, foldText, nameParts, parseBookData, searchTokens } from '../src/core/openings';
import { DRILL_GROUPS, DRILL_SECTIONS, DrillManager, sectionLineCount } from '../src/core/drill.manager';
import { BoardService, START_FEN } from '../src/services/board.service';

const board = new BoardService();
let book: OpeningBook;

beforeAll(() => {
  const raw: unknown = JSON.parse(readFileSync(new URL('../src/data/openings/openings.json', import.meta.url), 'utf8'));
  book = OpeningBook.fromData(parseBookData(raw));
});

describe('full lichess-org/chess-openings book', () => {
  it('contains every line and every ECO code A00–E99', () => {
    expect(book.entries).toHaveLength(3865);
    expect(new Set(book.entries.map((e) => e.eco)).size).toBe(500);
  });
});

describe('text folding and search tokens', () => {
  it('removes Latin accents but keeps Cyrillic letters intact', () => {
    expect(foldText('Grünfeld')).toBe('grunfeld');
    expect(foldText('Найдорф')).toBe('найдорф'); // й must not become и
    expect(foldText('King’s Gambit')).toBe("king's gambit");
  });

  it('maps Russian words by stem and drops filler words', () => {
    expect(searchTokens('Сицилианская Найдорф, английская атака')).toEqual(['sicilian', 'najdorf', 'english', 'attack']);
    expect(searchTokens('вариант Дракона')).toEqual(['dragon']);
    expect(searchTokens('Evans')).toEqual(['evans']);
  });
});

describe('opening search (autocomplete)', () => {
  it('finds the Evans Gambit by its English name', () => {
    const hits = book.search('Evans');
    expect(hits[0]?.name).toBe('Italian Game: Evans Gambit');
    expect(hits.every((h) => h.name.includes('Evans'))).toBe(true);
    expect(hits[0]?.san.slice(-1)).toEqual(['b4']);
  });

  it('finds the Najdorf from Russian input', () => {
    const hits = book.search('Найдорф');
    expect(hits[0]?.name).toBe('Sicilian Defense: Najdorf Variation');
    expect(hits[0]?.eco).toBe('B90');
  });

  it('narrows with several words: Sicilian → Najdorf → English Attack', () => {
    const hits = book.search('сицилианская найдорф английская атака');
    expect(hits[0]?.name).toBe('Sicilian Defense: Najdorf Variation, English Attack');
  });

  it('matches ECO codes and accent-free spellings', () => {
    expect(book.search('B90').every((h) => h.eco === 'B90')).toBe(true);
    expect(book.search('grunfeld')[0]?.name).toBe('Grünfeld Defense');
  });

  it('returns one suggestion per name, the shortest line', () => {
    const hits = book.search('english attack', 50);
    expect(new Set(hits.map((h) => h.name)).size).toBe(hits.length);
    const sameName = book.entries.filter((e) => e.name === 'Sicilian Defense: Najdorf Variation, English Attack');
    const shortest = Math.min(...sameName.map((e) => e.uci.length));
    expect(hits.find((h) => h.name === 'Sicilian Defense: Najdorf Variation, English Attack')?.uci.length).toBe(shortest);
  });

  it('returns nothing for nonsense', () => {
    expect(book.search('qwertyuiop')).toEqual([]);
    expect(book.search('   ')).toEqual([]);
  });
});

describe('opening name tree', () => {
  it('splits names into family, variation and sub-variations', () => {
    expect(nameParts('Sicilian Defense: Najdorf Variation, English Attack')).toEqual(['Sicilian Defense', 'Najdorf Variation', 'English Attack']);
    expect(nameParts("King's Gambit")).toEqual(["King's Gambit"]);
  });

  it('expands Sicilian → Najdorf → English Attack', () => {
    const sicilian = book.nameTree().find((n) => n.label === 'Sicilian Defense');
    const najdorf = sicilian?.children.find((n) => n.label === 'Najdorf Variation');
    const english = najdorf?.children.find((n) => n.label === 'English Attack');
    expect(english?.fullName).toBe('Sicilian Defense: Najdorf Variation, English Attack');
    expect(english?.entry?.eco).toBe('B90');
    expect(najdorf!.count).toBeGreaterThanOrEqual(english!.count);
  });

  it('counts every line exactly once at the root', () => {
    const total = book.nameTree().reduce((sum, n) => sum + n.count, 0);
    expect(total).toBe(book.entries.length);
    expect(book.nameTree()[0]?.label).toBe('Sicilian Defense'); // the largest family comes first
  });
});

describe('granular trainer sections', () => {
  it('groups every section into one of the tabs', () => {
    const groups = new Set(DRILL_GROUPS.map((g) => g.id));
    expect(DRILL_SECTIONS.every((s) => groups.has(s.group))).toBe(true);
    expect(new Set(DRILL_SECTIONS.map((s) => s.id)).size).toBe(DRILL_SECTIONS.length);
  });

  it.each([
    ['kings-gambit', 'C30', 'C39', "King's Gambit"],
    ['queens-gambit', 'D06', 'D69', null],
    ['evans', 'C51', 'C52', 'Evans Gambit'],
    ['benko', 'A57', 'A59', 'Benko Gambit'],
    ['budapest', 'A51', 'A52', 'Budapest'],
    ['muzio', 'C37', 'C37', 'Muzio'],
    ['nimzo', 'E20', 'E59', 'Nimzo-Indian'],
    ['kings-indian', 'E60', 'E99', "King's Indian Defense"],
    ['queens-indian', 'E12', 'E19', "Queen's Indian Defense"],
    ['grunfeld', 'D70', 'D99', 'Grünfeld'],
    ['sicilian', 'B20', 'B99', 'Sicilian Defense'],
    ['french', 'C00', 'C19', 'French Defense'],
    ['caro', 'B10', 'B19', 'Caro-Kann'],
    ['alekhine', 'B02', 'B05', 'Alekhine'],
    ['scandinavian', 'B01', 'B01', 'Scandinavian'],
    ['slav', 'D10', 'D19', 'Slav Defense'],
  ] as const)('%s: lines exist, all inside %s–%s and the family', (id, from, to, name) => {
    const section = DRILL_SECTIONS.find((s) => s.id === id)!;
    const entries = book.filterEntries(section.filter);
    expect(sectionLineCount(book, section)).toBe(entries.length);
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) {
      expect(e.eco >= from && e.eco <= to, `${e.eco} ${e.name}`).toBe(true);
      if (name) expect(e.name, e.eco).toContain(name);
    }
  });

  it('has the expected line counts for the gambits (lichess book, commit 3ba6b20)', () => {
    const count = (id: string) => sectionLineCount(book, DRILL_SECTIONS.find((s) => s.id === id)!);
    expect(count('kings-gambit')).toBe(191); // the main line + 137 accepted + 53 declined
    expect(count('muzio')).toBe(11);
    expect(count('benko')).toBe(24);
  });

  it.each([
    ['kings-gambit', '1. e4 e5 2. f4', "King's Gambit"],
    ['queens-gambit', '1. d4 d5 2. c4', "Queen's Gambit"],
    ['evans', '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. b4', 'Italian Game: Evans Gambit'],
    ['benko', '1. d4 Nf6 2. c4 c5 3. d5 b5', 'Benko Gambit'],
    ['budapest', '1. d4 Nf6 2. c4 e5', 'Indian Defense: Budapest Gambit'],
    ['muzio', '1. e4 e5 2. f4 exf4 3. Nf3 g5 4. Bc4 g4 5. O-O', "King's Gambit Accepted: Muzio Gambit"],
  ] as const)('%s: the defining moves are book moves inside the section', (id, pgn, opening) => {
    const section = DRILL_SECTIONS.find((s) => s.id === id)!;
    const moves = board.parsePgn(`${pgn} *`).moves;
    let fen = START_FEN;
    for (const m of moves) {
      const options = book.movesAt(fen, section.filter).map((b) => b.uci);
      expect(options, `${m.san} after ${fen}`).toContain(m.uci);
      fen = m.fenAfter;
    }
    expect(book.openingAt(fen)?.name.startsWith(opening)).toBe(true);
  });
});

describe('trainer line generation for the new sections (real book)', () => {
  /** Plays a whole line: the user always picks the most popular book move of the section. */
  function playOut(sectionId: string, random: number) {
    const section = DRILL_SECTIONS.find((s) => s.id === sectionId)!;
    const drill = new DrillManager({ getBook: () => book, board, onLine: () => undefined, random: () => random, replyDelayMs: 0 });
    drill.start({ sectionId, userColor: section.defaultColor, maxMoves: 30 });
    for (let guard = 0; guard < 60 && drill.getState().status === 'playing'; guard++) {
      const move = drill.bookMoves()[0];
      expect(move, `no book move in ${sectionId} at ${drill.getState().fen}`).toBeDefined();
      expect(drill.tryMove(move!.uci)).toBe(true);
    }
    return { state: drill.getState(), section };
  }

  it.each(['kings-gambit', 'queens-gambit', 'evans', 'benko', 'budapest', 'muzio', 'nimzo', 'grunfeld', 'scandinavian'])(
    '%s: a full line stays in the section and ends with the book',
    (id) => {
      for (const random of [0, 0.5, 0.99]) {
        const { state, section } = playOut(id, random);
        expect(state.status).toBe('finished');
        expect(state.stats.errors).toBe(0);
        expect(state.message?.key).toMatch(/^drill\.msg\.lineOver/);
        // The finished line is one of the section's named lines.
        const names = new Set(book.filterEntries(section.filter).map((e) => e.name));
        expect(names.has(book.openingAt(state.fen)!.name), `${id}: ${book.openingAt(state.fen)?.name}`).toBe(true);
      }
    },
  );
});
