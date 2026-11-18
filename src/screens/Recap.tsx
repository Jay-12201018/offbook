import { useEffect, useState } from 'react';
import type { Scene } from '@/lib/content.ts';
import { GENDER } from '@/lib/content.ts';
import { EPISODES, type EpisodeMeta } from '@/content/season1.ts';
import { Icon } from '@/components/Icon.tsx';
import { Avatar } from '@/components/Avatar.tsx';
import { useApp } from '@/lib/appState.tsx';
import { chatJson, recapMessages, type AiRecap } from '@/lib/ai.ts';
import { addPhrases, getApiKey, markEpisode, saveCall, updateCall, type CallLog } from '@/lib/store.ts';
import { pickVoice, speak, stopSpeaking } from '@/lib/tts.ts';
import { loadScene } from '@/lib/content.ts';

interface View {
  pairs: { said: string; better: string; noteZh?: string }[];
  phrases: { en: string; zh: string; audio?: string }[];
  praise: string;
}

function scriptedView(log: CallLog, scene: Scene): View {
  const pairs = log.turns
    .filter((t) => t.user && t.better && t.user.toLowerCase().replace(/[^a-z ]/g, '') !== t.better.toLowerCase().replace(/[^a-z ]/g, ''))
    .slice(0, 3)
    .map((t) => ({ said: t.user, better: t.better! }));
  return {
    pairs,
    phrases: scene.chunks.slice(0, 3).map((c) => ({ en: c.form, zh: c.meaningZh, audio: c.audio })),
    praise: log.turns.length >= 3 ? '整通电话都接住了。' : '开口就是胜利。',
  };
}

export function Recap({ scene, ep, log, onFinish, onAgain }: { scene: Scene; ep: EpisodeMeta; log: CallLog; onFinish: () => void; onAgain: () => void }) {
  const { settings, refresh } = useApp();
  const [view, setView] = useState<View | null>(null);
  const [aiFailed, setAiFailed] = useState<string | null>(null);
  const next = EPISODES.find((e) => e.no === ep.no + 1);
  const [nextTitle, setNextTitle] = useState<string>('');

  useEffect(() => {
    let live = true;
    (async () => {
      const id = await saveCall(log);
      let v: View;
      if (log.mode === 'ai' && log.turns.length) {
        try {
          const key = await getApiKey();
          const r = await chatJson<AiRecap>(key, settings.aiModel, recapMessages(log.turns, ep.call.partner), { maxTokens: 600 });
          v = {
            pairs: (r.pairs ?? []).slice(0, 3).filter((p) => p.said && p.better),
            phrases: (r.phrases ?? []).slice(0, 3).filter((p) => p.en),
            praise: r.praiseZh || '这通电话你撑下来了。',
          };
          if (!v.phrases.length) v.phrases = scriptedView(log, scene).phrases;
          void updateCall({ ...log, id, recap: r });
        } catch (e) {
          setAiFailed((e as Error).message);
          v = scriptedView(log, scene);
        }
      } else {
        v = scriptedView(log, scene);
      }
      await addPhrases(v.phrases.map((p) => ({ en: p.en, zh: p.zh, audio: p.audio, episodeId: ep.id, source: 'call' as const })));
      await markEpisode(ep.id, 'called');
      if (!live) return;
      setView(v);
    })();
    if (next) void loadScene(next.id).then((s) => live && setNextTitle(s.titleZh)).catch(() => undefined);
    return () => { live = false; stopSpeaking(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const say = (t: string) => void speak(t, { voice: pickVoice(GENDER[ep.call.partner] ?? 'female', settings.voiceURI), rate: 0.95 });
  const secs = Math.round(log.speakMs / 1000);

  async function finish() {
    await markEpisode(ep.id, 'done');
    await refresh();
    onFinish();
  }

  return (
    <div className="stage recap">
      <div className="recap__hero">
        <Avatar id={ep.call.partner} size={64} />
        <div>
          <div className="eyebrow">通话小结</div>
          <h1 className="title-lg">{view ? view.praise : '正在整理…'}</h1>
        </div>
      </div>

      <div className="stats-row">
        <div className="stat"><b>{log.turns.length}</b><span>开口次数</span></div>
        <div className="stat"><b>{secs || '—'}{secs ? '秒' : ''}</b><span>开口用时</span></div>
        <div className="stat"><b>{view ? view.phrases.length : '…'}</b><span>收进句库</span></div>
      </div>

      {!view && <div className="skeleton-list"><div /><div /><div /></div>}

      {view && view.pairs.length > 0 && (
        <section className="section">
          <h2 className="section__title">换个更自然的说法</h2>
          {view.pairs.map((p, i) => (
            <div className="pair" key={i}>
              <div className="pair__said"><span className="tag">你说的</span>{p.said}</div>
              <button className="pair__better" onClick={() => say(p.better)}>
                <span className="tag tag--mint">更自然</span>
                <span className="pair__text">{p.better}</span>
                <Icon name="volume" size={18} />
              </button>
              {p.noteZh && <div className="pair__note">{p.noteZh}</div>}
            </div>
          ))}
        </section>
      )}
      {view && view.pairs.length === 0 && log.turns.length > 0 && (
        <p className="good center-text">你说的都很自然。</p>
      )}

      {view && (
        <section className="section">
          <h2 className="section__title">今天收进句库的 3 句</h2>
          {view.phrases.map((p) => (
            <button className="phrase-row" key={p.en} onClick={() => say(p.en)}>
              <span className="phrase-row__star"><Icon name="star" size={16} /></span>
              <span className="phrase-row__body"><b>{p.en}</b><span>{p.zh}</span></span>
              <Icon name="volume" size={18} />
            </button>
          ))}
        </section>
      )}

      {aiFailed && <p className="muted small">AI 小结没生成（{aiFailed}），先显示剧本版。</p>}
      {log.mode === 'script' && <p className="muted small center-text">想让 Maya 真的跟你聊？在「我」里填 DeepSeek 密钥。</p>}

      {next && (
        <div className="next-card">
          <span className="eyebrow">下一集</span>
          <b>第 {next.no} 集 · {nextTitle}</b>
          <span className="muted small">{next.hookZh}</span>
        </div>
      )}

      <div className="dock dock--static">
        <button className="btn btn--primary btn--block btn--big" onClick={() => void finish()} disabled={!view}>
          <Icon name="check" size={22} /> 这就够了
        </button>
        <button className="link-btn" onClick={onAgain}>再打一次</button>
      </div>
    </div>
  );
}
