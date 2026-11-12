import { describe, expect, it } from 'vitest';
import { BoardService, START_FEN, positionKey } from '../src/services/board.service';
import { MATED_CP } from '../src/core/types';
import { parseUciLine, resolveTerminalScore, toWhitePov } from '../src/services/uci.parser';
import { explainMove } from '../src/core/move-explainer';
import { formatScore } from '../src/core/format';
import { I18n } from '../src/core/i18n';

const board = new BoardService();

const STALEMATE = '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1';
const BARE_KINGS = '8/8/8/4k3/8/8/8/4K3 w - - 0 1';
const KNIGHT_ONLY = '8/8/8/4k3/8/8/8/3NK3 w - - 0 1';
const FIFTY = '8/8/8/4k3/8/8/4P3/4K3 w - - 100 80';
const MATED = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3';

describe('draw detection in BoardService', () => {
  it('detects stalemate', () => {
    expect(board.isStalemate(STALEMATE)).toBe(true);
    expect(board.isDraw(STALEMATE)).toBe(true);
    expect(board.drawReason(STALEMATE)).toBe('stalemate');
    expect(board.status(STALEMATE)).toBe('stalemate');
  });

  it('detects insufficient material', () => {
    for (const fen of [BARE_KINGS, KNIGHT_ONLY]) {
      expect(board.isInsufficientMaterial(fen)).toBe(true);
      expect(board.drawReason(fen)).toBe('insufficient');
    }
  });

  it('detects the fifty-move rule', () => {
    expect(board.drawReason(FIFTY)).toBe('fifty');
  });

  it('is not a draw at the start or when checkmated', () => {
    expect(board.isDraw(START_FEN)).toBe(false);
    expect(board.isDraw(MATED)).toBe(false);
    expect(board.isStalemate(MATED)).toBe(false);
  });

  it('detects threefold repetition from the game history', () => {
    const game = board.parsePgn('1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8 *');
    const fens = [game.startFen, ...game.moves.map((m) => m.fenAfter)];
    const last = fens[8] as string;
    // FEN strings differ (move counters), positions do not.
    expect(last).not.toBe(START_FEN);
    expect(positionKey(last)).toBe(positionKey(START_FEN));
    expect(board.isThreefoldRepetition(last, fens.slice(0, 8))).toBe(true);
    // History may include the position itself.
    expect(board.isThreefoldRepetition(last, fens)).toBe(true);
    expect(board.drawReason(last, fens)).toBe('threefold');
    // Twice is not enough.
    expect(board.isThreefoldRepetition(fens[4] as string, fens.slice(0, 5))).toBe(false);
    expect(board.isThreefoldRepetition(last)).toBe(false);
  });
});

describe('terminal scores from UCI', () => {
  it('keeps mate 0 as checkmate of the side to move', () => {
    const info = parseUciLine('info depth 0 score mate 0');
    expect(info?.type).toBe('info');
    const score = toWhitePov({ kind: 'mate', value: 0 }, 'w');
    expect(score).toEqual({ kind: 'cp', value: -MATED_CP });
    expect(resolveTerminalScore(score, 'checkmate')).toEqual(score);
  });

  it('turns mate 0 into 0.00 when chess.js sees stalemate, not checkmate', () => {
    const score = toWhitePov({ kind: 'mate', value: 0 }, 'b');
    expect(resolveTerminalScore(score, 'draw')).toEqual({ kind: 'cp', value: 0 });
    expect(resolveTerminalScore(score, null)).toEqual({ kind: 'cp', value: 0 });
  });

  it('forces any score in a drawn position to exactly 0.00', () => {
    expect(resolveTerminalScore({ kind: 'cp', value: 37 }, 'draw')).toEqual({ kind: 'cp', value: 0 });
    expect(resolveTerminalScore({ kind: 'mate', value: 3 }, 'draw')).toEqual({ kind: 'cp', value: 0 });
    expect(formatScore(resolveTerminalScore({ kind: 'cp', value: -12 }, 'draw'))).toBe('0.00');
  });

  it('leaves ordinary scores alone', () => {
    expect(resolveTerminalScore({ kind: 'cp', value: 37 }, null)).toEqual({ kind: 'cp', value: 37 });
    expect(resolveTerminalScore({ kind: 'mate', value: -2 }, null)).toEqual({ kind: 'mate', value: -2 });
  });
});

describe('draw explanations', () => {
  it('explains a stalemating move in both languages', () => {
    // White plays Qf7, stalemating the black king on h8.
    const fen = '7k/8/6K1/8/8/8/8/5Q2 w - - 0 1';
    const lines = explainMove({ fen, uci: 'f1f7', candidates: [], afterScore: { kind: 'cp', value: 0 }, drawAfter: 'stalemate' }, board);
    const keys = lines.map((l) => l.key);
    expect(keys).toContain('ex.draw.stalemate');
    expect(lines.at(-1)).toMatchObject({ key: 'ex.evalAfter', params: { score: '0.00' } });
    const en = new I18n('en');
    const ru = new I18n('ru');
    expect(en.text({ key: 'ex.draw.stalemate' })).toMatch(/Draw/);
    expect(ru.text({ key: 'ex.draw.stalemate' })).toMatch(/Ничья/);
    expect(en.t('draw.title')).toBe('Draw');
    expect(ru.t('draw.title')).toBe('Ничья');
  });
});
