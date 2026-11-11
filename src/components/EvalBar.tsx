import type { Score } from '../core/types';
import { formatScore, whiteBarPercent } from '../core/format';

export function EvalBar({ score, flipped }: { score: Score | null; flipped: boolean }) {
  const white = whiteBarPercent(score);
  const whiteAhead = white >= 50;
  return (
    <div className={`eval-bar${flipped ? ' flipped' : ''}`} aria-label={`Оценка ${formatScore(score)}`}>
      <div className="eval-bar-white" style={{ height: `${white}%` }} />
      <span className={`eval-bar-label ${whiteAhead ? 'on-white' : 'on-black'}`}>{formatScore(score)}</span>
    </div>
  );
}
