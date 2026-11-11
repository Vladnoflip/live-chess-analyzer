import { it } from 'vitest';
import { boardService as b } from '../src/services/board.service';
it('probe', () => {
  const fen = 'r5k1/pbp3pp/1p1p1q2/8/3P4/2PB1N2/PP3PPP/3Q1RK1 w - - 0 1';
  console.log('valid', JSON.stringify(b.validate(fen)));
  for (const uci of ['f3e1', 'f3d2', 'h2h3']) {
    const after = b.applyUci(fen, uci)!;
    console.log('HIT', uci, b.kingSafety(fen, 'w').zoneAttacks, '->', b.kingSafety(after.fen, 'w').zoneAttacks, JSON.stringify(b.tactics(fen, uci)), JSON.stringify(b.pieceMobility(fen, uci)));
  }
});
