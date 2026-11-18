import type { Speed } from '@/session/types.ts';
import { contentUrl } from '@/content/normalize.ts';

const SILENT_WAV =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

let ctx: AudioContext | null = null;
let unlocked = false;
let current: HTMLAudioElement | null = null;
let currentOnEnd: (() => void) | null = null;
let currentOnError: (() => void) | null = null;

function getCtx(): AudioContext {
  if (!ctx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctor();
  }
  return ctx;
}

export function isAudioUnlocked(): boolean {
  return unlocked;
}

export async function unlockAudio(): Promise<void> {
  if (unlocked) return;
  try {
    const c = getCtx();
    if (c.state === 'suspended') await c.resume();
    const buf = c.createBuffer(1, 1, 22050);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(c.destination);
    src.start(0);
    const a = new Audio(SILENT_WAV);
    a.playsInline = true;
    a.muted = true;
    await a.play().catch(() => undefined);
    a.pause();
    unlocked = true;
  } catch {
    unlocked = true; // don't block; later plays will retry
  }
}

export function getAudioContext(): AudioContext {
  return getCtx();
}

function applyRate(el: HTMLAudioElement, rate: Speed): void {
  el.playbackRate = rate;
  el.preservesPitch = true;
  (el as HTMLAudioElement & { webkitPreservesPitch?: boolean }).webkitPreservesPitch = true;
}

export function stopPlayback(): void {
  if (current) {
    current.onended = null;
    current.onerror = null;
    current.pause();
    current.removeAttribute('src');
    current.load();
    current = null;
  }
  currentOnEnd = null;
  currentOnError = null;
}

export interface PlayOpts {
  rate?: Speed;
  startMs?: number;
  endMs?: number;
  onEnd?: () => void;
  onError?: () => void;
  onTime?: (t: number) => void;
}

export function playUrl(url: string, opts: PlayOpts = {}): HTMLAudioElement {
  stopPlayback();
  const el = new Audio();
  el.preload = 'auto';
  el.playsInline = true;
  applyRate(el, opts.rate ?? 1);
  el.src = url;
  current = el;
  currentOnEnd = opts.onEnd ?? null;
  currentOnError = opts.onError ?? null;
  let settled = false;

  const succeed = () => {
    if (settled || current !== el) return;
    settled = true;
    el.removeEventListener('timeupdate', onTime);
    const cb = currentOnEnd;
    currentOnEnd = null;
    currentOnError = null;
    cb?.();
  };
  const fail = () => {
    if (settled || current !== el) return;
    settled = true;
    el.removeEventListener('timeupdate', onTime);
    const cb = currentOnError;
    currentOnEnd = null;
    currentOnError = null;
    cb?.();
  };

  const onTime = () => {
    if (opts.onTime) opts.onTime(el.currentTime);
    if (opts.endMs != null && el.currentTime * 1000 >= opts.endMs) {
      el.pause();
      succeed();
    }
  };
  if (opts.onTime || opts.endMs != null) el.addEventListener('timeupdate', onTime);

  el.onended = succeed;
  el.onerror = fail;

  const start = () => {
    if (settled || current !== el) return;
    if (opts.startMs) el.currentTime = opts.startMs / 1000;
    void el.play().catch(() => {
      // iOS may still need a user gesture; unlock and retry once
      if (settled || current !== el) return;
      void unlockAudio().then(() => {
        if (settled || current !== el) return;
        void el.play().catch(() => fail());
      });
    });
  };
  if (el.readyState >= 2) start();
  else el.addEventListener('canplay', start, { once: true });
  return el;
}

export function pausePlayback(): void {
  current?.pause();
}

export function resumePlayback(): void {
  void current?.play().catch(() => undefined);
}

export function isPlaying(): boolean {
  return !!current && !current.paused && !current.ended;
}

export interface SequenceItem {
  url?: string;
  text?: string;
  durationMs?: number;
  id?: string;
}

export function playSequence(
  items: SequenceItem[],
  opts: {
    rate?: Speed;
    gapMs?: number;
    onItem?: (i: number, item: SequenceItem) => void;
    onEnd?: () => void;
    onError?: () => void;
  },
): { stop: () => void } {
  let i = 0;
  let stopped = false;
  const gap = opts.gapMs ?? 220;
  const fail = () => {
    if (stopped) return;
    stopped = true;
    opts.onError?.();
  };

  const run = () => {
    if (stopped) return;
    if (i >= items.length) {
      opts.onEnd?.();
      return;
    }
    const item = items[i];
    opts.onItem?.(i, item);
    const url = item.url ? contentUrl(item.url) : undefined;
    if (url) {
      playUrl(url, {
        rate: opts.rate,
        onEnd: () => {
          if (stopped) return;
          i += 1;
          window.setTimeout(run, gap / (opts.rate ?? 1));
        },
        onError: fail,
      });
    } else if (item.text) {
      speakFallback(
        item.text,
        opts.rate ?? 1,
        () => {
          if (stopped) return;
          i += 1;
          window.setTimeout(run, gap);
        },
        fail,
      );
    } else {
      i += 1;
      run();
    }
  };
  run();
  return {
    stop: () => {
      stopped = true;
      stopPlayback();
      window.speechSynthesis?.cancel();
    },
  };
}

export function playContent(relOrUrl: string | undefined, text: string | undefined, opts: PlayOpts = {}): void {
  const url = contentUrl(relOrUrl);
  if (url) {
    playUrl(url, opts);
    return;
  }
  // No file: keep the Web Speech fallback. A failed fallback is an error, not a finished play.
  if (text) speakFallback(text, opts.rate ?? 1, opts.onEnd, opts.onError);
  else opts.onError?.();
}

export function speakFallback(text: string, rate: number, onEnd?: () => void, onError?: () => void): void {
  if (!window.speechSynthesis) {
    onError?.();
    return;
  }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = Math.max(0.7, Math.min(1.2, rate));
  const voices = window.speechSynthesis.getVoices();
  const en = voices.find((v) => /en-US/i.test(v.lang) && /female|samantha|karen|moira|google/i.test(v.name))
    || voices.find((v) => /en-US/i.test(v.lang))
    || voices.find((v) => /^en/i.test(v.lang));
  if (en) u.voice = en;
  u.onend = () => onEnd?.();
  u.onerror = () => onError?.();
  window.speechSynthesis.speak(u);
}

export function currentElement(): HTMLAudioElement | null {
  return current;
}
