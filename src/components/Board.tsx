import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Square } from 'chess.js';
import type { BoardPiece } from '../services/board.service';
import { pieceImage } from './pieces';
import type { CandidateArrow, PvMark } from '../core/analysis.manager';
import { arrowShape, pointsAttr, squareCenter } from '../core/arrow-geometry';
import { textColorOn } from '../core/move-score';
import { trackPieces, type TrackedPiece } from '../core/piece-tracking';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
/** Slide duration for moves, ms. */
const ANIM_MS = 220;
/** Pointer travel (in squares) that turns a press into a drag rather than a click. */
const DRAG_THRESHOLD = 0.15;

export interface BoardProps {
  pieces: readonly BoardPiece[];
  flipped: boolean;
  arrows: readonly CandidateArrow[];
  pvMarks: readonly PvMark[];
  lastMove: { from: Square; to: Square } | null;
  targetsFrom(square: Square): Square[];
  onMove(from: Square, to: Square): void;
}

interface Drag {
  readonly from: Square;
  readonly id: number;
  /** Pointer position in board units (0..8). */
  readonly x: number;
  readonly y: number;
  readonly startX: number;
  readonly startY: number;
  readonly moved: boolean;
  readonly wasSelected: boolean;
}

/**
 * SVG board with drag-and-drop and click-to-move (pointer events: mouse, pen and touch).
 * Pieces keep stable identities between positions (see trackPieces), so every move —
 * yours, the engine's, or stepping through a game — slides the piece instead of
 * teleporting it. A piece dropped by hand lands instantly; only other moves animate.
 */
