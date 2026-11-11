import { Chess, DEFAULT_POSITION, validateFen, type Square, type PieceSymbol } from 'chess.js';
import type { Color } from '../core/types';

export const START_FEN = DEFAULT_POSITION;

export type FenValidation = { readonly ok: true; readonly fen: string } | { readonly ok: false; readonly error: string };

export interface BoardPiece {
  readonly square: Square;
  readonly type: PieceSymbol;
  readonly color: Color;
}

export interface LegalMove {
  readonly from: Square;
  readonly to: Square;
  readonly san: string;
  readonly uci: string;
  readonly promotion?: PieceSymbol;
}

export interface GameMove {
  /** 1-based half-move index within the loaded game. */
  readonly ply: number;
  readonly san: string;
  readonly uci: string;
  readonly color: Color;
  readonly fenBefore: string;
  readonly fenAfter: string;
}

export interface ParsedGame {
  readonly startFen: string;
  readonly moves: readonly GameMove[];
  readonly headers: Readonly<Record<string, string>>;
}

export type GameStatus = 'ongoing' | 'checkmate' | 'stalemate' | 'draw';

const UCI_RE = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/;

/**
 * Position-level chess logic: FEN parsing/validation, legal move generation,
 * SAN/UCI conversion, PGN parsing. Stateless — every call works on a FEN string.
 */
export class BoardService {
  /** Validates a FEN, normalising surrounding whitespace. Also rejects positions chess.js accepts but no engine should see. */
  validate(input: string): FenValidation {
    const fen = input.trim().replace(/\s+/g, ' ');
    if (fen.length === 0) return { ok: false, error: 'Пустой FEN' };

    const basic = validateFen(fen);
    if (!basic.ok) {
      const detail = (basic.error ?? '').replace(/^Invalid FEN:\s*/i, '');
      return { ok: false, error: detail ? `Некорректный FEN: ${detail}` : 'Некорректный FEN' };
    }

    const placement = fen.split(' ')[0] ?? '';
    const whiteKings = countChar(placement, 'K');
    const blackKings = countChar(placement, 'k');
    if (whiteKings !== 1 || blackKings !== 1) {
      return { ok: false, error: 'У каждой стороны должен быть ровно один король' };
    }

    const ranks = placement.split('/');
    if (/[pP]/.test(ranks[0] ?? '') || /[pP]/.test(ranks[7] ?? '')) {
      return { ok: false, error: 'Пешки не могут стоять на 1-й или 8-й горизонтали' };
    }

    // The side NOT to move must not be in check — otherwise the king could be captured.
    const flipped = fen.replace(/ ([wb]) /, (_m, side: string) => ` ${side === 'w' ? 'b' : 'w'} `).replace(
      /^(\S+ \S+ \S+) \S+/,
      '$1 -',
    );
    try {
      if (new Chess(flipped).inCheck()) {
        return { ok: false, error: 'Король стороны, которая не ходит, находится под шахом' };
      }
    } catch {
      return { ok: false, error: 'Некорректный FEN' };
    }

    return { ok: true, fen };
  }

  isValid(fen: string): boolean {
    return this.validate(fen).ok;
  }

  turn(fen: string): Color {
    return fen.split(' ')[1] === 'b' ? 'b' : 'w';
  }

  pieces(fen: string): BoardPiece[] {
    const result: BoardPiece[] = [];
    for (const row of new Chess(fen).board()) {
      for (const cell of row) {
        if (cell) result.push({ square: cell.square, type: cell.type, color: cell.color });
      }
    }
    return result;
  }

  legalMoves(fen: string, from?: Square): LegalMove[] {
    const chess = new Chess(fen);
    const moves = from ? chess.moves({ verbose: true, square: from }) : chess.moves({ verbose: true });
    return moves.map((m) => ({
      from: m.from,
      to: m.to,
      san: m.san,
      uci: m.lan,
      ...(m.promotion ? { promotion: m.promotion } : {}),
    }));
  }

  /** Plays a UCI move. Returns null if illegal. */
  applyUci(fen: string, uci: string): { fen: string; san: string } | null {
    const m = UCI_RE.exec(uci);
    if (!m) return null;
    const chess = new Chess(fen);
    try {
      const move = chess.move({ from: m[1] as Square, to: m[2] as Square, promotion: m[3] });
      return { fen: chess.fen(), san: move.san };
    } catch {
      return null;
    }
  }

  uciToSan(fen: string, uci: string): string | null {
    return this.applyUci(fen, uci)?.san ?? null;
  }

  /** Converts a UCI line (engine PV) to SAN, stopping at the first illegal move. */
  uciLineToSan(fen: string, line: readonly string[], maxMoves = Infinity): string[] {
    const sans: string[] = [];
    let current = fen;
    for (const uci of line) {
      if (sans.length >= maxMoves) break;
      const next = this.applyUci(current, uci);
      if (!next) break;
      sans.push(next.san);
      current = next.fen;
    }
    return sans;
  }

  status(fen: string): GameStatus {
    const chess = new Chess(fen);
    if (chess.isCheckmate()) return 'checkmate';
    if (chess.isStalemate()) return 'stalemate';
    if (chess.isInsufficientMaterial() || chess.isDrawByFiftyMoves()) return 'draw';
    return 'ongoing';
  }

