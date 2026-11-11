import en from '../locales/en.json';
import ru from '../locales/ru.json';
import { Store } from './observable';

export type Locale = 'en' | 'ru';
/** 'auto' follows the browser/system language. */
export type LocalePref = 'auto' | Locale;
export type MessageKey = keyof typeof en;
export type MessageParams = Readonly<Record<string, string | number>>;

/** A translatable message. Core modules return these; the UI turns them into text. */
export interface Msg {
  readonly key: MessageKey;
  readonly params?: MessageParams;
}

export const LOCALES: readonly Locale[] = ['en', 'ru'];

/** All dictionary keys, for validating keys that come from markup (data-i18n). */
export const DICTIONARY_KEYS: ReadonlySet<string> = new Set(Object.keys(en));

// Typed as the English key set: a key missing from ru.json is a compile error.
const RU: Record<MessageKey, string> = ru;
const DICTS: Readonly<Record<Locale, Readonly<Record<MessageKey, string>>>> = { en, ru: RU };

export function msg(key: MessageKey, params?: MessageParams): Msg {
  return params ? { key, params } : { key };
}

/** Russian system language → Russian UI; anything else → English. */
export function detectLocale(language: string | null | undefined): Locale {
  return language?.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

export function resolveLocale(pref: LocalePref, language: string | null | undefined): Locale {
  return pref === 'auto' ? detectLocale(language) : pref;
}

export function isLocalePref(v: unknown): v is LocalePref {
  return v === 'auto' || v === 'en' || v === 'ru';
}

/** Fills `{name}` placeholders; unknown placeholders are left as they are. */
export function translate(locale: Locale, key: MessageKey, params?: MessageParams): string {
  const template = DICTS[locale][key] ?? DICTS.en[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (params[name] !== undefined ? String(params[name]) : whole));
}

export function translateMsg(locale: Locale, m: Msg): string {
  return translate(locale, m.key, m.params);
}

export interface I18nState {
  readonly pref: LocalePref;
  readonly locale: Locale;
}

interface PrefStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const LOCALE_STORAGE_KEY = 'livechess.locale.v1';

/**
 * Current UI language. `systemLanguage` is navigator.language; the manual choice is
 * persisted in `storage` (web app) or applied from outside via setPref (extension
 * pages read it from chrome.storage).
 */
export class I18n extends Store<I18nState> {
  constructor(
    private readonly systemLanguage: string | null | undefined,
    private readonly storage: PrefStorage | null = null,
  ) {
    let pref: LocalePref = 'auto';
    try {
      const saved = storage?.getItem(LOCALE_STORAGE_KEY);
      if (isLocalePref(saved)) pref = saved;
    } catch {
      // Blocked storage: follow the system language.
    }
    super({ pref, locale: resolveLocale(pref, systemLanguage) });
  }

  setPref(pref: LocalePref): void {
    this.setState({ pref, locale: resolveLocale(pref, this.systemLanguage) });
    try {
      this.storage?.setItem(LOCALE_STORAGE_KEY, pref);
    } catch {
      // Not persisted; the choice lasts for this session.
    }
  }

  t = (key: MessageKey, params?: MessageParams): string => translate(this.getState().locale, key, params);

  text = (m: Msg): string => translateMsg(this.getState().locale, m);
}
