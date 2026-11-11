import type { Color } from './types';

/** One named line from lichess-org/chess-openings. */
export interface OpeningEntry {
  readonly index: number;
  readonly eco: string;
  readonly name: string;
  /** Part of the name before ":" — "Sicilian Defense", "King's Gambit Accepted". */
  readonly family: string;
  readonly uci: readonly string[];
  readonly san: readonly string[];
  /** Side that made the line's last (defining) move: whose choice this opening is. */
  readonly color: Color;
}

/** Serialized graph produced by scripts/build-openings.mjs. */
export interface OpeningBookData {
  readonly startId: number;
  /** Position keys: "placement side castling". */
  readonly positions: readonly string[];
  /** [eco, name, uci moves, san moves, position ids along the line (incl. start)] */
  readonly entries: readonly (readonly [string, string, string, string, readonly number[]])[];
}

export interface BookMove {
  readonly uci: string;
  readonly san: string;
  /** Opening name at the resulting position (own or inherited). */
  readonly opening: OpeningEntry | null;
  /** Number of named lines continuing through this move (after filtering). */
  readonly lines: number;
}

export interface OpeningFilter {
  /** Inclusive ECO range, e.g. "E00".."E99". */
  readonly ecoFrom?: string;
  readonly ecoTo?: string;
  /** Case-insensitive substring of the name; Russian keywords are mapped to English names. */
  readonly query?: string;
  /** Whose choice the opening is: 'w' = White's system/gambit, 'b' = Black's defence. */
  readonly color?: Color | null;
}

interface Node {
  /** Entry whose line ends exactly here. */
  own: number | null;
  /** Deepest named prefix on some line through here (used when `own` is null). */
  inherited: number | null;
  /** uci → resulting position key and SAN */
  readonly children: Map<string, { readonly key: string; readonly san: string }>;
  /** Entries passing through this position (including ending here). */
  readonly through: number[];
}

/**
 * Positions are keyed without the en-passant field: chess.js, lichess and the DOM
 * reader disagree on when to emit it, and it never distinguishes two opening names.
 */
export function positionKey(fen: string): string {
  return fen.split(' ').slice(0, 3).join(' ');
}

/** Russian search words → substrings of the English opening names. */
const RU_ALIASES: readonly (readonly [string, string])[] = [
  ['индийск', 'indian'],
  ['гамбит', 'gambit'],
  ['сицилиан', 'sicilian'],
  ['французск', 'french'],
  ['каро', 'caro-kann'],
  ['славянск', 'slav'],
  ['ферзев', "queen's"],
  ['королевск', "king's"],
  ['испанск', 'ruy lopez'],
  ['итальянск', 'italian'],
  ['английск', 'english'],
  ['голландск', 'dutch'],
  ['грюнфельд', 'grünfeld'],
  ['нимцович', 'nimzo'],
  ['эванс', 'evans'],
  ['муцио', 'muzio'],
  ['бенони', 'benoni'],
  ['скандинавск', 'scandinavian'],
  ['пирц', 'pirc'],
  ['алехин', 'alekhine'],
  ['лондон', 'london'],
  ['каталон', 'catalan'],
];

export function normalizeQuery(query: string): string {
  let q = query.trim().toLowerCase();
  for (const [ru, en] of RU_ALIASES) if (q.includes(ru)) q = en;
  return q;
}

export class OpeningBook {
  readonly entries: readonly OpeningEntry[];
  private readonly nodes = new Map<string, Node>();
  private readonly filterCache = new Map<string, ReadonlySet<number>>();

  private constructor(entries: OpeningEntry[], paths: readonly (readonly string[])[]) {
    this.entries = entries;
    // Shorter lines first, so `inherited` ends up being the deepest named prefix.
    const order = entries.map((e) => e.index).sort((a, b) => (paths[a]?.length ?? 0) - (paths[b]?.length ?? 0));
    for (const i of order) {
      const path = paths[i]!;
      const entry = entries[i]!;
      let lastNamed: number | null = null;
      path.forEach((key, ply) => {
        const node = this.node(key);
        node.through.push(i);
        if (ply === path.length - 1) node.own ??= i;
        if (node.own !== null) lastNamed = node.own;
        else node.inherited ??= lastNamed;
        const next = path[ply + 1];
        const uci = entry.uci[ply];
        if (next && uci && !node.children.has(uci)) node.children.set(uci, { key: next, san: entry.san[ply]! });
      });
    }
  }

  static fromData(data: OpeningBookData): OpeningBook {
    const entries: OpeningEntry[] = [];
    const paths: string[][] = [];
    data.entries.forEach(([eco, name, uci, san, path], index) => {
      const uciMoves = uci.split(' ');
      entries.push(makeEntry(index, eco, name, uciMoves, san.split(' ')));
      paths.push(path.map((id) => data.positions[id]!));
    });
    return new OpeningBook(entries, paths);
  }

