import type { Square, PieceSymbol } from 'chess.js';
import type { Color } from '../../src/core/types';

export interface PlacedPiece {
  readonly color: Color;
  readonly type: PieceSymbol;
}

export type Placement = ReadonlyMap<Square, PlacedPiece>;

export interface BoardSnapshot {
  readonly fen: string;
  /** Colour shown at the bottom of the board. */
  readonly orientation: Color;
  /** The user's colour in a bot game; null on analysis boards (hints always apply). */
  readonly myColor: Color | null;
  readonly boardEl: HTMLElement;
}

export interface Platform {
  readonly id: 'chesscom' | 'lichess';
  /** Host check only — cheap, used to pick the parser. */
  matchesHost(hostname: string): boolean;
  /**
   * Fair-play gate. Returns true only on pages where engine help is allowed:
   * analysis boards and games against bots. Live games against people always return false.
   */
  isAllowedPage(location: Pick<Location, 'pathname'>, doc: Document): boolean;
  read(doc: Document): BoardSnapshot | null;
  /** Board element as "tag#id" for diagnostics (why a page was refused), or null without a board. */
  describeBoard(doc: Document): string | null;
}
