import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Square } from 'chess.js';
import { useAnalysis, useDrill, useExplorer, useI18n, useServices } from '../../src/hooks/useAnalysis';
import { Board } from '../../src/components/Board';
import { DRILL_GROUPS, DRILL_SECTIONS, sectionLineCount, type DrillGroup, type DrillState, type SectionTotals } from '../../src/core/drill.manager';
import { formatScore } from '../../src/core/format';
import { textColorOn } from '../../src/core/move-score';
import type { Candidate } from '../../src/core/candidates';
import type { Color } from '../../src/core/types';
import { SoundControls } from '../../src/components/SoundControls';

export function TrainerApp() {
  const { manager, drill } = useServices();
  const analysis = useAnalysis();
  const drillState = useDrill();
  const explorerState = useExplorer();
  const bookReady = explorerState.status === 'ready';
  const { explorer } = useServices();
  const lineCounts = useMemo(() => {
    const book = explorer.getBook();
    return book ? Object.fromEntries(DRILL_SECTIONS.map((s) => [s.id, sectionLineCount(book, s)])) : {};
  }, [explorer, bookReady]);
  const { t, locale } = useI18n();

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = t('trainer.pageTitle');
  }, [locale]);

  // Continue a saved line as soon as the book is available.
  useEffect(() => {
    if (bookReady) drill.resume();
  }, [bookReady, drill]);

  const pieces = useMemo(() => manager.pieces(), [manager, analysis.fen]);
  const targetsFrom = useCallback((sq: Square) => manager.targetsFrom(sq), [manager, analysis.fen]);
  const hints = drillState.status !== 'idle' && drillState.hintsVisible;
  const flipped = drillState.userColor === 'b';

  const onMove = (from: Square, to: Square) => {
    const uci = manager.resolveMove(from, to);
    if (uci) drill.tryMove(uci);
  };

  return (
    <div className="trainer">
      <header className="t-head">
        <div className="brand">
          <span className="logo" aria-hidden>
            ♘
          </span>
          <div>
            <h1>{t('trainer.title')}</h1>
            <p>{t('trainer.subtitle')}</p>
          </div>
        </div>
        <div className="head-actions">
          <SoundControls compact />
          {drillState.status !== 'idle' && (
            <button className="ghost" onClick={() => drill.stop()}>
              {t('trainer.backToSections')}
            </button>
          )}
        </div>
      </header>

      {drillState.status === 'idle' ? (
        <SectionPicker state={drillState} bookReady={bookReady} lineCounts={lineCounts} onStart={(o) => drill.start(o)} />
      ) : (
        <main className="t-play">
          <div className="t-board-card">
            <div className="t-opening">{drillState.openingName ?? t('trainer.startingPosition')}</div>
            <div className="t-board">
              <Board
                pieces={pieces}
                flipped={flipped}
                arrows={hints ? manager.candidateArrows() : []}
                pvMarks={[]}
                lastMove={manager.lastMove()}
                targetsFrom={targetsFrom}
                onMove={onMove}
              />
            </div>
            <MoveStrip san={analysis.moves.map((m) => m.san)} />
          </div>

          <aside className="t-side">
            <Feedback state={drillState} onReveal={() => drill.reveal()} onRestart={() => drill.restart()} />
            <Progress state={drillState} />
            {hints && <Hints candidates={analysis.candidates} searching={analysis.live.status === 'searching'} />}
          </aside>
        </main>
      )}
    </div>
  );
}

function SectionPicker({
  state,
  bookReady,
  lineCounts,
  onStart,
}: {
  state: DrillState;
  bookReady: boolean;
  lineCounts: Readonly<Record<string, number>>;
  onStart(o: { sectionId: string; userColor: Color; maxMoves: number }): void;
}) {
  const [selected, setSelected] = useState(state.sectionId);
  const section = DRILL_SECTIONS.find((s) => s.id === selected) ?? DRILL_SECTIONS[0]!;
  const [group, setGroup] = useState<DrillGroup>(section.group);
  const [color, setColor] = useState<Color>(section.defaultColor);
  const [maxMoves, setMaxMoves] = useState(state.maxMoves);
  const { t } = useI18n();
  const visible = DRILL_SECTIONS.filter((s) => s.group === group);

  return (
    <main className="t-picker">
      <h2>{t('trainer.question')}</h2>
      <div className="group-tabs" role="tablist">
        {DRILL_GROUPS.map((g) => (
          <button key={g.id} role="tab" aria-selected={group === g.id} className={group === g.id ? 'on' : ''} onClick={() => setGroup(g.id)}>
            {t(g.title)}
            <span className="tab-count">{DRILL_SECTIONS.filter((s) => s.group === g.id).length}</span>
          </button>
        ))}
      </div>
      <div className="cards" role="tabpanel">
        {visible.map((s) => {
          const totals = state.totals[s.id];
          const lines = lineCounts[s.id];
          return (
            <button
              key={s.id}
              className={`card${selected === s.id ? ' selected' : ''}`}
              onClick={() => {
                setSelected(s.id);
                setColor(s.defaultColor);
              }}
            >
              <span className="card-title">{t(s.title)}</span>
              <span className="card-moves">{s.moves || '\u00a0'}</span>
              <span className="card-meta">
                <span>{s.eco ?? t('section.ecoVarious')}</span>
                {lines !== undefined && <span className="card-lines">{t('section.lineCount', { n: lines })}</span>}
                {totals && <Accuracy totals={totals} />}
              </span>
            </button>
          );
        })}
      </div>

      <div className="start-bar">
        <span className="start-section">{t(section.title)}</span>
        <div className="seg" role="group" aria-label={t('trainer.colour')}>
          <button className={color === 'w' ? 'on' : ''} onClick={() => setColor('w')}>
            {t('trainer.asWhite')}
          </button>
          <button className={color === 'b' ? 'on' : ''} onClick={() => setColor('b')}>
            {t('trainer.asBlack')}
          </button>
        </div>
        <label className="moves-input">
          {t('trainer.lineLength')}
          <input type="number" min={1} max={30} value={maxMoves} onChange={(e) => setMaxMoves(Number(e.target.value) || 10)} />
        </label>
        <button className="primary" disabled={!bookReady} onClick={() => onStart({ sectionId: selected, userColor: color, maxMoves })}>
          {bookReady ? t('trainer.start') : t('trainer.loadingBook')}
        </button>
      </div>
    </main>
  );
}

