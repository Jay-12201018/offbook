import { useEffect, useState } from 'react';
import { EarLog, situationSentence, type WeekPoint } from '@/components/EarLog.tsx';
import { SkillTreeView, type NodeStatus } from '@/components/SkillTreeView.tsx';
import { loadSkillTree } from '@/lib/catalog.ts';
import { copy } from '@/lib/copy.ts';
import { allLineEvents, allRecordings, allSessions, allSceneState } from '@/lib/db.ts';
import { playUrl } from '@/lib/audio.ts';
import { formatTtfw } from '@/lib/vad.ts';
import type { CatalogEntry, SceneRollup, Settings, SkillNode, SkillTree } from '@/session/types.ts';
import { UnitText } from '@/lib/units.tsx';

export function Progress({
  index,
  settings,
  states: rollups,
  onOpenScene,
}: {
  index: CatalogEntry[];
  settings: Settings;
  states: Record<string, SceneRollup>;
  onOpenScene: (id: string) => void;
}) {
  const [tree, setTree] = useState<SkillTree | null>(null);
  const [weeks, setWeeks] = useState<WeekPoint[]>([]);
  const [minutes, setMinutes] = useState(0);
  const [states, setStates] = useState<{ id: string; title: string; text: string }[]>([]);
  const [chunks, setChunks] = useState<{ form: string; url?: string; sceneId: string }[]>([]);
  const [ttfw, setTtfw] = useState<string | null>(null);

  useEffect(() => {
    void loadSkillTree().then(setTree);
  }, []);

  useEffect(() => {
    void (async () => {
      const [sessions, events, recs, rolls] = await Promise.all([
        allSessions(),
        allLineEvents(),
        allRecordings(),
        allSceneState(),
      ]);
      const now = Date.now();
      const weekMs = 7 * 86400000;
      const points: WeekPoint[] = [3, 2, 1, 0].map((ago) => {
        const end = now - ago * weekMs;
        const start = end - weekMs;
        const inWeek = sessions.filter((s) => {
          const t = s.completedAt || s.startedAt;
          return t >= start && t < end;
        });
        let catchN = 0;
        let catchD = 0;
        let revN = 0;
        let revD = 0;
        for (const s of inWeek) {
          if (s.metrics) {
            catchD += s.metrics.gistTotal || 0;
            catchN += s.metrics.gistHits || 0;
            const revealed = Object.values(s.metrics.reveals || {}).filter((n) => n > 0).length;
            const lines = Object.keys(s.metrics.firstListenByLine || {}).length || revealed;
            revD += Math.max(lines, 1);
            revN += revealed;
          }
        }
        const label = ago === 0 ? '本周' : ago === 1 ? '上周' : `${ago}周前`;
        return {
          label,
          catchRate: catchD ? catchN / catchD : 0,
          revealRate: revD ? revN / revD : 0,
          sessions: inWeek.length,
        };
      });
      setWeeks(points);
      const mins = sessions.reduce((acc, s) => {
        if (s.completedAt && s.startedAt) return acc + (s.completedAt - s.startedAt) / 60000;
        return acc + 8;
      }, 0);
      setMinutes(Math.round(mins));

      const byId = new Map(index.map((e) => [e.id, e]));
      setStates(
        rolls
          .filter((r) => r.completedAt || r.startedAt)
          .map((r) => ({
            id: r.sceneId,
            title: byId.get(r.sceneId)?.titleZh || '这场戏',
            text: situationSentence(r, byId.get(r.sceneId)?.titleZh || '这场戏'),
          })),
      );

      const rollMap = new Map(rolls.map((r) => [r.sceneId, r]));
      const preferred = recs
        .filter((r) => r.kind === 'chunk' || (r as { chunkId?: string }).chunkId)
        .concat(recs.filter((r) => r.kind !== 'chunk' && !(r as { chunkId?: string }).chunkId));
      const latestByKey = new Map<string, (typeof recs)[number]>();
      for (const r of preferred) {
        const chunkId = (r as { chunkId?: string }).chunkId;
        const k = chunkId ? `${r.sceneId}:c:${chunkId}` : `${r.sceneId}:${r.lineId}`;
        const prev = latestByKey.get(k);
        if (!prev || r.createdAt > prev.createdAt) latestByKey.set(k, r);
      }
      const chunkRows: { form: string; url?: string; sceneId: string }[] = [];
      for (const r of latestByKey.values()) {
        if (chunkRows.length >= 8) break;
        const chunkId = (r as { chunkId?: string }).chunkId;
        const label =
          (r as { label?: string }).label ||
          (chunkId ? rollMap.get(r.sceneId)?.chunkForms?.[chunkId] : undefined) ||
          r.lineId;
        if (label.startsWith('fluency-') || label.startsWith('turn-') || label.startsWith('react-')) continue;
        chunkRows.push({
          form: label,
          url: URL.createObjectURL(r.blob),
          sceneId: r.sceneId,
        });
      }
      setChunks((prev) => {
        for (const c of prev) if (c.url) URL.revokeObjectURL(c.url);
        return chunkRows;
      });

      const tts = events.map((e) => e.ttfwMs).filter((n): n is number => n != null);
      if (tts.length >= 2) {
        setTtfw(`你开口从 ${formatTtfw(tts[0])} 到最近的 ${formatTtfw(tts[tts.length - 1])}。`);
      } else if (tts.length === 1) {
        setTtfw(`最近一次开口大约在 ${formatTtfw(tts[0])}。`);
      }
    })();
  }, [index]);

  return (
    <div className="page">
      <p className="kicker">{copy.progress}</p>
      <h1 className="title" style={{ fontSize: '1.8rem', margin: '8px 0 12px' }}>
        耳朵日志
      </h1>
      <p className="helper" style={{ marginBottom: 20 }}>
        {copy.progressBlurb}
      </p>
      <EarLog weeks={weeks} />
      {ttfw ? <p style={{ marginTop: 16 }}><UnitText text={ttfw} /></p> : null}
      <hr className="hairline" />
      <h2 className="kicker">场面</h2>
      {states.length === 0 ? (
        <p className="helper" style={{ marginTop: 8 }}>
          练过以后，这里会出现你在每个场面里耳朵的变化。
        </p>
      ) : (
        states.map((s) => (
          <button key={s.id} type="button" className="list-row" onClick={() => onOpenScene(s.id)}>
            {s.text}
          </button>
        ))
      )}
      <hr className="hairline" />
      <h2 className="kicker">用过的说法</h2>
      {chunks.length === 0 ? (
        <p className="helper" style={{ marginTop: 8 }}>
          你录过的语块会留在这里，可以再听自己的。
        </p>
      ) : (
        chunks.map((c, i) => (
          <div key={i} className="chunk-row">
            <div>
              <div className="serif">{c.form}</div>
              <div className="helper">{index.find((e) => e.id === c.sceneId)?.titleZh}</div>
            </div>
            {c.url ? (
              <button
                type="button"
                className="dock-tool"
                style={{ flex: '0 0 auto', width: 'auto', padding: '0 14px' }}
                onClick={() => playUrl(c.url!, { rate: 1 })}
              >
                听我的
              </button>
            ) : null}
          </div>
        ))
      )}
      {minutes > 0 ? <p className="helper" style={{ marginTop: 24 }}><UnitText text={copy.minutesFoot(minutes)} /></p> : null}
      <hr className="hairline" />
      {tree ? <SkillTreeView tree={tree} statusFor={(n) => skillStatus(n, settings, index, rollups)} /> : null}
    </div>
  );
}

