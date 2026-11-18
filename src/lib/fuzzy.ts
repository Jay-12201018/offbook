const STOP = new Set([
  'the', 'a', 'an', 'to', 'of', 'and', 'or', 'in', 'on', 'for', 'is', 'it',
  'i', 'you', 'he', 'she', 'they', 'we', 'be', 'was', 'are', 'do', 'did',
]);

const CONTRACT: Record<string, string> = {
  "i'm": 'i am',
  "you're": 'you are',
  "we're": 'we are',
  "they're": 'they are',
  "it's": 'it is',
  "that's": 'that is',
  "what's": 'what is',
  "don't": 'do not',
  "doesn't": 'does not',
  "can't": 'cannot',
  "won't": 'will not',
  "i'll": 'i will',
  "we'll": 'we will',
  wanna: 'want to',
  gonna: 'going to',
  gotta: 'got to',
  kinda: 'kind of',
  lemme: 'let me',
  dunno: "don't know",
  gimme: 'give me',
};

export function normalizeAnswer(s: string): string {
  let t = s.toLowerCase().replace(/[“”‘’]/g, "'").replace(/[.,!?;:…—–-]/g, ' ');
  for (const [k, v] of Object.entries(CONTRACT)) {
    t = t.replace(new RegExp(`\\b${k}\\b`, 'g'), v);
  }
  return t.replace(/\s+/g, ' ').trim();
}

export function tokens(s: string): string[] {
  return normalizeAnswer(s)
    .split(' ')
    .filter((w) => w && !STOP.has(w) && /[a-z0-9\u4e00-\u9fff]/.test(w));
}

export function answerHits(answer: string, accept: string[]): boolean {
  const raw = answer.trim();
  if (!raw) return false;
  const norm = normalizeAnswer(raw);
  for (const a of accept) {
    const n = normalizeAnswer(a);
    if (!n) continue;
    if (norm.includes(n) || n.includes(norm)) return true;
    // Chinese / mixed: original substring, case-insensitive
    if (raw.toLowerCase().includes(a.toLowerCase()) || a.toLowerCase().includes(raw.toLowerCase())) {
      if (a.replace(/\s/g, '').length >= 2) return true;
    }
  }
  const at = new Set(tokens(raw));
  if (at.size === 0) {
    // Chinese-only answer: any accept item of 2+ chars contained
    return accept.some((a) => a.length >= 2 && raw.includes(a));
  }
  for (const a of accept) {
    const et = tokens(a);
    if (et.length === 0) continue;
    const hit = et.filter((w) => at.has(w)).length;
    if (hit / et.length >= 0.4) return true;
  }
  return false;
}

export function missingAnchors(answer: string, accept: string[]): string[] {
  const at = new Set(tokens(answer));
  const missing: string[] = [];
  for (const a of accept) {
    for (const w of tokens(a)) {
      if (w.length > 3 && !at.has(w) && !missing.includes(w)) missing.push(w);
    }
  }
  return missing.slice(0, 4);
}
