import { createContext, useContext, useSyncExternalStore } from 'react';
import type { AnalysisManager, AnalysisState } from '../core/analysis.manager';
import type { OpeningExplorer, ExplorerState } from '../core/opening.explorer';
import type { DrillManager, DrillState } from '../core/drill.manager';
import type { SoundService, SoundSettings } from '../services/sound.service';

export interface AppServices {
  readonly manager: AnalysisManager;
  readonly explorer: OpeningExplorer;
  readonly drill: DrillManager;
  readonly sound: SoundService;
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