function skillStatus(
  node: SkillNode,
  settings: Settings,
  index: CatalogEntry[],
  rolls: Record<string, SceneRollup>,
): NodeStatus {
  const last = settings.lastSequenceSession;
  const completed = (packIds: string[]) =>
    index.some((e) => packIds.includes(e.packId || '') && rolls[e.id]?.completedAt);

  if (node.id === 'diag') {
    return settings.diagComplete || (last != null && last >= 0) ? 'reached' : 'in-reach';
  }
  if (node.id === 'phase-A') {
    if (last != null && last >= 14) return 'reached';
    if (settings.diagComplete || (last != null && last >= 0)) return 'in-reach';
    return 'ahead';
  }
  if (node.id === 'A-daily-open') {
    if (completed(['pack-01-who-pays']) && completed(['pack-02-change-of-plans'])) return 'reached';
    if (completed(['pack-01-who-pays']) || (last != null && last >= 1)) return 'in-reach';
    return settings.diagComplete ? 'in-reach' : 'ahead';
  }
  if (node.id === 'A-travel-open') {
    if (completed(['pack-03-getting-around']) && completed(['pack-04-food-and-help'])) return 'reached';
    if (completed(['pack-03-getting-around']) || (last != null && last >= 15)) return 'in-reach';
    return last != null && last >= 8 ? 'in-reach' : 'ahead';
  }
  if (node.id === 'A-reduce-basic') {
    if (last != null && last >= 20) return 'reached';
    if (last != null && last >= 10) return 'in-reach';
    return settings.diagComplete ? 'in-reach' : 'ahead';
  }
  if (node.sketched) return 'ahead';
  if (node.phase === 'B' || node.phase === 'C' || node.phase === 'D' || node.phase === 'beyond') {
    return 'ahead';
  }
  return 'ahead';
}

