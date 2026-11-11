import { useEffect, useRef } from 'react';
import type { MoveClass } from '../core/types';
import type { GameMove } from '../services/board.service';
import { MOVE_CLASS_LABEL } from '../core/format';
import type { PlayedMoveScore, ReviewProgress } from '../core/analysis.manager';
import { scoreToColor } from '../core/move-score';
import { useI18n } from '../hooks/useAnalysis';

export interface MoveListProps {
  moves: readonly GameMove[];
  classes: Readonly<Record<number, MoveClass>>;
  moveScores: Readonly<Record<number, PlayedMoveScore>>;
  /** Plies that were book moves. */
  bookPlies?: ReadonlySet<number>;
  ply: number;
  review: ReviewProgress | null;
  onSelect(ply: number): void;
  onReview(): void;
  onCancelReview(): void;
}

export function MoveList({ moves, classes, moveScores, bookPlies, ply, review, onSelect, onReview, onCancelReview }: MoveListProps) {
  const { t } = useI18n();
  const activeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    // Scroll only the move list itself; scrollIntoView would also scroll the page away from the board.
    const el = activeRef.current;
    const box = el?.closest('.move-scroll');
    if (!el || !box) return;
    const top = el.offsetTop - box.clientHeight / 2;
    box.scrollTop = Math.max(0, top);
  }, [ply]);

  // Group into rows of (white, black); a game starting with Black to move gets an empty first cell.
  const rows: { number: number; white?: GameMove; black?: GameMove }[] = [];
  for (const move of moves) {
    const moveNumber = Number(move.fenBefore.split(' ')[5] ?? '1');
    const last = rows[rows.length - 1];
    if (move.color === 'w') rows.push({ number: moveNumber, white: move });
    else if (last && !last.black) last.black = move;
    else rows.push({ number: moveNumber, black: move });
  }

  const cell = (move: GameMove | undefined) => {
    if (!move) return <span className="move empty">…</span>;
    const cls = classes[move.ply];
    const ms = moveScores[move.ply];
    return (
      <button
        ref={move.ply === ply ? activeRef : undefined}
        className={`move${move.ply === ply ? ' active' : ''}${cls ? ` cls-${cls}` : ''}`}
        onClick={() => onSelect(move.ply)}
        title={cls ? (ms ? t('moves.scoreTitle', { label: t(MOVE_CLASS_LABEL[cls].label), score: ms.score }) : t(MOVE_CLASS_LABEL[cls].label)) : undefined}
      >
        <span>
          {ms && <span className={`score-dot${ms.brilliant ? ' glow' : ''}`} style={{ background: scoreToColor(ms.score, ms.brilliant) }} />}
          {move.san}
          {bookPlies?.has(move.ply) && <span className="book-mark" title={t('moves.bookMove')}>📖</span>}
        </span>
        {cls && cls !== 'good' && <span className="badge">{MOVE_CLASS_LABEL[cls].symbol}</span>}
      </button>
    );
  };

  const counts = Object.values(classes).reduce<Record<MoveClass, number>>(
    (acc, c) => ({ ...acc, [c]: acc[c] + 1 }),
    { brilliant: 0, best: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 },
  );

  return (
    <section className="panel moves-panel">
      <header className="panel-head">
        <span>{t('moves.title')}</span>
        {review?.running ? (
          <span className="review">
            <span className="spinner" /> {review.done}/{review.total}
            <button className="link" onClick={onCancelReview}>
              {t('moves.stop')}
            </button>
          </span>
        ) : (
          <button className="small" disabled={moves.length === 0} onClick={onReview}>
            {t('moves.review')}
          </button>
        )}
      </header>
      {review?.running && (
        <div className="progress">
          <div style={{ width: `${(100 * review.done) / Math.max(1, review.total)}%` }} />
        </div>
      )}
      <div className="move-scroll">
        {moves.length === 0 ? (
          <p className="muted">{t('moves.empty')}</p>
        ) : (
          <ol className="move-rows">
            {rows.map((row, i) => (
              <li key={i}>
                <span className="move-no">{row.number}.</span>
                {cell(row.white)}
                {cell(row.black)}
              </li>
            ))}
          </ol>
        )}
      </div>
      {Object.keys(classes).length > 0 && (
        <ul className="legend">
          {(Object.keys(MOVE_CLASS_LABEL) as MoveClass[]).map((c) => (
            <li key={c} className={`cls-${c}`}>
              <span className="badge">{MOVE_CLASS_LABEL[c].symbol}</span> {t('class.count', { label: t(MOVE_CLASS_LABEL[c].label), n: counts[c] })}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
