/**
 * Web Speech API wrapper (Chrome/Android, Safari/iOS).
 *
 * iOS 27 regression (WebKit bug 321436 and comments): after one recognition
 * session is cut short with stop()/abort(), every later session in the same
 * app launch is "deaf" (start/audiostart fire, but no speech or results) until
 * the app is killed. A media element playing between sessions has a similar
 * effect. The reported working pattern, which we follow everywhere:
 *   1. speak something with speechSynthesis right before each session,
 *   2. start a NEW recognizer right after the utterance's end event,
 *   3. continuous = false, and never cut the session: let Safari end it.
 * So on iOS "说完了" only stops *waiting*; the session is left to end on its
 * own and its late results are ignored. On other platforms stop() is safe.
 */
import { dlog } from './debug.ts';
import { isIos } from './install.ts';

type Alt = { transcript: string };
type ResultList = { length: number; [i: number]: { isFinal: boolean; length: number; [j: number]: Alt } };
interface Rec {
  lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number;
  onresult: ((ev: { resultIndex: number; results: ResultList }) => void) | null;
  onerror: ((ev: { error: string; message?: string }) => void) | null;
  onend: (() => void) | null;
  onstart?: (() => void) | null;
  onaudiostart?: (() => void) | null;
  onspeechstart?: (() => void) | null;
  onspeechend?: (() => void) | null;
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

/** On iOS sessions must never be cut (see header). */
export const NEVER_CUT = isIos();

export type ListenError = 'missing' | 'not-allowed' | 'service' | 'no-speech' | 'deaf' | 'network' | 'aborted' | 'failed';
export type ListenResult = { ok: true; text: string } | { ok: false; error: ListenError };

export interface ListenHandle {
  done: Promise<ListenResult>;
  /** Use what was heard so far. iOS: stops waiting, leaves the session to end itself. */
  finish(): void;
  /** Give up without a result. */
  cancel(): void;
}

let sessionNo = 0;
let live: { id: number; ended: Promise<void> } | null = null;

/** Resolve when the previous session (possibly orphaned) has ended, max `ms`. */
export function waitIdle(ms = 5000): Promise<void> {
  if (!live) return Promise.resolve();
  const cur = live;
  return Promise.race([cur.ended, new Promise<void>((r) => setTimeout(r, ms))]).then(() => {
    if (live === cur) live = null;
  });
}

let failStreak = 0;
export function asrFailStreak(): number {
  return failStreak;
}

export function listen(opts: {
  onInterim?: (text: string) => void;
  onSpeechStart?: () => void;
  /** Give up if nothing at all is heard for this long (deaf-session watchdog). */
  silenceMs?: number;
  /** Absolute cap on one session. */
  maxMs?: number;
} = {}): ListenHandle {
  const C = ctor();
  if (!C) return { done: Promise.resolve({ ok: false, error: 'missing' }), finish() {}, cancel() {} };

  const id = ++sessionNo;
  const tStart = Date.now();
  const L = (m: string) => dlog(`asr#${id}`, `${m} (+${Date.now() - tStart}ms)`);
  let heard = '';
  let gotSpeech = false;
  let settled = false;
  let resolveDone!: (r: ListenResult) => void;
  const done = new Promise<ListenResult>((r) => (resolveDone = r));
  let endedResolve!: () => void;
  const ended = new Promise<void>((r) => (endedResolve = r));
  live = { id, ended };
  const timers: number[] = [];

  const settle = (r: ListenResult) => {
    if (settled) return;
    settled = true;
    timers.forEach((t) => window.clearTimeout(t));
    if (r.ok) failStreak = 0;
    else if (r.error !== 'aborted') failStreak++;
    L(`settle ${r.ok ? `ok "${r.text.slice(0, 40)}"` : r.error}`);
    resolveDone(r);
  };

  const rec = new C();
  rec.lang = 'en-US';
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  rec.onstart = () => L('start');
  rec.onaudiostart = () => L('audiostart');
  rec.onspeechstart = () => { gotSpeech = true; L('speechstart'); opts.onSpeechStart?.(); };
  rec.onspeechend = () => L('speechend');
  rec.onresult = (ev) => {
    let text = '';
    let finals = 0;
    for (let i = 0; i < ev.results.length; i++) {
      text += (ev.results[i][0]?.transcript ?? '') + ' ';
      if (ev.results[i].isFinal) finals++;
    }
    text = text.replace(/\s+/g, ' ').trim();
    gotSpeech = true;
    L(`result n=${ev.results.length} final=${finals} len=${text.length}`);
    if (settled) return; // orphaned session: ignore late results
    heard = text;
    if (heard) opts.onInterim?.(heard);
    // Do NOT settle on the first final: iOS marks short pieces final early.
    // Wait for onend so the whole utterance is kept.
  };
  rec.onerror = (ev) => {
    L(`error ${ev.error}${ev.message ? ` "${ev.message}"` : ''}`);
    if (settled) return;
    const e = ev.error;
    if (e === 'not-allowed') return settle({ ok: false, error: 'not-allowed' });
    if (e === 'service-not-allowed') return settle({ ok: false, error: 'service' });
    if (e === 'network') return settle({ ok: false, error: 'network' });
    if (heard) return settle({ ok: true, text: heard });
    if (e === 'no-speech') return settle({ ok: false, error: gotSpeech ? 'no-speech' : 'no-speech' });
    if (e === 'aborted') return settle({ ok: false, error: 'aborted' });
    settle({ ok: false, error: 'failed' });
  };
  rec.onend = () => {
    L('end');
    if (live?.id === id) live = null;
    endedResolve();
    if (heard) settle({ ok: true, text: heard });
    else settle({ ok: false, error: 'no-speech' });
  };

  // Watchdogs. A deaf iOS session may never fire anything again.
  timers.push(window.setTimeout(() => {
    if (settled || gotSpeech) return;
    L('watchdog: no speech detected');
    settle({ ok: false, error: 'deaf' });
    try { rec.abort(); } catch { /* the session is already broken */ }
  }, opts.silenceMs ?? 10000));
  timers.push(window.setTimeout(() => {
    if (settled) return;
    L('watchdog: max length');
    if (!NEVER_CUT) { try { rec.stop(); } catch { /* ignore */ } }
    window.setTimeout(() => settle(heard ? { ok: true, text: heard } : { ok: false, error: 'no-speech' }), 800);
  }, opts.maxMs ?? 25000));

  try {
    L('start()');
    rec.start();
  } catch (e) {
    L(`start() threw ${(e as Error).message}`);
    if (live?.id === id) live = null;
    endedResolve();
    settle({ ok: false, error: 'failed' });
  }

  return {
    done,
    finish() {
      if (settled) return;
      L(`finish requested (${NEVER_CUT ? 'not cutting session' : 'stop()'})`);
      if (NEVER_CUT) {
        settle(heard ? { ok: true, text: heard } : { ok: false, error: 'aborted' });
        return;
      }
      try { rec.stop(); } catch { /* ignore */ }
      timers.push(window.setTimeout(() => settle(heard ? { ok: true, text: heard } : { ok: false, error: 'aborted' }), 1200));
    },
    cancel() {
      if (settled) return;
      L('cancel');
      settle({ ok: false, error: 'aborted' });
      if (!NEVER_CUT) { try { rec.abort(); } catch { /* ignore */ } }
    },
  };
}
