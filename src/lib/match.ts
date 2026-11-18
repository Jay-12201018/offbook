export function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function words(s: string): string[] {
  return norm(s).split(' ').filter(Boolean);
}

/** Index of the first option whose keyword appears in the text, or -1. */
export function matchOption(text: string, options: { kw: string[] }[]): number {
  const t = ` ${norm(text)} `;
  let best = -1;
  let bestLen = 0;
  options.forEach((o, i) => {
    for (const k of o.kw) {
      const kk = ` ${norm(k)} `;
      if (t.includes(kk) && kk.length > bestLen) {
        best = i;
        bestLen = kk.length;
      }
    }
  });
  return best;
}

const SIMPLE: Record<string, string> = { gonna: 'going', wanna: 'want', gotta: 'got', ya: 'you', 'im': "i'm", 'dont': "don't" };

/** Which target words were heard (for green lighting). */
export function litWords(target: string, heard: string): boolean[] {
  const h = new Set(words(heard).map((w) => SIMPLE[w] ?? w));
  const hNoApos = new Set([...h].map((w) => w.replace(/'/g, '')));
  return target.split(/\s+/).map((tok) => {
    const w = norm(tok);
    if (!w) return false;
    const base = SIMPLE[w] ?? w;
    return h.has(base) || hNoApos.has(base.replace(/'/g, ''));
  });
}
