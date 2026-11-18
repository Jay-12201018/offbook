import { useState } from 'react';
import { publicUrl } from '@/lib/publicUrl.ts';
import { Avatar } from '@/components/Avatar.tsx';
import { useApp } from '@/lib/appState.tsx';
import type { Goal } from '@/lib/store.ts';

const GOALS: { id: Goal; emoji: string; label: string }[] = [
  { id: 'shows', emoji: '🎬', label: '看剧不用字幕' },
  { id: 'travel', emoji: '✈️', label: '出国敢开口' },
  { id: 'chat', emoji: '💬', label: '和外国人聊天' },
];

export function FirstRun({ onStart, onSkip }: { onStart: () => void; onSkip: () => void }) {
  const { update } = useApp();
  const [step, setStep] = useState<0 | 1>(0);

  if (step === 0) {
    return (
      <div className="first">
        <div className="first__art">
          <img src={publicUrl('icons/icon-192.png')} alt="" width={96} height={96} className="first__logo" />
          <div className="first__faces">
            <Avatar id="maya" size={64} />
            <Avatar id="chris" size={64} />
          </div>
        </div>
        <h1 className="first__title">每天一通电话<br />英语就说出口了</h1>
        <p className="first__sub">看一小集 → 偷 3 句 → 接 Maya 的电话</p>
        <div className="first__cta">
          <button className="btn btn--primary btn--block btn--big" onClick={() => setStep(1)}>开始，60 秒</button>
        </div>
      </div>
    );
  }

  return (
    <div className="first">
      <h1 className="title-lg first__q">你最想先做到哪个？</h1>
      <div className="stack gap goal-list">
        {GOALS.map((g) => (
          <button
            key={g.id}
            className="opt opt--big opt--goal"
            onClick={async () => { await update({ goal: g.id }); onStart(); }}
          >
            <span className="opt__emoji" aria-hidden>{g.emoji}</span>{g.label}
          </button>
        ))}
      </div>
      <button className="link-btn" onClick={async () => { await update({ firstRunDone: true }); onSkip(); }}>跳过，直接进去</button>
    </div>
  );
}
