import type { Score } from '../core/types';
import { formatScore, whiteBarPercent } from '../core/format';
import { useI18n } from '../hooks/useAnalysis';

export function EvalBar({ score, flipped }: { score: Score | null; flipped: boolean }) {
  const { t } = useI18n();
  const white = whiteBarPercent(score);
  const whiteAhead = white >= 50;
  return (
    <div className={`eval-bar${flipped ? ' flipped' : ''}`} aria-label={t('eval.label', { score: formatScore(score) })}>
      <div className="eval-bar-white" style={{ height: `${white}%` }} />
      <span className={`eval-bar-label ${whiteAhead ? 'on-white' : 'on-black'}`}>{formatScore(score)}</span>
    </div>
  );
}
