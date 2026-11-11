import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Square } from 'chess.js';
import { useAnalysis, useDrill, useExplorer, useServices } from '../../src/hooks/useAnalysis';
import { Board } from '../../src/components/Board';
import { DRILL_SECTIONS, type DrillState, type SectionTotals } from '../../src/core/drill.manager';
import { formatScore } from '../../src/core/format';
import { textColorOn } from '../../src/core/move-score';
import type { Candidate } from '../../src/core/candidates';
import type { Color } from '../../src/core/types';
import { SoundControls } from '../../src/components/SoundControls';

/** Short descriptions for the section cards. */
const ABOUT: Record<string, { readonly blurb: string; readonly eco: string; readonly icon: string }> = {
  all: { blurb: 'Все дебюты книги вперемешку', eco: 'A00–E99', icon: '♞' },
  indian: { blurb: 'Нимцович, староиндийская, новоиндийская, Боголюбов', eco: 'A45–E99', icon: '♝' },
  gambits: { blurb: 'Ферзевый, королевский, Эванса, Муцио и другие', eco: 'разные', icon: '♟' },
  sicilian: { blurb: 'Найдорф, дракон, Свешников, Тайманов', eco: 'B20–B99', icon: '♛' },
  french: { blurb: 'Винавер, Тарраш, классическая система', eco: 'C00–C19', icon: '♜' },
  caro: { blurb: 'Классическая, атака Панова, система с продвижением', eco: 'B10–B19', icon: '♚' },
  slav: { blurb: 'Славянская и полуславянская защита', eco: 'D10–D19, D43–D49', icon: '♞' },
};

export function TrainerApp() {
  const { manager, drill } = useServices();
  const analysis = useAnalysis();
  const drillState = useDrill();
  const explorerState = useExplorer();
  const bookReady = explorerState.status === 'ready';

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
            <h1>Тренажёр дебютов</h1>
            <p>LiveChess Analyzer · всё считается на вашем компьютере</p>
          </div>
        </div>
        <div className="head-actions">
          <SoundControls compact />
          {drillState.status !== 'idle' && (
            <button className="ghost" onClick={() => drill.stop()}>
              ← К разделам
            </button>
          )}
        </div>
      </header>

      {drillState.status === 'idle' ? (
        <SectionPicker state={drillState} bookReady={bookReady} onStart={(o) => drill.start(o)} />
      ) : (
        <main className="t-play">
          <div className="t-board-card">
            <div className="t-opening">{drillState.openingName ?? 'Начальная позиция'}</div>
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
  onStart,
}: {
  state: DrillState;
  bookReady: boolean;
  onStart(o: { sectionId: string; userColor: Color; maxMoves: number }): void;
}) {
  const [selected, setSelected] = useState(state.sectionId);
  const section = DRILL_SECTIONS.find((s) => s.id === selected) ?? DRILL_SECTIONS[0]!;
  const [color, setColor] = useState<Color>(section.defaultColor);
  const [maxMoves, setMaxMoves] = useState(state.maxMoves);

  return (
    <main className="t-picker">
      <h2>Что тренируем сегодня?</h2>
      <div className="cards">
        {DRILL_SECTIONS.map((s) => {
          const about = ABOUT[s.id];
          const t = state.totals[s.id];
          return (
            <button
              key={s.id}
              className={`card${selected === s.id ? ' selected' : ''}`}
              onClick={() => {
                setSelected(s.id);
                setColor(s.defaultColor);
              }}
            >
              <span className="card-icon" aria-hidden>
                {about?.icon}
              </span>
              <span className="card-title">{s.title}</span>
              <span className="card-blurb">{about?.blurb}</span>
              <span className="card-meta">
                <span>{about?.eco}</span>
                {t && <Accuracy totals={t} />}
              </span>
            </button>
          );
        })}
      </div>

      <div className="start-bar">
        <div className="seg" role="group" aria-label="Цвет">
          <button className={color === 'w' ? 'on' : ''} onClick={() => setColor('w')}>
            ♔ Белыми
          </button>
          <button className={color === 'b' ? 'on' : ''} onClick={() => setColor('b')}>
            ♚ Чёрными
          </button>
        </div>
        <label className="moves-input">
          Ходов в линии
          <input type="number" min={1} max={30} value={maxMoves} onChange={(e) => setMaxMoves(Number(e.target.value) || 10)} />
        </label>
        <button className="primary" disabled={!bookReady} onClick={() => onStart({ sectionId: selected, userColor: color, maxMoves })}>
          {bookReady ? 'Начать тренировку' : 'Загружаем книгу дебютов…'}
        </button>
      </div>
    </main>
  );
}

function Accuracy({ totals }: { totals: SectionTotals }) {
  if (totals.positions === 0) return null;
  const pct = Math.round((100 * totals.correct) / totals.positions);
  return (
    <span className="acc" title={`Линий пройдено: ${totals.lines}, верно ${totals.correct}, ошибок ${totals.errors}`}>
      <span className="ring" style={{ background: `conic-gradient(var(--good) ${pct * 3.6}deg, var(--track) 0)` }} />
      {pct}%
    </span>
  );
}

function Feedback({ state, onReveal, onRestart }: { state: DrillState; onReveal(): void; onRestart(): void }) {
  const tone = state.message?.tone ?? 'info';
  return (
    <section className={`t-card feedback tone-${tone}`}>
      <div className="feedback-text">{state.message?.text ?? 'Ваш ход'}</div>
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
            Показать ход теории
          </button>
        )}
        <button className={state.status === 'finished' ? 'primary' : 'soft'} onClick={onRestart}>
          {state.status === 'finished' ? 'Ещё линию' : 'Начать заново'}
        </button>
      </div>
      <p className="hint">
        {state.status === 'playing'
          ? `Вы играете ${state.userColor === 'w' ? 'белыми' : 'чёрными'}. Подсказки движка появятся после ошибки.`
          : 'Линия завершена. Прогресс сохранён.'}
      </p>
    </section>
  );
}

function Progress({ state }: { state: DrillState }) {
  const { stats } = state;
  const total = state.totals[state.sectionId];
  const section = DRILL_SECTIONS.find((s) => s.id === state.sectionId);
  const pct = stats.positions ? Math.round((100 * stats.correct) / stats.positions) : 100;
  return (
    <section className="t-card progress">
      <div className="progress-head">
        <span>{section?.title}</span>
        <span className="muted">
          ход {Math.ceil(state.line.length / 2)} из {state.maxMoves}
        </span>
      </div>
      <div className="bar">
        <span style={{ width: `${Math.min(100, (100 * Math.ceil(state.line.length / 2)) / state.maxMoves)}%` }} />
      </div>
      <dl className="stats">
        <div>
          <dt>Верно</dt>
          <dd className="good">{stats.correct}</dd>
        </div>
        <div>
          <dt>Ошибок</dt>
          <dd className="bad">{stats.errors}</dd>
        </div>
        <div>
          <dt>Точность</dt>
          <dd>{pct}%</dd>
        </div>
        <div>
          <dt>Линий всего</dt>
          <dd>{total?.lines ?? 0}</dd>
        </div>
      </dl>
    </section>
  );
}

function Hints({ candidates, searching }: { candidates: readonly Candidate[]; searching: boolean }) {
  return (
    <section className="t-card hints">
      <div className="progress-head">
        <span>Подсказка движка</span>
        {searching && <span className="muted">считает…</span>}
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
  if (san.length === 0) return <div className="move-strip muted">Ходов пока нет</div>;
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
