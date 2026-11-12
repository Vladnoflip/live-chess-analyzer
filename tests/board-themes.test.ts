import { describe, expect, it } from 'vitest';
import {
  BOARD_PALETTES,
  BOARD_THEMES,
  BOARD_THEME_STORAGE_KEY,
  BoardThemeStore,
  boardThemeVars,
  isBoardTheme,
} from '../src/core/board-themes';
import { I18n } from '../src/core/i18n';

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

class MemoryStorage {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
}

describe('board themes', () => {
  it('offers Classic, Wood, Neon and Soft with names in both languages', () => {
    expect(BOARD_THEMES).toEqual(['classic', 'wood', 'neon', 'soft']);
    const en = new I18n('en');
    const ru = new I18n('ru');
    expect(BOARD_THEMES.map((id) => en.t(BOARD_PALETTES[id].label))).toEqual(['Classic', 'Wood', 'Neon', 'Soft']);
    expect(BOARD_THEMES.map((id) => ru.t(BOARD_PALETTES[id].label))).toEqual(['Классика', 'Дерево', 'Неон', 'Мягкая']);
  });

  it('keeps pieces readable on every square colour', () => {
    for (const id of BOARD_THEMES) {
      const { light, dark } = BOARD_PALETTES[id];
      // Squares are told apart, but not so harsh that pieces get lost.
      expect(contrast(light, dark), id).toBeGreaterThan(1.3);
      expect(contrast(light, dark), id).toBeLessThan(4);
      // Black pieces (black fill) and white pieces (white fill, black outline).
      for (const sq of [light, dark]) {
        expect(contrast('#000000', sq), `${id} black on ${sq}`).toBeGreaterThanOrEqual(2);
        expect(contrast('#ffffff', sq), `${id} white on ${sq}`).toBeGreaterThanOrEqual(1.15);
      }
    }
    // The darkest palette outlines pieces with a glow.
    expect(BOARD_PALETTES.neon.pieceFilter).toMatch(/drop-shadow\(0 0 /);
  });

  it('exposes the palette as CSS custom properties', () => {
    const vars = boardThemeVars('wood');
    expect(vars['--sq-light']).toBe(BOARD_PALETTES.wood.light);
    expect(vars['--sq-dark']).toBe(BOARD_PALETTES.wood.dark);
    expect(Object.keys(vars).every((k) => k.startsWith('--'))).toBe(true);
    for (const id of BOARD_THEMES) expect(Object.keys(boardThemeVars(id))).toEqual(Object.keys(vars));
  });

  it('remembers the choice and ignores junk in storage', () => {
    const storage = new MemoryStorage();
    const store = new BoardThemeStore('classic', storage);
    expect(store.getState().theme).toBe('classic');
    store.setTheme('neon');
    expect(storage.getItem(BOARD_THEME_STORAGE_KEY)).toBe('neon');
    expect(new BoardThemeStore('classic', storage).getState().theme).toBe('neon');
    storage.setItem(BOARD_THEME_STORAGE_KEY, 'rainbow');
    expect(new BoardThemeStore('soft', storage).getState().theme).toBe('soft');
    expect(isBoardTheme('wood')).toBe(true);
    expect(isBoardTheme('rainbow')).toBe(false);
    expect(isBoardTheme(3)).toBe(false);
  });

  it('works without storage (extension trainer gets the theme from settings)', () => {
    const blocked = {
      getItem(): string | null {
        throw new Error('blocked');
      },
      setItem(): void {
        throw new Error('blocked');
      },
    };
    const store = new BoardThemeStore('soft', blocked);
    expect(store.getState().theme).toBe('soft');
    store.setTheme('wood');
    expect(store.getState().theme).toBe('wood');
  });
});