export function Board({ pieces, flipped, arrows, pvMarks, lastMove, targetsFrom, onMove }: BoardProps) {
  const [selected, setSelected] = useState<Square | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const nextId = useRef(0);
  const trackedRef = useRef<TrackedPiece[]>([]);
  /** Piece that was just dropped by hand: shown at its new square without sliding. */
  const droppedId = useRef<number | null>(null);

  const lastFrom = lastMove?.from ?? null;
  const lastTo = lastMove?.to ?? null;
  const tracked = useMemo(() => {
    const move = lastFrom && lastTo ? { from: lastFrom, to: lastTo } : null;
    const t = trackPieces(trackedRef.current, pieces, move, () => ++nextId.current);
    trackedRef.current = t;
    return t;
  }, [pieces, lastFrom, lastTo]);

  const bySquare = useMemo(() => new Map(pieces.map((p) => [p.square, p])), [pieces]);
  const targets = useMemo(() => (selected ? new Set(targetsFrom(selected)) : new Set<Square>()), [selected, targetsFrom]);

  // A new position clears the selection (the selected piece may be gone).
  useEffect(() => {
    setSelected(null);
    setDrag(null);
  }, [pieces]);
  // The "no slide" exception applies to a single render.
  useEffect(() => {
    droppedId.current = null;
  });

  const coords = (sq: Square) => {
    const file = sq.charCodeAt(0) - 97;
    const rank = Number(sq[1]) - 1;
    return flipped ? { x: 7 - file, y: rank } : { x: file, y: 7 - rank };
  };

  const toBoard = (e: ReactPointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 8, y: ((e.clientY - r.top) / r.height) * 8 };
  };

  const squareAt = (x: number, y: number): Square | null => {
    if (x < 0 || y < 0 || x >= 8 || y >= 8) return null;
    const col = Math.floor(x);
    const row = Math.floor(y);
    const file = FILES[flipped ? 7 - col : col]!;
    const rank = flipped ? row + 1 : 8 - row;
    return `${file}${rank}` as Square;
  };

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const p = toBoard(e);
    const sq = squareAt(p.x, p.y);
    if (!sq) return;
    // Second click of click-to-move (including capturing an enemy piece).
    if (selected && selected !== sq && targets.has(sq)) {
      onMove(selected, sq);
      setSelected(null);
      return;
    }
    const piece = tracked.find((t) => t.square === sq);
    if (!piece) {
      setSelected(null);
      return;
    }
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setSelected(sq);
    setDrag({ from: sq, id: piece.id, x: p.x, y: p.y, startX: p.x, startY: p.y, moved: false, wasSelected: selected === sq });
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!drag) return;
    const p = toBoard(e);
    const moved = drag.moved || Math.hypot(p.x - drag.startX, p.y - drag.startY) > DRAG_THRESHOLD;
    setDrag({ ...drag, x: p.x, y: p.y, moved });
  };

  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!drag) return;
    const current = drag;
    setDrag(null);
    if (!current.moved) {
      // A plain click: clicking the selected piece again deselects it.
      if (current.wasSelected) setSelected(null);
      return;
    }
    const p = toBoard(e);
    const to = squareAt(p.x, p.y);
    if (to && to !== current.from && targetsFrom(current.from).includes(to)) {
      droppedId.current = current.id;
      setSelected(null);
      onMove(current.from, to);
    }
    // Illegal drop: the piece returns to its square and stays selected.
  };

  const squares: Square[] = [];
  for (let r = 8; r >= 1; r--) for (const f of FILES) squares.push(`${f}${r}` as Square);
  const dragging = drag?.moved ? drag : null;
  const hover = dragging ? squareAt(dragging.x, dragging.y) : null;
  const inHand = dragging ? tracked.find((t) => t.id === dragging.id) : undefined;

  return (
    <svg
      className={`board${dragging ? ' dragging' : ''}`}
      viewBox="0 0 8 8"
      role="img"
      aria-label="Шахматная доска"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setDrag(null)}
    >
      {squares.map((sq) => {
        const { x, y } = coords(sq);
        const dark = (sq.charCodeAt(0) - 97 + Number(sq[1])) % 2 === 1;
        const highlighted = lastMove && (lastMove.from === sq || lastMove.to === sq);
        return (
          <g key={sq} className="square" data-square={sq}>
            <rect x={x} y={y} width={1} height={1} className={dark ? 'sq-dark' : 'sq-light'} />
            {highlighted && <rect x={x} y={y} width={1} height={1} className="sq-last" />}
            {selected === sq && <rect x={x} y={y} width={1} height={1} className="sq-selected" />}
            {hover === sq && targets.has(sq) && <rect x={x + 0.03} y={y + 0.03} width={0.94} height={0.94} className="sq-hover" />}
          </g>
        );
      })}

      {/* Coordinates on the edge squares */}
      {FILES.map((f, i) => (
        <text key={f} x={(flipped ? 7 - i : i) + 0.94} y={7.95} className="coord" textAnchor="end">
          {f}
        </text>
      ))}
      {[1, 2, 3, 4, 5, 6, 7, 8].map((r) => (
        <text key={r} x={0.04} y={(flipped ? r - 1 : 8 - r) + 0.2} className="coord">
          {r}
        </text>
      ))}

      {/* Stable keys + CSS transform transitions = sliding pieces. Rendered in id order:
          if React reordered the nodes, moving an element in the DOM would cancel its transition. */}
      {[...tracked].sort((a, b) => a.id - b.id).map((p) => {
        const { x, y } = coords(p.square);
        return (
          <image
            key={p.id}
            href={pieceImage(p.color, p.type)}
            x={0.02}
            y={0.02}
            width={0.96}
            height={0.96}
            className="piece"
            data-square={p.square}
            pointerEvents="none"
            style={{
              transform: `translate(${x}px, ${y}px)`,
              transition: droppedId.current === p.id ? 'none' : `transform ${ANIM_MS}ms cubic-bezier(.25,.8,.35,1)`,
              opacity: dragging?.id === p.id ? 0.3 : 1,
            }}
          />
        );
      })}

      {[...targets].map((sq) => {
        const { x, y } = coords(sq);
        return bySquare.has(sq) ? (
          <circle key={sq} cx={x + 0.5} cy={y + 0.5} r={0.46} className="target-capture" pointerEvents="none" />
        ) : (
          <circle key={sq} cx={x + 0.5} cy={y + 0.5} r={0.15} className="target" pointerEvents="none" />
        );
      })}

      {pvMarks.map((m) => {
        const to = coords(m.to);
        const from = coords(m.from);
        return (
          <g key={m.index} pointerEvents="none">
            <rect x={from.x} y={from.y} width={1} height={1} className="pv-from" />
            <rect x={to.x} y={to.y} width={1} height={1} className="pv-to" />
            <circle cx={to.x + 0.82} cy={to.y + 0.18} r={0.15} className="pv-badge" />
            <text x={to.x + 0.82} y={to.y + 0.19} className="pv-num" textAnchor="middle" dominantBaseline="middle">
              {m.index}
            </text>
          </g>
        );
      })}

      {!dragging && arrows.map((a) => <Arrow key={a.rank} arrow={a} orientation={flipped ? 'b' : 'w'} part="body" />)}
      {/* Badges on top of all arrows, fully opaque so the numbers stay readable. */}
      {!dragging && arrows.map((a) => <Arrow key={`b${a.rank}`} arrow={a} orientation={flipped ? 'b' : 'w'} part="badge" />)}

      {/* The piece in hand follows the pointer, slightly enlarged, above everything. */}
      {dragging && inHand && (
        <image
          href={pieceImage(inHand.color, inHand.type)}
          x={dragging.x - 0.56}
          y={dragging.y - 0.62}
          width={1.12}
          height={1.12}
          className="piece piece-in-hand"
          pointerEvents="none"
        />
      )}
    </svg>
  );
}

interface ArrowProps {
  arrow: CandidateArrow;
  orientation: 'w' | 'b';
  part: 'body' | 'badge';
}

/**
 * Rounded shaft (bent for knight moves) + softened head + score badge. Every arrow
 * has the same opacity; the selected/best one is only wider.
 */
function Arrow({ arrow, orientation, part }: ArrowProps) {
  const shape = arrowShape(squareCenter(arrow.from, orientation), squareCenter(arrow.to, orientation), arrow.accent);
  if (part === 'badge') {
    return (
      <g className="arrow-badge" pointerEvents="none">
        <circle cx={shape.badge.x} cy={shape.badge.y} r={0.2} fill={arrow.color} stroke="rgba(0,0,0,.35)" strokeWidth={0.025} />
        <text x={shape.badge.x} y={shape.badge.y + 0.005} fill={textColorOn(arrow.color)} textAnchor="middle" dominantBaseline="central">
          {arrow.score}
        </text>
      </g>
    );
  }
  return (
    <g className={`arrow-g${arrow.glow ? ' glow' : ''}`} pointerEvents="none">
      <polyline
        points={pointsAttr(shape.shaft)}
        fill="none"
        stroke={arrow.color}
        strokeWidth={shape.width}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polygon points={pointsAttr(shape.head)} fill={arrow.color} stroke={arrow.color} strokeWidth={0.06} strokeLinejoin="round" />
    </g>
  );
}
