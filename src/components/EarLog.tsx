import type { SceneRollup } from '@/session/types.ts';

export interface WeekPoint {
  label: string;
  catchRate: number; // 0-1
  revealRate: number;
  sessions: number;
}

export function EarLog({ weeks }: { weeks: WeekPoint[] }) {
  const empty = weeks.every((w) => !w.sessions);
  if (empty) {
    return (
      <p className="helper">
        还没有练过。练过几次以后，这里会按周记下你第一次能抓住多少，以及还要不要看文字。
      </p>
    );
  }
  return (
    <div>
      <div className="week-bars" role="img" aria-label="四周的第一遍抓住和看文字比例">
        {weeks.map((w) => (
          <div key={w.label} className="col">
            <div className="bar-track">
              <div
                className="bar catch"
                style={{ height: w.sessions ? `${Math.max(4, w.catchRate * 100)}%` : '0' }}
              />
              <div
                className="bar reveal"
                style={{ height: w.sessions ? `${Math.max(4, w.revealRate * 100)}%` : '0' }}
              />
            </div>
            <div className="lbl">{w.label}</div>
          </div>
        ))}
      </div>
      <p className="helper" style={{ marginTop: 10 }}>
        绿是第一遍抓住的比例，琥珀是还要看文字的比例。按周看，隔几天练也不会变成空的。
      </p>
    </div>
  );
}

export function situationSentence(row: SceneRollup, title: string): string {
  if (!row.completedAt && !row.startedAt) return `${title}：还没开始。`;
  if (row.revealRate == null) return `${title}：你已经听过这场。`;
  if ((row.revealRate ?? 1) > 0.6) return `${title}：上次大多数句子你还是看了文字。可以再跑一遍。`;
  if ((row.firstListenCatch ?? false) && (row.revealRate ?? 1) < 0.4) {
    return `${title}：这场你第一遍就能抓住大意，而且不太依赖文字了。`;
  }
  return `${title}：耳朵在跟上，文字用得比刚开始少。`;
}
