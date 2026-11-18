import { publicUrl } from './publicUrl.ts';

export interface Speaker { id: string; name: string; gender?: string }
export interface Line { id: string; speaker: string; text: string; audio?: string; durationMs?: number }
export interface Chunk {
  id: string; form: string; meaningZh: string; fromLineId?: string; sayAfter?: string;
  audio?: string; durationMs?: number; afterAudio?: string;
}
export interface Glue { id: string; lineId: string; span: string; hear: string; noteZh: string }
export interface Scene {
  id: string; title: string; titleZh: string; setting: string; speakers: Speaker[];
  lines: Line[]; chunks: Chunk[]; glue: Glue[];
  roleplay: { setupZh: string; aiRole: string; variants: string[]; mustUse: string[]; starters: string[] };
  audioFull?: string; audioFullDurationMs?: number; durationSec?: number;
}

const cache = new Map<string, Promise<Scene>>();

export function loadScene(id: string): Promise<Scene> {
  let p = cache.get(id);
  if (!p) {
    p = fetch(publicUrl(`/content/scenes/${id}.json`)).then((r) => {
      if (!r.ok) throw new Error(`scene ${id}: ${r.status}`);
      return r.json() as Promise<Scene>;
    });
    p.catch(() => cache.delete(id));
    cache.set(id, p);
  }
  return p;
}

export function audioUrl(rel?: string): string | undefined {
  return rel ? publicUrl(`/content/${rel.replace(/^\/+/, '')}`) : undefined;
}

export const AVATAR: Record<string, string> = {
  maya: 'avatars/maya.webp',
  chris: 'avatars/chris.webp',
  matt: 'avatars/matt.webp',
  jordan: 'avatars/jordan.webp',
};

export function avatarUrl(id: string): string {
  return publicUrl(AVATAR[id] ?? AVATAR.maya);
}

export const NAMES: Record<string, string> = { maya: 'Maya', chris: 'Chris', matt: 'Matt', jordan: 'Jordan' };
export const GENDER: Record<string, 'female' | 'male'> = { maya: 'female', chris: 'male', matt: 'male', jordan: 'female' };
