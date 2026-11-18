import { useEffect, useMemo, useRef, useState } from 'react';
import type { Scene, Line } from '@/lib/content.ts';
import { audioUrl, NAMES } from '@/lib/content.ts';
import type { EpisodeMeta } from '@/content/season1.ts';
import { playClip, playSequence, stopAudio } from '@/lib/player.ts';
import { Avatar } from '@/components/Avatar.tsx';
import { Icon } from '@/components/Icon.tsx';
import { useApp } from '@/lib/appState.tsx';
import { chatText, explainMessages } from '@/lib/ai.ts';
import { getApiKey } from '@/lib/store.ts';

type Phase = 'ready' | 'playing' | 'paused' | 'quiz' | 'answered';

export function Watch({ scene, ep, onDone }: { scene: Scene; ep: EpisodeMeta; onDone: () => void }) {
  const { settings, hasKey } = useApp();
  const [phase, setPhase] = useState<Phase>('ready');
  const [shown, setShown] = useState(0); // bubbles visible
  const [active, setActive] = useState(-1);
  const [slow, setSlow] = useState(settings.pace === 'slow');
  const [showEn, setShowEn] = useState(settings.showEnglish);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [sheet, setSheet] = useState<Line | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const resumeAt = useRef(0);

  const side = useMemo(() => {
    const order = scene.speakers.map((s) => s.id);
    return (id: string) => (order.indexOf(id) % 2 === 1 ? 'right' : 'left');
  }, [scene]);

  useEffect(() => () => stopAudio(), []);

  useEffect(() => {
    const el = listRef.current?.querySelector('.bubble-row:last-child');
    el?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [shown]);

  const urls = scene.lines.map((l) => audioUrl(l.audio) ?? '');

  async function play(from = resumeAt.current) {
    if (from >= scene.lines.length) from = 0;
    if (from === 0) setShown(0);
    setPhase('playing');
    const ok = await playSequence(urls, {
      rate: slow ? 0.85 : 1,
      gapMs: 180,
      startAt: from,
      onIndex: (i) => {
        resumeAt.current = i;
        setActive(i);
        setShown((s) => Math.max(s, i + 1));
      },
    });
    if (ok) {
      resumeAt.current = 0;
      setActive(-1);
      setShown(scene.lines.length);
      setPhase((p) => (p === 'playing' ? (pick === null ? 'quiz' : 'answered') : p));
    }
  }

  function pause() {
    stopAudio();
    setPhase('paused');
  }

  function playLine(l: Line, rate = 1) {
    const u = audioUrl(l.audio);
    if (u) void playClip(u, rate);
  }

  const lineIdx = (l: Line) => scene.lines.findIndex((x) => x.id === l.id);
  const done = phase === 'quiz' || phase === 'answered';

  return (
    <div className="stage watch">
      <div className="watch__head">
        <div className="eyebrow">第 {ep.no} 集 · {Math.round((scene.durationSec ?? 60))} 秒</div>
        <h1 className="title-lg">{scene.titleZh}</h1>
        <p className="muted small">{ep.call.sceneZh}</p>
      </div>

      <div className="chat" ref={listRef}>
        {shown === 0 && (
          <div className="chat__empty">
            <div className="avatar-stack">
              {scene.speakers.map((s) => <Avatar key={s.id} id={s.id} size={56} />)}
            </div>
            <p>先别看字，<b>只用耳朵</b>听一遍</p>
          </div>
        )}
        {scene.lines.slice(0, shown).map((l, i) => {
          const isRevealed = showEn || revealed.has(l.id);
          return (
            <div key={l.id} className={`bubble-row bubble-row--${side(l.speaker)}`}>
              <Avatar id={l.speaker} size={32} />
              <button
                className={`bubble bubble--${side(l.speaker)}${i === active ? ' is-active' : ''}`}
                onClick={() => { setRevealed((r) => new Set(r).add(l.id)); setSheet(l); }}
                aria-label={`${NAMES[l.speaker]} 的台词，点开`}
              >
                <span className="bubble__name">{NAMES[l.speaker] ?? l.speaker}</span>
                <span className={`bubble__text${isRevealed ? '' : ' is-blur'}`}>{l.text}</span>
              </button>
            </div>
          );
        })}
      </div>

      <div className="dock">
        {done ? (
          <Quiz ep={ep} pick={pick} onPick={(i) => { setPick(i); setPhase('answered'); }} onReplay={() => { setPick(null); setPhase('ready'); void play(0); }} onNext={onDone} />
        ) : (
          <div className="player">
            <button className={`chip-btn${slow ? ' is-on' : ''}`} onClick={() => setSlow((v) => !v)} aria-pressed={slow}>
              <Icon name="slow" size={20} /> 慢速
            </button>
            {phase === 'playing' ? (
              <button className="play-btn" onClick={pause} aria-label="暂停"><Icon name="pause" size={34} /></button>
            ) : (
              <button className="play-btn" onClick={() => void play()} aria-label="播放"><Icon name="play" size={34} /></button>
            )}
            <button className={`chip-btn${showEn ? ' is-on' : ''}`} onClick={() => setShowEn((v) => !v)} aria-pressed={showEn}>
              <Icon name={showEn ? 'eye' : 'eyeOff'} size={20} /> 字幕
            </button>
          </div>
        )}
        {!done && phase !== 'ready' && (
          <button className="link-btn" onClick={() => { stopAudio(); setShown(scene.lines.length); setActive(-1); setPhase('quiz'); }}>
            听完了，下一步 →
          </button>
        )}
      </div>

      {sheet && (
        <LineSheet
          line={sheet}
          zh={ep.lineZh[sheet.id]}
          glue={scene.glue.find((g) => g.lineId === sheet.id)?.noteZh}
          hasKey={hasKey}
          model={settings.aiModel}
          setting={scene.setting}
          onPlay={(r) => playLine(sheet, r)}
          onClose={() => setSheet(null)}
          index={lineIdx(sheet)}
        />
      )}
    </div>
  );
}

function Quiz({ ep, pick, onPick, onReplay, onNext }: { ep: EpisodeMeta; pick: number | null; onPick: (i: number) => void; onReplay: () => void; onNext: () => void }) {
  const right = pick === ep.gist.answer;
  return (
    <div className="quiz">
      <div className="quiz__q">{ep.gist.q}</div>
      <div className="quiz__opts">
        {ep.gist.options.map((o, i) => {
          const state = pick === null ? '' : i === ep.gist.answer ? ' is-right' : i === pick ? ' is-wrong' : ' is-dim';
          return (
            <button key={i} className={`opt${state}`} disabled={pick !== null} onClick={() => onPick(i)}>
              {o}
              {pick !== null && i === ep.gist.answer && <Icon name="check" size={20} />}
            </button>
          );
        })}
      </div>
      {pick !== null && (
        <div className="quiz__foot">
          <span className={right ? 'good' : 'muted'}>{right ? '听懂了！' : '没关系，答案在这。'}</span>
          <div className="row gap">
            {!right && <button className="btn btn--ghost" onClick={onReplay}>再听一遍</button>}
            <button className="btn btn--primary" onClick={onNext}>继续</button>
          </div>
        </div>
      )}
    </div>
  );
}

function LineSheet(props: {
  line: Line; zh?: string; glue?: string; hasKey: boolean; model: string; setting: string; index: number;
  onPlay: (rate: number) => void; onClose: () => void;
}) {
  const { line, zh, glue, hasKey, model, setting, onPlay, onClose } = props;
  const [showZh, setShowZh] = useState(false);
  const [ai, setAi] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { onPlay(1); }, [line.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function explain() {
    setBusy(true);
    setErr(null);
    try {
      const key = await getApiKey();
      setAi(await chatText(key, model, explainMessages(line.text, setting), { maxTokens: 220 }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="这句台词">
        <div className="sheet__grip" />
        <div className="row gap center-y">
          <Avatar id={line.speaker} size={36} />
          <b>{NAMES[line.speaker]}</b>
        </div>
        <p className="sheet__en">{line.text}</p>
        {showZh ? <p className="sheet__zh">{zh ?? '—'}</p> : (
          <button className="link-btn" onClick={() => setShowZh(true)}>看中文意思</button>
        )}
        {glue && <p className="note">{glue}</p>}
        {ai && <p className="note note--ai"><Icon name="spark" size={16} /> {ai}</p>}
        {err && <p className="error">{err}</p>}
        <div className="row gap wrap">
          <button className="btn btn--soft" onClick={() => onPlay(1)}><Icon name="replay" size={18} /> 重听</button>
          <button className="btn btn--soft" onClick={() => onPlay(0.75)}><Icon name="slow" size={18} /> 慢放</button>
          {hasKey && !ai && (
            <button className="btn btn--soft" onClick={explain} disabled={busy}>
              <Icon name="spark" size={18} /> {busy ? '想一想…' : 'AI 讲解'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
