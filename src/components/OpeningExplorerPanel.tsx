import type { BookMove, OpeningFilter } from '../core/openings';
import type { ExplorerState, PositionOpening } from '../core/opening.explorer';
import { DRILL_SECTIONS } from '../core/drill.manager';

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
  return (
    <section className="panel explorer-panel">
      <header className="panel-head">
        <span>Обзор дебютов</span>
        <span className="row-buttons">
          <button className="small" onClick={props.onBack} disabled={!canGoBack} title="Назад (←)">
            ◀ Назад
          </button>
          <button className="small" onClick={props.onRoot}>
            В начало
          </button>
        </span>
      </header>

      {state.status === 'loading' && <p className="muted small-text">Загрузка книги дебютов…</p>}
      {state.status === 'error' && <p className="error">{state.error}</p>}

      <div className={`theory-flag ${position.inBook ? 'in' : 'out'}`}>
        {position.inBook ? '📖 В теории' : 'Вне теории'}
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
          aria-label="Раздел"
        >
          <option value="">Раздел…</option>
          {DRILL_SECTIONS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
        <input
          type="search"
          placeholder="Название: «индийск», «гамбит»…"
          value={f.query ?? ''}
          onChange={(e) => props.onFilter({ query: e.target.value || undefined })}
        />
        <input
          className="eco-input"
          placeholder="ECO от"
          maxLength={3}
          value={f.ecoFrom ?? ''}
          onChange={(e) => props.onFilter({ ecoFrom: e.target.value.toUpperCase() || undefined })}
        />
        <input
          className="eco-input"
          placeholder="до"
          maxLength={3}
          value={f.ecoTo ?? ''}
          onChange={(e) => props.onFilter({ ecoTo: e.target.value.toUpperCase() || undefined })}
        />
        <select
          value={f.color ?? ''}
          onChange={(e) => props.onFilter({ color: e.target.value === 'w' || e.target.value === 'b' ? e.target.value : null })}
          aria-label="Цвет"
        >
          <option value="">Любой цвет</option>
          <option value="w">За белых</option>
          <option value="b">За чёрных</option>
        </select>
      </div>

      {moves.length === 0 ? (
        <p className="muted small-text">{position.inBook ? 'В выбранном фильтре продолжений нет.' : 'Книжных продолжений нет.'}</p>
      ) : (
        <ul className="book-moves">
          {moves.map((m) => (
            <li key={m.uci}>
              <button onClick={() => props.onPlay(m.uci)}>
                <strong className="book-san">{m.san}</strong>
                <span className="book-name">{m.opening?.name ?? '—'}</span>
                <span className="eco">{m.opening?.eco ?? ''}</span>
                <span className="muted small-text" title="Число именованных линий через этот ход">
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
