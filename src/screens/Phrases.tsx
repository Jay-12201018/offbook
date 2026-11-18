import { useEffect, useRef, useState } from 'react';
import { allPhrases, deletePhrase, touchPhrase, type Phrase } from '@/lib/store.ts';
import { audioUrl } from '@/lib/content.ts';
import { episodeById } from '@/content/season1.ts';
import { playClip, stopAudio } from '@/lib/player.ts';
import { pickVoice, speak } from '@/lib/tts.ts';
import { Icon } from '@/components/Icon.tsx';
import { Avatar } from '@/components/Avatar.tsx';
import { asrSupported, listen, type ListenHandle } from '@/lib/asr.ts';
import { litWords } from '@/lib/match.ts';
import { useApp } from '@/lib/appState.tsx';

function play(p: Phrase) {
  const u = audioUrl(p.audio);
  if (u) void playClip(u);
  else void speak(p.en, { voice: pickVoice('female') });
}

export function Phrases() {
  const { refresh } = useApp();
  const [list, setList] = useState<Phrase[] | null>(null);
  const [review, setReview] = useState<Phrase[] | null>(null);

  const load = () => allPhrases().then(setList);
  useEffect(() => { void load(); return () => stopAudio(); }, []);

  if (review) return <Review items={review} onClose={() => { setReview(null); void load(); }} />;

  return (
    <div className="page phrases">
      <header className="page__head">
        <h1 className="title-lg">句库</h1>
        <span className="muted">{list?.length ?? 0} 句会说的</span>
      </header>

      {list && list.length > 0 && (
        <button
          className="btn btn--primary btn--block btn--big"
          onClick={() => setReview([...list].sort((a, b) => (a.reviews - b.reviews) || ((a.lastReview ?? 0) - (b.lastReview ?? 0))).slice(0, 8))}
        >
          <Icon name="mic" size={20} /> 练一遍（{Math.min(8, list.length)} 句）
        </button>
      )}

      {list && list.length === 0 && (
        <div className="empty">
          <Avatar id="maya" size={72} />
          <p>还没有句子。<br />每集「偷 3 句」和通话后，会自动收到这里。</p>
        </div>
      )}

      <div className="phrase-list">
        {list?.map((p) => (
          <div className="phrase-card" key={p.id}>
            <button className="phrase-card__play" onClick={() => play(p)} aria-label="播放"><Icon name="volume" size={20} /></button>
            <div className="phrase-card__body">
              <b>{p.en}</b>
              <span>{p.zh}</span>
              <small>第 {episodeById(p.episodeId)?.no ?? '?'} 集 · {p.source === 'steal' ? '偷来的' : '通话'}{p.reviews ? ` · 练过 ${p.reviews} 次` : ''}</small>
            </div>
            <button className="icon-btn icon-btn--faint" onClick={async () => { await deletePhrase(p.id); await load(); void refresh(); }} aria-label="删除"><Icon name="trash" size={18} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Review({ items, onClose }: { items: Phrase[]; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(false);
  const [heard, setHeard] = useState('');
  const [live, setLive] = useState(false);
  const h = useRef<ListenHandle | null>(null);
  const p = items[i];

  useEffect(() => () => { h.current?.cancel(); stopAudio(); }, []);

  async function sayIt() {
    if (live) { h.current?.stop(); return; }
    setLive(true); setHeard('');
    const hh = listen({ onInterim: setHeard, maxMs: 7000 });
    h.current = hh;
    const r = await hh.done;
    setLive(false);
    if (r.ok) setHeard(r.text);
    setShown(true);
    play(p);
  }

  async function next() {
    await touchPhrase(p.id);
    if (i >= items.length - 1) return onClose();
    setI(i + 1); setShown(false); setHeard('');
  }

  const lit = heard ? litWords(p.en, heard) : [];

  return (
    <div className="practice">
      <div className="practice__bar">
        <button className="icon-btn" onClick={onClose} aria-label="关闭"><Icon name="x" size={22} /></button>
        <div className="progress">{items.map((x, k) => <span key={x.id} className={k < i ? 'done' : k === i ? 'now' : ''} />)}</div>
        <span className="practice__step">复习</span>
      </div>
      <div className="stage review">
        <div className="card review__card">
          <p className="eyebrow">用英文怎么说？</p>
          <p className="review__zh">{p.zh}</p>
          {shown ? (
            <p className="review__en">
              {p.en.split(/\s+/).map((w, k) => <span key={k} className={lit[k] ? 'lit' : ''}>{w} </span>)}
            </p>
          ) : <p className="review__en review__en--hidden">· · ·</p>}
          {heard && <p className="muted small">我听到：<i>{heard}</i></p>}
        </div>
        <div className="dock">
          {asrSupported() && !shown && (
            <>
              <button className={`mic-btn${live ? ' is-live' : ''}`} onClick={() => void sayIt()} aria-label="说出来"><Icon name={live ? 'stop' : 'mic'} size={34} /></button>
              <p className="dock__hint">{live ? '说完点一下' : '先自己说，再看答案'}</p>
            </>
          )}
          <div className="row gap center">
            {!shown && <button className="btn btn--ghost" onClick={() => { setShown(true); play(p); }}>看答案</button>}
            {shown && <button className="btn btn--soft" onClick={() => play(p)}><Icon name="volume" size={18} /> 再听</button>}
            {shown && <button className="btn btn--primary" onClick={() => void next()}>{i >= items.length - 1 ? '完成' : '下一句'}</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
