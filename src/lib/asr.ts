/**
 * Optional "我听到：" hint. Never required. Timed out if it hangs.
 * Isolated from concurrent getUserMedia metering when possible —
 * prefer using this for typed gist answers, not during record-and-compare.
 */
export type AsrResult = { text: string } | { error: string } | { timeout: true };

interface RecogCtor {
  new (): SpeechRecognitionLite;
}

interface SpeechRecognitionLite {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((ev: { results: { [i: number]: { [j: number]: { transcript: string }; isFinal?: boolean } } }) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

function Ctor(): RecogCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: RecogCtor;
    webkitSpeechRecognition?: RecogCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function asrAvailable(): boolean {
  return Ctor() != null;
}

export function listenOnce(opts: { lang?: string; timeoutMs?: number } = {}): Promise<AsrResult> {
  const Rec = Ctor();
  if (!Rec) return Promise.resolve({ error: 'missing' });
  const timeoutMs = opts.timeoutMs ?? 8000;
  return new Promise((resolve) => {
    let done = false;
    const rec = new Rec();
    rec.lang = opts.lang ?? 'en-US';
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    const finish = (r: AsrResult) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      try {
        rec.onresult = null;
        rec.onerror = null;
        rec.onend = null;
        rec.abort();
      } catch {
        /* ignore */
      }
      resolve(r);
    };
    const timer = window.setTimeout(() => finish({ timeout: true }), timeoutMs);
    rec.onresult = (ev) => {
      try {
        const alt = ev.results[0]?.[0]?.transcript;
        if (alt) finish({ text: alt });
      } catch {
        finish({ error: 'parse' });
      }
    };
    rec.onerror = (ev) => finish({ error: ev.error || 'error' });
    rec.onend = () => {
      if (!done) finish({ error: 'ended' });
    };
    try {
      rec.start();
    } catch {
      finish({ error: 'start' });
    }
  });
}
