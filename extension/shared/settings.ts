import { isLocalePref, type LocalePref, type MessageKey } from '../../src/core/i18n';

export interface ExtensionSettings {
  readonly enabled: boolean;
  readonly showArrow: boolean;
  readonly showEvalBar: boolean;
  /** Show the best-move arrow only when it is the user's turn (bot games). */
  readonly onlyMyTurn: boolean;
  /** Depth cap — lower values save battery. */
  readonly depth: number;
  readonly threads: number;
  readonly hashMb: number;
  /** Candidate lines (MultiPV): 1, 3 or 5. */
  readonly multiPv: number;
  /** Compact variants panel next to the board. */
  readonly showPanel: boolean;
  /** Opening name next to the eval bar (only while in book). */
  readonly showOpening: boolean;
  /** Overlay / popup / trainer font (system fonts only — no web-font downloads). */
  readonly fontFamily: FontId;
  /** Text size multiplier for the overlay panel and labels. */
  readonly fontScale: number;
  /** UI language of the popup and the trainer page; 'auto' follows the browser. */
  readonly locale: LocalePref;
}

export type FontId = 'system' | 'humanist' | 'rounded' | 'serif' | 'mono';

export const FONTS: Readonly<Record<FontId, { readonly label: MessageKey; readonly stack: string }>> = {
  system: { label: 'font.system', stack: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
  humanist: { label: 'font.humanist', stack: "'Segoe UI Variable', 'Gill Sans', 'Trebuchet MS', Calibri, sans-serif" },
  rounded: { label: 'font.rounded', stack: "ui-rounded, 'SF Pro Rounded', 'Arial Rounded MT Bold', Nunito, 'Segoe UI', sans-serif" },
  serif: { label: 'font.serif', stack: "Georgia, Cambria, 'Times New Roman', serif" },
  mono: { label: 'font.mono', stack: "ui-monospace, Consolas, 'Cascadia Mono', Menlo, monospace" },
};

export const DEFAULT_SETTINGS: ExtensionSettings = {
  enabled: true,
  showArrow: true,
  showEvalBar: true,
  onlyMyTurn: false,
  depth: 14,
  threads: 2,
  hashMb: 32,
  multiPv: 3,
  showPanel: true,
  showOpening: true,
  fontFamily: 'system',
  fontScale: 100,
  locale: 'auto',
};

export const DEPTH_LIMITS = { min: 6, max: 24 } as const;

const KEY = 'settings';

export async function loadSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.sync.get(KEY);
  return sanitize(stored[KEY]);
}

export async function saveSettings(patch: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
  const next = { ...(await loadSettings()), ...patch };
  await chrome.storage.sync.set({ [KEY]: next });
  return next;
}

export function onSettingsChanged(listener: (settings: ExtensionSettings) => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes[KEY]) listener(sanitize(changes[KEY].newValue));
  });
}

/** Storage is untrusted input (older versions, manual edits): fall back to defaults field by field. */
function sanitize(raw: unknown): ExtensionSettings {
  const src = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const bool = (k: keyof ExtensionSettings) => (typeof src[k] === 'boolean' ? (src[k] as boolean) : (DEFAULT_SETTINGS[k] as boolean));
  const num = (k: keyof ExtensionSettings, min: number, max: number) => {
    const v = src[k];
    return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : (DEFAULT_SETTINGS[k] as number);
  };
  return {
    enabled: bool('enabled'),
    showArrow: bool('showArrow'),
    showEvalBar: bool('showEvalBar'),
    onlyMyTurn: bool('onlyMyTurn'),
    depth: num('depth', DEPTH_LIMITS.min, DEPTH_LIMITS.max),
    threads: num('threads', 1, 32),
    hashMb: num('hashMb', 16, 256),
    multiPv: num('multiPv', 1, 5),
    showPanel: bool('showPanel'),
    showOpening: bool('showOpening'),
    fontFamily: typeof src.fontFamily === 'string' && src.fontFamily in FONTS ? (src.fontFamily as FontId) : DEFAULT_SETTINGS.fontFamily,
    fontScale: num('fontScale', 80, 150),
    locale: isLocalePref(src.locale) ? src.locale : DEFAULT_SETTINGS.locale,
  };
}
