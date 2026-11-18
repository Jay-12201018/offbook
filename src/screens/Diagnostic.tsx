import { useEffect, useMemo, useRef, useState } from 'react';
import { ConfirmSheet } from '@/components/ConfirmSheet.tsx';
import { MicDisc } from '@/components/MicDisc.tsx';
import { SpeedToggle } from '@/components/SpeedToggle.tsx';
import { contentUrl } from '@/content/normalize.ts';
import { playSequence, playUrl, stopPlayback, unlockAudio } from '@/lib/audio.ts';
import { copy } from '@/lib/copy.ts';
import { enableMic } from '@/lib/micAccess.ts';
import { UnitText } from '@/lib/units.tsx';
import { DIAGNOSTIC_BRIEFING } from '@/content/situations-zh.ts';
import { clearResume, getDiagnosticResume, saveRecording, saveResume } from '@/lib/db.ts';
import { answerHits } from '@/lib/fuzzy.ts';
import { mic } from '@/lib/recorder.ts';
import { tick } from '@/lib/tick.ts';
import { EnergyVad } from '@/lib/vad.ts';
import type { DiagnosticProgress, DiagnosticSub, Scene, Speed } from '@/session/types.ts';

/**
 * Sequence session 0: three familiar-topic listens (120 / 150 / 180 wpm)
 * plus one 45-second talk after 30s prep. There is no fail.
 */