  /** Parses a PGN (first game only). Throws with a readable message on malformed input. */
  parsePgn(pgn: string): ParsedGame {
    const chess = new Chess();
    try {
      chess.loadPgn(pgn.trim());
    } catch (e) {
      throw new Error(`Не удалось разобрать PGN: ${e instanceof Error ? e.message : String(e)}`);
    }
    const headers = chess.getHeaders();
    const history = chess.history({ verbose: true });
    const startFen = history[0]?.before ?? chess.fen();
    const moves: GameMove[] = history.map((m, i) => ({
      ply: i + 1,
      san: m.san,
      uci: m.lan,
      color: m.color,
      fenBefore: m.before,
      fenAfter: m.after,
    }));
    return { startFen, moves, headers };
  }

  /** Material consequences of a move: its own exchange on the target square and what it leaves en prise. */
  tactics(fen: string, uci: string): TacticalSummary | null {
    const m = UCI_RE.exec(uci);
    if (!m) return null;
    const chess = new Chess(fen);
    let move;
    try {
      move = chess.move({ from: m[1] as Square, to: m[2] as Square, promotion: m[3] });
    } catch {
      return null;
    }
    const captured = move.captured ? PIECE_VALUE[move.captured] : 0;
    const promo = move.promotion ? PIECE_VALUE[move.promotion] - PIECE_VALUE.p : 0;
    const moveSee = captured + promo - exchangeGain(chess, move.to);

    let opponentBestCapture = 0;
    for (const c of chess.moves({ verbose: true })) {
      if (!c.captured) continue;
      chess.move(c);
      const gain = PIECE_VALUE[c.captured] - exchangeGain(chess, c.to);
      chess.undo();
      opponentBestCapture = Math.max(opponentBestCapture, gain);
    }
    return { moveSee, opponentBestCapture, sacrificed: Math.max(-moveSee, opponentBestCapture) };
  }

  kingSafety(fen: string, color: Color): KingSafety {
    const chess = new Chess(fen);
    const king = chess.findPiece({ type: 'k', color })[0];
    if (!king) return { zoneAttacks: 0 };
    const enemy: Color = color === 'w' ? 'b' : 'w';
    const f = king.charCodeAt(0) - 97;
    const r = Number(king[1]);
    let zoneAttacks = 0;
    for (let df = -1; df <= 1; df++) {
      for (let dr = -1; dr <= 1; dr++) {
        const ff = f + df;
        const rr = r + dr;
        if (ff < 0 || ff > 7 || rr < 1 || rr > 8) continue;
        zoneAttacks += chess.attackers(`${'abcdefgh'[ff]}${rr}` as Square, enemy).length;
      }
    }
    return { zoneAttacks };
  }

  /** Mobility of the moved piece before and after the move. */
  pieceMobility(fen: string, uci: string): MobilityChange | null {
    const m = UCI_RE.exec(uci);
    if (!m) return null;
    const before = new Chess(fen);
    const pieceBefore = before.moves({ square: m[1] as Square }).length;
    const applied = this.applyUci(fen, uci);
    if (!applied) return null;
    // Count the moved piece's moves as if it were its turn again; impossible if it gives check.
    const flipped = applied.fen.replace(/ ([wb]) (\S+) \S+ /, (_s, side: string, castle: string) => ` ${side === 'w' ? 'b' : 'w'} ${castle} - `);
    try {
      const after = new Chess(flipped);
      return { pieceBefore, pieceAfter: after.moves({ square: m[2] as Square }).length };
    } catch {
      return null;
    }
  }
}

function countChar(s: string, ch: string): number {
  let n = 0;
  for (const c of s) if (c === ch) n++;
  return n;
}

export const boardService = new BoardService();

export const PIECE_VALUE: Readonly<Record<PieceSymbol, number>> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20_000 };

/**
 * Static exchange evaluation: best material gain for the side to move from capturing
 * on `square` (≥ 0), always recapturing with the least valuable piece. Uses legal moves,
 * so pins are respected.
 */
function exchangeGain(chess: Chess, square: Square): number {
  const target = chess.get(square);
  if (!target) return 0;
  const capture = chess
    .moves({ verbose: true })
    .filter((m) => m.to === square)
    .sort((a, b) => PIECE_VALUE[a.piece] - PIECE_VALUE[b.piece])[0];
  if (!capture) return 0;
  chess.move(capture);
  const promo = capture.promotion ? PIECE_VALUE[capture.promotion] - PIECE_VALUE.p : 0;
  // The capturer may stop the exchange at any point, hence max(0, …).
  const gain = Math.max(0, PIECE_VALUE[target.type] + promo - exchangeGain(chess, square));
  chess.undo();
  return gain;
}

export interface TacticalSummary {
  /** Exchange result of the move on its destination square (negative = the moved piece is lost). */
  readonly moveSee: number;
  /** Largest material gain the opponent has from any capture right after the move. */
  readonly opponentBestCapture: number;
  /** Material the move puts at risk: max(-moveSee, opponentBestCapture). */
  readonly sacrificed: number;
}

export interface KingSafety {
  /** Number of enemy attacks on the king's square and its neighbours. */
  readonly zoneAttacks: number;
}

export interface MobilityChange {
  readonly pieceBefore: number;
  readonly pieceAfter: number;
}
