import { normalizeScene } from '@/content/normalize.ts';
import { publicUrl } from '@/lib/publicUrl.ts';
import { overlayTitleZh } from '@/lib/displayTitle.ts';
import { overlaySituationZh } from '@/content/situations-zh.ts';
import type {
  AudioCues,
  CatalogEntry,
  Pack,
  Scene,
  Sequence,
  SequenceDay,
  SequenceMode,
  SceneRollup,
  SkillTree,
} from '@/session/types.ts';

let indexCache: CatalogEntry[] | null = null;
let sequenceCache: Sequence | null = null;
let packsCache: Pack[] | null = null;
let skillCache: SkillTree | null = null;
const sceneCache = new Map<string, Scene>();

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function loadIndex(): Promise<CatalogEntry[]> {
  if (indexCache) return indexCache;
  const data = await getJson<CatalogEntry[]>(publicUrl('/content/index.json'));
  indexCache = (data || []).map((e) => ({
    ...e,
    titleZh: overlayTitleZh(e.id, e.titleZh),
    situationZh: overlaySituationZh(e.id, e.situationZh),
  }));
  return indexCache;
}

function isMode(m: unknown): m is SequenceMode {
  return (
    m === 'roleplay' ||
    m === 'fluency' ||
    m === 'tv-shadow' ||
    m === 'easy-listen' ||
    m === 'dictogloss' ||
    m === 'diagnostic'
  );
}

export function normalizeSequence(raw: unknown): Sequence {
  if (!raw || typeof raw !== 'object') return { firstRunSceneId: null, days: [] };
  const r = raw as Record<string, unknown>;

  if (Array.isArray(r.sessions)) {
    const days: SequenceDay[] = r.sessions.map((item) => {
      const s = item as Record<string, unknown>;
      const sceneIds = Array.isArray(s.sceneIds) ? (s.sceneIds as string[]) : undefined;
      const sceneId = String(s.sceneId || sceneIds?.[0] || '');
      const mode = isMode(s.mode) ? s.mode : 'roleplay';
      return {
        day: Number(s.session ?? s.day ?? 0),
        sceneId,
        sceneIds,
        mode,
        titleZh: s.titleZh as string | undefined,
        titleEn: s.titleEn as string | undefined,
        packId: s.packId as string | undefined,
        warmupFrom: s.warmupFrom as string | undefined,
        note: s.note as string | undefined,
      };
    });
    const firstDiag = days.find((d) => d.mode === 'diagnostic');
    return {
      firstRunSceneId: firstDiag?.sceneId || days[0]?.sceneId || null,
      titleZh: (r.titleZh as string) || undefined,
      days,
    };
  }

  if (Array.isArray(r.days)) {
    const days = (r.days as SequenceDay[]).map((d) => ({
      ...d,
      mode: isMode(d.mode) ? d.mode : 'roleplay',
    }));
    return {
      firstRunSceneId: (r.firstRunSceneId as string) || days[0]?.sceneId || null,
      titleZh: r.titleZh as string | undefined,
      days,
    };
  }

  return { firstRunSceneId: null, days: [] };
}

export async function loadSequence(): Promise<Sequence> {
  if (sequenceCache) return sequenceCache;
  const data = await getJson<unknown>(publicUrl('/content/sequence.json'));
  sequenceCache = normalizeSequence(data);
  return sequenceCache;
}

export async function loadPacks(): Promise<Pack[]> {
  if (packsCache) return packsCache;
  const data = await getJson<{ packs: Pack[] } | Pack[]>(publicUrl('/content/packs.json'));
  if (!data) packsCache = [];
  else if (Array.isArray(data)) packsCache = data;
  else packsCache = data.packs || [];
  return packsCache;
}

export async function loadSkillTree(): Promise<SkillTree | null> {
  if (skillCache) return skillCache;
  skillCache = await getJson<SkillTree>(publicUrl('/content/skill-tree.json'));
  return skillCache;
}

export async function loadCues(sceneId: string): Promise<AudioCues | null> {
  return getJson<AudioCues>(publicUrl(`/content/audio/${sceneId}/cues.json`));
}

export async function loadScene(id: string): Promise<Scene | null> {
  if (sceneCache.has(id)) return sceneCache.get(id)!;
  const raw = await getJson<Record<string, unknown>>(publicUrl(`/content/scenes/${id}.json`));
  if (!raw) return null;
  const cues = await loadCues(id);
  const scene = normalizeScene(raw, cues);
  const withZh: Scene = {
    ...scene,
    titleZh: overlayTitleZh(scene.id, scene.titleZh),
    situationZh: overlaySituationZh(scene.id, scene.situationZh),
  };
  sceneCache.set(id, withZh);
  return withZh;
}

export function entryById(index: CatalogEntry[], id: string): CatalogEntry | undefined {
  return index.find((s) => s.id === id);
}

export function sessionForScene(seq: Sequence, sceneId: string): SequenceDay | undefined {
  return seq.days.find((d) => d.sceneId === sceneId || d.sceneIds?.includes(sceneId));
}

export function modeForScene(seq: Sequence, sceneId: string): SequenceMode {
  return sessionForScene(seq, sceneId)?.mode || 'roleplay';
}

export function currentSequenceSession(
  seq: Sequence,
  lastCompletedSession: number | undefined,
): SequenceDay | undefined {
  if (!seq.days.length) return undefined;
  const nextIdx =
    lastCompletedSession == null || lastCompletedSession < 0
      ? 0
      : lastCompletedSession + 1;
  return seq.days.find((d) => d.day === nextIdx) || seq.days[Math.min(nextIdx, seq.days.length - 1)];
}

export function nextSceneId(seq: Sequence, currentId: string, index: CatalogEntry[]): string | null {
  const i = seq.days.findIndex((d) => d.sceneId === currentId || d.sceneIds?.includes(currentId));
  if (i >= 0 && i + 1 < seq.days.length) {
    return seq.days[i + 1].sceneId || seq.days[i + 1].sceneIds?.[0] || null;
  }
  const official = index.filter((s) => s.official !== false);
  const pool = official.length ? official : index;
  const j = pool.findIndex((s) => s.id === currentId);
  if (j >= 0 && j + 1 < pool.length) return pool[j + 1].id;
  return pool[0]?.id && pool[0].id !== currentId ? pool[0].id : null;
}

export function nextSequenceSession(seq: Sequence, current: SequenceDay): SequenceDay | null {
  const i = seq.days.findIndex((d) => d.day === current.day);
  if (i >= 0 && i + 1 < seq.days.length) return seq.days[i + 1];
  return null;
}

export const LIFE_LABELS: Record<string, string> = {
  everyday: '日常',
  travel: '旅行',
  work: '工作',
  shows: '剧场风',
  listens: '更长的听',
  interviews: '面试',
};

export function invalidateCatalog(): void {
  indexCache = null;
  sequenceCache = null;
  packsCache = null;
  skillCache = null;
  sceneCache.clear();
}

export function pickMicroScene(
  index: CatalogEntry[],
  states: Record<string, SceneRollup>,
  fallbackId: string,
): string {
  const official = index.filter((s) => s.official !== false);
  const pool = official.length ? official : index;
  const done = pool
    .map((e) => ({ id: e.id, at: states[e.id]?.completedAt || 0 }))
    .filter((x) => x.at > 0)
    .sort((a, b) => b.at - a.at);
  return done[0]?.id || fallbackId;
}
