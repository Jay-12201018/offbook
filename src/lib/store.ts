import { openDB, type IDBPDatabase } from 'idb';

/**
 * Local-only storage (IndexedDB "offbook2").
 * - kv: settings + progress
 * - phrases: 句库
 * - calls: call transcripts (for recap / history)
 * - secrets: the user's own API key. Never exported, never logged.
 */

export type Goal = 'shows' | 'travel' | 'chat';
export type Pace = 'slow' | 'ok' | 'fast';

export interface Settings {
  firstRunDone: boolean;
  goal: Goal | null;
  pace: Pace;
  showEnglish: boolean;
  aiModel: string;
  voiceURI: string | null;
  voiceURIMale: string | null;
}

export interface EpisodeProgress {
  id: string;
  watched?: number;
  stolen?: number;
  called?: number;
  done?: number;
}

export interface Phrase {
  id: string; // stable: lowercased text
  en: string;
  zh: string;
  episodeId: string;
  audio?: string; // relative content path when an original clip exists
  source: 'steal' | 'call';
  addedAt: number;
  reviews: number;
  lastReview?: number;
}

export interface CallTurnLog {
  partner: string;
  user: string;
  better?: string;
  hintUsed?: number;
  typed?: boolean;
  latencyMs?: number;
}

export interface CallLog {
  id?: number;
  episodeId: string;
  at: number;
  mode: 'ai' | 'script';
  turns: CallTurnLog[];
  speakMs: number;
  recap?: unknown;
}

export const DEFAULT_SETTINGS: Settings = {
  firstRunDone: false,
  goal: null,
  pace: 'ok',
  showEnglish: false,
  aiModel: 'deepseek-flash',
  voiceURI: null,
  voiceURIMale: null,
};

let dbp: Promise<IDBPDatabase> | null = null;
function db(): Promise<IDBPDatabase> {
  if (!dbp) {
    dbp = openDB('offbook2', 1, {
      upgrade(d) {
        d.createObjectStore('kv');
        d.createObjectStore('phrases', { keyPath: 'id' });
        d.createObjectStore('calls', { keyPath: 'id', autoIncrement: true });
        d.createObjectStore('secrets');
      },
    });
  }
  return dbp;
}

export async function getSettings(): Promise<Settings> {
  const s = ((await (await db()).get('kv', 'settings')) ?? {}) as Partial<Settings>;
  const merged = { ...DEFAULT_SETTINGS, ...s };
  // deepseek-chat / deepseek-reasoner were retired by DeepSeek on 2026-07-24.
  if (merged.aiModel === 'deepseek-chat' || merged.aiModel === 'deepseek-reasoner') merged.aiModel = 'deepseek-flash';
  return merged;
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await (await db()).put('kv', next, 'settings');
  return next;
}

export async function getProgress(): Promise<Record<string, EpisodeProgress>> {
  return ((await (await db()).get('kv', 'progress')) ?? {}) as Record<string, EpisodeProgress>;
}

export async function markEpisode(id: string, step: 'watched' | 'stolen' | 'called' | 'done'): Promise<void> {
  const d = await db();
  const all = await getProgress();
  const row = all[id] ?? { id };
  row[step] = Date.now();
  all[id] = row;
  await d.put('kv', all, 'progress');
  await logActiveDay();
}

async function logActiveDay(): Promise<void> {
  const d = await db();
  const days = ((await d.get('kv', 'days')) ?? []) as string[];
  const today = localDay(Date.now());
  if (!days.includes(today)) {
    days.push(today);
    await d.put('kv', days.slice(-400), 'days');
  }
}

export function localDay(t: number): string {
  const x = new Date(t);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

export async function activeDays(): Promise<string[]> {
  return ((await (await db()).get('kv', 'days')) ?? []) as string[];
}

export async function addPhrases(list: Omit<Phrase, 'id' | 'addedAt' | 'reviews'>[]): Promise<number> {
  const d = await db();
  let added = 0;
  for (const p of list) {
    const id = p.en.trim().toLowerCase().replace(/[.!?…]+$/, '');
    if (!id) continue;
    const existing = (await d.get('phrases', id)) as Phrase | undefined;
    if (existing) continue;
    await d.put('phrases', { ...p, id, addedAt: Date.now(), reviews: 0 });
    added++;
  }
  return added;
}

export async function allPhrases(): Promise<Phrase[]> {
  const rows = (await (await db()).getAll('phrases')) as Phrase[];
  return rows.sort((a, b) => b.addedAt - a.addedAt);
}

export async function touchPhrase(id: string): Promise<void> {
  const d = await db();
  const p = (await d.get('phrases', id)) as Phrase | undefined;
  if (!p) return;
  p.reviews += 1;
  p.lastReview = Date.now();
  await d.put('phrases', p);
}

export async function deletePhrase(id: string): Promise<void> {
  await (await db()).delete('phrases', id);
}

export async function saveCall(log: CallLog): Promise<number> {
  return (await (await db()).add('calls', log)) as number;
}

export async function updateCall(log: CallLog): Promise<void> {
  await (await db()).put('calls', log);
}

export async function allCalls(): Promise<CallLog[]> {
  return (await (await db()).getAll('calls')) as CallLog[];
}

/* ---------- secrets (API key) ---------- */

export async function getApiKey(): Promise<string> {
  return ((await (await db()).get('secrets', 'deepseek')) as string | undefined) ?? '';
}

export async function setApiKey(key: string): Promise<void> {
  const d = await db();
  if (key) await d.put('secrets', key, 'deepseek');
  else await d.delete('secrets', 'deepseek');
}

/* ---------- backup (never includes secrets) ---------- */

export interface Backup {
  app: 'offbook';
  version: 2;
  exportedAt: number;
  settings: Settings;
  progress: Record<string, EpisodeProgress>;
  days: string[];
  phrases: Phrase[];
  calls: CallLog[];
}

export async function exportBackup(): Promise<Backup> {
  return {
    app: 'offbook',
    version: 2,
    exportedAt: Date.now(),
    settings: await getSettings(),
    progress: await getProgress(),
    days: await activeDays(),
    phrases: await allPhrases(),
    calls: await allCalls(),
  };
}

export async function importBackup(b: Backup): Promise<void> {
  if (b?.app !== 'offbook' || b.version !== 2) throw new Error('bad backup');
  const d = await db();
  await d.put('kv', { ...DEFAULT_SETTINGS, ...b.settings }, 'settings');
  await d.put('kv', b.progress ?? {}, 'progress');
  await d.put('kv', b.days ?? [], 'days');
  for (const p of b.phrases ?? []) await d.put('phrases', p);
  for (const c of b.calls ?? []) {
    const { id: _drop, ...rest } = c;
    void _drop;
    await d.add('calls', rest);
  }
}

export async function resetAll(): Promise<void> {
  const d = await db();
  await d.clear('kv');
  await d.clear('phrases');
  await d.clear('calls');
}
