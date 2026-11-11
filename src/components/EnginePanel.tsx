import type { LiveView } from '../core/analysis.manager';
import { formatCount, formatDuration, formatScore } from '../core/format';
import type { MessageKey } from '../core/i18n';
import { useI18n } from '../hooks/useAnalysis';

const STATUS_TEXT: Record<LiveView['status'], MessageKey> = {
  loading: 'engine.status.loading',
  idle: 'engine.status.idle',
  searching: 'engine.status.searching',
  done: 'engine.status.done',
  error: 'engine.status.error',
};

export function EnginePanel({ live, engineName, threads }: { live: LiveView; engineName: string; threads: number }) {
  const { t, text } = useI18n();
  return (
    <section className="panel engine-panel">
      <header className="panel-head">
        <span className="engine-name">{engineName}</span>
        <span className={`status status-${live.status}`}>
          {(live.status === 'searching' || live.status === 'loading') && <span className="spinner" />}
          {t(STATUS_TEXT[live.status])}
          {live.fromCache && live.status === 'done' ? t('engine.cached') : ''}
        </span>
      </header>

      {live.error ? (
        <p className="error">{live.error}</p>
      ) : (
        <>
          <div className="engine-main">
            <span className="engine-score">{formatScore(live.score)}</span>
            <div className="engine-best">
              <span className="muted">{t('engine.bestMove')}</span>
              <strong>{live.bestMoveSan ?? '—'}</strong>
              {live.bestMoveUci && <code>{live.bestMoveUci}</code>}
            </div>
          </div>
          <p className="pv">
            <span className="muted">{t('engine.pv')}</span>
            {live.pvSan.length ? live.pvSan.join(' ') : '—'}
          </p>
          <dl className="stats">
            <div>
              <dt>{t('engine.depth')}</dt>
              <dd>{live.depth || '—'}</dd>
            </div>
            <div>
              <dt>{t('engine.time')}</dt>
              <dd>{live.fromCache ? '—' : text(formatDuration(live.elapsedMs))}</dd>
            </div>
            <div>
              <dt>{t('engine.nodes')}</dt>
              <dd>{formatCount(live.nodes)}</dd>
            </div>
            <div>
              <dt>{t('engine.nps')}</dt>
              <dd>{formatCount(live.nps)}</dd>
            </div>
            <div>
              <dt>{t('engine.threads')}</dt>
              <dd>{threads}</dd>
            </div>
          </dl>
        </>
      )}
    </section>
  );
}