function Accuracy({ totals }: { totals: SectionTotals }) {
  const { t } = useI18n();
  if (totals.positions === 0) return null;
  const pct = Math.round((100 * totals.correct) / totals.positions);
  return (
    <span className="acc" title={t('trainer.accuracyTitle', { lines: totals.lines, correct: totals.correct, errors: totals.errors })}>
      <span className="ring" style={{ background: `conic-gradient(var(--good) ${pct * 3.6}deg, var(--track) 0)` }} />
      {pct}%
    </span>
  );
}

function Feedback({ state, onReveal, onRestart }: { state: DrillState; onReveal(): void; onRestart(): void }) {
  const { t, text } = useI18n();
  const tone = state.message?.tone ?? 'info';
  return (
    <section className={`t-card feedback tone-${tone}`}>
      <div className="feedback-text">{state.message ? text(state.message) : t('trainer.yourMove')}</div>
      {state.expected.length > 0 && (
        <div className="chips">
          {state.expected.map((san) => (
            <span key={san} className="chip">
              {san}
            </span>
          ))}
        </div>
      )}
      <div className="actions">
        {state.status === 'playing' && state.expected.length > 0 && (
          <button className="soft" onClick={onReveal}>
            {t('drill.reveal')}
          </button>
        )}
        <button className={state.status === 'finished' ? 'primary' : 'soft'} onClick={onRestart}>
          {state.status === 'finished' ? t('trainer.another') : t('trainer.restart')}
        </button>
      </div>
      <p className="hint">
        {state.status === 'playing'
          ? t(state.userColor === 'w' ? 'drill.youPlayWhite' : 'drill.youPlayBlack')
          : t('trainer.finished')}
      </p>
    </section>
  );
}

function Progress({ state }: { state: DrillState }) {
  const { t } = useI18n();
  const { stats } = state;
  const total = state.totals[state.sectionId];
  const section = DRILL_SECTIONS.find((s) => s.id === state.sectionId);
  const pct = stats.positions ? Math.round((100 * stats.correct) / stats.positions) : 100;
  return (
    <section className="t-card progress">
      <div className="progress-head">
        <span>{section ? t(section.title) : ''}</span>
        <span className="muted">
          {t('trainer.moveOf', { n: Math.ceil(state.line.length / 2), max: state.maxMoves })}
        </span>
      </div>
      <div className="bar">
        <span style={{ width: `${Math.min(100, (100 * Math.ceil(state.line.length / 2)) / state.maxMoves)}%` }} />
      </div>
      <dl className="stats">
        <div>
          <dt>{t('trainer.correct')}</dt>
          <dd className="good">{stats.correct}</dd>
        </div>
        <div>
          <dt>{t('trainer.errors')}</dt>
          <dd className="bad">{stats.errors}</dd>
        </div>
        <div>
          <dt>{t('trainer.accuracy')}</dt>
          <dd>{pct}%</dd>
        </div>
        <div>
          <dt>{t('trainer.linesTotal')}</dt>
          <dd>{total?.lines ?? 0}</dd>
        </div>
      </dl>
    </section>
  );
}

function Hints({ candidates, searching }: { candidates: readonly Candidate[]; searching: boolean }) {
  const { t } = useI18n();
  return (
    <section className="t-card hints">
      <div className="progress-head">
        <span>{t('trainer.hints')}</span>
        {searching && <span className="muted">{t('trainer.thinking')}</span>}
      </div>
      <ul>
        {candidates.map((c) => (
          <li key={c.rank}>
            <span className="badge" style={{ background: c.color, color: textColorOn(c.color) }}>
              {c.moveScore}
            </span>
            <strong>{c.sanMove}</strong>
            <span className="muted">{formatScore(c.score)}</span>
            <span className="pv muted">{c.pvSan.slice(1, 4).join(' ')}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function MoveStrip({ san }: { san: readonly string[] }) {
  const { t } = useI18n();
  if (san.length === 0) return <div className="move-strip muted">{t('trainer.noMoves')}</div>;
  return (
    <div className="move-strip">
      {san.map((m, i) => (
        <span key={i} className={i === san.length - 1 ? 'last' : ''}>
          {i % 2 === 0 && <em>{i / 2 + 1}.</em>}
          {m}
        </span>
      ))}
    </div>
  );
}
