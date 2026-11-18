/**
 * Device speech synthesis for call partner lines (AI + scripted calls).
 * Picks a natural en-US voice; separate preference for male characters.
 */

const synth: SpeechSynthesis | null = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;

export function ttsSupported(): boolean {
  return synth !== null;
}

let voicesCache: SpeechSynthesisVoice[] = [];
function loadVoices(): SpeechSynthesisVoice[] {
  if (!synth) return [];
  const v = synth.getVoices();
  if (v.length) voicesCache = v;
  return voicesCache;
}
if (synth) {
  loadVoices();
  synth.addEventListener?.('voiceschanged', loadVoices);
}

export function waitVoices(ms = 1500): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const now = loadVoices();
    if (now.length || !synth) return resolve(now);
    const t = window.setTimeout(() => resolve(loadVoices()), ms);
    synth.addEventListener?.('voiceschanged', () => { window.clearTimeout(t); resolve(loadVoices()); }, { once: true });
  });
}

const FEMALE = /samantha|ava|allison|susan|zoe|nicky|joelle|aria|jenny|michelle|emma|ana\b|female|google us english|karen|serena|victoria|sara|libby/i;
const MALE = /\balex\b|aaron|tom|evan|nathan|fred|daniel|guy|davis|tony|andrew|brian|christopher|eric|roger|steffan|male|reed|rocko|ralph/i;
const QUALITY = /natural|neural|premium|enhanced|online|google/i;

export function englishVoices(): SpeechSynthesisVoice[] {
  return loadVoices().filter((v) => /^en[-_]/i.test(v.lang));
}

function score(v: SpeechSynthesisVoice, gender: 'female' | 'male'): number {
  let s = 0;
  if (/^en[-_]US/i.test(v.lang)) s += 50;
  else if (/^en/i.test(v.lang)) s += 10;
  if (QUALITY.test(v.name)) s += 20;
  if (gender === 'female' && FEMALE.test(v.name)) s += 15;
  if (gender === 'male' && MALE.test(v.name)) s += 15;
  if (gender === 'female' && MALE.test(v.name)) s -= 10;
  if (gender === 'male' && FEMALE.test(v.name)) s -= 10;
  if (/eloquence|bad news|bells|boing|bubbles|cellos|jester|organ|trinoids|whisper|wobble|zarvox|albert|bahh|superstar|grandma|grandpa|shelley|flo|sandy/i.test(v.name)) s -= 60;
  if (v.localService) s += 2;
  return s;
}

export function pickVoice(gender: 'female' | 'male', preferredURI?: string | null): SpeechSynthesisVoice | null {
  const list = englishVoices();
  if (preferredURI) {
    const p = list.find((v) => v.voiceURI === preferredURI);
    if (p) return p;
  }
  if (!list.length) return null;
  return [...list].sort((a, b) => score(b, gender) - score(a, gender))[0];
}

let unlocked = false;
/** Call inside a user gesture once (iOS requires it before async speak()). */
export function unlockTts(): void {
  if (!synth || unlocked) return;
  unlocked = true;
  try {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    synth.speak(u);
  } catch { /* ignore */ }
}

export function stopSpeaking(): void {
  try { synth?.cancel(); } catch { /* ignore */ }
}

export function isSpeaking(): boolean {
  return !!synth && (synth.speaking || synth.pending);
}

/** Speak one utterance; resolves when finished (or after a safety timeout). */
export function speak(text: string, opts: { voice?: SpeechSynthesisVoice | null; rate?: number } = {}): Promise<void> {
  return new Promise((resolve) => {
    if (!synth || !text.trim()) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    if (opts.voice) { u.voice = opts.voice; u.lang = opts.voice.lang; } else u.lang = 'en-US';
    u.rate = opts.rate ?? 1;
    let settled = false;
    const end = () => { if (!settled) { settled = true; window.clearTimeout(t); resolve(); } };
    // Chrome sometimes never fires onend; estimate a ceiling from length.
    const t = window.setTimeout(end, 2500 + text.length * 110 / (opts.rate ?? 1));
    u.onend = end;
    u.onerror = end;
    synth.speak(u);
    // Chrome bug: queue can be paused after a tab switch.
    if (synth.paused) synth.resume();
  });
}

/**
 * Sentence queue for streaming AI text: push text as it arrives; complete
 * sentences are spoken in order with no gaps.
 */
export class SpeechQueue {
  private buf = '';
  private chain: Promise<void> = Promise.resolve();
  private cancelled = false;
  private voice: SpeechSynthesisVoice | null;
  private rate: number;
  private onSentence?: (s: string) => void;
  constructor(voice: SpeechSynthesisVoice | null, rate = 1, onSentence?: (s: string) => void) {
    this.voice = voice;
    this.rate = rate;
    this.onSentence = onSentence;
  }

  push(delta: string): void {
    this.buf += delta;
    // split on sentence end followed by space
    const re = /^(.+?[.!?…]["')\]]?)(\s+)/s;
    let m: RegExpMatchArray | null;
    while ((m = this.buf.match(re))) {
      const sentence = m[1];
      this.buf = this.buf.slice(m[0].length);
      this.enqueue(sentence);
    }
  }

  flush(): Promise<void> {
    if (this.buf.trim()) this.enqueue(this.buf.trim());
    this.buf = '';
    return this.chain;
  }

  cancel(): void {
    this.cancelled = true;
    stopSpeaking();
  }

  private enqueue(s: string) {
    const clean = s.replace(/\[END\]/gi, '').trim();
    if (!clean) return;
    this.chain = this.chain.then(() => {
      if (this.cancelled) return;
      this.onSentence?.(clean);
      return speak(clean, { voice: this.voice, rate: this.rate });
    });
  }
}
