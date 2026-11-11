import { Store } from './observable';
import { loadOpeningBook, type BookMove, type OpeningBook, type OpeningEntry, type OpeningFilter } from './openings';
import type { GameMove } from '../services/board.service';

export interface ExplorerState {
  readonly status: 'idle' | 'loading' | 'ready' | 'error';
  readonly error: string | null;
  readonly filter: OpeningFilter;
}

export interface PositionOpening {
  readonly opening: OpeningEntry | null;
  readonly inBook: boolean;
}

/** Holds the lazily loaded opening book and the explorer filter. */
export class OpeningExplorer extends Store<ExplorerState> {
  private book: OpeningBook | null = null;
  private readonly readyListeners: ((book: OpeningBook) => void)[] = [];

  constructor(private readonly loader: () => Promise<OpeningBook> = loadOpeningBook) {
    super({ status: 'idle', error: null, filter: {} });
  }

  load(): Promise<OpeningBook | null> {
    if (this.book) return Promise.resolve(this.book);
    this.setState({ status: 'loading' });
    return this.loader().then(
      (book) => {
        this.book = book;
        this.setState({ status: 'ready', error: null });
        for (const l of this.readyListeners) l(book);
        return book;
      },
      (e: unknown) => {
        this.setState({ status: 'error', error: e instanceof Error ? e.message : String(e) });
        return null;
      },
    );
  }

  getBook(): OpeningBook | null {
    return this.book;
  }

  onReady(listener: (book: OpeningBook) => void): void {
    if (this.book) listener(this.book);
    else this.readyListeners.push(listener);
  }

  setFilter(patch: Partial<OpeningFilter>): void {
    this.setState((s) => ({ filter: { ...s.filter, ...patch } }));
  }

  resetFilter(filter: OpeningFilter = {}): void {
    this.setState({ filter });
  }

  movesAt(fen: string): BookMove[] {
    return this.book?.movesAt(fen, this.getState().filter) ?? [];
  }

  describe(fen: string): PositionOpening {
    if (!this.book) return { opening: null, inBook: false };
    return { opening: this.book.openingAt(fen), inBook: this.book.inBook(fen) };
  }

  /** Plies of a game whose move was a book move from a book position. */
  bookPlies(moves: readonly GameMove[]): ReadonlySet<number> {
    const set = new Set<number>();
    if (!this.book) return set;
    for (const m of moves) {
      if (!this.book.isBookMove(m.fenBefore, m.uci)) break;
      set.add(m.ply);
    }
    return set;
  }
}
