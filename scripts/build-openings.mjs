// Preprocesses lichess-org/chess-openings (CC0) TSVs into a compact position graph:
//   src/data/openings/*.tsv  →  src/data/openings/openings.json
// Every line is replayed with chess.js once here, so the app never has to.
// Positions are keyed by "placement side castling" (en-passant dropped, see README).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'openings');
const files = ['a', 'b', 'c', 'd', 'e'];

const positionIndex = new Map();
const positions = [];
const keyOf = (fen) => fen.split(' ').slice(0, 3).join(' ');
const idOf = (fen) => {
  const key = keyOf(fen);
  let id = positionIndex.get(key);
  if (id === undefined) {
    id = positions.length;
    positions.push(key);
    positionIndex.set(key, id);
  }
  return id;
};

const startId = idOf(new Chess().fen());
const entries = [];
for (const f of files) {
  const lines = readFileSync(join(dir, `${f}.tsv`), 'utf8').split(/\r?\n/).slice(1).filter(Boolean);
  for (const line of lines) {
    const [eco, name, pgn] = line.split('\t');
    const chess = new Chess();
    const uci = [];
    const san = [];
    const path = [startId];
    for (const token of pgn.split(/\s+/)) {
      if (/^\d+\.+$/.test(token)) continue;
      const move = chess.move(token);
      uci.push(move.lan);
      san.push(move.san);
      path.push(idOf(chess.fen()));
    }
    entries.push([eco, name, uci.join(' '), san.join(' '), path]);
  }
}

writeFileSync(join(dir, 'openings.json'), JSON.stringify({ source: 'lichess-org/chess-openings@3ba6b20d', startId, positions, entries }));
console.log(`openings.json: ${entries.length} lines, ${positions.length} positions`);
