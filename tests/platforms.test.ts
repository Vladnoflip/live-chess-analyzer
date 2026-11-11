// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Square } from 'chess.js';
import { buildFen } from '../extension/platforms/fen-builder';
import { chesscom } from '../extension/platforms/chesscom';
import { lichess } from '../extension/platforms/lichess';
import { platformFor } from '../extension/platforms';
import type { PlacedPiece } from '../extension/platforms/types';
import { START_FEN } from '../src/services/board.service';

const START_PIECES = 'rnbqkbnr'.split('').flatMap((t, i) => {
  const f = 'abcdefgh'[i]!;
  return [
    [`${f}1`, 'w', t],
    [`${f}2`, 'w', 'p'],
    [`${f}7`, 'b', 'p'],
    [`${f}8`, 'b', t],
  ] as const;
});

function placement(entries: readonly (readonly [string, 'w' | 'b', string])[]): Map<Square, PlacedPiece> {
  return new Map(entries.map(([sq, color, type]) => [sq as Square, { color, type } as PlacedPiece]));
}

function move(entries: readonly (readonly [string, 'w' | 'b', string])[], from: string, to: string) {
  const piece = entries.find((e) => e[0] === from)!;
  return [...entries.filter((e) => e[0] !== from && e[0] !== to), [to, piece[1], piece[2]] as const];
}

describe('buildFen', () => {
  it('rebuilds the start position', () => {
    expect(buildFen(placement(START_PIECES), null)).toBe(START_FEN);
  });

  it('derives side to move from the last move', () => {
    const after = move(START_PIECES, 'e2', 'e4');
    expect(buildFen(placement(after), { from: 'e2', to: 'e4' })).toBe(
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    );
  });

  it('sets en passant only when a capture is possible', () => {
    let pos = move(START_PIECES, 'e2', 'e4');
    pos = move(pos, 'a7', 'a6');
    pos = move(pos, 'e4', 'e5');
    pos = move(pos, 'd7', 'd5');
    expect(buildFen(placement(pos), { from: 'd7', to: 'd5' })).toContain(' w KQkq d6 ');
  });

  it('drops castling rights when king or rook left home', () => {
    const pos = move(move(START_PIECES, 'h1', 'h3'), 'e8', 'e7');
    expect(buildFen(placement(pos), null).split(' ')[2]).toBe('Q');
  });

  it('uses the fallback turn when there is no last move', () => {
    expect(buildFen(placement(START_PIECES), null, 'b').split(' ')[1]).toBe('b');
  });
});

// ── chess.com ──────────────────────────────────────────────────────────────

function chesscomDoc(boardId: string, opts: { flipped?: boolean; pieces?: string[]; highlights?: string[] } = {}): Document {
  const pieces =
    opts.pieces ??
    START_PIECES.map(([sq, c, t]) => `piece ${c}${t} square-${'abcdefgh'.indexOf(sq[0]!) + 1}${sq[1]}`);
  const html = `<wc-chess-board id="${boardId}" class="board${opts.flipped ? ' flipped' : ''}">
    <svg class="coordinates"></svg><div class="element-pool"></div><div class="hover-square"></div>
    ${(opts.highlights ?? []).map((h) => `<div class="highlight ${h}"></div>`).join('')}
    ${pieces.map((c) => `<div class="${c}"></div>`).join('')}
  </wc-chess-board>`;
  return new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
}

describe('chess.com fair-play gate', () => {
  it.each([
    ['/play/computer', 'board-play-computer'],
    ['/analysis', 'board-analysis-board'],
    ['/analysis/game/live/123456', 'board-analysis-board'],
  ])('allows %s', (pathname, id) => {
    expect(chesscom.isAllowedPage({ pathname }, chesscomDoc(id))).toBe(true);
  });

  it.each([
    ['/game/live/123456', 'board-single'],
    ['/play/online', 'board-play-online'],
    ['/game/daily/987', 'board-single'],
    ['/play/computer', 'board-single'], // right path but a different board — refuse
    ['/game/live/123456', 'board-play-computer'], // bot board id on a live game path — refuse
    ['/', 'board-play-computer'],
  ])('blocks %s (board #%s)', (pathname, id) => {
    expect(chesscom.isAllowedPage({ pathname }, chesscomDoc(id))).toBe(false);
  });

  it('blocks pages without a board', () => {
    expect(chesscom.isAllowedPage({ pathname: '/play/computer' }, new DOMParser().parseFromString('<p></p>', 'text/html'))).toBe(false);
  });
});

