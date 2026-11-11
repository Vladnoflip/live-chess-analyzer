import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AnalysisContext } from './hooks/useAnalysis';
import { AnalysisManager } from './core/analysis.manager';
import { EngineService } from './services/engine.service';
import { WorkerTransport, engineScriptUrl, pickEngineFlavor } from './services/engine.transport';
import { boardService } from './services/board.service';
import { OpeningExplorer } from './core/opening.explorer';
import { DrillManager } from './core/drill.manager';
import { openingContext } from './core/openings';
import { SoundService, bindSounds } from './services/sound.service';
import { I18n } from './core/i18n';
import './styles.css';

const flavor = pickEngineFlavor();
const engine = new EngineService(new WorkerTransport(engineScriptUrl(flavor, import.meta.env.BASE_URL)));
const manager = new AnalysisManager(engine, boardService, {
  multiThreaded: flavor === 'lite-multi',
  maxThreads: navigator.hardwareConcurrency || 1,
});
void manager.init();

// The opening book is a separate lazily loaded chunk.
const explorer = new OpeningExplorer();
explorer.onReady((book) => manager.setOpeningLookup((fenBefore, uci) => openingContext(book, boardService, fenBefore, uci)));
void explorer.load();
const drill = new DrillManager({
  getBook: () => explorer.getBook(),
  board: boardService,
  onLine: (startFen, ucis) => manager.loadUciLine(startFen, ucis),
  storage: safeLocalStorage(),
});

const sound = new SoundService(safeLocalStorage());
// UI language: navigator.language unless the user picked one in the settings.
const i18n = new I18n(navigator.language, safeLocalStorage());
bindSounds(sound, manager, drill);
// Audio may only start after a user gesture; any click or key unlocks it.
window.addEventListener('pointerdown', () => sound.unlock(), { capture: true });
window.addEventListener('keydown', () => sound.unlock(), { capture: true });

/** localStorage can throw on access (privacy modes); the trainer then simply doesn't persist. */
function safeLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

createRoot(root).render(
  <StrictMode>
    <AnalysisContext.Provider value={{ manager, explorer, drill, sound, i18n }}>
      <App />
    </AnalysisContext.Provider>
  </StrictMode>,
);
