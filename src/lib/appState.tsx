import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  activeDays, allPhrases, DEFAULT_SETTINGS, getApiKey, getProgress, getSettings, saveSettings,
  type EpisodeProgress, type Settings,
} from './store.ts';

interface AppState {
  ready: boolean;
  settings: Settings;
  hasKey: boolean;
  progress: Record<string, EpisodeProgress>;
  phraseCount: number;
  days: string[];
  update: (patch: Partial<Settings>) => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [hasKey, setHasKey] = useState(false);
  const [progress, setProgress] = useState<Record<string, EpisodeProgress>>({});
  const [phraseCount, setPhraseCount] = useState(0);
  const [days, setDays] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    const [s, k, p, ph, d] = await Promise.all([getSettings(), getApiKey(), getProgress(), allPhrases(), activeDays()]);
    setSettings(s);
    setHasKey(!!k);
    setProgress(p);
    setPhraseCount(ph.length);
    setDays(d);
    setReady(true);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const update = useCallback(async (patch: Partial<Settings>) => {
    setSettings(await saveSettings(patch));
  }, []);

  return <Ctx.Provider value={{ ready, settings, hasKey, progress, phraseCount, days, update, refresh }}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const c = useContext(Ctx);
  if (!c) throw new Error('no app state');
  return c;
}

export function weekCount(days: string[]): number {
  const now = new Date();
  const dow = (now.getDay() + 6) % 7; // Monday = 0
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow).getTime();
  return days.filter((d) => {
    const [y, m, dd] = d.split('-').map(Number);
    return new Date(y, m - 1, dd).getTime() >= monday;
  }).length;
}
