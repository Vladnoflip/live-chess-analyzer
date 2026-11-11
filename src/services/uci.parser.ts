import { MATED_CP, type Score } from '../core/types';

/** Raw `info` line, score still from the side-to-move's perspective (as UCI defines it). */
export interface RawInfo {
  depth: number;
  selDepth?: number;
  multiPv: number;
  score: Score;
  bound?: 'lower' | 'upper';
  nodes?: number;
  nps?: number;
  timeMs?: number;
  pv: string[];
}

export type UciMessage =
  | { type: 'uciok' }
  | { type: 'readyok' }
  | { type: 'id'; key: 'name' | 'author'; value: string }
  | { type: 'info'; info: RawInfo }
  | { type: 'bestmove'; move: string | null; ponder: string | null }
  | { type: 'other'; line: string };

const NUMERIC_FIELDS: Record<string, 'depth' | 'selDepth' | 'multiPv' | 'nodes' | 'nps' | 'timeMs'> = {
  depth: 'depth',
  seldepth: 'selDepth',
  multipv: 'multiPv',
  nodes: 'nodes',
  nps: 'nps',
  time: 'timeMs',
};

/**
 * Parses a single line of UCI engine output.
 *
 * `info` lines are only returned when they carry both a score and a PV — Stockfish
 * also emits `info depth N currmove ...` progress lines and `info string ...`
 * diagnostics, which are useless for display and are reported as `other`.
 */
export function parseUciLine(raw: string): UciMessage {
  const line = raw.trim();
  if (line === 'uciok') return { type: 'uciok' };
  if (line === 'readyok') return { type: 'readyok' };

  const tokens = line.split(/\s+/);
  const head = tokens[0];

  if (head === 'id' && (tokens[1] === 'name' || tokens[1] === 'author')) {
    return { type: 'id', key: tokens[1], value: tokens.slice(2).join(' ') };
  }

  if (head === 'bestmove') {
    // "bestmove (none)" is sent for positions with no legal moves (mate/stalemate).
    const move = tokens[1] && tokens[1] !== '(none)' ? tokens[1] : null;
    const ponderIdx = tokens.indexOf('ponder');
    const ponder = ponderIdx > 0 ? (tokens[ponderIdx + 1] ?? null) : null;
    return { type: 'bestmove', move, ponder };
  }

  if (head === 'info') {
    const info = parseInfo(tokens);
    return info ? { type: 'info', info } : { type: 'other', line };
  }

  return { type: 'other', line };
}

function parseInfo(tokens: string[]): RawInfo | null {
  if (tokens[1] === 'string') return null;

  const partial: Partial<RawInfo> & { multiPv: number } = { multiPv: 1 };
  let i = 1;
  while (i < tokens.length) {
    const key = tokens[i] ?? '';
    const numericField = NUMERIC_FIELDS[key];
    if (numericField) {
      partial[numericField] = Number(tokens[i + 1]);
      i += 2;
      continue;
    }
    if (key === 'score') {
      // score cp <x> [lowerbound|upperbound]  |  score mate <y> [lowerbound|upperbound]
      const kind = tokens[i + 1];
      const value = Number(tokens[i + 2]);
      if ((kind === 'cp' || kind === 'mate') && Number.isFinite(value)) {
        partial.score = { kind, value };
      }
      i += 3;
      const maybeBound = tokens[i];
      if (maybeBound === 'lowerbound' || maybeBound === 'upperbound') {
        partial.bound = maybeBound === 'lowerbound' ? 'lower' : 'upper';
        i++;
      }
      continue;
    }
    if (key === 'pv') {
      // pv is always the last field: every remaining token is a move.
      partial.pv = tokens.slice(i + 1);
      break;
    }
    if (key === 'wdl') {
      i += 4;
      continue;
    }
    // Other single-value fields we don't use: hashfull, tbhits, currmove, currmovenumber, cpuload.
    i += 2;
  }

  if (partial.depth === undefined || !partial.score) return null;
  // Terminal positions report "info depth 0 score mate 0" with no pv — keep them.
  return { ...partial, depth: partial.depth, score: partial.score, pv: partial.pv ?? [] };
}

export { MATED_CP };

/** Flips a score from side-to-move POV to White POV. */
export function toWhitePov(score: Score, sideToMove: 'w' | 'b'): Score {
  const sign = sideToMove === 'w' ? 1 : -1;
  if (score.kind === 'mate' && score.value === 0) {
    // Side to move is checkmated.
    return { kind: 'cp', value: -sign * MATED_CP };
  }
  return { kind: score.kind, value: sign * score.value };
}
