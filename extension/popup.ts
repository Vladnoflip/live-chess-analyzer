import { DEPTH_LIMITS, FONTS, loadSettings, saveSettings, type ExtensionSettings, type FontId } from './shared/settings';

type BoolKey = 'enabled' | 'showArrow' | 'showEvalBar' | 'onlyMyTurn' | 'showPanel' | 'showOpening';
type NumKey = 'depth' | 'threads' | 'hashMb';

const BOOL_KEYS: readonly BoolKey[] = ['enabled', 'showArrow', 'showEvalBar', 'onlyMyTurn', 'showPanel', 'showOpening'];
const NUM_KEYS: readonly NumKey[] = ['depth', 'threads', 'hashMb'];

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`#${id} missing`);
  return node as T;
}

async function main(): Promise<void> {
  const settings: ExtensionSettings = await loadSettings();

  const depth = el<HTMLInputElement>('depth');
  depth.min = String(DEPTH_LIMITS.min);
  depth.max = String(DEPTH_LIMITS.max);
  const threads = el<HTMLInputElement>('threads');
  threads.min = '1';
  threads.max = String(Math.max(1, navigator.hardwareConcurrency || 1));

  for (const key of BOOL_KEYS) {
    const input = el<HTMLInputElement>(key);
    input.checked = settings[key];
    input.addEventListener('change', () => void saveSettings({ [key]: input.checked }));
  }

  const fontFamily = el<HTMLSelectElement>('fontFamily');
  const fontScale = el<HTMLSelectElement>('fontScale');
  for (const [id, f] of Object.entries(FONTS)) {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = f.label;
    opt.style.fontFamily = f.stack;
    fontFamily.append(opt);
  }
  const applyFont = (id: FontId, scale: number) => {
    document.body.style.fontFamily = FONTS[id].stack;
    el<HTMLParagraphElement>('fontPreview').style.fontSize = `${(12 * scale) / 100}px`;
  };
  fontFamily.value = settings.fontFamily;
  fontScale.value = String([90, 100, 115, 130].reduce((a, b) => (Math.abs(b - settings.fontScale) < Math.abs(a - settings.fontScale) ? b : a)));
  applyFont(settings.fontFamily, settings.fontScale);
  fontFamily.addEventListener('change', () => {
    const id = fontFamily.value as FontId;
    applyFont(id, Number(fontScale.value));
    void saveSettings({ fontFamily: id });
  });
  fontScale.addEventListener('change', () => {
    applyFont(fontFamily.value as FontId, Number(fontScale.value));
    void saveSettings({ fontScale: Number(fontScale.value) });
  });

  // The trainer is a page inside the extension; opening a tab needs no extra permission.
  el<HTMLButtonElement>('openTrainer').addEventListener('click', () => {
    void chrome.tabs.create({ url: chrome.runtime.getURL('extension/trainer.html') });
    window.close();
  });

  const multiPv = el<HTMLSelectElement>('multiPv');
  multiPv.value = String(settings.multiPv);
  multiPv.addEventListener('change', () => void saveSettings({ multiPv: Number(multiPv.value) }));

  for (const key of NUM_KEYS) {
    const input = el<HTMLInputElement>(key);
    const out = el<HTMLOutputElement>(`${key}Out`);
    input.value = String(settings[key]);
    out.textContent = input.value;
    input.addEventListener('input', () => {
      out.textContent = input.value;
    });
    // `change` fires on release — the engine is reconfigured once, not per pixel.
    input.addEventListener('change', () => void saveSettings({ [key]: Number(input.value) }));
  }
}

void main();
