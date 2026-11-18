import { useEffect, useRef, useState } from 'react';
import type { Scene } from '@/lib/content.ts';
import { GENDER, NAMES } from '@/lib/content.ts';
import type { EpisodeMeta } from '@/content/season1.ts';
import { Avatar } from '@/components/Avatar.tsx';
import { Icon } from '@/components/Icon.tsx';
import { DebugOverlay } from '@/components/DebugPanel.tsx';
import { useApp } from '@/lib/appState.tsx';
import { asrFailStreak, asrSupported, listen, waitIdle, type ListenHandle } from '@/lib/asr.ts';
import { pickVoice, speak, SpeechQueue, stopSpeaking, unlockTts, waitVoices } from '@/lib/tts.ts';
import { matchOption } from '@/lib/match.ts';
import {
  AiError, chatJson, chatStream, hintMessages, openingUser, roleplaySystem, type AiHint, type Msg,
} from '@/lib/ai.ts';
import { getApiKey, type CallLog, type CallTurnLog } from '@/lib/store.ts';
import { stopAudio } from '@/lib/player.ts';
import { dlog } from '@/lib/debug.ts';

type Status = 'ringing' | 'connecting' | 'partner' | 'you' | 'listening' | 'thinking' | 'error' | 'ended';

const GENERIC_REACT = ['Ha, okay.', 'Got it.', 'Fair enough.', 'Okay, okay.'];
const RETRY_CUES = ['Sorry, go ahead.', "Sorry, I didn't catch that. Say it again?", "I'm listening."];
const RATE = { slow: 0.9, ok: 1, fast: 1.06 } as const;

