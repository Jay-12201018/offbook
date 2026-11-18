import type { CSSProperties, ReactNode } from 'react';

/**
 * Keep a number+unit token together, including a short leading modifier
 * (大约 / 每分钟 / 大约每分钟) and a 词/分钟 suffix when present.
 * After that, keep a trailing punctuation cluster with the two preceding
 * non-space, non-punctuation characters (so “开始。” / “位置。” / “细节。”
 * stay one nowrap token), and wrap a short run of 2+ Latin words in
 * .phrase-glue (teaching cues like “This week was pretty normal”).
 * Does not wrap a whole clause or sentence.
 */
const UNIT_RE =
  /((?:大约每分钟|每分钟|大约)\s*)?(\d+(?:\s*[、,]\s*\d+)*(?:\s*[–—\-至到]\s*\d+)?(?:\s*\/\s*\d+)?)\s+(秒|分钟|个月|周|词(?:\/分钟)?)/g;

const LATIN_RUN_RE = /[A-Za-z][A-Za-z''’]*(?:\s+[A-Za-z][A-Za-z''’]*)+[?!.]*/g;

/** Short enough to fit a 390px line; longer English still wraps at spaces. */
const LATIN_RUN_MAX = 48;

const PUNCT_CLUSTER = /[。！？,，、；;.!?…]+/;

type Mark = { start: number; end: number; kind: 'unit' | 'phrase' };

function marksIn(text: string): Mark[] {
  const marks: Mark[] = [];
  const unitRe = new RegExp(UNIT_RE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = unitRe.exec(text))) {
    marks.push({ start: m.index, end: m.index + m[0].length, kind: 'unit' });
  }
  const latinRe = new RegExp(LATIN_RUN_RE.source, 'g');
  while ((m = latinRe.exec(text))) {
    if (m[0].length > LATIN_RUN_MAX) continue;
    const start = m.index;
    const end = start + m[0].length;
    if (marks.some((mk) => start < mk.end && end > mk.start)) continue;
    marks.push({ start, end, kind: 'phrase' });
  }
  marks.sort((a, b) => a.start - b.start);
  return marks;
}

function leadingPunct(rest: string): string {
  const m = rest.match(new RegExp(`^${PUNCT_CLUSTER.source}`));
  return m ? m[0] : '';
}

/** One character that can sit in the punct-glue window (not space, not punct). */
const PRE_CHAR = /[^\s。！？,，、；;.!?…]/;

function gluePunctInText(text: string, keyStart: number): { nodes: ReactNode[]; nextKey: number } {
  const nodes: ReactNode[] = [];
  const re = new RegExp(`(${PRE_CHAR.source}{0,2})(${PUNCT_CLUSTER.source})`, 'g');
  let last = 0;
  let k = keyStart;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const lead = m[1];
    const punct = m[2];
    const start = m.index;
    if (start > last) nodes.push(text.slice(last, start));
    nodes.push(
      <span key={k++} className="punct-glue">
        {lead}
        {punct}
      </span>,
    );
    last = start + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return { nodes, nextKey: k };
}

export function glueUnits(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const marks = marksIn(text);
  let last = 0;
  let k = 0;
  for (const mk of marks) {
    const before = text.slice(last, mk.start);
    if (before) {
      const glued = gluePunctInText(before, k);
      parts.push(...glued.nodes);
      k = glued.nextKey;
    }
    let value = text.slice(mk.start, mk.end);
    const punct = leadingPunct(text.slice(mk.end));
    if (punct) value += punct;
    parts.push(
      <span key={k++} className={mk.kind === 'phrase' ? 'phrase-glue' : 'unit-glue'}>
        {value}
      </span>,
    );
    last = mk.end + punct.length;
  }
  if (last < text.length) {
    const glued = gluePunctInText(text.slice(last), k);
    parts.push(...glued.nodes);
  }
  return parts.length ? parts : [text];
}

export function UnitText({
  text,
  className,
  style,
}: {
  text: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span className={className} style={style}>
      {glueUnits(text)}
    </span>
  );
}
