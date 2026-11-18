import { useEffect, useRef, useState } from 'react';
import type { Scene } from '@/lib/content.ts';
import { audioUrl } from '@/lib/content.ts';
import type { EpisodeMeta } from '@/content/season1.ts';
import { playClip, stopAudio } from '@/lib/player.ts';
import { asrSupported } from '@/lib/asr.ts';
import { cueThenListen } from '@/lib/speech.ts';
import { litWords } from '@/lib/match.ts';
import { recorderSupported, startRecording, stopRecording } from '@/lib/recorder.ts';
import { addPhrases, markEpisode } from '@/lib/store.ts';
import { Icon } from '@/components/Icon.tsx';
import { DebugOverlay } from '@/components/DebugPanel.tsx';
import { useApp } from '@/lib/appState.tsx';

type Mode = 'idle' | 'cue' | 'listening' | 'recording';

export function Steal({ scene, ep, onDone }: { scene: Scene; ep: EpisodeMeta; onDone: () => void }) {
  const { refresh } = useApp();
  const chunks = scene.chunks.slice(0, 3);
  const [i, setI] = useState(0);
  const [mode, setMode] = useState<Mode>('idle');
  const [heard, setHeard] = useState('');
  const [tries, setTries] = useState(0);
  const [mine, setMine] = useState<string | null>(null);
  const [asrBroken, setAsrBroken] = useState(!asrSupported());
  const [msg, setMsg] = useState<string | null>(null);
  const handle = useRef<ReturnType<typeof cueThenListen> | null>(null);
  const c = chunks[i];
  const target = c.form.replace(/…/g, '').trim();
  const lit = heard ? litWords(target, heard) : [];
  const allLit = lit.length > 0 && lit.filter(Boolean).length >= Math.ceil(lit.length * 0.6);

  useEffect(() => {
    setHeard(''); setTries(0); setMine(null); setMsg(null); setMode('idle');
    const u = audioUrl(c.audio);
    if (u) void playClip(u);
  }, [i]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { stopAudio(); handle.current?.cancel(); }, []);

  async function speakIt() {
    stopAudio();
    if (mode === 'listening' || mode === 'cue') { handle.current?.finish(); return; }
    if (asrBroken) return recordIt();
    setMode('cue'); setHeard(''); setMsg(null);
    // The model line is spoken by speechSynthesis right before listening (iOS needs this).
    const h = cueThenListen(target, { onInterim: setHeard, rate: 0.9 });
    h.onListening(() => setMode('listening'));
    handle.current = h;
    const r = await h.done;
    handle.current = null;
    setMode('idle');
    setTries((t) => t + 1);
    if (r.ok) setHeard(r.text);
    else if (r.error === 'not-allowed' || r.error === 'service' || r.error === 'missing' || r.error === 'failed') {
      setAsrBroken(true);
      setMsg(r.error === 'service' ? '语音识别没开（iPhone：设置 → Siri / 听写）。改用录音对比。' : r.error === 'not-allowed' ? '麦克风没开。可以录音自己对比，或直接继续。' : '这台设备认不出语音，改用录音对比。');
    } else if (r.error === 'no-speech' || r.error === 'deaf') setMsg('没听到声音，再说一次？');
    else if (r.error === 'network') { setAsrBroken(true); setMsg('语音识别要联网，改用录音对比。'); }
  }

  async function recordIt() {
    if (!recorderSupported()) { setTries((t) => t + 1); setMsg('这台设备不能录音。跟着原声大声说一遍就好。'); return; }
    if (mode === 'recording') {
      const url = await stopRecording();
      setMode('idle'); setTries((t) => t + 1);
      if (url) { setMine(url); void playClip(url); }
      return;
    }
    try {
      await startRecording();
      setMode('recording');
    } catch {
      setMsg('麦克风没开。跟着原声大声说一遍就好。');
      setTries((t) => t + 1);
    }
  }

  async function next() {
    if (i < chunks.length - 1) { setI(i + 1); return; }
    await addPhrases(chunks.map((ch) => ({ en: ch.form, zh: ch.meaningZh, episodeId: ep.id, audio: ch.audio, source: 'steal' as const })));
    await markEpisode(ep.id, 'stolen');
    await refresh();
    onDone();
  }

  return (
    <div className="stage steal">
      <div className="steal__top">
        <div className="eyebrow">偷 3 句 · {i + 1}/3</div>
        <div className="dots">{chunks.map((_, k) => <span key={k} className={k <= i ? 'on' : ''} />)}</div>
      </div>

      <DebugOverlay lines={5} />
      <div className="card steal__card" key={c.id}>
        <p className="steal__zh">{c.meaningZh}</p>
        <p className="steal__en">
          {target.split(/\s+/).map((w, k) => (
            <span key={k} className={lit[k] ? 'lit' : ''}>{w} </span>
          ))}
          {c.form.endsWith('…') && <span className="muted">…</span>}
        </p>
        <div className="row gap center">
          <button className="btn btn--soft" onClick={() => { const u = audioUrl(c.audio); if (u) void playClip(u); }}>
            <Icon name="volume" size={18} /> 原声
          </button>
          <button className="btn btn--soft" onClick={() => { const u = audioUrl(c.audio); if (u) void playClip(u, 0.75); }}>
            <Icon name="slow" size={18} /> 慢
          </button>
          {c.afterAudio && (
            <button className="btn btn--soft" onClick={() => { const u = audioUrl(c.afterAudio); if (u) void playClip(u); }}>
              <Icon name="play" size={16} /> 例句
            </button>
          )}
        </div>
        {c.sayAfter && <p className="muted small center-text">例句：{c.sayAfter}</p>}
      </div>

      <div className="steal__feedback" aria-live="polite">
        {mode === 'cue' && <p className="muted">先听一遍…</p>}
        {mode === 'listening' && <p className="listening-dots">在听，跟着说… {heard && <i>{heard}</i>}</p>}
        {mode === 'recording' && <p className="rec-dot">录音中，说完点一下停止</p>}
        {mode === 'idle' && heard && (
          <p className={allLit ? 'good' : 'muted'}>{allLit ? '说得好！' : '我听到：'} <i>{heard}</i></p>
        )}
        {mine && mode === 'idle' && (
          <div className="row gap center">
            <button className="btn btn--soft" onClick={() => { const u = audioUrl(c.audio); if (u) void playClip(u); }}>样子</button>
            <button className="btn btn--soft" onClick={() => void playClip(mine)}>我的</button>
          </div>
        )}
        {msg && <p className="muted small">{msg}</p>}
      </div>

      <div className="dock">
        <button
          className={`mic-btn${mode !== 'idle' ? ' is-live' : ''}`}
          onClick={() => void speakIt()}
          aria-label={mode === 'idle' ? '跟着说一遍' : '停止'}
        >
          <Icon name={mode === 'idle' ? 'mic' : mode === 'listening' ? 'check' : 'volume'} size={34} />
        </button>
        <p className="dock__hint">{mode === 'idle' ? (asrBroken ? '点一下录音，跟着说' : '点一下：先听，再跟着说') : mode === 'cue' ? '先听…' : '说完点一下（或停一下）'}</p>
        <div className="row gap center">
          {tries > 0 && !allLit && mode === 'idle' && <button className="btn btn--ghost" onClick={() => void speakIt()}>再来</button>}
          <button className={`btn ${tries > 0 ? 'btn--primary' : 'btn--ghost'}`} onClick={() => void next()} disabled={mode !== 'idle'}>
            {tries > 0 ? (i < 2 ? '下一句' : '收进句库') : '跳过'}
          </button>
        </div>
      </div>
    </div>
  );
}
