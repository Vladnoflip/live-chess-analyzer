import { Store } from './observable';
import type { MessageKey } from './i18n';

/**
 * Board skins. Each theme is a set of CSS custom properties applied to the board SVG,
 * so the web app and the extension's trainer page share the same palettes.
 */
export const BOARD_THEMES = ['classic', 'wood', 'neon', 'soft'] as const;
export type BoardTheme = (typeof BOARD_THEMES)[number];

export interface BoardPalette {
  readonly label: MessageKey;
  readonly light: string;
  readonly dark: string;
  /** Last-move highlight (drawn over the square colour). */
  readonly last: string;
  readonly selected: string;
  /** Legal-move dots and capture rings. */
  readonly target: string;
  readonly coord: string;
  /** CSS filter for pieces: a soft shadow, or a glow where the squares are dark. */
  readonly pieceFilter: string;
}

export const BOARD_PALETTES: Readonly<Record<BoardTheme, BoardPalette>> = {
  classic: {
    label: 'theme.classic',
    light: '#e9d8b4',
    dark: '#b08661',
    last: 'rgba(255, 221, 0, 0.35)',
    selected: 'rgba(79, 157, 255, 0.45)',
    target: 'rgba(0, 0, 0, 0.25)',
    coord: 'rgba(0, 0, 0, 0.45)',
    pieceFilter: 'drop-shadow(0 0.02px 0.02px rgba(0, 0, 0, 0.25))',
  },
  wood: {
    label: 'theme.wood',
    light: '#e3bf86',
    dark: '#9a6534',
    last: 'rgba(255, 236, 140, 0.42)',
    selected: 'rgba(120, 200, 120, 0.45)',
    target: 'rgba(60, 30, 5, 0.3)',
    coord: 'rgba(60, 30, 5, 0.6)',
    pieceFilter: 'drop-shadow(0 0.03px 0.025px rgba(40, 20, 0, 0.45))',
  },
  neon: {
    label: 'theme.neon',
    light: '#6a72c9',
    dark: '#343b86',
    last: 'rgba(255, 64, 214, 0.38)',
    selected: 'rgba(0, 255, 240, 0.38)',
    target: 'rgba(0, 255, 240, 0.45)',
    coord: 'rgba(170, 255, 255, 0.85)',
    // A cyan outline keeps black pieces readable on the dark-blue squares.
    pieceFilter: 'drop-shadow(0 0 0.025px rgba(0, 255, 255, 0.95)) drop-shadow(0 0 0.05px rgba(0, 255, 255, 0.55))',
  },
  soft: {
    label: 'theme.soft',
    light: '#ece6d6',
    dark: '#a9b99f',
    last: 'rgba(222, 196, 120, 0.42)',
    selected: 'rgba(111, 154, 126, 0.45)',
    target: 'rgba(60, 70, 55, 0.22)',
    coord: 'rgba(60, 60, 50, 0.5)',
    pieceFilter: 'drop-shadow(0 0.025px 0.02px rgba(0, 0, 0, 0.22))',
  },
};

export function isBoardTheme(v: unknown): v is BoardTheme {
  return typeof v === 'string' && (BOARD_THEMES as readonly string[]).includes(v);
}

/** CSS custom properties for the board element (`style` attribute). */
export function boardThemeVars(theme: BoardTheme): Record<string, string> {
  const p = BOARD_PALETTES[theme];
  return {
    '--sq-light': p.light,
    '--sq-dark': p.dark,
    '--sq-last': p.last,
    '--sq-selected': p.selected,
    '--sq-target': p.target,
    '--coord': p.coord,
    '--piece-filter': p.pieceFilter,
  };
}

interface PrefStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const BOARD_THEME_STORAGE_KEY = 'livechess.boardTheme.v1';

/** Selected board theme; persisted in localStorage (web) or set from extension settings. */
export class BoardThemeStore extends Store<{ readonly theme: BoardTheme }> {
  constructor(
    fallback: BoardTheme = 'classic',
    private readonly storage: PrefStorage | null = null,
  ) {
    let theme = fallback;
    try {
      const saved = storage?.getItem(BOARD_THEME_STORAGE_KEY);
      if (isBoardTheme(saved)) theme = saved;
    } catch {
      // Blocked storage: use the fallback.
    }
    super({ theme });
  }

  setTheme(theme: BoardTheme): void {
    if (theme === this.getState().theme) return;
    this.setState({ theme });
    try {
      this.storage?.setItem(BOARD_THEME_STORAGE_KEY, theme);
    } catch {
      // Not persisted.
    }
  }
}
