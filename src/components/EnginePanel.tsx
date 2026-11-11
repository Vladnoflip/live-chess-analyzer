import type { LiveView } from '../core/analysis.manager';
import { formatCount, formatDuration, formatScore } from '../core/format';

const STATUS_TEXT: Record<LiveView['status'], string> = {
  loading: 'Загрузка движка…',
  idle: 'Ожидание',
  searching: 'Анализ…',
  done: 'Готово',
  error: 'Ошибка',
};

export function EnginePanel({ live, engineName, threads }: { live: LiveView; engineName: string; threads: number }) {
  return (
    <section className="panel engine-panel">
      <header className="panel-head">
        <span className="engine-name">{engineName}</span>
        <span className={`status status-${live.status}`}>
          {(live.status === 'searching' || live.status === 'loading') && <span className="spinner" />}
          {STATUS_TEXT[live.status]}
          {live.fromCache && live.status === 'done' ? ' (кэш)' : ''}
        </span>
      </header>

      {live.error ? (
        <p className="error">{live.error}</p>
      ) : (
        <>
          <div className="engine-main">
            <span className="engine-score">{formatScore(live.score)}</span>
            <div className="engine-best">
              <span className="muted">Лучший ход</span>
              <strong>{live.bestMoveSan ?? '—'}</strong>
              {live.bestMoveUci && <code>{live.bestMoveUci}</code>}
            </div>
          </div>
          <p className="pv">
            <span className="muted">PV: </span>
            {live.pvSan.length ? live.pvSan.join(' ') : '—'}
          </p>
          <dl className="stats">
            <div>
              <dt>Глубина</dt>
              <dd>{live.depth || '—'}</dd>
            </div>
            <div>
              <dt>Время</dt>
              <dd>{live.fromCache ? '—' : formatDuration(live.elapsedMs)}</dd>
            </div>
            <div>
              <dt>Узлы</dt>
              <dd>{formatCount(live.nodes)}</dd>
            </div>
            <div>
              <dt>Узлов/с</dt>
              <dd>{formatCount(live.nps)}</dd>
            </div>
            <div>
              <dt>Потоки</dt>
              <dd>{threads}</dd>
            </div>
          </dl>
        </>
      )}
    </section>
  );
}
