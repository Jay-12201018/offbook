import { copy } from '@/lib/copy.ts';
import { splitCurriculumTitle } from '@/lib/displayTitle.ts';
import { UnitText } from '@/lib/units.tsx';
import type { CatalogEntry } from '@/session/types.ts';

export function SceneCard({
  entry,
  primaryLabel,
  resumeHint,
  onPrimary,
  minutes,
}: {
  entry: CatalogEntry;
  primaryLabel: string;
  resumeHint?: string;
  onPrimary: () => void;
  minutes?: number;
}) {
  const display = splitCurriculumTitle(entry.titleZh || entry.title);
  return (
    <article className="scene-card">
      <p className="kicker">{resumeHint || display.kicker || '今天这场戏'}</p>
      <h1 className="title">{display.title}</h1>
      {entry.situationZh ? <p className="helper cjk-wrap"><UnitText text={entry.situationZh} /></p> : null}
      <p className="helper" style={{ marginTop: 8 }}>
        <UnitText text={`大约 ${minutes ?? entry.estimatedMinutes} 分钟`} />
      </p>
      <button type="button" className="btn btn-primary" style={{ marginTop: 20 }} onClick={onPrimary}>
        {primaryLabel || copy.continue}
      </button>
    </article>
  );
}
