import type { Score } from '../core/types';
import type { DrawReason } from '../services/board.service';
import { formatScore, whiteBarPercent } from '../core/format';
import { useI18n } from '../hooks/useAnalysis';

const DRAW_SCORE: Score = { kind: 'cp', value: 0 };

export function EvalBar({ score, flipped, draw = null }: { score: Score | null; flipped: boolean; draw?: DrawReason | null }) {
  const { t } = useI18n();
  if (draw) {
    const reason = t(`draw.reason.${draw}` as const);
    return (
      <div className={`eval-bar draw${flipped ? ' flipped' : ''}`} aria-label={t('draw.badge', { reason })} title={t('draw.badge', { reason })}>
        <div className="eval-bar-white" style={{ height: '50%' }} />
        <span className="eval-bar-label eval-bar-draw">{formatScore(DRAW_SCORE)}</span>
      </div>
    );
  }
  const white = whiteBarPercent(score);
  const whiteAhead = white >= 50;
  return (
    <div className={`eval-bar${flipped ? ' flipped' : ''}`} aria-label={t('eval.label', { score: formatScore(score) })}>
      <div className="eval-bar-white" style={{ height: `${white}%` }} />
      <span className={`eval-bar-label ${whiteAhead ? 'on-white' : 'on-black'}`}>{formatScore(score)}</span>
    </div>
  );
}
