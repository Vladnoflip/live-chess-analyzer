import type { Candidate } from '../core/candidates';
import type { Explanation } from '../core/move-explainer';
import { formatScore } from '../core/format';
import { useI18n } from '../hooks/useAnalysis';

export interface VariantsPanelProps {
  candidates: readonly Candidate[];
  selectedRank: number | null;
  explanation: readonly Explanation[];
  explanationTitle: string | null;
  onSelect(rank: number): void;
}

export function VariantsPanel({ candidates, selectedRank, explanation, explanationTitle, onSelect }: VariantsPanelProps) {
  const { t, text } = useI18n();
  return (
    <section className="panel variants-panel">
      <header className="panel-head">
        <span>{t('variants.title')}</span>
        <span className="muted small-text">{t('variants.hint')}</span>
      </header>
      {candidates.length === 0 ? (
        <p className="muted small-text">{t('variants.waiting')}</p>
      ) : (
        <ol className="variants">
          {candidates.map((c) => (
            <li key={c.rank}>
              <button
                className={`variant${selectedRank === c.rank ? ' selected' : ''}${c.brilliant ? ' brilliant' : ''}`}
                onClick={() => onSelect(c.rank)}
                title={c.pvSan.join(' ')}
              >
                <span className="variant-san">
                  {c.sanMove}
                  {c.brilliant && <span className="badge brilliant-badge">!!</span>}
                </span>
                <span className="variant-eval">{formatScore(c.score)}</span>
                <span className="variant-bar">
                  <span style={{ width: `${Math.max(3, c.moveScore)}%`, background: c.color }} />
                </span>
                <span className="variant-score" style={{ color: c.color }}>
                  {c.moveScore}
                </span>
                <span className="variant-pv muted">{c.pvSan.slice(1).join(' ')}</span>
              </button>
            </li>
          ))}
        </ol>
      )}

      {explanation.length > 0 && (
        <div className="explanation">
          {explanationTitle && <div className="explanation-title">{explanationTitle}</div>}
          <ul>
            {explanation.map((e, i) => (
              <li key={i} className={`tone-${e.tone}`}>
                {text(e)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
