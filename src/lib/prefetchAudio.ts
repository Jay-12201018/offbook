import { contentUrl } from '@/content/normalize.ts';
import { loadScene } from '@/lib/catalog.ts';
import { publicUrl } from '@/lib/publicUrl.ts';

const AUDIO_CACHE = 'offbook-audio';

/** Collect model-audio URLs for a scene (full take, lines, chunks, cues). */
export function audioUrlsForScene(scene: {
  id: string;
  audioFull?: string;
  lines: { audio?: string }[];
  chunks: { audio?: string; afterAudio?: string }[];
}): string[] {
  const urls: string[] = [];
  const add = (rel?: string) => {
    const u = contentUrl(rel);
    if (u) urls.push(u);
  };
  add(scene.audioFull);
  for (const l of scene.lines) add(l.audio);
  for (const c of scene.chunks) {
    add(c.audio);
    add(c.afterAudio);
  }
  urls.push(publicUrl(`/content/audio/${scene.id}/cues.json`));
  return [...new Set(urls)];
}

/**
 * Warm the runtime audio cache for a few scenes (today / next / mid-resume)
 * without putting the whole library into the install precache.
 */
export async function prefetchSceneAudio(sceneIds: string[]): Promise<void> {
  const ids = [...new Set(sceneIds.filter(Boolean))];
  if (!ids.length) return;
  const urls = new Set<string>();
  for (const id of ids) {
    try {
      const scene = await loadScene(id);
      if (scene) for (const u of audioUrlsForScene(scene)) urls.add(u);
      else urls.add(publicUrl(`/content/audio/${id}/cues.json`));
    } catch {
      /* skip a missing scene */
    }
  }
  let cache: Cache | null = null;
  try {
    cache = await caches.open(AUDIO_CACHE);
  } catch {
    cache = null;
  }
  for (const url of urls) {
    try {
      if (cache) {
        const hit = await cache.match(url);
        if (hit) continue;
      }
      const res = await fetch(url, { credentials: 'same-origin' });
      if (cache && res.ok) await cache.put(url, res.clone());
    } catch {
      /* offline or aborted; leave the rest for later */
    }
  }
}

export function schedulePrefetch(sceneIds: string[], delayMs = 1400): () => void {
  const id = window.setTimeout(() => {
    void prefetchSceneAudio(sceneIds);
  }, delayMs);
  return () => window.clearTimeout(id);
}
