import { useState } from 'react';
import { DRILL_SECTIONS, type DrillState } from '../core/drill.manager';
import type { Color } from '../core/types';

export interface DrillPanelProps {
  state: DrillState;
  bookReady: boolean;
  onStart(options: { sectionId: string; userColor: Color; maxMoves: number }): void;
  onRestart(): void;
  onStop(): void;
  onReveal(): void;
}

export function DrillPanel({ state, bookReady, onStart, onRestart, onStop, onReveal }: DrillPanelProps) {
  const [sectionId, setSectionId] = useState(state.sectionId);
  const section = DRILL_SECTIONS.find((s) => s.id === sectionId) ?? DRILL_SECTIONS[0]!;
  const [color, setColor] = useState<Color>(section.defaultColor);
  const [maxMoves, setMaxMoves] = useState(state.maxMoves);
  const { stats } = state;
  const total = state.totals[state.status === 'idle' ? sectionId : state.sectionId];

  return (
    <section className="panel drill-panel">
      <header className="panel-head">
        <span>Тренажёр дебютов</span>
        {state.status !== 'idle' && (
          <span className="muted small-text">
            позиций {stats.positions} · верно {stats.correct} · ошибок {stats.errors}
          </span>
        )}
      </header>

      {total && (
        <p className="muted small-text drill-totals">
          За всё время в разделе: линий {total.lines} · верно {total.correct} · ошибок {total.errors}
          {total.positions > 0 ? ` · точность ${Math.round((100 * total.correct) / total.positions)}%` : ''}
        </p>
      )}
      {state.status === 'idle' ? (
        <div className="drill-setup">
          <label>
            Раздел
            <select
              value={sectionId}
              onChange={(e) => {
                setSectionId(e.target.value);
                const s = DRILL_SECTIONS.find((x) => x.id === e.target.value);
                if (s) setColor(s.defaultColor);
              }}
            >
              {DRILL_SECTIONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Играю
            <select value={color} onChange={(e) => setColor(e.target.value === 'b' ? 'b' : 'w')}>
              <option value="w">белыми</option>
              <option value="b">чёрными</option>
            </select>
          </label>
          <label>
            Ходов
            <input type="number" min={1} max={30} value={maxMoves} onChange={(e) => setMaxMoves(Number(e.target.value) || 10)} />
          </label>
          <button disabled={!bookReady} onClick={() => onStart({ sectionId, userColor: color, maxMoves })}>
            {bookReady ? 'Начать' : 'Загрузка книги…'}
          </button>
        </div>
      ) : (
        <>
          {state.openingName && <div className="drill-opening">{state.openingName}</div>}
          {state.message && <p className={`drill-message tone-${state.message.tone}`}>{state.message.text}</p>}
          <div className="row-buttons">
            {state.status === 'playing' && state.expected.length > 0 && (
              <button className="small" onClick={onReveal}>
                Показать ход теории
              </button>
            )}
            <button className="small" onClick={onRestart}>
              Заново
            </button>
            <button className="small" onClick={onStop}>
              Выйти
            </button>
          </div>
          <p className="muted small-text">
            {state.status === 'playing'
              ? `Вы играете ${state.userColor === 'w' ? 'белыми' : 'чёрными'}. Подсказки движка появятся после ошибки.`
              : 'Линия завершена.'}
          </p>
        </>
      )}
    </section>
  );
}
