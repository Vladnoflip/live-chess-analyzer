import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Square } from 'chess.js';
import { useAnalysis, useDrill, useExplorer, useI18n, useServices } from './hooks/useAnalysis';
import type { AnalysisState } from './core/analysis.manager';
import type { MessageKey, MessageParams } from './core/i18n';
import { START_FEN, boardService } from './services/board.service';
import { exportAnnotatedPgn, pgnFileName } from './core/pgn-export';
import { mistakeHeatmap } from './core/heatmap';
import { downloadText } from './components/download';
import { Board } from './components/Board';
import { EvalBar } from './components/EvalBar';
import { EnginePanel } from './components/EnginePanel';
import { MoveList } from './components/MoveList';
import { LoadPanel } from './components/LoadPanel';
import { LichessImportPanel } from './components/LichessImportPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { VariantsPanel } from './components/VariantsPanel';
import { OpeningExplorerPanel } from './components/OpeningExplorerPanel';
import { DrillPanel } from './components/DrillPanel';
import { SupportLink } from './components/SupportLink';
import { DRILL_SECTIONS, sectionLineCount } from './core/drill.manager';

type Mode = 'analysis' | 'explorer' | 'drill';

const MODES: readonly { id: Mode; title: MessageKey }[] = [
  { id: 'analysis', title: 'mode.analysis' },
  { id: 'explorer', title: 'mode.explorer' },
  { id: 'drill', title: 'mode.drill' },
];

export function App() {
  const { manager, explorer, drill } = useServices();
  const state = useAnalysis();
  const explorerState = useExplorer();
  const drillState = useDrill();
  const { t, text, locale } = useI18n();

  // Keep <html lang> and the tab title in sync with the UI language.
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = t('app.pageTitle');
  }, [locale]);
  const [flipped, setFlipped] = useState(false);
  const [mode, setMode] = useState<Mode>('analysis');
  const [showHeatmap, setShowHeatmap] = useState(false);

  // state.fen is a deliberate dependency: the manager methods read the current position.
  const pieces = useMemo(() => manager.pieces(), [manager, state.fen]);
  const targetsFrom = useCallback((sq: Square) => manager.targetsFrom(sq), [manager, state.fen]);
  const position = useMemo(() => explorer.describe(state.fen), [explorer, explorerState.status, state.fen]);
  const bookMoves = useMemo(() => explorer.movesAt(state.fen), [explorer, explorerState, state.fen]);
  const tree = useMemo(() => explorer.nameTree(), [explorer, explorerState.status]);
  const lineCounts = useMemo(() => {
    const book = explorer.getBook();
    return book ? Object.fromEntries(DRILL_SECTIONS.map((s) => [s.id, sectionLineCount(book, s)])) : {};
  }, [explorer, explorerState.status]);
  const searchOpenings = useCallback((q: string) => explorer.search(q), [explorer, explorerState.status]);
  const bookPlies = useMemo(() => explorer.bookPlies(state.moves), [explorer, explorerState.status, state.moves]);

  const drilling = mode === 'drill' && drillState.status !== 'idle';
  const heatmap = useMemo(() => mistakeHeatmap(state.moves, state.classes), [state.moves, state.classes]);
  const heatmapVisible = showHeatmap && mode === 'analysis' && Object.keys(state.classes).length > 0;
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
        <nav className="modes" aria-label={t('mode.label')}>
          {MODES.map((m) => (
            <button key={m.id} className={mode === m.id ? 'active' : ''} onClick={() => switchMode(m.id)}>
              {t(m.title)}
            </button>
          ))}
        </nav>
        <span className="muted small-text">{t('app.localNote')}</span>
      </header>

      <main className="layout">
        <div className="board-area">
          <EvalBar score={hintsHidden ? null : state.live.score} flipped={flipped} draw={state.drawReason} />
          <div className="board-wrap">
            <div className={`opening-strip ${position.inBook ? 'in' : 'out'}`}>
              {explorerState.status !== 'ready'
                ? t('strip.loading')
                : position.opening
                  ? t(position.inBook ? 'strip.opening' : 'strip.openingOut', { name: position.opening.name, eco: position.opening.eco })
                  : position.inBook
                    ? t('strip.start')
                    : t('strip.out')}
            </div>
            <Board
              pieces={pieces}
              flipped={flipped}
              arrows={hintsHidden ? [] : manager.candidateArrows()}
              pvMarks={hintsHidden ? [] : manager.pvPreview()}
              lastMove={manager.lastMove()}
              heatmap={heatmapVisible ? heatmap : undefined}
              targetsFrom={targetsFrom}
              onMove={onBoardMove}
            />
            {!drilling && (
              <div className="nav">
                <button onClick={() => manager.goTo(0)} title={t('nav.first')}>⏮</button>
                <button onClick={() => manager.prev()} title={t('nav.prev')}>◀</button>
                <button onClick={() => manager.next()} title={t('nav.next')}>▶</button>
                <button onClick={() => manager.goTo(state.moves.length)} title={t('nav.last')}>⏭</button>
                <button onClick={() => setFlipped((f) => !f)} title={t('nav.flip')}>⇅</button>
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
              tree={tree}
              search={searchOpenings}
              onOpenLine={(entry) => manager.loadUciLine(START_FEN, entry.uci)}
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
              lineCounts={lineCounts}
              onStart={(o) => {
                setFlipped(o.userColor === 'b');
                drill.start(o);
              }}
              onRestart={() => drill.restart()}
              onStop={() => drill.stop()}
              onReveal={() => drill.reveal()}
            />
          )}
          <EnginePanel live={hintsHidden ? { ...state.live, score: null, bestMoveSan: null, bestMoveUci: null, pvSan: [] } : state.live} engineName={state.engineName} threads={state.settings.threads} draw={state.drawReason} />
          {!hintsHidden && (
            <VariantsPanel
              candidates={state.candidates}
              selectedRank={state.selectedRank}
              explanation={state.explanation}
              explanationTitle={explanationTitle(state, t)}
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
            heatmap={mode === 'analysis' ? { on: showHeatmap, squares: heatmap.length, onToggle: setShowHeatmap } : undefined}
            onExport={() => downloadText(pgnFileName(state.headers), exportAnnotatedPgn(state, boardService, text))}
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
              <LichessImportPanel />
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
      <footer className="app-footer">
        <span className="muted small-text">LiveChess Analyzer · GPL-3.0</span>
        <SupportLink />
      </footer>
    </div>
  );
}

function explanationTitle(state: AnalysisState, t: (key: MessageKey, params?: MessageParams) => string): string | null {
  const selected = state.candidates.find((c) => c.rank === state.selectedRank);
  if (selected) return t('explain.titleVariant', { san: selected.sanMove });
  const move = state.moves[state.ply - 1];
  if (!move) return null;
  const n = Number(move.fenBefore.split(' ')[5] ?? '1');
  return t('explain.titleMove', { move: `${n}${move.color === 'w' ? '.' : '…'} ${move.san}` });
}