export function Call(props: {
  scene: Scene;
  ep: EpisodeMeta;
  maxTurns?: number;
  onDone: (log: CallLog) => void;
  onExit: () => void;
}) {
  const { scene, ep, onDone, onExit } = props;
  const { settings, hasKey } = useApp();
  const partner = ep.call.partner;
  const name = NAMES[partner];
  const script = ep.call.turns.slice(0, props.maxTurns ?? ep.call.turns.length);
  const aiMax = props.maxTurns ?? 6;

  const [mode, setMode] = useState<'ai' | 'script'>(hasKey ? 'ai' : 'script');
  const [status, setStatus] = useState<Status>('ringing');
  const [caption, setCaption] = useState('');
  const [captionZh, setCaptionZh] = useState('');
  const [zhOpen, setZhOpen] = useState(false);
  const [showCaption, setShowCaption] = useState(true);
  const [mine, setMine] = useState('');
  const [interim, setInterim] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [typing, setTyping] = useState(!asrSupported());
  const [typed, setTyped] = useState('');
  const [hintLevel, setHintLevel] = useState(0);
  const [hint, setHint] = useState<AiHint | null>(null);
  const [hintBusy, setHintBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const history = useRef<Msg[]>([]);
  const turns = useRef<CallTurnLog[]>([]);
  const idx = useRef(0);
  const retried = useRef(false);
  const retryNo = useRef(0);
  const partnerEnd = useRef(0);
  const speakMs = useRef(0);
  const lastPartner = useRef('');
  const handle = useRef<ListenHandle | null>(null);
  const queue = useRef<SpeechQueue | null>(null);
  const abort = useRef<AbortController | null>(null);
  const startedAt = useRef(0);
  const alive = useRef(true);
  const voice = useRef<SpeechSynthesisVoice | null>(null);
  const keyRef = useRef('');
  const typingRef = useRef(typing);
  typingRef.current = typing;
  const rate = RATE[settings.pace];

  useEffect(() => {
    alive.current = true;
    stopAudio();
    // Read the key straight from storage so the badge is never stale.
    void getApiKey().then((k) => {
      keyRef.current = k;
      dlog('call', `key present: ${k ? `yes (${k.length} chars)` : 'no'} · model ${settings.aiModel}`);
      if (alive.current) setMode(k ? 'ai' : 'script');
    });
    return () => {
      alive.current = false;
      handle.current?.cancel();
      queue.current?.cancel();
      abort.current?.abort();
      stopSpeaking();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (status === 'ringing' || status === 'ended') return;
    const t = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 500);
    return () => window.clearInterval(t);
  }, [status]);

  /* ---------- listening: always right after a speechSynthesis utterance ---------- */

  async function startListening() {
    if (!alive.current) return;
    if (typingRef.current || !asrSupported()) { setStatus('you'); return; }
    await waitIdle(3000);
    if (!alive.current) return;
    setStatus('listening');
    setInterim('');
    setNote(null);
    let speechAt = 0;
    const t0 = Date.now();
    const h = listen({ onInterim: setInterim, onSpeechStart: () => { speechAt = Date.now(); } });
    handle.current = h;
    const r = await h.done;
    if (handle.current === h) handle.current = null;
    if (!alive.current) return;
    if (r.ok) {
      speakMs.current += Date.now() - (speechAt || t0);
      return handleAnswer(r.text);
    }
    setStatus('you');
    if (r.error === 'not-allowed') { setTyping(true); setNote('麦克风或语音识别没被允许。可以在系统设置里打开，先打字回答。'); }
    else if (r.error === 'service') { setTyping(true); setNote('这台手机的语音识别没开（iPhone：设置 → Siri / 听写）。先打字回答。'); }
    else if (r.error === 'missing' || r.error === 'network') { setTyping(true); setNote('这台设备暂时用不了语音识别，先打字回答。'); }
    else if (r.error === 'aborted') setNote(null);
    else setNote(asrFailStreak() >= 2 ? '还是没听到。点「再说一次」，或者点键盘打字。' : '没听到。点「再说一次」，或者打字。');
  }

  /** Mic button when idle: a short spoken cue first (iOS needs speech right before a session), then listen. */
  async function retryListen() {
    if (status !== 'you') return;
    unlockTts();
    stopSpeaking();
    setStatus('partner');
    const cue = RETRY_CUES[retryNo.current++ % RETRY_CUES.length];
    await speak(cue, { voice: voice.current, rate });
    void startListening();
  }

  function finishSpeaking() {
    handle.current?.finish();
  }

  /* ---------- partner side ---------- */

  async function sayScripted(text: string, zh = '', thenListen = true) {
    if (!alive.current) return;
    setStatus('partner');
    setCaption(text);
    setCaptionZh(zh);
    setZhOpen(false);
    lastPartner.current = text;
    await speak(text, { voice: voice.current, rate });
    if (!alive.current) return;
    partnerEnd.current = Date.now();
    if (thenListen) void startListening();
    else setStatus('you');
  }

  async function aiTurn() {
    setStatus('thinking');
    setCaptionZh('');
    setError(null);
    const q = new SpeechQueue(voice.current, rate);
    queue.current = q;
    const ac = new AbortController();
    abort.current = ac;
    let shown = '';
    try {
      const userTurns = turns.current.length;
      const msgs = [...history.current];
      const notes: string[] = [];
      const lastTurn = turns.current[turns.current.length - 1];
      if (lastTurn) {
        const wc = lastTurn.user.split(/\s+/).filter(Boolean).length;
        if (wc <= 3 || (lastTurn.hintUsed ?? 0) >= 2 || /[\u4e00-\u9fff]/.test(lastTurn.user)) notes.push('the learner is struggling, make your next line shorter and simpler, maybe an either/or question');
        else if (wc >= 12 && !lastTurn.hintUsed) notes.push('the learner is doing well, you can sound a bit more natural and fast');
      }
      if (userTurns >= aiMax + 1) notes.push('wrap up the scene now, end with [END]');
      if (notes.length) {
        const last = msgs[msgs.length - 1];
        msgs[msgs.length - 1] = { ...last, content: `${last.content}\n\n(Stage note: ${notes.join('; ')}.)` };
      }
      const full = await chatStream(keyRef.current, settings.aiModel, msgs, (d) => {
        if (!alive.current) return;
        if (!shown) setStatus('partner');
        shown += d;
        setCaption(shown.replace(/\[END\]/gi, '').trim());
        q.push(d);
      }, { signal: ac.signal, maxTokens: 110 });
      const text = full.replace(/\[END\]/gi, '').trim();
      history.current.push({ role: 'assistant', content: full.trim() });
      lastPartner.current = text;
      await q.flush();
      if (!alive.current) return;
      partnerEnd.current = Date.now();
      if (/\[END\]/i.test(full) || turns.current.length >= aiMax + 2) finish();
      else void startListening();
    } catch (e) {
      if (!alive.current) return;
      const err = e as AiError;
      if (err.code === 'aborted') return;
      q.cancel();
      dlog('call', `AI error shown: ${err.message}`);
      // Never switch silently: show the real error, the user decides.
      setError(err.message || String(e));
      setStatus('error');
    }
  }

  function switchToScript() {
    setError(null);
    setMode('script');
    dlog('call', 'user switched to script mode');
    idx.current = Math.min(turns.current.length, script.length - 1);
    retried.current = false;
    const t = script[idx.current];
    void sayScripted(t.line, t.zh);
  }

  /* ---------- call control ---------- */

  async function accept() {
    unlockTts();
    setStatus('connecting');
    startedAt.current = Date.now();
    await waitVoices();
    voice.current = pickVoice(GENDER[partner] ?? 'female', GENDER[partner] === 'male' ? settings.voiceURIMale : settings.voiceURI);
    keyRef.current = await getApiKey();
    dlog('call', `accept: mode=${mode} key=${keyRef.current ? 'yes' : 'no'} model=${settings.aiModel} voice=${voice.current?.name ?? 'default'}`);
    if (mode === 'ai') {
      if (!keyRef.current) {
        setError('没有读到 API Key（浏览器和主屏幕图标是两份存储，请在这个图标里的「我」重新填写）。');
        setStatus('error');
        return;
      }
      history.current = [
        { role: 'system', content: roleplaySystem(scene, ep, partner, settings.pace, aiMax) },
        openingUser(),
      ];
      return aiTurn();
    }
    idx.current = 0;
    retried.current = false;
    return sayScripted(script[0].line, script[0].zh);
  }

  function finish() {
    setStatus('ended');
    handle.current?.cancel();
  }

  async function hangUp() {
    handle.current?.cancel();
    queue.current?.cancel();
    abort.current?.abort();
    stopSpeaking();
    if (turns.current.length === 0) return onExit();
    finish();
  }

  function goRecap() {
    onDone({ episodeId: ep.id, at: Date.now(), mode, turns: turns.current, speakMs: speakMs.current });
  }

  /* ---------- your side ---------- */

  async function handleAnswer(text: string, opts: { typed?: boolean } = {}) {
    const clean = text.trim();
    if (!clean) return;
    if (handle.current) { handle.current.cancel(); handle.current = null; }
    setMine(clean);
    setInterim('');
    setNote(null);
    const usedHint = hintLevel;
    setHintLevel(0);
    setHint(null);
    const latency = partnerEnd.current ? Date.now() - partnerEnd.current : undefined;
    // Let an un-cut iOS session finish before the partner speaks again.
    await waitIdle(3000);

    if (mode === 'ai') {
      turns.current.push({ partner: lastPartner.current, user: clean, hintUsed: usedHint || undefined, typed: opts.typed, latencyMs: latency });
      history.current.push({ role: 'user', content: clean });
      return aiTurn();
    }

    const t = script[idx.current];
    const k = matchOption(clean, t.options);
    const wordsCount = clean.split(/\s+/).filter(Boolean).length;
    if (k < 0 && !retried.current && wordsCount < 2) {
      retried.current = true;
      return sayScripted(`Sorry, what was that? ${t.line}`, t.zh);
    }
    const opt = k >= 0 ? t.options[k] : null;
    turns.current.push({
      partner: t.line, user: clean, better: (opt ?? t.options[0]).say,
      hintUsed: usedHint || undefined, typed: opts.typed, latencyMs: latency,
    });
    const react = opt?.react ?? GENERIC_REACT[idx.current % GENERIC_REACT.length];
    idx.current += 1;
    retried.current = false;
    if (idx.current >= script.length) {
      await sayScripted(`${react} ${ep.call.bye}`, '', false);
      return finish();
    }
    const nt = script[idx.current];
    return sayScripted(`${react} ${nt.line}`, nt.zh);
  }

  async function tapHint() {
    if (hintLevel >= 3) return;
    const nextLevel = hintLevel + 1;
    if (mode === 'ai' && !hint) {
      setHintBusy(true);
      try {
        const h = await chatJson<AiHint>(keyRef.current, settings.aiModel, hintMessages(history.current, partner), { maxTokens: 160 });
        if (!alive.current) return;
        setHint(h);
      } catch (e) {
        setNote((e as Error).message);
        setHintBusy(false);
        return;
      }
      setHintBusy(false);
    }
    setHintLevel(nextLevel);
  }

  const scriptHint = mode === 'script' && script[idx.current]
    ? { zh: script[idx.current].hint.zh, first: script[idx.current].hint.first, line: script[idx.current].options[0].say }
    : null;
  const h = mode === 'ai' ? hint : scriptHint;

  /** Model line (other voice), then listen: doubles as the iOS pre-session utterance. */
  async function sayHintLine() {
    if (!h || status !== 'you') return;
    unlockTts();
    setStatus('partner');
    const other = GENDER[partner] === 'male' ? 'female' : 'male';
    await speak(h.line, { voice: pickVoice(other), rate: 0.9 });
    void startListening();
  }

  const mm = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;
  const chips = mode === 'script' && script[idx.current] ? script[idx.current].options.map((o) => o.say) : [];
  const badge = mode === 'ai'
    ? <span className="pill pill--ai"><Icon name="spark" size={12} /> AI 实时</span>
    : <span className="pill pill--script">剧本模式</span>;

  /* ---------- render ---------- */

  if (status === 'ringing') {
    return (
      <div className="call call--ringing">
        <div className="call__center">
          <div className="ring-pulse"><Avatar id={partner} size={148} /></div>
          <h1 className="call__name">{name}</h1>
          <p className="call__sub">来电 · {ep.call.sceneZh}</p>
          {mode === 'ai'
            ? <p className="pill pill--ai pill--lg"><Icon name="spark" size={14} /> AI 实时 · {settings.aiModel}</p>
            : <p className="pill pill--script pill--lg">剧本模式 · 没有读到 DeepSeek 密钥</p>}
        </div>
        <DebugOverlay />
        <div className="call__answer">
          <div className="call__answer-col">
            <button className="round-btn round-btn--red" onClick={onExit} aria-label="拒绝"><Icon name="phone" size={30} style={{ transform: 'rotate(135deg)' }} /></button>
            <span>稍后</span>
          </div>
          <div className="call__answer-col">
            <button className="round-btn round-btn--green wiggle" onClick={() => void accept()} aria-label="接听"><Icon name="phone" size={30} /></button>
            <span>接听</span>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'ended') {
    return (
      <div className="call call--ended">
        <div className="call__center">
          <Avatar id={partner} size={112} />
          <h1 className="call__name">通话结束</h1>
          <p className="call__sub">{mm} · 你开口 {turns.current.length} 次 · {mode === 'ai' ? 'AI 实时' : '剧本模式'}</p>
        </div>
        <div className="call__end-actions">
          <button className="btn btn--primary btn--block" onClick={goRecap}>看小结</button>
        </div>
      </div>
    );
  }

  const speaking = status === 'partner';
  const listening = status === 'listening';
  return (
    <div className="call call--live">
      <div className="call__top">
        <span className="call__timer">{mm}</span>
        {badge}
        <button className={`icon-btn icon-btn--dark${showCaption ? ' is-on' : ''}`} onClick={() => setShowCaption((v) => !v)} aria-label="字幕">
          <Icon name={showCaption ? 'eye' : 'eyeOff'} size={20} />
        </button>
      </div>
      <DebugOverlay />

      <div className="call__center call__center--live">
        <div className={`speaker-ring${speaking ? ' is-speaking' : ''}`}><Avatar id={partner} size={120} /></div>
        <div className="call__name-sm">{name}</div>
        <div className="caption" aria-live="polite">
          {status === 'connecting' || (status === 'thinking' && !caption) ? (
            <span className="typing"><i /><i /><i /></span>
          ) : showCaption ? (
            <>
              <p className="caption__en" onClick={() => setZhOpen((v) => !v)}>{caption}</p>
              {captionZh && (zhOpen || hintLevel > 0) && <p className="caption__zh">{captionZh}</p>}
              {captionZh && !zhOpen && hintLevel === 0 && (status === 'you' || listening) && (
                <button className="link-btn link-btn--light" onClick={() => setZhOpen(true)}>没听懂？看中文</button>
              )}
            </>
          ) : (
            <p className="caption__hidden">{speaking ? '正在说…' : '字幕已隐藏'}</p>
          )}
          {status === 'thinking' && caption && <span className="typing typing--sm"><i /><i /><i /></span>}
        </div>
        {listening ? (
          <div className="mine is-live">
            <span className="mine__label"><span className="rec-dot-sm" /> 在听</span>
            {interim || <span className="mine__ph">直接说英文…</span>}
          </div>
        ) : mine ? <div className="mine">{mine}</div> : null}
      </div>

      <div className="call__bottom">
        {h && hintLevel > 0 && (
          <div className="hint-card">
            <p className="hint-card__zh"><Icon name="bulb" size={16} /> {h.zh}</p>
            {hintLevel >= 2 && <p className="hint-card__first">{hintLevel >= 3 ? h.line : h.first}</p>}
            {hintLevel >= 3 && status === 'you' && (
              <button className="link-btn" onClick={() => void sayHintLine()}><Icon name="volume" size={16} /> 听一遍，然后跟着说</button>
            )}
          </div>
        )}
        {note && <p className="call__note">{note}</p>}
        {status === 'error' && (
          <div className="hint-card hint-card--error">
            <p className="error">{error}</p>
            <div className="row gap wrap">
              {mode === 'ai' && history.current.length > 0 && <button className="btn btn--soft" onClick={() => void aiTurn()}>重试</button>}
              <button className="btn btn--soft" onClick={switchToScript}>改用剧本</button>
            </div>
          </div>
        )}

        {typing && (status === 'you' || listening) && (
          <div className="type-area">
            {chips.length > 0 && (
              <div className="chips">
                {chips.map((c) => <button key={c} className="chip" onClick={() => void handleAnswer(c, { typed: true })}>{c}</button>)}
              </div>
            )}
            <form className="type-row" onSubmit={(e) => { e.preventDefault(); if (typed.trim()) { void handleAnswer(typed, { typed: true }); setTyped(''); } }}>
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="用英文打字回答…"
                autoCapitalize="sentences"
                autoComplete="off"
                enterKeyHint="send"
                aria-label="打字回答"
              />
              <button type="submit" className="icon-btn icon-btn--mint" aria-label="发送"><Icon name="send" size={20} /></button>
            </form>
          </div>
        )}

        <div className="call__controls">
          <button className="ctrl" onClick={() => void tapHint()} disabled={(status !== 'you' && !listening) || hintLevel >= 3 || hintBusy} aria-label="提示">
            <span className="ctrl__icon"><Icon name="bulb" size={22} /></span>
            <span>{hintBusy ? '…' : hintLevel === 0 ? '提示' : `提示 ${hintLevel}/3`}</span>
          </button>
          {listening ? (
            <button className="talk-btn is-live" onClick={finishSpeaking} aria-label="说完了">
              <Icon name="check" size={40} />
            </button>
          ) : (
            <button
              className={`talk-btn${status === 'you' && !typing ? ' is-ready' : ''}`}
              onClick={() => void retryListen()}
              disabled={status !== 'you'}
              aria-label="再说一次"
            >
              <Icon name="mic" size={38} />
            </button>
          )}
          <button className="ctrl" onClick={() => setTyping((v) => !v)} aria-label="打字">
            <span className={`ctrl__icon${typing ? ' is-on' : ''}`}><Icon name="keyboard" size={22} /></span>
            <span>打字</span>
          </button>
        </div>
        <p className="call__status">
          {listening ? '在听，说完点 ✓（或停一下）'
            : status === 'you' ? (typing ? '打字回答，或点麦克风说' : '点麦克风，再说一次')
            : speaking ? `${name} 在说…` : status === 'thinking' || status === 'connecting' ? `${name} 在想…` : ''}
        </p>
        <button className="hangup" onClick={() => void hangUp()} aria-label="挂断"><Icon name="phone" size={26} style={{ transform: 'rotate(135deg)' }} /></button>
      </div>
    </div>
  );
}
