import type { ReactNode } from 'react';
import type { SceneLine } from '@/session/types.ts';

/** Keep short contraction phrases on one line without wrapping a whole sentence. */
const CONTRACTION_RE =
  /\b(I don't know|I don't|don't know|I can't|I won't|I wouldn't|I couldn't|I'm not|it's not)\b/gi;

export function wrapContractions(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = new RegExp(CONTRACTION_RE.source, 'gi');
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <span key={k++} className="phrase-glue">
        {m[0]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length ? parts : [text];
}

export function RevealText({
  line,
  level,
}: {
  line: SceneLine;
  level: 0 | 1 | 2;
}) {
  return (
    <div className="reveal-slot" aria-live="polite">
      {level === 0 ? (
        <p className="helper">先听声音。没听清再听，不要急着翻。</p>
      ) : (
        <>
          <p className="line-en">{wrapContractions(line.text)}</p>
          {level >= 2 && line.meaningZh ? (
            <p className="line-zh" style={{ marginTop: 10 }}>
              {line.meaningZh}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
