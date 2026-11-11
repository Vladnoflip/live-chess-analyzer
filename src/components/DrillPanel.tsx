import { useState } from 'react';
import { DRILL_GROUPS, DRILL_SECTIONS, type DrillState } from '../core/drill.manager';
import type { Color } from '../core/types';
import { useI18n } from '../hooks/useAnalysis';

export interface DrillPanelProps {
  state: DrillState;
  bookReady: boolean;
  /** Named book lines per section id (empty until the book has loaded). */
  lineCounts: Readonly<Record<string, number>>;
  onStart(options: { sectionId: string; userColor: Color; maxMoves: number }): void;
  onRestart(): void;
  onStop(): void;
  onReveal(): void;
}

export function DrillPanel({ state, bookReady, lineCounts, onStart, onRestart, onStop, onReveal }: DrillPanelProps) {
  const [sectionId, setSectionId] = useState(state.sectionId);
  const section = DRILL_SECTIONS.find((s) => s.id === sectionId) ?? DRILL_SECTIONS[0]!;
  const [color, setColor] = useState<Color>(section.defaultColor);
  const [maxMoves, setMaxMoves] = useState(state.maxMoves);
  const { stats } = state;
  const { t, text } = useI18n();
  const total = state.totals[state.status === 'idle' ? sectionId : state.sectionId];

  return (
    <section className="panel drill-panel">
      <header className="panel-head">
        <span>{t('drill.title')}</span>
        {state.status !== 'idle' && (
          <span className="muted small-text">
            {t('drill.sessionStats', { positions: stats.positions, correct: stats.correct, errors: stats.errors })}
          </span>
        )}
      </header>

      {total && (
        <p className="muted small-text drill-totals">
          {total.positions > 0
            ? t('drill.totalsAccuracy', { lines: total.lines, correct: total.correct, errors: total.errors, pct: Math.round((100 * total.correct) / total.positions) })
            : t('drill.totals', { lines: total.lines, correct: total.correct, errors: total.errors })}
        </p>
      )}
      {state.status === 'idle' ? (
        <div className="drill-setup">
          <label>
            {t('drill.section')}
            <select
              value={sectionId}
              onChange={(e) => {
                setSectionId(e.target.value);
                const s = DRILL_SECTIONS.find((x) => x.id === e.target.value);
                if (s) setColor(s.defaultColor);
              }}
            >
              {DRILL_GROUPS.map((g) => (
                <optgroup key={g.id} label={t(g.title)}>
                  {DRILL_SECTIONS.filter((s) => s.group === g.id).map((s) => (
                    <option key={s.id} value={s.id}>
                      {lineCounts[s.id] !== undefined ? t('drill.sectionOption', { title: t(s.title), n: lineCounts[s.id]! }) : t(s.title)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label>
            {t('drill.playAs')}
            <select value={color} onChange={(e) => setColor(e.target.value === 'b' ? 'b' : 'w')}>
              <option value="w">{t('drill.white')}</option>
              <option value="b">{t('drill.black')}</option>
            </select>
          </label>
          <label>
            {t('drill.moves')}
            <input type="number" min={1} max={30} value={maxMoves} onChange={(e) => setMaxMoves(Number(e.target.value) || 10)} />
          </label>
          <button disabled={!bookReady} onClick={() => onStart({ sectionId, userColor: color, maxMoves })}>
            {bookReady ? t('drill.start') : t('drill.loadingBook')}
          </button>
        </div>
      ) : (
        <>
          {state.openingName && <div className="drill-opening">{state.openingName}</div>}
          {state.message && <p className={`drill-message tone-${state.message.tone}`}>{text(state.message)}</p>}
          <div className="row-buttons">
            {state.status === 'playing' && state.expected.length > 0 && (
              <button className="small" onClick={onReveal}>
                {t('drill.reveal')}
              </button>
            )}
            <button className="small" onClick={onRestart}>
              {t('drill.again')}
            </button>
            <button className="small" onClick={onStop}>
              {t('drill.exit')}
            </button>
          </div>
          <p className="muted small-text">
            {state.status === 'playing'
              ? t(state.userColor === 'w' ? 'drill.youPlayWhite' : 'drill.youPlayBlack')
              : t('drill.lineFinished')}
          </p>
        </>
      )}
    </section>
  );
}