  /**
   * Builds a book from lines whose positions are computed by the caller
   * (used by tests with a small fixed tree).
   */
  static fromLines(lines: readonly { eco: string; name: string; uci: readonly string[]; san: readonly string[]; fens: readonly string[] }[]): OpeningBook {
    const entries = lines.map((l, i) => makeEntry(i, l.eco, l.name, l.uci, l.san));
    return new OpeningBook(entries, lines.map((l) => l.fens.map(positionKey)));
  }

  /** True if the position occurs in any book line. */
  inBook(fen: string): boolean {
    return this.nodes.has(positionKey(fen));
  }

  /** Name of the position: its own line, else the deepest named prefix leading here. */
  openingAt(fen: string): OpeningEntry | null {
    const node = this.nodes.get(positionKey(fen));
    if (!node) return null;
    const i = node.own ?? node.inherited;
    return i === null ? null : (this.entries[i] ?? null);
  }

  isBookMove(fen: string, uci: string): boolean {
    return this.nodes.get(positionKey(fen))?.children.has(uci) ?? false;
  }

  /** Book continuations from a position, most popular (by number of named lines) first. */
  movesAt(fen: string, filter: OpeningFilter = {}): BookMove[] {
    const node = this.nodes.get(positionKey(fen));
    if (!node) return [];
    const allowed = this.matching(filter);
    const result: BookMove[] = [];
    for (const [uci, child] of node.children) {
      const childNode = this.nodes.get(child.key);
      if (!childNode) continue;
      const lines = childNode.through.filter((i) => allowed.has(i)).length;
      if (lines === 0) continue;
      const opening = childNode.own ?? childNode.inherited;
      result.push({ uci, san: child.san, opening: opening === null ? null : (this.entries[opening] ?? null), lines });
    }
    return result.sort((a, b) => b.lines - a.lines || a.san.localeCompare(b.san));
  }

  /** Entries matching a filter (by ECO range, name and colour). */
  filterEntries(filter: OpeningFilter): OpeningEntry[] {
    const set = this.matching(filter);
    return this.entries.filter((e) => set.has(e.index));
  }

  private matching(filter: OpeningFilter): ReadonlySet<number> {
    const key = JSON.stringify([filter.ecoFrom ?? '', filter.ecoTo ?? '', filter.query ?? '', filter.color ?? '']);
    const cached = this.filterCache.get(key);
    if (cached) return cached;
    const q = filter.query ? normalizeQuery(filter.query) : '';
    const from = filter.ecoFrom?.toUpperCase() ?? '';
    const to = filter.ecoTo?.toUpperCase() ?? '';
    const set = new Set<number>();
    for (const e of this.entries) {
      if (from && e.eco < from) continue;
      if (to && e.eco > to) continue;
      if (q && !e.name.toLowerCase().includes(q)) continue;
      if (filter.color && e.color !== filter.color) continue;
      set.add(e.index);
    }
    this.filterCache.set(key, set);
    return set;
  }

  private node(key: string): Node {
    let node = this.nodes.get(key);
    if (!node) {
      node = { own: null, inherited: null, children: new Map(), through: [] };
      this.nodes.set(key, node);
    }
    return node;
  }
}

function makeEntry(index: number, eco: string, name: string, uci: readonly string[], san: readonly string[]): OpeningEntry {
  return {
    index,
    eco,
    name,
    family: name.split(':')[0]!.trim(),
    uci,
    san,
    color: uci.length % 2 === 1 ? 'w' : 'b',
  };
}

let loading: Promise<OpeningBook> | null = null;

/** Loads the bundled book lazily (separate chunk) and caches it. */
export function loadOpeningBook(): Promise<OpeningBook> {
  loading ??= import('../data/openings/openings.json').then((m) => OpeningBook.fromData(parseBookData(m.default)));
  return loading;
}

/** Shape check for the bundled JSON (a malformed build should fail loudly, not render garbage). */
export function parseBookData(raw: unknown): OpeningBookData {
  const d = raw as Partial<Record<keyof OpeningBookData, unknown>>;
  const ok =
    typeof raw === 'object' &&
    raw !== null &&
    typeof d.startId === 'number' &&
    Array.isArray(d.positions) &&
    Array.isArray(d.entries) &&
    d.entries.every((e: unknown) => Array.isArray(e) && e.length === 5 && Array.isArray(e[4]));
  if (!ok) throw new Error('Бандл дебютов повреждён: пересоберите его (npm run build-openings)');
  return raw as OpeningBookData;
}

/** Opening context of a move for the move explainer (null when the game is already out of book). */
export function openingContext(
  book: OpeningBook,
  board: { applyUci(fen: string, uci: string): { fen: string } | null },
  fenBefore: string,
  uci: string,
): { name: string; eco: string; inBook: boolean; moveNumber: number } | null {
  if (!book.inBook(fenBefore)) return null;
  const inBook = book.isBookMove(fenBefore, uci);
  const after = inBook ? board.applyUci(fenBefore, uci) : null;
  const op = (after ? book.openingAt(after.fen) : null) ?? book.openingAt(fenBefore);
  if (!op) return null;
  return { name: op.name, eco: op.eco, inBook, moveNumber: Number(fenBefore.split(' ')[5] ?? '1') || 1 };
}
