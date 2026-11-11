import { describe, expect, it } from 'vitest';
import { parseUciLine, toWhitePov, MATED_CP } from '../src/services/uci.parser';

describe('parseUciLine', () => {
  it('parses a full info line', () => {
    const msg = parseUciLine(
      'info depth 20 seldepth 29 multipv 1 score cp 35 wdl 120 820 60 nodes 1234567 nps 987654 hashfull 120 tbhits 0 time 1250 pv e2e4 e7e5 g1f3',
    );
    expect(msg).toEqual({
      type: 'info',
      info: {
        depth: 20,
        selDepth: 29,
        multiPv: 1,
        score: { kind: 'cp', value: 35 },
        nodes: 1234567,
        nps: 987654,
        timeMs: 1250,
        pv: ['e2e4', 'e7e5', 'g1f3'],
      },
    });
  });

  it('parses mate scores and bounds', () => {
    const msg = parseUciLine('info depth 12 score mate -3 upperbound nodes 10 pv a1a2');
    expect(msg).toMatchObject({ type: 'info', info: { score: { kind: 'mate', value: -3 }, bound: 'upper' } });
  });

  it('ignores info string and currmove progress lines', () => {
    expect(parseUciLine('info string NNUE evaluation using nn-xxx.nnue').type).toBe('other');
    expect(parseUciLine('info depth 15 currmove e2e4 currmovenumber 1').type).toBe('other');
  });

  it('keeps the terminal "mate 0" line without pv', () => {
    expect(parseUciLine('info depth 0 score mate 0')).toMatchObject({
      type: 'info',
      info: { depth: 0, score: { kind: 'mate', value: 0 }, pv: [] },
    });
  });

  it('parses bestmove with and without ponder', () => {
    expect(parseUciLine('bestmove e2e4 ponder e7e5')).toEqual({ type: 'bestmove', move: 'e2e4', ponder: 'e7e5' });
    expect(parseUciLine('bestmove g1f3')).toEqual({ type: 'bestmove', move: 'g1f3', ponder: null });
    expect(parseUciLine('bestmove (none)')).toEqual({ type: 'bestmove', move: null, ponder: null });
  });

  it('parses handshake lines', () => {
    expect(parseUciLine('uciok')).toEqual({ type: 'uciok' });
    expect(parseUciLine('readyok\r')).toEqual({ type: 'readyok' });
    expect(parseUciLine('id name Stockfish 18')).toEqual({ type: 'id', key: 'name', value: 'Stockfish 18' });
  });
});

describe('toWhitePov', () => {
  it('keeps White-to-move scores', () => {
    expect(toWhitePov({ kind: 'cp', value: 50 }, 'w')).toEqual({ kind: 'cp', value: 50 });
  });

  it('flips Black-to-move scores', () => {
    expect(toWhitePov({ kind: 'cp', value: 50 }, 'b')).toEqual({ kind: 'cp', value: -50 });
    expect(toWhitePov({ kind: 'mate', value: 2 }, 'b')).toEqual({ kind: 'mate', value: -2 });
  });

  it('turns "mate 0" into a signed mated score', () => {
    expect(toWhitePov({ kind: 'mate', value: 0 }, 'w')).toEqual({ kind: 'cp', value: -MATED_CP });
    expect(toWhitePov({ kind: 'mate', value: 0 }, 'b')).toEqual({ kind: 'cp', value: MATED_CP });
  });
});
