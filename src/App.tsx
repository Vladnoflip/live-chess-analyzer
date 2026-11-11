import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Square } from 'chess.js';
import { useAnalysis, useDrill, useExplorer, useServices } from './hooks/useAnalysis';
import type { AnalysisState } from './core/analysis.manager';
import { START_FEN } from './services/board.service';
import { Board } from './components/Board';
import { EvalBar } from './components/EvalBar';
import { EnginePanel } from './components/EnginePanel';
import { MoveList } from './components/MoveList';
import { LoadPanel } from './components/LoadPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { VariantsPanel } from './components/VariantsPanel';
import { OpeningExplorerPanel } from './components/OpeningExplorerPanel';
import { DrillPanel } from './components/DrillPanel';

type Mode = 'analysis' | 'explorer' | 'drill';

const MODES: readonly { id: Mode; title: string }[] = [
  { id: 'analysis', title: 'Анализ' },
  { id: 'explorer', title: 'Дебюты' },
  { id: 'drill', title: 'Тренажёр' },
];

export function App() {
  const { manager, explorer, drill } = useServices();
  const state = useAnalysis();
  const explorerState = useExplorer();
  const drillState = useDrill();
  const [flipped, setFlipped] = useState(false);
  const [mode, setMode] = useState<Mode>('analysis');

  // state.fen is a deliberate dependency: the manager methods read the current position.
  const pieces = useMemo(() => manager.pieces(), [manager, state.fen]);
  const targetsFrom = useCallback((sq: Square) => manager.targetsFrom(sq), [manager, state.fen]);
  const position = useMemo(() => explorer.describe(state.fen), [explorer, explorerState.status, state.fen]);
  const bookMoves = useMemo(() => explorer.movesAt(state.fen), [explorer, explorerState, state.fen]);
  const bookPlies = useMemo(() => explorer.bookPlies(state.moves), [explorer, explorerState.status, state.moves]);

  const drilling = mode === 'drill' && drillState.status !== 'idle';
  const hintsHidden = drilling && !drillState.hintsVisible;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (drilling && e.key !== 'f') return;
      if (e.key === 'ArrowLeft') manager.prev();
      else if (e.key === 'ArrowRight') manager.next();
      else if (e.key === 'Home') manager.goTo(0);
      else if (e.key === 'End') manager.goTo(Number.MAX_SAFE_INTEGER);
      else if (e.key === 'f') setFlipped((f) => !f);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [manager, drilling]);

  const onBoardMove = (from: Square, to: Square) => {
    if (drilling) {
      const uci = manager.resolveMove(from, to);
      if (uci) drill.tryMove(uci);
      return;
    }
    manager.playMove(from, to);
  };

  const switchMode = (next: Mode) => {
    // Leaving the trainer only pauses it: the line is saved and resumed on return.
    if (mode === 'drill' && next !== 'drill') drill.pause();
    setMode(next);
  };

  // The saved line can only be continued once the opening book has loaded.
  useEffect(() => {
    if (mode === 'drill' && explorerState.status === 'ready') drill.resume();
  }, [drill, mode, explorerState.status]);

  const title = state.headers.White && state.headers.Black ? `${state.headers.White} — ${state.headers.Black}` : null;

  return (
    <div className="app">
      <header className="app-head">
        <h1>LiveChess Analyzer</h1>
        {title && <span className="game-title">{title}</span>}
        <nav className="modes" aria-label="Режим">
          {MODES.map((m) => (
            <button key={m.id} className={mode === m.id ? 'active' : ''} onClick={() => switchMode(m.id)}>
              {m.title}
            </button>
          ))}
        </nav>
        <span className="muted small-text">Всё считается локально в браузере</span>
      </header>

      <main className="layout">
        <div className="board-area">
          <EvalBar score={hintsHidden ? null : state.live.score} flipped={flipped} />
          <div className="board-wrap">
            <div className={`opening-strip ${position.inBook ? 'in' : 'out'}`}>
              {explorerState.status !== 'ready'
                ? 'Книга дебютов загружается…'
                : position.opening
                  ? `${position.opening.name} · ${position.opening.eco}${position.inBook ? '' : ' · вне теории'}`
                  : position.inBook
                    ? 'Начальная позиция'
                    : 'Вне теории'}
            </div>
            <Board
              pieces={pieces}
              flipped={flipped}
              arrows={hintsHidden ? [] : manager.candidateArrows()}
              pvMarks={hintsHidden ? [] : manager.pvPreview()}
              lastMove={manager.lastMove()}
              targetsFrom={targetsFrom}
              onMove={onBoardMove}
            />
            {!drilling && (
              <div className="nav">
                <button onClick={() => manager.goTo(0)} title="В начало (Home)">⏮</button>
                <button onClick={() => manager.prev()} title="Назад (←)">◀</button>
                <button onClick={() => manager.next()} title="Вперёд (→)">▶</button>
                <button onClick={() => manager.goTo(state.moves.length)} title="В конец (End)">⏭</button>
                <button onClick={() => setFlipped((f) => !f)} title="Перевернуть доску (F)">⇅</button>
              </div>
            )}
          </div>
        </div>

        <aside className="side">
          {mode === 'explorer' && (
            <OpeningExplorerPanel
              state={explorerState}
              position={position}
              moves={bookMoves}
              canGoBack={state.ply > 0}
              onPlay={(uci) => manager.playUci(uci)}
              onBack={() => manager.prev()}
              onRoot={() => manager.loadFen(START_FEN)}
              onFilter={(patch) => explorer.setFilter(patch)}
              onPreset={(filter) => explorer.resetFilter(filter)}
            />
          )}
          {mode === 'drill' && (
            <DrillPanel
              state={drillState}
              bookReady={explorerState.status === 'ready'}
              onStart={(o) => {
                setFlipped(o.userColor === 'b');
                drill.start(o);
              }}
              onRestart={() => drill.restart()}
              onStop={() => drill.stop()}
              onReveal={() => drill.reveal()}
            />
          )}
          <EnginePanel live={hintsHidden ? { ...state.live, score: null, bestMoveSan: null, bestMoveUci: null, pvSan: [] } : state.live} engineName={state.engineName} threads={state.settings.threads} />
          {!hintsHidden && (
            <VariantsPanel
              candidates={state.candidates}
              selectedRank={state.selectedRank}
              explanation={state.explanation}
              explanationTitle={explanationTitle(state)}
              onSelect={(rank) => manager.selectCandidate(rank)}
            />
          )}
          <MoveList
            moves={state.moves}
            classes={state.classes}
            moveScores={state.moveScores}
            bookPlies={bookPlies}
            ply={state.ply}
            review={state.review}
            onSelect={(ply) => !drilling && manager.goTo(ply)}
            onReview={() => void manager.reviewGame()}
            onCancelReview={() => manager.cancelReview()}
          />
          {mode === 'analysis' && (
            <>
              <LoadPanel
                fenInput={state.fenInput}
                fenError={state.fenError}
                pgnError={state.pgnError}
                liveMode={state.liveMode}
                onFenChange={(t) => manager.setFenInput(t)}
                onFenSubmit={() => manager.submitFen()}
                onLiveModeChange={(on) => manager.setLiveMode(on)}
                onPgnLoad={(pgn) => manager.loadPgn(pgn)}
              />
              <SettingsPanel
                settings={state.settings}
                maxThreads={state.maxThreads}
                multiThreaded={state.multiThreaded}
                onChange={(patch) => manager.updateSettings(patch)}
              />
            </>
          )}
        </aside>
      </main>
    </div>
  );
}

function explanationTitle(state: AnalysisState): string | null {
  const selected = state.candidates.find((c) => c.rank === state.selectedRank);
  if (selected) return `Разбор варианта ${selected.sanMove}`;
  const move = state.moves[state.ply - 1];
  if (!move) return null;
  const n = Number(move.fenBefore.split(' ')[5] ?? '1');
  return `Разбор хода ${n}${move.color === 'w' ? '.' : '…'} ${move.san}`;
}
