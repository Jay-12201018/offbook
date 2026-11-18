/**
 * Web Speech API wrapper (Chrome/Android, Safari/iOS 14.5+).
 * iOS quirks handled here:
 *  - a fresh recognizer per attempt (reusing one fails silently on iOS)
 *  - short delay after TTS/audio before starting (audio session hand-off)
 *  - one automatic retry when start fails / ends instantly with nothing
 *  - final result sometimes never arrives on iOS -> fall back to last interim
 */

type Alt = { transcript: string };
type ResultList = { length: number; [i: number]: { isFinal: boolean; length: number; [j: number]: Alt } };
interface Rec {
  lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number;
  onresult: ((ev: { resultIndex: number; results: ResultList }) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
  onspeechstart?: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
type RecCtor = new () => Rec;

function ctor(): RecCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function asrSupported(): boolean {
  return ctor() !== null;
}

export type ListenResult =
  | { ok: true; text: string }
  | { ok: false; error: 'missing' | 'not-allowed' | 'service' | 'no-speech' | 'network' | 'aborted' | 'failed' };

export interface ListenHandle {
  done: Promise<ListenResult>;
  /** Stop listening and use what was heard so far. */
  stop(): void;
  /** Cancel without a result. */
  cancel(): void;
}

let failStreak = 0;
export function asrFailStreak(): number {
  return failStreak;
}

export function listen(opts: {
  onInterim?: (text: string) => void;
  onSpeechStart?: () => void;
  maxMs?: number;
  delayMs?: number;
} = {}): ListenHandle {
  const C = ctor();
  if (!C) return { done: Promise.resolve({ ok: false, error: 'missing' }), stop() {}, cancel() {} };

  let rec: Rec | null = null;
  let heard = '';
  let finished = false;
  let stopRequested = false;
  let attempts = 0;
  let startedAt = 0;
  let resolveFn!: (r: ListenResult) => void;
  const done = new Promise<ListenResult>((r) => (resolveFn = r));
  let maxTimer = 0;

  const finish = (r: ListenResult) => {
    if (finished) return;
    finished = true;
    window.clearTimeout(maxTimer);
    if (rec) {
      rec.onresult = rec.onerror = rec.onend = null;
      try { rec.abort(); } catch { /* ignore */ }
    }
    if (r.ok) failStreak = 0;
    else if (r.error !== 'aborted' && r.error !== 'no-speech') failStreak++;
    resolveFn(r);
  };

  const begin = () => {
    if (finished) return;
    attempts++;
    rec = new C();
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    rec.onspeechstart = () => opts.onSpeechStart?.();
    rec.onresult = (ev) => {
      let text = '';
      let final = false;
      for (let i = 0; i < ev.results.length; i++) {
        text += ev.results[i][0]?.transcript ?? '';
        if (ev.results[i].isFinal) final = true;
      }
      heard = text.trim();
      if (heard) opts.onInterim?.(heard);
      if (final && heard) finish({ ok: true, text: heard });
    };
    rec.onerror = (ev) => {
      const e = ev.error;
      if (e === 'not-allowed') return finish({ ok: false, error: 'not-allowed' });
      if (e === 'service-not-allowed') return finish({ ok: false, error: 'service' });
      if (e === 'aborted' && stopRequested) return finish(heard ? { ok: true, text: heard } : { ok: false, error: 'aborted' });
      if (e === 'network') return finish({ ok: false, error: 'network' });
      if (e === 'no-speech') return finish(heard ? { ok: true, text: heard } : { ok: false, error: 'no-speech' });
      // audio-capture / aborted (iOS session clash): retry once
      if (attempts < 2 && !heard && !stopRequested) {
        window.setTimeout(begin, 450);
        return;
      }
      finish(heard ? { ok: true, text: heard } : { ok: false, error: 'failed' });
    };
    rec.onend = () => {
      if (finished) return;
      if (heard) return finish({ ok: true, text: heard });
      if (stopRequested) return finish({ ok: false, error: 'aborted' });
      // iOS sometimes ends instantly without any event: retry once
      if (attempts < 2 && Date.now() - startedAt < 900) {
        window.setTimeout(begin, 450);
        return;
      }
      finish({ ok: false, error: 'no-speech' });
    };
    try {
      startedAt = Date.now();
      rec.start();
    } catch {
      if (attempts < 2) window.setTimeout(begin, 450);
      else finish({ ok: false, error: 'failed' });
    }
  };

  maxTimer = window.setTimeout(() => {
    stopRequested = true;
    try { rec?.stop(); } catch { /* ignore */ }
    window.setTimeout(() => finish(heard ? { ok: true, text: heard } : { ok: false, error: 'no-speech' }), 900);
  }, opts.maxMs ?? 15000);

  window.setTimeout(begin, opts.delayMs ?? 250);

  return {
    done,
    stop() {
      if (finished) return;
      stopRequested = true;
      try { rec?.stop(); } catch { /* ignore */ }
      // iOS may never deliver a final after stop(): settle with interim.
      window.setTimeout(() => finish(heard ? { ok: true, text: heard } : { ok: false, error: 'aborted' }), 1200);
    },
    cancel() {
      stopRequested = true;
      finish({ ok: false, error: 'aborted' });
    },
  };
}
