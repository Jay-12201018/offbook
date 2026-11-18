import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  DiagnosticProgress,
  LineEvent,
  ResumeMap,
  ResumeState,
  SceneRollup,
  SessionKind,
  SessionMetrics,
  Settings,
  StoredResume,
} from '@/session/types.ts';
import { isDiagnosticProgress } from '@/session/engine.ts';

const DEFAULT_SETTINGS: Settings = {
  uiLanguage: 'zh',
  speed: 1,
  theme: 'auto',
  installHintDismissed: false,
  firstRunComplete: false,
  micAllowed: null,
  persistAsked: false,
};

interface OffbookDB extends DBSchema {
  settings: { key: string; value: unknown };
  sessions: {
    key: number;
    value: {
      id?: number;
      sceneId: string;
      kind: string;
      mode: string;
      startedAt: number;
      completedAt?: number;
      layer?: string;
      lineIndex?: number;
      metrics?: SessionMetrics;
    };
    indexes: { 'by-started': number; 'by-scene': string };
  };
  lineEvents: {
    key: number;
    value: LineEvent;
    indexes: { 'by-scene': string; 'by-at': number };
  };
  recordings: {
    key: string;
    value: {
      id: string;
      sceneId: string;
      lineId: string;
      blob: Blob;
      mime: string;
      durationMs: number;
      createdAt: number;
      kind?: string;
      chunkId?: string;
      label?: string;
    };
    indexes: { 'by-scene-line': [string, string]; 'by-created': number };
  };
  sceneState: { key: string; value: SceneRollup };
  resume: { key: string; value: StoredResume };
}

let dbPromise: Promise<IDBPDatabase<OffbookDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<OffbookDB>> {
  if (!dbPromise) {
    dbPromise = openDB<OffbookDB>('offbook', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings');
        if (!db.objectStoreNames.contains('sessions')) {
          const s = db.createObjectStore('sessions', { keyPath: 'id', autoIncrement: true });
          s.createIndex('by-started', 'startedAt');
          s.createIndex('by-scene', 'sceneId');
        }
        if (!db.objectStoreNames.contains('lineEvents')) {
          const s = db.createObjectStore('lineEvents', { keyPath: 'id', autoIncrement: true });
          s.createIndex('by-scene', 'sceneId');
          s.createIndex('by-at', 'at');
        }
        if (!db.objectStoreNames.contains('recordings')) {
          const s = db.createObjectStore('recordings', { keyPath: 'id' });
          s.createIndex('by-scene-line', ['sceneId', 'lineId']);
          s.createIndex('by-created', 'createdAt');
        }
        if (!db.objectStoreNames.contains('sceneState')) db.createObjectStore('sceneState');
        if (!db.objectStoreNames.contains('resume')) db.createObjectStore('resume');
      },
    });
  }
  return dbPromise;
}

