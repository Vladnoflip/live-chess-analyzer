import { describe, expect, it } from 'vitest';
import en from '../src/locales/en.json';
import ru from '../src/locales/ru.json';
import { DICTIONARY_KEYS, I18n, LOCALE_STORAGE_KEY, detectLocale, resolveLocale, translate } from '../src/core/i18n';

describe('dictionaries', () => {
  it('have exactly the same keys', () => {
    expect(Object.keys(ru).sort()).toEqual(Object.keys(en).sort());
  });

  it('use the same placeholders in both languages', () => {
    const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(ru[key]), key).toEqual(placeholders(en[key]));
    }
  });

  it('have no empty strings and no Cyrillic in English', () => {
    for (const [key, value] of Object.entries(en)) {
      expect(value.length, key).toBeGreaterThan(0);
      if (key !== 'lang.ru') expect(/[А-Яа-яЁё]/.test(value), key).toBe(false);
    }
    for (const [key, value] of Object.entries(ru)) expect(value.length, key).toBeGreaterThan(0);
  });
});

describe('language detection', () => {
  it.each([
    ['ru', 'ru'],
    ['ru-RU', 'ru'],
    ['RU-ua', 'ru'],
    ['en-US', 'en'],
    ['de-DE', 'en'],
    ['uk-UA', 'en'],
    ['', 'en'],
    [undefined, 'en'],
  ] as const)('%s -> %s', (lang, locale) => {
    expect(detectLocale(lang)).toBe(locale);
  });

  it('manual choice overrides the system language', () => {
    expect(resolveLocale('auto', 'ru-RU')).toBe('ru');
    expect(resolveLocale('en', 'ru-RU')).toBe('en');
    expect(resolveLocale('ru', 'en-US')).toBe('ru');
  });
});

describe('translate', () => {
  it('fills placeholders', () => {
    expect(translate('en', 'drill.msg.correct', { san: 'Nf3' })).toBe('Correct: Nf3');
    expect(translate('ru', 'drill.msg.correct', { san: 'Nf3' })).toBe('Верно: Nf3');
    expect(translate('en', 'trainer.moveOf', { n: 3, max: 10 })).toBe('move 3 of 10');
  });

  it('leaves unknown placeholders untouched', () => {
    expect(translate('en', 'drill.msg.correct')).toBe('Correct: {san}');
  });

  it('exposes the key set for markup validation', () => {
    expect(DICTIONARY_KEYS.has('popup.enabled')).toBe(true);
    expect(DICTIONARY_KEYS.has('nope')).toBe(false);
  });
});

describe('I18n store', () => {
  function memory() {
    const data = new Map<string, string>();
    return { data, storage: { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) } };
  }

  it('defaults to English unless the system is Russian', () => {
    expect(new I18n('de-DE').getState()).toEqual({ pref: 'auto', locale: 'en' });
    expect(new I18n('ru-RU').getState()).toEqual({ pref: 'auto', locale: 'ru' });
  });

  it('persists a manual override and restores it', () => {
    const { data, storage } = memory();
    const a = new I18n('ru-RU', storage);
    a.setPref('en');
    expect(a.getState().locale).toBe('en');
    expect(a.t('mode.drill')).toBe('Trainer');
    expect(data.get(LOCALE_STORAGE_KEY)).toBe('en');
    expect(new I18n('ru-RU', storage).getState()).toEqual({ pref: 'en', locale: 'en' });
  });

  it('ignores junk in storage and survives blocked storage', () => {
    const { data, storage } = memory();
    data.set(LOCALE_STORAGE_KEY, 'klingon');
    expect(new I18n('en-US', storage).getState().pref).toBe('auto');
    const blocked = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      },
    };
    const b = new I18n('ru', blocked);
    expect(() => b.setPref('en')).not.toThrow();
    expect(b.getState().locale).toBe('en');
  });
});
