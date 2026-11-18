/**
 * On-device diagnostics ("debug 语音" in 我). Ring buffer of recognizer, TTS
 * and AI request events. Never records the API key or transcripts' full text
 * beyond a short preview.
 */
type Listener = () => void;
export interface DebugEvent { t: number; tag: string; msg: string }

const KEY = 'offbook-debug';
const MAX = 200;
const events: DebugEvent[] = [];
const listeners = new Set<Listener>();
const t0 = Date.now();

export function debugEnabled(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

export function setDebugEnabled(on: boolean): void {
  try { if (on) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}

export function dlog(tag: string, msg: string): void {
  events.push({ t: Date.now(), tag, msg });
  if (events.length > MAX) events.splice(0, events.length - MAX);
  listeners.forEach((l) => l());
}

export function debugEvents(): DebugEvent[] {
  return events;
}

export function clearDebug(): void {
  events.length = 0;
  listeners.forEach((l) => l());
}

export function subscribeDebug(l: Listener): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function fmtEvent(e: DebugEvent): string {
  return `${((e.t - t0) / 1000).toFixed(2)}s [${e.tag}] ${e.msg}`;
}

export function envSummary(): string {
  const nav = navigator as Navigator & { standalone?: boolean };
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || nav.standalone === true;
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return [
    `UA: ${navigator.userAgent}`,
    `standalone: ${standalone}`,
    `SpeechRecognition: ${w.SpeechRecognition ? 'yes' : w.webkitSpeechRecognition ? 'webkit' : 'no'}`,
    `speechSynthesis: ${'speechSynthesis' in window ? 'yes' : 'no'}`,
    `viewport: ${window.innerWidth}x${window.innerHeight} dpr ${window.devicePixelRatio}`,
  ].join('\n');
}