export async function getSettings(): Promise<Settings> {
  const db = await getDb();
  const stored = (await db.get('settings', 'app')) as Settings | undefined;
  return { ...DEFAULT_SETTINGS, ...(stored || {}) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const db = await getDb();
  const cur = await getSettings();
  const next = { ...cur, ...patch };
  await db.put('settings', next, 'app');
  return next;
}

const RESUME_SLOTS = ['full', 'micro', 'review', 'diagnostic', 'first-run', 'current'] as const;

async function migrateLegacyResume(): Promise<void> {
  const db = await getDb();
  const cur = await db.get('resume', 'current');
  if (!cur) return;
  const key = cur.kind || 'full';
  const existing = await db.get('resume', key);
  if (!existing) await db.put('resume', cur, key);
  await db.delete('resume', 'current');
}

export async function getResume(kind: SessionKind = 'full'): Promise<ResumeState | null> {
  await migrateLegacyResume();
  const db = await getDb();
  const row = await db.get('resume', kind);
  if (!row || isDiagnosticProgress(row)) return null;
  return row;
}

export async function getDiagnosticResume(): Promise<DiagnosticProgress | null> {
  await migrateLegacyResume();
  const db = await getDb();
  const row = await db.get('resume', 'diagnostic');
  return isDiagnosticProgress(row) ? row : null;
}

export async function getResumes(): Promise<ResumeMap> {
  await migrateLegacyResume();
  const db = await getDb();
  const map: ResumeMap = {};
  for (const key of ['full', 'micro', 'review', 'diagnostic', 'first-run'] as const) {
    const row = await db.get('resume', key);
    if (!row) continue;
    if (key === 'diagnostic' && isDiagnosticProgress(row)) map.diagnostic = row;
    else if (key !== 'diagnostic' && !isDiagnosticProgress(row)) map[key] = row;
  }
  return map;
}

export async function saveResume(state: StoredResume): Promise<void> {
  const db = await getDb();
  await db.put('resume', { ...state, updatedAt: Date.now() }, state.kind);
}

export async function clearResume(kind?: SessionKind): Promise<void> {
  const db = await getDb();
  if (kind) {
    await db.delete('resume', kind);
    return;
  }
  for (const key of RESUME_SLOTS) {
    await db.delete('resume', key);
  }
}

export async function putLineEvent(ev: LineEvent): Promise<void> {
  const db = await getDb();
  await db.add('lineEvents', ev);
}

export async function allLineEvents(): Promise<LineEvent[]> {
  const db = await getDb();
  return db.getAllFromIndex('lineEvents', 'by-at');
}

export async function saveRecording(rec: {
  id: string;
  sceneId: string;
  lineId: string;
  blob: Blob;
  mime: string;
  durationMs: number;
  kind?: string;
  chunkId?: string;
  label?: string;
}): Promise<void> {
  const db = await getDb();
  await db.put('recordings', { ...rec, createdAt: Date.now() });
}

export async function latestRecording(
  sceneId: string,
  lineId: string,
): Promise<Awaited<ReturnType<typeof getDb>> extends never ? never : {
  id: string;
  blob: Blob;
  mime: string;
  durationMs: number;
  createdAt: number;
} | undefined> {
  const db = await getDb();
  const all = await db.getAllFromIndex('recordings', 'by-scene-line', [sceneId, lineId]);
  return all.sort((a, b) => b.createdAt - a.createdAt)[0];
}

export async function recordingsForScene(sceneId: string) {
  const db = await getDb();
  const all = await db.getAll('recordings');
  return all.filter((r) => r.sceneId === sceneId).sort((a, b) => b.createdAt - a.createdAt);
}

export async function allRecordings() {
  const db = await getDb();
  return db.getAllFromIndex('recordings', 'by-created');
}

export async function getSceneState(id: string): Promise<SceneRollup | undefined> {
  const db = await getDb();
  return db.get('sceneState', id);
}

export async function allSceneState(): Promise<SceneRollup[]> {
  const db = await getDb();
  return db.getAll('sceneState');
}

export async function putSceneState(row: SceneRollup): Promise<void> {
  const db = await getDb();
  await db.put('sceneState', row, row.sceneId);
}

export async function addSession(row: {
  sceneId: string;
  kind: string;
  mode: string;
  startedAt: number;
  completedAt?: number;
  metrics?: SessionMetrics;
}): Promise<number> {
  const db = await getDb();
  return db.add('sessions', row) as Promise<number>;
}

export async function allSessions() {
  const db = await getDb();
  return db.getAllFromIndex('sessions', 'by-started');
}


export function sessionDedupeKey(s: { sceneId?: string; kind?: string; startedAt?: number }): string {
  if (!s.sceneId || !s.kind || !s.startedAt) return '';
  return `${s.sceneId}|${s.kind}|${s.startedAt}`;
}

export function lineEventDedupeKey(e: { sceneId?: string; lineId?: string; at?: number }): string {
  if (!e.sceneId || !e.lineId || !e.at) return '';
  return `${e.sceneId}|${e.lineId}|${e.at}`;
}

export interface ExportPayload {
  version: 1 | 2;
  exportedAt: number;
  settings: Settings;
  sessions: unknown[];
  lineEvents: LineEvent[];
  sceneState: SceneRollup[];
  resume: StoredResume | null;
  resumes?: ResumeMap;
  recordings?: { id: string; sceneId: string; lineId: string; mime: string; durationMs: number; createdAt: number; dataUrl: string; kind?: string; chunkId?: string; label?: string }[];
}

export async function exportProgress(includeRecordings = true): Promise<ExportPayload> {
  const [settings, sessions, lineEvents, sceneState, resumes, recs] = await Promise.all([
    getSettings(),
    allSessions(),
    allLineEvents(),
    allSceneState(),
    getResumes(),
    includeRecordings ? allRecordings() : Promise.resolve([]),
  ]);
  const payload: ExportPayload = {
    version: 2,
    exportedAt: Date.now(),
    settings,
    sessions,
    lineEvents,
    sceneState,
    resume: resumes.full || resumes.diagnostic || resumes.micro || resumes.review || resumes['first-run'] || null,
    resumes,
  };
  if (includeRecordings) {
    payload.recordings = [];
    for (const r of recs) {
      const dataUrl = await blobToDataUrl(r.blob);
      payload.recordings.push({
        id: r.id,
        sceneId: r.sceneId,
        lineId: r.lineId,
        mime: r.mime,
        durationMs: r.durationMs,
        createdAt: r.createdAt,
        dataUrl,
        kind: r.kind,
        chunkId: (r as { chunkId?: string }).chunkId,
        label: (r as { label?: string }).label,
      });
    }
  }
  return payload;
}

export async function importProgress(payload: ExportPayload): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(
    ['settings', 'sessions', 'lineEvents', 'sceneState', 'resume', 'recordings'],
    'readwrite',
  );
  if (payload.settings) await tx.objectStore('settings').put({ ...DEFAULT_SETTINGS, ...payload.settings }, 'app');
  const resumeStore = tx.objectStore('resume');
  for (const key of RESUME_SLOTS) {
    await resumeStore.delete(key);
  }
  const slots = payload.resumes || {};
  const slotList = Object.entries(slots) as [keyof ResumeMap, StoredResume][];
  if (slotList.length) {
    for (const [key, row] of slotList) {
      if (row) await resumeStore.put(row, key);
    }
  } else if (payload.resume) {
    const key = payload.resume.kind || 'full';
    await resumeStore.put(payload.resume, key);
  }
  if (payload.sceneState) {
    for (const row of payload.sceneState) {
      await tx.objectStore('sceneState').put(row, row.sceneId);
    }
  }
  if (payload.lineEvents) {
    const store = tx.objectStore('lineEvents');
    const existing = await store.getAll();
    const seen = new Set(existing.map((ev) => lineEventDedupeKey(ev)));
    for (const ev of payload.lineEvents) {
      const { id: _id, ...rest } = ev;
      const key = lineEventDedupeKey(rest);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      await store.add(rest);
    }
  }
  if (payload.sessions) {
    const store = tx.objectStore('sessions');
    const existing = await store.getAll();
    const seen = new Set(existing.map((s) => sessionDedupeKey(s)));
    for (const s of payload.sessions as Array<{
      id?: number;
      sceneId: string;
      kind: string;
      mode: string;
      startedAt: number;
      completedAt?: number;
      layer?: string;
      lineIndex?: number;
      metrics?: SessionMetrics;
    }>) {
      const { id: _id, ...rest } = s;
      const key = sessionDedupeKey(rest);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      await store.add(rest);
    }
  }
  if (payload.recordings) {
    const store = tx.objectStore('recordings');
    for (const r of payload.recordings) {
      const blob = dataUrlToBlob(r.dataUrl, r.mime);
      await store.put({
        id: r.id,
        sceneId: r.sceneId,
        lineId: r.lineId,
        blob,
        mime: r.mime,
        durationMs: r.durationMs,
        createdAt: r.createdAt,
        kind: r.kind,
        chunkId: r.chunkId,
        label: r.label,
      });
    }
  }
  await tx.done;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl: string, mime: string): Blob {
  const [, b64] = dataUrl.split(',');
  const bin = atob(b64 || '');
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime || 'audio/webm' });
}

export { DEFAULT_SETTINGS };
