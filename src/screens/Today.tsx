import { useEffect, useState } from 'react';
import { CHAPTERS, EPISODES, type EpisodeMeta } from '@/content/season1.ts';
import { loadScene, type Scene } from '@/lib/content.ts';
import { Avatar } from '@/components/Avatar.tsx';
import { Icon } from '@/components/Icon.tsx';
import { useApp, weekCount } from '@/lib/appState.tsx';
import { toast } from '@/components/Toast.tsx';
import type { Plan } from './Practice.tsx';

export function Today({ onStart, onGoMe }: { onStart: (id: string, plan: Plan) => void; onGoMe: () => void }) {
  const { progress, phraseCount, days, hasKey } = useApp();
  const [scenes, setScenes] = useState<Record<string, Scene>>({});
  const [sheet, setSheet] = useState<EpisodeMeta | null>(null);

  useEffect(() => {
    Promise.all(EPISODES.map((e) => loadScene(e.id).catch(() => null))).then((list) => {
      const m: Record<string, Scene> = {};
      list.forEach((s) => { if (s) m[s.id] = s; });
      setScenes(m);
    });
  }, []);

  const doneCount = EPISODES.filter((e) => progress[e.id]?.done).length;
  const current = EPISODES.find((e) => !progress[e.id]?.done) ?? EPISODES[EPISODES.length - 1];
  const allDone = doneCount === EPISODES.length;
  const cs = scenes[current.id];
  const week = weekCount(days);

  return (
    <div className="page today">
      <header className="today__top">
        <div className="today__brand">今天</div>
        <div className="row gap-sm">
          <span className="stat-chip" title="本周练习天数">🔥 本周 {week} 天</span>
          <span className="stat-chip" title="句库">⭐ {phraseCount}</span>
        </div>
      </header>

      <section className="hero">
        <div className="hero__faces">
          {(cs?.speakers ?? [{ id: 'maya' }, { id: 'chris' }]).slice(0, 3).map((s) => <Avatar key={s.id} id={s.id} size={52} />)}
        </div>
        <div className="hero__tag">{allDone ? '第一章完成 · 再练一集' : `第 ${current.no} 集`}</div>
        <h1 className="hero__title">{cs?.titleZh ?? '…'}</h1>
        <p className="hero__en">“{cs?.title ?? ''}”</p>
        <p className="hero__hook">{current.hookZh}</p>
        <button className="btn btn--primary btn--block btn--big" onClick={() => onStart(current.id, 'full')}>
          <Icon name="play" size={20} /> 开始 · 约 15 分钟
        </button>
        <div className="hero__alts">
          <button className="btn btn--ghost" onClick={() => onStart(current.id, 'short')}>只有 8 分钟</button>
          <button className="btn btn--ghost" onClick={() => onStart(current.id, 'talk')}><Icon name="phone" size={16} /> 只想说话</button>
        </div>
      </section>

      {!hasKey && (
        <button className="ai-nudge" onClick={onGoMe}>
          <Icon name="spark" size={18} />
          <span>填上你的 DeepSeek 密钥，Maya 就能真的跟你聊</span>
          <Icon name="chevron" size={18} />
        </button>
      )}

      <section className="path" aria-label="路线图">
        {CHAPTERS.map((ch, ci) => (
          <div key={ch.id} className={`chapter${ch.ready ? '' : ' chapter--locked'}`}>
            <div className="chapter__banner">
              <span className="chapter__no">第 {ci + 1} 章</span>
              <b>{ch.titleZh}</b>
              {ch.ready ? <span className="chapter__count">{doneCount}/{EPISODES.length}</span> : <span className="chapter__count"><Icon name="lock" size={14} /> 即将上线</span>}
            </div>
            {ch.ready && (
              <div className="nodes">
                {EPISODES.map((e, i) => {
                  const done = !!progress[e.id]?.done;
                  const isCur = e.id === current.id && !allDone;
                  const locked = !done && !isCur;
                  const offset = [0, 1, 2, 1, 0, -1, -2][i % 7];
                  return (
                    <div key={e.id} className="node-wrap" style={{ transform: `translateX(${offset * 38}px)` }}>
                      <button
                        className={`node${done ? ' node--done' : ''}${isCur ? ' node--cur' : ''}${locked ? ' node--locked' : ''}`}
                        onClick={() => {
                          if (locked) return toast('先完成上一集');
                          if (isCur) return onStart(e.id, 'full');
                          setSheet(e);
                        }}
                        aria-label={`第 ${e.no} 集 ${scenes[e.id]?.titleZh ?? ''}${done ? '，已完成' : locked ? '，未解锁' : ''}`}
                      >
                        {done ? <Icon name="check" size={30} /> : locked ? <Icon name="lock" size={24} /> : <Icon name="play" size={28} />}
                      </button>
                      <span className="node__label">{scenes[e.id]?.titleZh ?? `第 ${e.no} 集`}</span>
                      {isCur && <span className="node__bubble">今天</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </section>

      {sheet && (
        <div className="sheet-backdrop" onClick={() => setSheet(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog">
            <div className="sheet__grip" />
            <div className="eyebrow">第 {sheet.no} 集 · 已完成</div>
            <h2 className="title-md">{scenes[sheet.id]?.titleZh}</h2>
            <div className="stack gap">
              <button className="btn btn--soft btn--block" onClick={() => { setSheet(null); onStart(sheet.id, 'watch'); }}><Icon name="play" size={18} /> 重看这一集</button>
              <button className="btn btn--soft btn--block" onClick={() => { setSheet(null); onStart(sheet.id, 'talk'); }}><Icon name="phone" size={18} /> 再打一次电话</button>
              <button className="btn btn--soft btn--block" onClick={() => { setSheet(null); onStart(sheet.id, 'full'); }}>完整再练一遍</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
