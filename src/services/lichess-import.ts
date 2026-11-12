/**
 * Optional import of a player's recent games from the public lichess API.
 *
 * This is the ONLY network request in the web app, and it is only sent when the user
 * presses the import button. The extension never includes this module (it has no
 * button for it and no host permission is added for it).
 */

export const LICHESS_API = 'https://lichess.org/api/games/user';
export const LICHESS_MAX_GAMES = 10;

/** lichess usernames: 2–30 letters, digits, '_' or '-'. */
const USERNAME = /^[A-Za-z0-9][A-Za-z0-9_-]{1,29}$/;

export interface LichessGame {
  readonly id: string;
  readonly white: string;
  readonly black: string;
  /** "1-0", "0-1", "½-½" or "*". */
  readonly result: string;
  /** Milliseconds since the epoch. */
  readonly createdAt: number;
  /** bullet, blitz, rapid, classical, correspondence… */
  readonly speed: string;
  readonly pgn: string;
}

export type LichessErrorCode = 'invalidUser' | 'notFound' | 'rateLimited' | 'network' | 'badResponse' | 'noGames';

export class LichessImportError extends Error {
  constructor(
    readonly code: LichessErrorCode,
    detail = '',
  ) {
    super(`lichess import failed: ${code}${detail ? ` (${detail})` : ''}`);
  }
}

export function isValidLichessUsername(name: string): boolean {
  return USERNAME.test(name.trim());
}

export function lichessGamesUrl(username: string, max = LICHESS_MAX_GAMES): string {
  return `${LICHESS_API}/${encodeURIComponent(username.trim())}?max=${max}&pgnInJson=true`;
}

type FetchLike = (url: string, init: { headers: Record<string, string>; signal?: AbortSignal }) => Promise<{
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
}>;

/** Downloads the user's last games (newest first). */
export async function fetchLichessGames(
  username: string,
  options: { fetchImpl?: FetchLike; signal?: AbortSignal; max?: number } = {},
): Promise<LichessGame[]> {
  if (!isValidLichessUsername(username)) throw new LichessImportError('invalidUser');
  const doFetch: FetchLike = options.fetchImpl ?? ((url, init) => fetch(url, init));
  let response: Awaited<ReturnType<FetchLike>>;
  try {
    response = await doFetch(lichessGamesUrl(username, options.max), {
      headers: { Accept: 'application/x-ndjson' },
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new LichessImportError('network', e instanceof Error ? e.message : String(e));
  }
  if (response.status === 404) throw new LichessImportError('notFound');
  if (response.status === 429) throw new LichessImportError('rateLimited');
  if (!response.ok) throw new LichessImportError('badResponse', `HTTP ${response.status}`);
  const games = parseLichessNdjson(await response.text());
  if (games.length === 0) throw new LichessImportError('noGames');
  return games;
}

/** Parses the NDJSON body (one game per line); lines without a PGN are skipped. */
export function parseLichessNdjson(body: string): LichessGame[] {
  const games: LichessGame[] = [];
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    let data: unknown;
    try {
      data = JSON.parse(line);
    } catch {
      throw new LichessImportError('badResponse', 'invalid JSON');
    }
    const game = toGame(data);
    if (game) games.push(game);
  }
  return games;
}

function toGame(data: unknown): LichessGame | null {
  if (!isRecord(data) || typeof data.pgn !== 'string' || typeof data.id !== 'string') return null;
  const players = isRecord(data.players) ? data.players : {};
  return {
    id: data.id,
    white: playerName(players.white),
    black: playerName(players.black),
    result: data.winner === 'white' ? '1-0' : data.winner === 'black' ? '0-1' : data.status === 'draw' || data.status === 'stalemate' ? '½-½' : '*',
    createdAt: typeof data.createdAt === 'number' ? data.createdAt : 0,
    speed: typeof data.speed === 'string' ? data.speed : '',
    pgn: data.pgn,
  };
}

function playerName(p: unknown): string {
  if (!isRecord(p)) return '?';
  if (isRecord(p.user) && typeof p.user.name === 'string') return p.user.name;
  if (typeof p.aiLevel === 'number') return `Stockfish level ${p.aiLevel}`;
  return 'Anonymous';
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}
