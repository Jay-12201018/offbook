import { useEffect, useState } from 'react';
import { loadScene, type Scene } from '@/lib/content.ts';
import { episodeById } from '@/content/season1.ts';
import { Icon } from '@/components/Icon.tsx';
import { Watch } from './Watch.tsx';
import { Steal } from './Steal.tsx';
import { Call } from './Call.tsx';
import { Recap } from './Recap.tsx';
import { markEpisode, type CallLog, type Pace } from '@/lib/store.ts';
import { useApp } from '@/lib/appState.tsx';
import { stopAudio } from '@/lib/player.ts';
import { stopSpeaking } from '@/lib/tts.ts';

export type Plan = 'full' | 'short' | 'talk' | 'first' | 'watch';
type Step = 'watch' | 'steal' | 'call' | 'recap' | 'pace';

const STEPS: Record<Plan, Step[]> = {
  full: ['watch', 'steal', 'call', 'recap'],
  short: ['watch', 'call', 'recap'],
  talk: ['call', 'recap'],
  first: ['watch', 'call', 'pace'],
  watch: ['watch'],
};

export function Practice({ episodeId, plan, onClose }: { episodeId: string; plan: Plan; onClose: () => void }) {
  const ep = episodeById(episodeId)!;
  const [scene, setScene] = useState<Scene | null>(null);
  const [err, setErr] = useState(false);
  const steps = STEPS[plan];
  const [k, setK] = useState(0);
  const [log, setLog] = useState<CallLog | null>(null);
  const [callKey, setCallKey] = useState(0);
  const { refresh } = useApp();

  useEffect(() => {
    loadScene(episodeId).then(setScene).catch(() => setErr(true));
  }, [episodeId]);

  const step = steps[k];
  const next = () => (k < steps.length - 1 ? setK(k + 1) : close());
  const close = () => { stopAudio(); stopSpeaking(); void refresh(); onClose(); };

  if (err) return <div className="stage center-all"><p>内容没加载出来，检查网络后再试。</p><button className="btn btn--primary" onClick={onClose}>返回</button></div>;
  if (!scene) return <div className="stage center-all"><span className="typing"><i /><i /><i /></span></div>;

  const fullscreenDark = step === 'call';

  return (
    <div className={`practice${fullscreenDark ? ' practice--dark' : ''}`}>
      {!fullscreenDark && (
        <div className="practice__bar">
          <button className="icon-btn" onClick={close} aria-label="关闭"><Icon name="x" size={22} /></button>
          <div className="progress">
            {steps.map((s, i) => <span key={s} className={i < k ? 'done' : i === k ? 'now' : ''} />)}
          </div>
          <span className="practice__step">{LABEL[step]}</span>
        </div>
      )}
      {step === 'watch' && (
        <Watch scene={scene} ep={ep} onDone={async () => { await markEpisode(ep.id, 'watched'); next(); }} />
      )}
      {step === 'steal' && <Steal scene={scene} ep={ep} onDone={next} />}
      {step === 'call' && (
        <Call
          key={callKey}
          scene={scene}
          ep={ep}
          maxTurns={plan === 'first' ? 2 : undefined}
          onExit={close}
          onDone={(l) => { setLog(l); next(); }}
        />
      )}
      {step === 'recap' && log && (
        <Recap scene={scene} ep={ep} log={log} onFinish={close} onAgain={() => { setLog(null); setCallKey((c) => c + 1); setK(steps.indexOf('call')); }} />
      )}
      {step === 'pace' && <PaceAsk onDone={close} />}
    </div>
  );
}

const LABEL: Record<Step, string> = { watch: '看一集', steal: '偷 3 句', call: '接电话', recap: '小结', pace: '' };

function PaceAsk({ onDone }: { onDone: () => void }) {
  const { update } = useApp();
  const choose = async (p: Pace) => {
    await update({ pace: p, firstRunDone: true });
    onDone();
  };
  return (
    <div className="stage center-all pace">
      <div className="big-emoji" aria-hidden>🎧</div>
      <h1 className="title-lg">刚才的语速，你觉得？</h1>
      <p className="muted">之后会按你的感觉调整，不用考试。</p>
      <div className="stack gap">
        <button className="opt opt--big" onClick={() => void choose('slow')}>有点快，跟不上</button>
        <button className="opt opt--big" onClick={() => void choose('ok')}>正好</button>
        <button className="opt opt--big" onClick={() => void choose('fast')}>可以再快点</button>
      </div>
    </div>
  );
}
