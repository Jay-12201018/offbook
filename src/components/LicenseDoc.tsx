import type { ReactNode } from 'react';

function bareUrl(raw: string): { href: string; rest: string } {
  let href = raw;
  let rest = '';
  while (href && /[),.;:!?]+$/.test(href)) {
    rest = href.slice(-1) + rest;
    href = href.slice(0, -1);
  }
  return { href, rest };
}

function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`|(https?:\/\/[^\s]+))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[2] && m[3]) {
      parts.push(
        <a key={k++} href={m[3]} target="_blank" rel="noreferrer">
          {m[2]}
        </a>,
      );
    } else if (m[4]) {
      parts.push(<strong key={k++}>{m[4]}</strong>);
    } else if (m[5]) {
      parts.push(<code key={k++}>{m[5]}</code>);
    } else if (m[6]) {
      const { href, rest } = bareUrl(m[6]);
      parts.push(
        <a key={k++} href={href} target="_blank" rel="noreferrer">
          {href}
        </a>,
      );
      if (rest) parts.push(rest);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function LicenseDoc({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }
    if (line.startsWith('# ')) {
      blocks.push(
        <h2 key={key++} className="serif" style={{ fontSize: '1.25rem', margin: '18px 0 8px' }}>
          {inline(line.slice(2))}
        </h2>,
      );
      i += 1;
      continue;
    }
    if (line.startsWith('## ')) {
      blocks.push(
        <h3 key={key++} className="kicker" style={{ margin: '20px 0 8px', textTransform: 'none', letterSpacing: 0 }}>
          {inline(line.slice(3))}
        </h3>,
      );
      i += 1;
      continue;
    }
    if (line.startsWith('- ')) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith('- ')) {
        items.push(lines[i].slice(2));
        i += 1;
      }
      blocks.push(
        <ul key={key++} style={{ paddingLeft: 20, margin: '8px 0 12px', lineHeight: 1.55 }}>
          {items.map((it, j) => (
            <li key={j} style={{ marginBottom: 8 }}>
              {inline(it)}
            </li>
          ))}
        </ul>,
      );
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !lines[i].startsWith('#') && !lines[i].startsWith('- ')) {
      para.push(lines[i]);
      i += 1;
    }
    blocks.push(
      <p key={key++} style={{ lineHeight: 1.55, margin: '0 0 12px' }}>
        {inline(para.join(' '))}
      </p>,
    );
  }
  return <div className="license-doc">{blocks}</div>;
}
