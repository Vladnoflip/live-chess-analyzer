import type { BookMove, OpeningFilter } from '../core/openings';
import type { ExplorerState, PositionOpening } from '../core/opening.explorer';
import { DRILL_SECTIONS } from '../core/drill.manager';
import { useI18n } from '../hooks/useAnalysis';

export interface OpeningExplorerPanelProps {
  state: ExplorerState;
  position: PositionOpening;
  moves: readonly BookMove[];
  canGoBack: boolean;
  onPlay(uci: string): void;
  onBack(): void;
  onRoot(): void;
  onFilter(patch: Partial<OpeningFilter>): void;
  onPreset(filter: OpeningFilter): void;
}

export function OpeningExplorerPanel(props: OpeningExplorerPanelProps) {
  const { state, position, moves, canGoBack } = props;
  const f = state.filter;
  const { t } = useI18n();
  return (
    <section className="panel explorer-panel">
      <header className="panel-head">
        <span>{t('explorer.title')}</span>
        <span className="row-buttons">
          <button className="small" onClick={props.onBack} disabled={!canGoBack} title={t('explorer.backTitle')}>
            {t('explorer.back')}
          </button>
          <button className="small" onClick={props.onRoot}>
            {t('explorer.root')}
          </button>
        </span>
      </header>

      {state.status === 'loading' && <p className="muted small-text">{t('explorer.loading')}</p>}
      {state.status === 'error' && <p className="error">{state.error}</p>}

      <div className={`theory-flag ${position.inBook ? 'in' : 'out'}`}>
        {position.inBook ? t('explorer.inBook') : t('explorer.outOfBook')}
        {position.opening && (
          <span>
            : <strong>{position.opening.name}</strong> <span className="eco">{position.opening.eco}</span>
          </span>
        )}
      </div>

      <div className="filters">
        <select
          value={DRILL_SECTIONS.find((s) => s.filter.query === f.query && s.filter.ecoFrom === f.ecoFrom)?.id ?? ''}
          onChange={(e) => {
            const s = DRILL_SECTIONS.find((x) => x.id === e.target.value);
            if (s) props.onPreset(s.filter);
          }}
          aria-label={t('explorer.section')}
        >
          <option value="">{t('explorer.sectionPlaceholder')}</option>
          {DRILL_SECTIONS.map((s) => (
            <option key={s.id} value={s.id}>
              {t(s.title)}
            </option>
          ))}
        </select>
        <input
          type="search"
          placeholder={t('explorer.search')}
          value={f.query ?? ''}
          onChange={(e) => props.onFilter({ query: e.target.value || undefined })}
        />
        <input
          className="eco-input"
          placeholder={t('explorer.ecoFrom')}
          maxLength={3}
          value={f.ecoFrom ?? ''}
          onChange={(e) => props.onFilter({ ecoFrom: e.target.value.toUpperCase() || undefined })}
        />
        <input
          className="eco-input"
          placeholder={t('explorer.ecoTo')}
          maxLength={3}
          value={f.ecoTo ?? ''}
          onChange={(e) => props.onFilter({ ecoTo: e.target.value.toUpperCase() || undefined })}
        />
        <select
          value={f.color ?? ''}
          onChange={(e) => props.onFilter({ color: e.target.value === 'w' || e.target.value === 'b' ? e.target.value : null })}
          aria-label={t('explorer.side')}
        >
          <option value="">{t('explorer.anySide')}</option>
          <option value="w">{t('explorer.forWhite')}</option>
          <option value="b">{t('explorer.forBlack')}</option>
        </select>
      </div>

      {moves.length === 0 ? (
        <p className="muted small-text">{position.inBook ? t('explorer.noFiltered') : t('explorer.noBook')}</p>
      ) : (
        <ul className="book-moves">
          {moves.map((m) => (
            <li key={m.uci}>
              <button onClick={() => props.onPlay(m.uci)}>
                <strong className="book-san">{m.san}</strong>
                <span className="book-name">{m.opening?.name ?? '—'}</span>
                <span className="eco">{m.opening?.eco ?? ''}</span>
                <span className="muted small-text" title={t('explorer.linesTitle')}>
                  {m.lines}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
