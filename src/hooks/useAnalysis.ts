import { createContext, useContext, useSyncExternalStore } from 'react';
import type { AnalysisManager, AnalysisState } from '../core/analysis.manager';
import type { OpeningExplorer, ExplorerState } from '../core/opening.explorer';
import type { DrillManager, DrillState } from '../core/drill.manager';
import type { SoundService, SoundSettings } from '../services/sound.service';
import type { I18n, I18nState, MessageKey, MessageParams, Msg } from '../core/i18n';
import { translate, translateMsg } from '../core/i18n';

export interface AppServices {
  readonly manager: AnalysisManager;
  readonly explorer: OpeningExplorer;
  readonly drill: DrillManager;
  readonly sound: SoundService;
  readonly i18n: I18n;
}

export const AnalysisContext = createContext<AppServices | null>(null);

export function useServices(): AppServices {
  const services = useContext(AnalysisContext);
  if (!services) throw new Error('AnalysisContext is not provided');
  return services;
}

export function useManager(): AnalysisManager {
  return useServices().manager;
}

export function useAnalysis(): AnalysisState {
  const { manager } = useServices();
  return useSyncExternalStore(manager.subscribe, manager.getState);
}

export function useExplorer(): ExplorerState {
  const { explorer } = useServices();
  return useSyncExternalStore(explorer.subscribe, explorer.getState);
}

export function useDrill(): DrillState {
  const { drill } = useServices();
  return useSyncExternalStore(drill.subscribe, drill.getState);
}

export function useSound(): SoundSettings {
  const { sound } = useServices();
  return useSyncExternalStore(sound.subscribe, sound.getState);
}

export interface Translator extends I18nState {
  /** Text for a dictionary key. */
  t(key: MessageKey, params?: MessageParams): string;
  /** Text for a message produced by the core (explanations, trainer feedback, errors). */
  text(m: Msg): string;
  setPref: I18n['setPref'];
}

/** Current UI language; components re-render when it changes. */
export function useI18n(): Translator {
  const { i18n } = useServices();
  const state = useSyncExternalStore(i18n.subscribe, i18n.getState);
  return {
    ...state,
    t: (key, params) => translate(state.locale, key, params),
    text: (m) => translateMsg(state.locale, m),
    setPref: (p) => i18n.setPref(p),
  };
}
