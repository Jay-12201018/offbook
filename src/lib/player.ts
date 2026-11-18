/** Single-channel audio playback for scene clips. */
let current: HTMLAudioElement | null = null;
let token = 0;

export function stopAudio(): void {
  token++;
  if (current) {
    current.onended = null;
    current.onerror = null;
    current.pause();
    current = null;
  }
}

export function playClip(url: string, rate = 1): Promise<boolean> {
  stopAudio();
  const my = ++token;
  return new Promise((resolve) => {
    const el = new Audio(url);
    el.preload = 'auto';
    (el as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
    el.playbackRate = rate;
    el.preservesPitch = true;
    current = el;
    const done = (ok: boolean) => {
      if (current === el) current = null;
      resolve(ok && my === token);
    };
    el.onended = () => done(true);
    el.onerror = () => done(false);
    el.play().catch(() => done(false));
  });
}

/** Play a list of clips back-to-back; onIndex fires before each. Resolves false if interrupted. */
export async function playSequence(
  urls: string[],
  opts: { rate?: number; gapMs?: number; onIndex?: (i: number) => void; startAt?: number } = {},
): Promise<boolean> {
  const start = ++token;
  for (let i = opts.startAt ?? 0; i < urls.length; i++) {
    if (token !== start) return false;
    opts.onIndex?.(i);
    token = start; // playClip bumps token; keep sequence identity
    const ok = await playClipKeep(urls[i], opts.rate ?? 1, start);
    if (!ok || token !== start) return false;
    if (opts.gapMs) await new Promise((r) => setTimeout(r, opts.gapMs));
  }
  return token === start;
}

function playClipKeep(url: string, rate: number, seq: number): Promise<boolean> {
  if (current) { current.onended = null; current.onerror = null; current.pause(); }
  return new Promise((resolve) => {
    const el = new Audio(url);
    (el as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
    el.playbackRate = rate;
    el.preservesPitch = true;
    current = el;
    const done = (ok: boolean) => { if (current === el) current = null; resolve(ok && token === seq); };
    el.onended = () => done(true);
    el.onerror = () => done(true); // skip a broken clip rather than stall the episode
    el.play().catch(() => done(false));
  });
}

export function isAudioActive(): boolean {
  return !!current && !current.paused;
}