describe('chess.com board reader', () => {
  it('reads the start position', () => {
    const snap = chesscom.read(chesscomDoc('board-play-computer'));
    expect(snap?.fen).toBe(START_FEN);
    expect(snap?.orientation).toBe('w');
    expect(snap?.myColor).toBe('w');
  });

  it('reads 1. e4 c5 using the last-move highlights (as observed on /play/computer)', () => {
    const pos = move(move(START_PIECES, 'e2', 'e4'), 'c7', 'c5');
    const pieces = pos.map(([sq, c, t]) => `piece square-${'abcdefgh'.indexOf(sq[0]!) + 1}${sq[1]} ${c}${t}`);
    const snap = chesscom.read(chesscomDoc('board-play-computer', { pieces, highlights: ['square-37', 'square-35'] }));
    expect(snap?.fen).toBe('rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1');
  });

  it('treats a flipped board as playing Black', () => {
    const snap = chesscom.read(chesscomDoc('board-play-computer', { flipped: true }));
    expect(snap?.orientation).toBe('b');
    expect(snap?.myColor).toBe('b');
  });

  it('has no "my colour" on the analysis board', () => {
    expect(chesscom.read(chesscomDoc('board-analysis-board'))?.myColor).toBeNull();
  });
});

// ── lichess ────────────────────────────────────────────────────────────────

const SQ = 73;
const NAMES: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

function lichessDoc(opts: { fen?: string; orientation?: 'white' | 'black'; pieces?: typeof START_PIECES } = {}): Document {
  const orientation = opts.orientation ?? 'white';
  const pieces = (opts.pieces ?? START_PIECES).map(([sq, c, t]) => {
    const file = 'abcdefgh'.indexOf(sq[0]!);
    const rank = Number(sq[1]);
    const x = orientation === 'white' ? file : 7 - file;
    const y = orientation === 'white' ? 8 - rank : rank - 1;
    return `<piece class="${c === 'w' ? 'white' : 'black'} ${NAMES[t]}" style="transform: translate(${x * SQ}px, ${y * SQ}px);"></piece>`;
  });
  const copyables = opts.fen !== undefined ? `<div class="copyables"><div class="pair"><input class="copyable" value="${opts.fen}"></div></div>` : '';
  const doc = new DOMParser().parseFromString(
    `<body><div class="cg-wrap cgv1 orientation-${orientation} manipulable"><cg-container><cg-board>${pieces.join('')}</cg-board></cg-container></div>${copyables}</body>`,
    'text/html',
  );
  const board = doc.querySelector('cg-board')!;
  board.getBoundingClientRect = () => ({ width: SQ * 8, height: SQ * 8 }) as DOMRect;
  return doc;
}

describe('lichess', () => {
  it('allows only the analysis board', () => {
    expect(lichess.isAllowedPage({ pathname: '/analysis' }, lichessDoc())).toBe(true);
    expect(lichess.isAllowedPage({ pathname: '/analysis/standard/rnbqkbnr' }, lichessDoc())).toBe(true);
    expect(lichess.isAllowedPage({ pathname: '/AbCdEfGh' }, lichessDoc())).toBe(false);
    expect(lichess.isAllowedPage({ pathname: '/AbCdEfGh/white' }, lichessDoc())).toBe(false);
    expect(lichess.isAllowedPage({ pathname: '/tv' }, lichessDoc())).toBe(false);
  });

  it('prefers the FEN from the copyable input', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    expect(lichess.read(lichessDoc({ fen }))?.fen).toBe(fen);
  });

  it('falls back to piece coordinates, for both orientations', () => {
    expect(lichess.read(lichessDoc())?.fen).toBe(START_FEN);
    const black = lichess.read(lichessDoc({ orientation: 'black' }));
    expect(black?.fen).toBe(START_FEN);
    expect(black?.orientation).toBe('b');
  });
});

describe('platformFor', () => {
  it('picks the parser by host', () => {
    expect(platformFor('www.chess.com')?.id).toBe('chesscom');
    expect(platformFor('lichess.org')?.id).toBe('lichess');
    expect(platformFor('example.com')).toBeNull();
  });
});
