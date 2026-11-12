import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  LichessImportError,
  fetchLichessGames,
  isValidLichessUsername,
  lichessGamesUrl,
  parseLichessNdjson,
} from '../src/services/lichess-import';
import { BoardService } from '../src/services/board.service';

const GAME_1 = {
  id: 'abcd1234',
  createdAt: 1762900000000,
  speed: 'blitz',
  status: 'mate',
  winner: 'white',
  players: { white: { user: { name: 'alice' } }, black: { user: { name: 'bob' } } },
  pgn: '[Event "Rated blitz game"]\n[White "alice"]\n[Black "bob"]\n[Result "1-0"]\n\n1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0\n',
};
const GAME_2 = {
  id: 'efgh5678',
  createdAt: 1762800000000,
  speed: 'rapid',
  status: 'draw',
  players: { white: { aiLevel: 3 }, black: { user: { name: 'alice' } } },
  pgn: '1. d4 d5 1/2-1/2',
};
const BODY = `${JSON.stringify(GAME_1)}\n${JSON.stringify(GAME_2)}\n`;

function fakeFetch(status: number, body: string) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const impl = async (url: string, init: { headers: Record<string, string> }) => {
    calls.push({ url, headers: init.headers });
    return { ok: status >= 200 && status < 300, status, text: async () => body };
  };
  return { impl, calls };
}

describe('lichess import (web app only)', () => {
  it('builds the documented API URL', () => {
    expect(lichessGamesUrl('alice')).toBe('https://lichess.org/api/games/user/alice?max=10&pgnInJson=true');
  });

  it('validates usernames before any request', async () => {
    expect(isValidLichessUsername('alice_99')).toBe(true);
    expect(isValidLichessUsername('a')).toBe(false);
    expect(isValidLichessUsername('bad name')).toBe(false);
    expect(isValidLichessUsername('../admin')).toBe(false);
    const { impl, calls } = fakeFetch(200, BODY);
    await expect(fetchLichessGames('no spaces please', { fetchImpl: impl })).rejects.toMatchObject({ code: 'invalidUser' });
    expect(calls).toHaveLength(0);
  });

  it('requests NDJSON and parses players, result, speed and PGN', async () => {
    const { impl, calls } = fakeFetch(200, BODY);
    const games = await fetchLichessGames('alice', { fetchImpl: impl });
    expect(calls).toEqual([{ url: lichessGamesUrl('alice'), headers: { Accept: 'application/x-ndjson' } }]);
    expect(games).toHaveLength(2);
    expect(games[0]).toMatchObject({ id: 'abcd1234', white: 'alice', black: 'bob', result: '1-0', speed: 'blitz' });
    expect(games[1]).toMatchObject({ white: 'Stockfish level 3', black: 'alice', result: '½-½' });
    // The PGN loads in the analyzer.
    const parsed = new BoardService().parsePgn(games[0]!.pgn);
    expect(parsed.moves.map((m) => m.san)).toEqual(['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#']);
  });

  it('maps HTTP errors to readable codes', async () => {
    for (const [status, code] of [
      [404, 'notFound'],
      [429, 'rateLimited'],
      [500, 'badResponse'],
    ] as const) {
      await expect(fetchLichessGames('alice', { fetchImpl: fakeFetch(status, '').impl })).rejects.toMatchObject({ code });
    }
    await expect(fetchLichessGames('alice', { fetchImpl: fakeFetch(200, '').impl })).rejects.toMatchObject({ code: 'noGames' });
    const offline = async () => {
      throw new TypeError('Failed to fetch');
    };
    await expect(fetchLichessGames('alice', { fetchImpl: offline })).rejects.toBeInstanceOf(LichessImportError);
  });

  it('rejects malformed NDJSON and skips games without a PGN', () => {
    expect(() => parseLichessNdjson('{not json')).toThrow(LichessImportError);
    expect(parseLichessNdjson('{"id":"x"}\n')).toEqual([]);
  });

  it('is never part of the extension', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx|html)$/.test(name)) files.push(p);
      }
    };
    walk('extension');
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/lichess-import|LichessImportPanel|src\/App/);
      expect(src, f).not.toContain('lichess.org/api');
    }
  });
});
