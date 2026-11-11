import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AnalysisContext } from '../../src/hooks/useAnalysis';
import { AnalysisManager } from '../../src/core/analysis.manager';
import { EngineService } from '../../src/services/engine.service';
import { WorkerTransport, engineScriptUrl, pickEngineFlavor } from '../../src/services/engine.transport';
import { boardService } from '../../src/services/board.service';
import { OpeningExplorer } from '../../src/core/opening.explorer';
import { DrillManager } from '../../src/core/drill.manager';
import { openingContext } from '../../src/core/openings';
import { SoundService, bindSounds } from '../../src/services/sound.service';
import { I18n } from '../../src/core/i18n';
import { FONTS, loadSettings, onSettingsChanged, type ExtensionSettings } from '../shared/settings';
import { TrainerApp } from './TrainerApp';
import './trainer.css';

// Engine runs right here: extension pages are cross-origin isolated (see manifest),
// so the multi-threaded build is available. Nothing goes over the network.
const flavor = pickEngineFlavor();
const engine = new EngineService(new WorkerTransport(engineScriptUrl(flavor, chrome.runtime.getURL('/'))));
const manager = new AnalysisManager(engine, boardService, {
  multiThreaded: flavor === 'lite-multi',
  maxThreads: navigator.hardwareConcurrency || 1,
  initialSettings: { depth: 14, multiPv: 3, hashMb: 32 },
});
void manager.init();

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
// Language comes from the extension settings (popup); 'auto' follows navigator.language.
const i18n = new I18n(navigator.language);
bindSounds(sound, manager, drill);
// Audio may only start after a user gesture; any click or key unlocks it.
window.addEventListener('pointerdown', () => sound.unlock(), { capture: true });
window.addEventListener('keydown', () => sound.unlock(), { capture: true });

function applySettings(s: ExtensionSettings): void {
  i18n.setPref(s.locale);
  const root = document.documentElement.style;
  root.setProperty('--font', FONTS[s.fontFamily].stack);
  root.setProperty('--font-scale', String(s.fontScale / 100));
}
void loadSettings().then(applySettings);
onSettingsChanged(applySettings);

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
      <TrainerApp />
    </AnalysisContext.Provider>
  </StrictMode>,
);
