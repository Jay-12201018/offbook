import { publicUrl } from '@/lib/publicUrl.ts';
import type { AudioCues, LifeArea, Scene, SceneLine } from '@/session/types.ts';

const LIFE: Record<string, LifeArea> = {
  daily: 'everyday',
  travel: 'travel',
  work: 'work',
  tv: 'shows',
  podcast: 'listens',
};

export function contentUrl(rel?: string | null): string | undefined {
  if (!rel) return undefined;
  if (rel.startsWith('http') || rel.startsWith('blob:') || rel.startsWith('data:')) {
    return rel;
  }
  if (rel.startsWith('/')) return publicUrl(rel);
  return publicUrl(`content/${rel.replace(/^\//, '')}`);
}

export function normalizeScene(raw: Record<string, unknown>, cues?: AudioCues | null): Scene {
  const register = (raw.register as Scene['register']) || 'daily';
  const lines = ((raw.lines as SceneLine[]) || []).map((ln) => {
    const info = cues?.lines?.[ln.id];
    return {
      ...ln,
      spoken: ln.spoken || ln.text,
      asHeard: (ln as SceneLine).asHeard || ln.spoken,
      audio: ln.audio || info?.file,
      durationMs: ln.durationMs || info?.durationMs,
    };
  });
  const chunks = ((raw.chunks as Scene['chunks']) || []).map((c) => {
    const info = cues?.chunks?.[c.id];
    return {
      ...c,
      audio: c.audio || info?.file,
      durationMs: c.durationMs || info?.durationMs,
      afterAudio: c.afterAudio || info?.afterFile,
      afterDurationMs: c.afterDurationMs || info?.afterDurationMs,
    };
  });
  return {
    id: String(raw.id),
    packId: raw.packId as string | undefined,
    dayInPack: raw.dayInPack as number | undefined,
    title: String(raw.title ?? ''),
    titleZh: String(raw.titleZh ?? raw.title ?? ''),
    setting: String(raw.setting ?? raw.situation ?? ''),
    situationZh: (raw.situationZh as string) || undefined,
    speakers: (raw.speakers as Scene['speakers']) || [],
    register,
    lifeArea: (raw.lifeArea as LifeArea) || LIFE[register] || 'everyday',
    skillNode: raw.skillNode as string | undefined,
    targetWpm: Number(raw.targetWpm) || 140,
    slowerWpm: Number(raw.slowerWpm) || 115,
    durationSec: Number(raw.durationSec) || 60,
    estimatedMinutes: Number(raw.estimatedMinutes) || 22,
    newItems: (raw.newItems as string[]) || [],
    lines,
    gist: (raw.gist as Scene['gist']) || [],
    details: (raw.details as Scene['details']) || [],
    glue: (raw.glue as Scene['glue']) || [],
    chunks,
    roleplay: (raw.roleplay as Scene['roleplay']) || {
      setupZh: '',
      aiRole: '',
      variants: [],
      mustUse: [],
      starters: [],
    },
    fluency: (raw.fluency as Scene['fluency']) || { promptZh: '', promptEn: '' },
    warmupLineIds: (raw.warmupLineIds as string[]) || [],
    audioFull: (raw.audioFull as string) || cues?.full?.file,
    audioFullDurationMs: (raw.audioFullDurationMs as number) || cues?.full?.durationMs,
    official: raw.official as boolean | undefined,
  };
}

export function speakerName(scene: Scene, id: string): string {
  return scene.speakers.find((s) => s.id === id)?.name || id;
}

export function inferUserSpeaker(scene: Scene): string | null {
  const role = scene.roleplay?.aiRole || '';
  const mentioned = scene.speakers.find((s) =>
    role.toLowerCase().startsWith(s.name.toLowerCase()),
  );
  if (mentioned) {
    const other = scene.speakers.find((s) => s.id !== mentioned.id);
    return other?.id ?? null;
  }
  return scene.speakers[1]?.id || scene.speakers[0]?.id || null;
}

export function inferPartnerSpeaker(scene: Scene): string | null {
  const user = inferUserSpeaker(scene);
  const other = scene.speakers.find((s) => s.id !== user);
  return other?.id ?? scene.speakers[0]?.id ?? null;
}