export function DiagnosticScreen({
  scenes,
  speak,
  speed,
  onSpeed,
  listeningOnly,
  nextTitleZh,
  onExit,
  onFinished,
  onProgressScene,
  onMicAllowed,
  initial,
}: {
  scenes: Scene[];
  speak: Scene | null;
  speed: Speed;
  onSpeed: (s: Speed) => void;
  listeningOnly: boolean;
  nextTitleZh: string;
  onExit: () => void;
  onFinished: (result: {
    comfortableWpm: number;
    ttfwMs?: number;
    speed?: Speed;
    speedChosen?: boolean;
  }) => void;
  onProgressScene?: (sceneId: string) => void;
  onMicAllowed?: (allowed: boolean) => void;
  initial?: DiagnosticProgress | null;
}) {
  const [ready, setReady] = useState(!!initial);
  const [stage, setStage] = useState(initial?.stage ?? 0);
  const [sub, setSub] = useState<DiagnosticSub>(initial?.sub ?? 'intro');
  const [promptI, setPromptI] = useState(initial?.promptI ?? 0);
  const [answer, setAnswer] = useState(initial?.answer ?? '');
  const [msg, setMsg] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [hits, setHits] = useState<boolean[][]>(initial?.hits ?? [[], [], []]);
  const [confirm, setConfirm] = useState(false);
  const [recording, setRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const [ttfw, setTtfw] = useState<number | undefined>(initial?.ttfwMs);
  const [replayUsed, setReplayUsed] = useState(initial?.replayUsed ?? false);
  const [heard, setHeard] = useState(initial?.heard ?? false);
  const [prepLeft, setPrepLeft] = useState(initial?.prepLeft ?? 30);
  const [talkElapsed, setTalkElapsed] = useState(0);
  const [speedChosen, setSpeedChosen] = useState(initial?.speedChosen ?? false);
  const [pickedSpeed, setPickedSpeed] = useState<Speed | undefined>(initial?.speed);
  const [startedAt] = useState(initial?.startedAt ?? Date.now());
  const recordingRef = useRef(false);
  recordingRef.current = recording;
  const gistAdvanceRef = useRef<number | null>(null);
  const gistBusyRef = useRef(false);
  const [gistBusy, setGistBusy] = useState(false);

  const listen = scenes[Math.min(stage, Math.max(0, scenes.length - 1))];
  const prompts = useMemo(() => (listen ? [...listen.gist, ...listen.details] : []), [listen]);

  useEffect(() => {
    if (initial) return;
    let cancel = false;
    void getDiagnosticResume().then((r) => {
      if (cancel) return;
      if (r) {
        setStage(r.stage);
        setSub(r.sub);
        setPromptI(r.promptI);
        setAnswer(r.answer || '');
        setHits(r.hits?.length ? r.hits : [[], [], []]);
        setReplayUsed(!!r.replayUsed);
        setHeard(!!r.heard);
        setTtfw(r.ttfwMs);
        setPrepLeft(r.prepLeft ?? 30);
        setSpeedChosen(!!r.speedChosen);
        setPickedSpeed(r.speed);
      }
      setReady(true);
    });
    return () => {
      cancel = true;
    };
  }, [initial]);

  const comfortableWpm = (() => {
    if (initial?.comfortableWpm && hits.every((row) => !row?.some(Boolean))) {
      /* keep stored value until new answers overwrite via hits */
    }
    const wpms = scenes.map((s) => s.targetWpm || 0);
    let best = wpms[0] || 120;
    let any = false;
    for (let i = 0; i < scenes.length; i++) {
      const row = hits[i] || [];
      const need = Math.max(1, Math.min(2, scenes[i]?.gist.length || 2));
      const gHits = row.slice(0, scenes[i]?.gist.length || 0).filter(Boolean).length;
      if (row.length) any = true;
      if (gHits >= need) best = wpms[i] || best;
    }
    if (!any && initial?.comfortableWpm) return initial.comfortableWpm;
    return best;
  })();

  const persistRef = useRef<DiagnosticProgress | null>(null);
  persistRef.current = {
    kind: 'diagnostic',
    stage,
    sub,
    promptI,
    answer,
    hits,
    replayUsed,
    heard,
    ttfwMs: ttfw,
    comfortableWpm,
    speed: pickedSpeed,
    speedChosen,
    prepLeft,
    startedAt,
    updatedAt: Date.now(),
  };

  useEffect(() => {
    if (!ready) return;
    if (persistRef.current) void saveResume(persistRef.current);
  }, [ready, stage, sub, promptI, answer, hits, replayUsed, heard, ttfw, comfortableWpm, pickedSpeed, speedChosen, prepLeft]);

  useEffect(() => {
    const flush = () => {
      if (persistRef.current) void saveResume(persistRef.current);
    };
    const onVis = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVis);
      if (recordingRef.current) {
        void mic.stop();
        recordingRef.current = false;
      }
      stopPlayback();
      flush();
    };
  }, []);

  useEffect(() => {
    mic.onLevel = (lv) => {
      if (recordingRef.current) setLevel(lv);
    };
    return () => {
      mic.onLevel = undefined;
      stopPlayback();
    };
  }, [recording]);

  useEffect(() => {
    if (!recording) {
      setTalkElapsed(0);
      return;
    }
    const t0 = performance.now();
    setTalkElapsed(0);
    const id = window.setInterval(() => {
      setTalkElapsed(Math.floor((performance.now() - t0) / 1000));
    }, 200);
    return () => window.clearInterval(id);
  }, [recording]);

  useEffect(() => {
    const speaking = sub === 'prep' || sub === 'talk' || sub === 'recap';
    const id = speaking
      ? speak?.id || 'diag-speak-this-week'
      : scenes[Math.min(stage, Math.max(0, scenes.length - 1))]?.id;
    if (id) onProgressScene?.(id);
  }, [stage, sub, scenes, speak, onProgressScene]);

  useEffect(() => {
    return () => {
      if (gistAdvanceRef.current != null) window.clearTimeout(gistAdvanceRef.current);
      gistAdvanceRef.current = null;
      gistBusyRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (sub !== 'prep') return;
    const id = window.setInterval(() => {
      setPrepLeft((n) => {
        if (n <= 1) {
          window.clearInterval(id);
          setSub('talk');
          return 0;
        }
        return n - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [sub]);

  const playListen = (slow = false) => {
    if (!listen) return;
    void unlockAudio();
    tick('pause');
    setMsg(null);
    setPlaying(true);
    const full = contentUrl(listen.audioFull);
    const rate: Speed = slow ? 0.85 : speed;
    const onEnd = () => {
      setPlaying(false);
      setHeard(true);
    };
    const onError = () => {
      setPlaying(false);
      setMsg(copy.playFailed);
    };
    if (full) {
      playUrl(full, { rate, onEnd, onError });
      return;
    }
    playSequence(
      listen.lines.map((l) => ({ url: contentUrl(l.audio), text: l.spoken })),
      { rate, onEnd, onError },
    );
  };

  const finish = async () => {
    await clearResume('diagnostic');
    onFinished({
      comfortableWpm,
      ttfwMs: ttfw,
      speed: pickedSpeed,
      speedChosen,
    });
  };

  const pickSpeed = (s: Speed) => {
    setPickedSpeed(s);
    setSpeedChosen(true);
    onSpeed(s);
  };

  if (!ready) {
    return (
      <div className="session">
        <div className="session-stage">
          <p className="helper">在准备定位…</p>
        </div>
      </div>
    );
  }

  let body = null;
  let dock = null;

  if (sub === 'intro') {
    body = (
      <div>
        <p className="kicker">先定位</p>
        <h1 className="title" style={{ fontSize: '1.7rem', margin: '8px 0 14px' }}>
          先看看你现在能抓住什么
        </h1>
        <p className="cjk-wrap" style={{ lineHeight: 1.55 }}>
          <UnitText text={DIAGNOSTIC_BRIEFING} />
        </p>
      </div>
    );
    dock = (
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => {
          void unlockAudio();
          setSub('cold');
        }}
      >
        {stage > 0 || hits.some((row) => row.length) ? copy.continue : '开始听'}
      </button>
    );
  } else if (sub === 'cold' && listen) {
    body = (
      <div>
        <p className="kicker">先听 · 每分钟 {listen.targetWpm} 词</p>
        <h2 className="title" style={{ fontSize: '1.5rem', margin: '8px 0 12px' }}>
          {listen.titleZh}
        </h2>
        <p className="helper">{copy.coldHint} {copy.coldHint2}</p>
        <div className="waveform" style={{ marginTop: 32 }}>
          {playing ? <span className="tally" /> : null}
        </div>
        <p className="listen-status" style={{ textAlign: 'center', marginTop: 12 }}>
          {playing
            ? '正在听这一段'
            : msg
              ? msg
              : !heard
                ? '准备好了就按下面播放'
                : replayUsed
                  ? '可以慢一点再听，或去说大意'
                  : '可以再听，或去说大意'}
        </p>
      </div>
    );
    dock = (
      <>
        <SpeedToggle value={speed} onChange={onSpeed} />
        {heard && !playing ? (
          <div className="dock-row">
            {!replayUsed ? (
              <button
                type="button"
                className="dock-tool"
                onClick={() => {
                  setReplayUsed(true);
                  playListen();
                }}
              >
                {copy.replayOnce}
              </button>
            ) : (
              <button type="button" className="dock-tool" onClick={() => playListen(true)}>
                {copy.slower}
              </button>
            )}
          </div>
        ) : null}
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            if (!heard && !playing) {
              playListen();
              return;
            }
            stopPlayback();
            setPlaying(false);
            setHeard(true);
            setSub('gist');
            setPromptI(0);
            setAnswer('');
            setMsg(null);
          }}
        >
          {!heard && !playing ? copy.startListen : copy.caughtGist}
        </button>
      </>
    );
  } else if (sub === 'gist' && listen) {
    const p = prompts[promptI];
    body = p ? (
      <div>
        <p className="kicker">{promptI < listen.gist.length ? '大意' : '细节'} · 每分钟 {listen.targetWpm} 词</p>
        <h2 className="prompt-zh" style={{ margin: '12px 0 14px' }}>{p.askZh}</h2>
        <textarea className="field" style={{ marginTop: 16 }} rows={3} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="中文或英文都可以。" />
        {msg ? <p className="helper" style={{ marginTop: 10 }}>{msg}</p> : null}
      </div>
    ) : (
      <p>继续</p>
    );
    const submitGist = () => {
      if (!p || gistBusyRef.current) return;
      gistBusyRef.current = true;
      setGistBusy(true);
      const blank = !answer.trim();
      const hit = blank ? false : answerHits(answer, p.accept);
      setHits((prev) => {
        const next = prev.map((row) => [...row]);
        next[stage] = [...(next[stage] || [])];
        next[stage][promptI] = hit;
        return next;
      });
      if (!blank) setMsg(hit ? copy.gistOk : copy.gistPartial);
      const nextPrompt = promptI + 1;
      if (gistAdvanceRef.current != null) window.clearTimeout(gistAdvanceRef.current);
      gistAdvanceRef.current = window.setTimeout(() => {
        gistAdvanceRef.current = null;
        setMsg(null);
        setAnswer('');
        if (nextPrompt >= prompts.length) {
          const last = stage + 1 >= scenes.length;
          setReplayUsed(false);
          setHeard(false);
          if (last) {
            setPrepLeft(30);
            setSub('prep');
          } else {
            setStage(stage + 1);
            setSub('cold');
          }
          setPromptI(0);
        } else {
          setPromptI(nextPrompt);
        }
        gistAdvanceRef.current = window.setTimeout(() => {
          gistAdvanceRef.current = null;
          gistBusyRef.current = false;
          setGistBusy(false);
        }, 300);
      }, blank ? 0 : 600);
    };
    dock = answer.trim() ? (
      <button type="button" className="btn btn-primary" disabled={gistBusy} onClick={submitGist}>
        {copy.nextAsk}
      </button>
    ) : (
      <button type="button" className="btn btn-text" style={{ width: '100%' }} disabled={gistBusy} onClick={submitGist}>
        {copy.skipEmptyAsk}
      </button>
    );
  } else if (sub === 'prep' || sub === 'talk') {
    body = (
      <div>
        <p className="kicker">开口</p>
        <h2 className="title" style={{ fontSize: '1.4rem', margin: '8px 0 12px' }}>
          {speak?.titleZh || '说一件这周的事'}
        </h2>
        {sub === 'prep' ? (
          <>
            <p className="cjk-wrap" style={{ lineHeight: 1.55 }}>
              <UnitText text={speak?.fluency.promptZh || '准备 30 秒，然后说大约 45 秒，讲一件这周发生的事。'} />
            </p>
            <p className="serif" style={{ fontSize: '2rem', marginTop: 24 }}>{prepLeft}</p>
          </>
        ) : (
          <>
            <p className="cjk-wrap" style={{ lineHeight: 1.55 }}>
              讲一件这周做过的事就好，哪怕很小。
            </p>
            <p className="listen-status" style={{ marginTop: 16 }}>
              <UnitText text="大约 45 秒。说完就停。" />
            </p>
            {recording ? (
              <p className="serif" style={{ fontSize: '2rem', marginTop: 20 }}>
                <span className="unit-glue">{Math.min(talkElapsed, 45)} / 45 秒</span>
              </p>
            ) : null}
            {listeningOnly ? (
              <p className="helper cjk-wrap" style={{ marginTop: 16 }}>
                {copy.speakListenOnly}
              </p>
            ) : null}
            {msg && sub === 'talk' ? <p className="helper" style={{ marginTop: 10 }}>{msg}</p> : null}
          </>
        )}
      </div>
    );
    dock =
      sub === 'prep' ? (
        <button type="button" className="btn btn-primary" onClick={() => setSub('talk')}>
          跳过准备，开始说
        </button>
      ) : listeningOnly ? (
        <>
          <button type="button" className="btn btn-primary" onClick={() => setSub('recap')}>
            先听到这里
          </button>
          <button
            type="button"
            className="btn btn-text"
            style={{ width: '100%' }}
            onClick={async () => {
              void unlockAudio();
              const ok = await enableMic();
              if (ok) {
                setMsg(null);
                onMicAllowed?.(true);
              } else {
                setMsg(copy.micDenied);
              }
            }}
          >
            {copy.micAllow}
          </button>
        </>
      ) : (
        <>
          <MicDisc
            live={recording}
            level={level}
            onClick={async () => {
              if (recording) {
                const result = await mic.stop();
                setRecording(false);
                if (result.silent) return;
                await saveRecording({
                  id: `diag-speak-${Date.now()}`,
                  sceneId: speak?.id || 'diag-speak-this-week',
                  lineId: 'speak',
                  blob: result.blob,
                  mime: result.mime,
                  durationMs: result.durationMs,
                });
                setSub('recap');
              } else {
                void unlockAudio();
                try {
                  await mic.prepare();
                  const an = mic.getAnalyser();
                  const vad = an ? new EnergyVad(an, performance.now()) : null;
                  vad?.start();
                  tick('rec');
                  await mic.start();
                  setRecording(true);
                  window.setTimeout(async () => {
                    if (!mic.isRecording()) return;
                    const r = await mic.stop();
                    setRecording(false);
                    const ms = vad?.stop() ?? undefined;
                    if (ms != null) setTtfw(ms);
                    if (!r.silent) {
                      await saveRecording({
                        id: `diag-speak-${Date.now()}`,
                        sceneId: speak?.id || 'diag-speak-this-week',
                        lineId: 'speak',
                        blob: r.blob,
                        mime: r.mime,
                        durationMs: r.durationMs,
                      });
                    }
                    setSub('recap');
                  }, 50000);
                } catch {
                  setSub('recap');
                }
              }
            }}
          />
          <button type="button" className="btn btn-text" onClick={() => setSub('recap')}>
            先到这里
          </button>
        </>
      );
  } else {
    const bandKind = scenes.map((s, i) => {
      const row = hits[i] || [];
      const g = s.gist.length;
      const gHits = row.slice(0, g).filter(Boolean).length;
      if (gHits >= Math.max(1, g - 0)) return 'caught' as const;
      if (gHits > 0) return 'partial' as const;
      return 'miss' as const;
    });
    const allMissed = bandKind.length > 1 && bandKind.every((k) => k === 'miss');
    const lines = allMissed
      ? ['这三段第一遍都还没抓住。这不是退步，只是现在的位置。']
      : scenes.map((s, i) => {
          const kind = bandKind[i];
          if (kind === 'caught') return `大约 ${s.targetWpm} 词/分钟的那段，你抓住了大意。`;
          if (kind === 'partial') return `大约 ${s.targetWpm} 词/分钟的那段，你抓住了一部分。`;
          return `大约 ${s.targetWpm} 词/分钟的那段，第一遍还没抓住。`;
        });
    if (!allMissed && bandKind.some((k) => k === 'miss')) {
      lines.push('这不是退步，只是现在的位置。');
    }
    body = (
      <div>
        <p className="kicker">今天</p>
        <h2 className="title" style={{ fontSize: '1.6rem', margin: '8px 0 16px' }}>
          这就够了。
        </h2>
        {lines.map((l, i) => (
          <p key={`${i}-${l}`} className="recap-line" style={{ lineHeight: 1.55, marginBottom: 10 }}>
            <UnitText text={l} />
          </p>
        ))}
        <p className="recap-line" style={{ lineHeight: 1.55, marginBottom: 10 }}>
          <UnitText text={`接下来可以先从大约每分钟 ${comfortableWpm} 词附近的对话开始。`} />
        </p>
        <p className="serif" style={{ fontSize: '1.15rem', margin: '20px 0' }}>
          {copy.nextNamed(nextTitleZh)}
        </p>
        <p style={{ marginBottom: 10 }}>{copy.speedAsk}</p>
        <div className="dock-row">
          <button type="button" className="dock-tool" aria-pressed={pickedSpeed === 1.1} onClick={() => pickSpeed(1.1)}>{copy.speedSlow}</button>
          <button type="button" className="dock-tool" aria-pressed={pickedSpeed === 1} onClick={() => pickSpeed(1)}>{copy.speedOk}</button>
          <button type="button" className="dock-tool" aria-pressed={pickedSpeed === 0.85} onClick={() => pickSpeed(0.85)}>{copy.speedFast}</button>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          style={{ marginTop: 18 }}
          onClick={() => void finish()}
        >
          {copy.enough}
        </button>
      </div>
    );
  }

  return (
    <div className="session">
      <header className="session-top">
        <button type="button" className="icon-btn" onClick={() => setConfirm(true)} aria-label="先停在这里">
          先停
        </button>
        <div className="layer-name">定位</div>
        <div className="count">
          {sub === 'prep' || sub === 'talk' || sub === 'recap' ? 4 : Math.min(stage + 1, 3)} / 4
        </div>
      </header>
      <div className="session-stage">{body}</div>
      {dock ? <div className="session-dock">{dock}</div> : null}
      {confirm ? (
        <ConfirmSheet title={copy.leaveConfirm} onStay={() => setConfirm(false)} onLeave={onExit} />
      ) : null}
    </div>
  );
}
