import { listen, waitIdle, type ListenHandle, type ListenResult } from './asr.ts';
import { pickVoice, speak, stopSpeaking, unlockTts } from './tts.ts';
import { stopAudio } from './player.ts';

/**
 * Speak a short cue with speechSynthesis, then open a fresh recognition
 * session right after it ends (the pattern that keeps iOS 27 sessions alive).
 * Call from a tap handler.
 */
export function cueThenListen(cue: string, opts: { onInterim?: (t: string) => void; rate?: number } = {}): {
  done: Promise<ListenResult>;
  finish(): void;
  cancel(): void;
  onListening(cb: () => void): void;
} {
  unlockTts();
  stopAudio();
  stopSpeaking();
  let h: ListenHandle | null = null;
  let cancelled = false;
  let finishEarly = false;
  const cbs: { onL?: () => void } = {};
  const done = (async (): Promise<ListenResult> => {
    await waitIdle(3000);
    await speak(cue, { voice: pickVoice('female'), rate: opts.rate ?? 0.95 });
    if (cancelled) return { ok: false, error: 'aborted' };
    h = listen({ onInterim: opts.onInterim });
    cbs.onL?.();
    if (finishEarly) h.finish();
    return h.done;
  })();
  return {
    done,
    finish() { if (h) h.finish(); else finishEarly = true; },
    cancel() { cancelled = true; h?.cancel(); },
    onListening(cb) { cbs.onL = cb; },
  };
}
