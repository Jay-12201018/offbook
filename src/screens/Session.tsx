import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ComparePlayer } from '@/components/ComparePlayer.tsx';
import { ConfirmSheet } from '@/components/ConfirmSheet.tsx';
import { LineStage } from '@/components/LineStage.tsx';
import { MicDisc } from '@/components/MicDisc.tsx';
import { Recap } from '@/components/Recap.tsx';
import { SpeedToggle } from '@/components/SpeedToggle.tsx';
import { contentUrl, inferPartnerSpeaker, inferUserSpeaker, speakerName } from '@/content/normalize.ts';
import { playContent, playSequence, playUrl, stopPlayback, unlockAudio, pausePlayback } from '@/lib/audio.ts';
import { copy } from '@/lib/copy.ts';
import { UnitText } from '@/lib/units.tsx';
import { saveRecording, saveSettings } from '@/lib/db.ts';
import { clearMediaSession, setMediaSession } from '@/lib/mediaSession.ts';
import { enableMic } from '@/lib/micAccess.ts';
import { mic } from '@/lib/recorder.ts';
import { tick } from '@/lib/tick.ts';
import { EnergyVad } from '@/lib/vad.ts';
import { listenOnce } from '@/lib/asr.ts';
import { answerHits } from '@/lib/fuzzy.ts';
import { buildRecap, shouldCutExtra } from '@/session/engine.ts';
import { useSession } from '@/session/useSession.ts';
import type {
  CatalogEntry,
  LayerId,
  Scene,
  SequenceMode,
  SessionKind,
  SessionPlan,
  Speed,
  TroubleItem,
} from '@/session/types.ts';

export function SessionScreen({
  scene,
  kind,
  mode,
  plan,
  speed,
  onSpeed,
  listeningOnly,
  onExit,
  onFinished,
  nextEntry,
  troubles,
  forceFresh,
  warmupClip,
  onMicAllowed,
}: {
  scene: Scene;
  kind: SessionKind;
  mode: SequenceMode;
  plan: SessionPlan;
  speed: Speed;
  onSpeed: (s: Speed) => void;
  listeningOnly: boolean;
  onExit: () => void;
  onFinished: () => void;
  nextEntry: CatalogEntry | null;
  troubles?: TroubleItem[];
  forceFresh?: boolean;
  warmupClip?: { titleZh: string; items: { url?: string; text: string }[] } | null;
  onMicAllowed?: (allowed: boolean) => void;
}) {
  const { state, patch, advance, complete, logLine, layers } = useSession({
    scene,
    kind,
    mode,
    plan,
    listeningOnly,
    forceFresh,
  });
  const [confirm, setConfirm] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [level, setLevel] = useState(0);
  const [selfUrl, setSelfUrl] = useState<string | undefined>();
  const [recording, setRecording] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const retryMic = async () => {
    void unlockAudio();
    const ok = await enableMic();
    if (ok) onMicAllowed?.(true);
    else setMsg(copy.micDenied);
  };

  const [cueHidden, setCueHidden] = useState(false);
  const [coldReplayUsed, setColdReplayUsed] = useState(false);
  const [coldHeard, setColdHeard] = useState(false);
  const [gistRetry, setGistRetry] = useState(0);
  const [offerSlow, setOfferSlow] = useState(false);
  const [answer, setAnswer] = useState('');
  const [recon, setRecon] = useState('');
  const [fluencyUrls, setFluencyUrls] = useState<string[]>([]);
  const vadRef = useRef<EnergyVad | null>(null);
  const seqStop = useRef<{ stop: () => void } | null>(null);
  const promptEnd = useRef(0);
  const recLevel = useRef(0);
  const gistAdvanceRef = useRef<number | null>(null);
  const gistBusyRef = useRef(false);
  const [gistBusy, setGistBusy] = useState(false);

  useEffect(() => {
    return () => {
      if (gistAdvanceRef.current != null) window.clearTimeout(gistAdvanceRef.current);
      gistAdvanceRef.current = null;
      gistBusyRef.current = false;
    };
  }, []);

  useEffect(() => {
    mic.onLevel = (lv) => {
      recLevel.current = lv;
      if (recording) setLevel(lv);
    };
    return () => {
      mic.onLevel = undefined;
    };
  }, [recording]);

  const selfUrlRef = useRef<string | undefined>(undefined);
  selfUrlRef.current = selfUrl;
  const layerRef = useRef<LayerId | undefined>(undefined);
  layerRef.current = state?.layer;
  const fluencyRef = useRef<string[]>([]);
  fluencyRef.current = fluencyUrls;

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== 'hidden') return;
      const lyr = layerRef.current;
      if (lyr === 'chunks' || lyr === 'speak-scene' || lyr === 'mode-extra' || lyr === 'line-work') {
        pausePlayback();
        setPlaying(false);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      stopPlayback();
      seqStop.current?.stop();
      clearMediaSession();
      if (selfUrlRef.current) URL.revokeObjectURL(selfUrlRef.current);
      for (const u of fluencyRef.current) URL.revokeObjectURL(u);
    };
  }, []);

  const linesForWork = useMemo(() => {
    if (kind === 'review' && troubles?.length) {
      const ids = new Set(troubles.filter((t) => t.sceneId === scene.id && t.lineId).map((t) => t.lineId));
      const filtered = scene.lines.filter((l) => ids.has(l.id));
      if (filtered.length) return filtered;
    }
    if (kind === 'first-run') return scene.lines.slice(0, Math.min(8, scene.lines.length));
    return scene.lines;
  }, [kind, scene, troubles]);

  const chunksForWork = useMemo(() => {
    if (kind === 'micro') return scene.chunks.slice(0, 1);
    if (kind === 'review' && troubles?.length) {
      const ids = new Set(troubles.filter((t) => t.chunkId).map((t) => t.chunkId));
      const filtered = scene.chunks.filter((c) => ids.has(c.id));
      if (filtered.length) return filtered;
    }
    return scene.chunks;
  }, [kind, scene, troubles]);

  const prompts = useMemo(() => {
    const g = scene.gist || [];
    const d = kind === 'micro' || kind === 'first-run' ? (scene.details || []).slice(0, 1) : scene.details || [];
    return [...g, ...d];
  }, [scene, kind]);

  const userSpeaker = inferUserSpeaker(scene);
  const partnerSpeaker = inferPartnerSpeaker(scene);
  const partnerLines = scene.lines.filter((l) => l.speaker === partnerSpeaker);
  const userLines = scene.lines.filter((l) => l.speaker === userSpeaker);
  const exchanges = Math.max(1, Math.min(partnerLines.length, userLines.length || 1));
  const exchangeCount = kind === 'micro' ? 1 : kind === 'first-run' ? Math.min(2, exchanges) : exchanges;

  const requestClose = () => {
    if (state && state.layer !== 'recap') setConfirm(true);
    else onExit();
  };

  const playLine = useCallback(
    (rel: string | undefined, text: string, onEnd?: () => void) => {
      void unlockAudio();
      setPlaying(true);
      setMediaSession({
        title: scene.titleZh || scene.title,
        onPause: () => {
          pausePlayback();
          setPlaying(false);
        },
      });
      playContent(rel, text, {
        rate: speed,
        onEnd: () => {
          setPlaying(false);
          promptEnd.current = performance.now();
          onEnd?.();
        },
        onError: () => {
          setPlaying(false);
          setMsg(copy.playFailed);
        },
      });
    },
    [scene, speed],
  );

  const playCold = useCallback(
    (opts?: { slow?: boolean; first20?: boolean }) => {
      void unlockAudio();
      seqStop.current?.stop();
      setPlaying(true);
      setMsg(null);
      tick('pause');
      const rate: Speed = opts?.slow ? 0.85 : speed;
      setMediaSession({
        title: scene.titleZh || scene.title,
        onPause: () => {
          pausePlayback();
          seqStop.current?.stop();
          setPlaying(false);
        },
      });
      const full = contentUrl(scene.audioFull);
      if (full) {
        playUrl(full, {
          rate,
          endMs: opts?.first20 ? 20000 : undefined,
          onEnd: () => {
            setPlaying(false);
            setColdHeard(true);
          },
          onError: () => {
            setPlaying(false);
            setMsg(copy.playFailed);
          },
        });
        return;
      }
      const items = scene.lines.map((l) => ({
        url: contentUrl(l.audio),
        text: l.spoken || l.text,
        id: l.id,
        durationMs: l.durationMs,
      }));
      let acc = 0;
      const clipped = opts?.first20
        ? items.filter((it) => {
            if (acc >= 20000) return false;
            acc += it.durationMs || 2000;
            return true;
          })
        : items;
      seqStop.current = playSequence(clipped, {
        rate,
        onEnd: () => {
          setPlaying(false);
          setColdHeard(true);
        },
        onError: () => {
          setPlaying(false);
          setMsg(copy.playFailed);
        },
      });
    },
    [scene, speed],
  );

  const startRec = async (lineId: string) => {
    if (listeningOnly) {
      setMsg(copy.listeningOnlyNote);
      return;
    }
    void unlockAudio();
    try {
      await mic.prepare();
    } catch {
      setMsg(copy.micDenied);
      return;
    }
    tick('rec');
    const analyser = mic.getAnalyser();
    const t0 = promptEnd.current || performance.now();
    if (analyser) {
      vadRef.current = new EnergyVad(analyser, t0);
      vadRef.current.start();
    }
    await mic.start();
    setRecording(true);
    setMsg(null);
    void lineId;
  };

  const stopRec = async (lineId: string, chunkId?: string) => {
    const result = await mic.stop();
    setRecording(false);
    const ttfw = vadRef.current?.stop() ?? null;
    vadRef.current = null;
    if (result.silent) {
      setMsg(copy.noSound);
      return;
    }
    const id = `${scene.id}-${lineId}-${Date.now()}`;
    await saveRecording({
      id,
      sceneId: scene.id,
      lineId,
      blob: result.blob,
      mime: result.mime,
      durationMs: result.durationMs,
      kind: chunkId ? 'chunk' : 'line',
      chunkId,
      label: chunkId ? scene.chunks.find((c) => c.id === chunkId)?.form : undefined,
    });
    if (selfUrl) URL.revokeObjectURL(selfUrl);
    const url = URL.createObjectURL(result.blob);
    setSelfUrl(url);
    if (ttfw != null) {
      patch((s) => ({ ...s, metrics: { ...s.metrics, ttfwMs: [...s.metrics.ttfwMs, ttfw] } }));
      logLine(lineId, { ttfwMs: ttfw, recordingId: id });
    } else {
      logLine(lineId, { recordingId: id });
    }
    if (chunkId) {
      patch((s) => ({
        ...s,
        metrics: {
          ...s.metrics,
          chunksUsed: s.metrics.chunksUsed.includes(chunkId)
            ? s.metrics.chunksUsed
            : [...s.metrics.chunksUsed, chunkId],
          chunkTakes: { ...s.metrics.chunkTakes, [chunkId]: (s.metrics.chunkTakes[chunkId] || 0) + 1 },
        },
      }));
    }
    setMsg(null);
    return url;
  };

  const toggleRec = async (lineId: string, chunkId?: string) => {
    if (recording) return stopRec(lineId, chunkId);
    await startRec(lineId);
    return undefined;
  };

  const autoKey = useRef('');
  useEffect(() => {
    if (!state || state.layer !== 'line-work') return;
    const line = linesForWork[state.stepIndex];
    if (!line) return;
    const key = `${line.id}:${state.stepIndex}`;
    if (autoKey.current === key) return;
    autoKey.current = key;
    const t = window.setTimeout(() => {
      playLine(line.audio, line.spoken, () => {
        if (!listeningOnly) void startRec(line.id);
      });
    }, 260);
    return () => window.clearTimeout(t);
  }, [state, linesForWork, playLine]);

  const warmKey = useRef('');
  useEffect(() => {
    if (!state || state.layer !== 'warmup') return;
    const key = `${scene.id}:${warmupClip?.titleZh || 'self'}`;
    if (warmKey.current === key) return;
    warmKey.current = key;
    const source =
      warmupClip?.items ||
      scene.lines
        .filter((l) => scene.warmupLineIds.includes(l.id))
        .slice(0, 2)
        .map((l) => ({ url: l.audio, text: l.spoken }));
    const items = source.map((it) => ({ url: contentUrl(it.url), text: it.text }));
    if (!items.length) return;
    setPlaying(true);
    seqStop.current = playSequence(items, {
      rate: speed,
      onEnd: () => setPlaying(false),
      onError: () => setPlaying(false),
    });
  }, [state, warmupClip, scene, speed]);

  if (!state) {

    return (
      <div className="session">
        <div className="session-stage">
          <p className="helper">在准备这场戏…</p>
        </div>
      </div>
    );
  }

  const layer: LayerId = state.layer;
  const step = state.stepIndex;
  const totalSteps = (() => {
    switch (layer) {
      case 'gist':
        return prompts.length;
      case 'line-work':
        return linesForWork.length;
      case 'chunks':
        return kind === 'micro' ? chunksForWork.length : chunksForWork.length + (chunksForWork.length ? 1 : 0);
      case 'speak-scene':
        return exchangeCount;
      case 'mode-extra':
        if (mode === 'fluency') return 5;
        if (mode === 'easy-listen') return 4;
        if (mode === 'dictogloss') return 3;
        if (mode === 'tv-shadow') return 2;
        return 1;
      default:
        return 1;
    }
  })();

  const header = (
    <header className="session-top">
      <button type="button" className="icon-btn" onClick={requestClose} aria-label="先停在这里">
        先停
      </button>
      <div className="layer-name">{layerTitle(layer, mode, step, scene.gist.length)}</div>
      <div className="count">
        {layer === 'opening' || layer === 'recap' || layer === 'cold-listen' || layer === 'warmup'
          ? ''
          : `${Math.min(step + 1, totalSteps)} / ${totalSteps}`}
      </div>
    </header>
  );

  const goNextLayer = () => {
    stopPlayback();
    seqStop.current?.stop();
    if (selfUrlRef.current) {
      URL.revokeObjectURL(selfUrlRef.current);
      selfUrlRef.current = undefined;
    }
    setSelfUrl(undefined);
    setMsg(null);
    setAnswer('');
    setPlaying(false);
    if (layer === 'recap') return;
    const nxt = layers[layers.indexOf(layer) + 1];
    if (nxt === 'recap' || !nxt) {
      patch((s) => ({ ...s, layer: 'recap', stepIndex: 0 }));
    } else {
      advance();
    }
  };

  const finish = async (speedChoice?: 'ok' | 'fast' | 'slow') => {
    if (speedChoice === 'fast') await saveSettings({ speed: 0.85 });
    if (speedChoice === 'slow') await saveSettings({ speed: 1.1 });
    if (speedChoice === 'ok') await saveSettings({ speed });
    if (kind === 'first-run') await saveSettings({ firstRunComplete: true });
    await complete(state.metrics);
    onFinished();
  };

  const recapModel = buildRecap(
    scene,
    state.metrics,
    nextEntry?.titleZh || nextEntry?.title || '下一场还在路上',
    nextEntry?.id || null,
    kind,
    shouldCutExtra(plan, state.startedAt),
  );

  let body: ReactNode = null;
  let dock: ReactNode = null;

  /* ---------- opening ---------- */
  if (layer === 'opening') {
    body = (
      <div>
        <p className="kicker">
          <UnitText
            text={kind === 'micro' ? copy.openingMicro : kind === 'review' ? copy.openingReview : copy.openingToday}
          />
        </p>
        <h1 className="title" style={{ fontSize: '1.8rem', margin: '8px 0 12px' }}>
          {scene.titleZh}
        </h1>
        {scene.situationZh ? (
          <p className="helper cjk-wrap">
            <UnitText text={scene.situationZh} />
          </p>
        ) : null}
        <p style={{ marginTop: 20 }} className="kicker">
          {copy.chunksToday}
        </p>
        <ul style={{ paddingLeft: 18, margin: '10px 0 0', lineHeight: 1.6 }}>
          {scene.chunks.map((c) => (
            <li key={c.id}>
              <span className="serif">{c.form}</span>
              <span className="helper"> — {c.meaningZh}</span>
            </li>
          ))}
        </ul>
      </div>
    );
    dock = (
      <>
        <SpeedToggle value={speed} onChange={onSpeed} />
        <button type="button" className="btn btn-primary" onClick={() => { void unlockAudio(); goNextLayer(); }}>
          开始听
        </button>
      </>
    );
  }

  /* ---------- warmup ---------- */
  if (layer === 'warmup') {
    const wlines = scene.lines.filter((l) => scene.warmupLineIds.includes(l.id)).slice(0, 2);
    const items = (warmupClip?.items || wlines.map((l) => ({ url: l.audio, text: l.spoken }))).map((it) => ({
      url: contentUrl(it.url),
      text: it.text,
    }));
    body = (
      <div>
        <p className="helper">先用一句熟悉的热热耳朵，大约半分钟。</p>
        {warmupClip?.titleZh ? (
          <p className="serif" style={{ marginTop: 16, fontSize: '1.2rem' }}>
            {warmupClip.titleZh}
          </p>
        ) : (
          <div style={{ marginTop: 24 }}>
            {wlines.map((l) => (
              <p key={l.id} className="helper" style={{ marginTop: 8 }}>
                {speakerName(scene, l.speaker)}
              </p>
            ))}
          </div>
        )}
        <p className="helper" style={{ textAlign: 'center', marginTop: 24 }}>
          {playing ? '在听一句熟悉的' : '准备好了就按下面'}
        </p>
      </div>
    );
    dock = (
      <div className="dock-row">
        <button
          type="button"
          className="dock-tool"
          onClick={() => {
            setPlaying(true);
    seqStop.current = playSequence(items, {
      rate: speed,
      onEnd: () => setPlaying(false),
      onError: () => setPlaying(false),
    });
          }}
        >
          {copy.replay}
        </button>
        <button type="button" className="btn btn-primary" style={{ width: 'auto', padding: '0 28px' }} onClick={goNextLayer}>
          继续
        </button>
      </div>
    );
  }

  /* ---------- cold listen ---------- */
  if (layer === 'cold-listen') {
    body = (
      <div>
        <p className="kicker">{copy.coldTitle}</p>
        <h2 className="title" style={{ fontSize: '1.6rem', margin: '8px 0 16px' }}>
          {copy.coldHint}
        </h2>
        <p className="helper">{copy.coldHint2}</p>
        <div className="waveform" style={{ marginTop: 32 }}>
          {playing ? <span className="tally" /> : null}
        </div>
        <p className="listen-status" style={{ textAlign: 'center', marginTop: 12 }}>
          {playing
            ? '正在听整场对话'
            : msg
              ? msg
              : !coldHeard
                ? '准备好了就按下面播放'
                : coldReplayUsed
                  ? copy.goGistNow
                  : '可以再听，或去说大意'}
        </p>
        {offerSlow ? <p className="helper" style={{ marginTop: 16 }}>{copy.gistMiss}</p> : null}
      </div>
    );
    dock = (
      <>
        <SpeedToggle value={speed} onChange={onSpeed} />
        {coldHeard && !playing && !coldReplayUsed ? (
          <div className="dock-row">
            <button
              type="button"
              className="dock-tool"
              onClick={() => {
                setColdReplayUsed(true);
                playCold();
              }}
            >
              {copy.replayOnce}
            </button>
          </div>
        ) : null}
        {offerSlow ? (
          <div className="dock-row">
            <button type="button" className="dock-tool" onClick={() => playCold({ slow: true })}>
              {copy.slower}
            </button>
            <button type="button" className="dock-tool" onClick={() => playCold({ first20: true })}>
              {copy.firstTwenty}
            </button>
          </div>
        ) : null}
        {offerSlow ? (
          <button
            type="button"
            className="btn btn-text"
            style={{ width: '100%' }}
            onClick={() => {
              const i = layers.indexOf('gist');
              const nxt = (i >= 0 ? layers[i + 1] : null) || 'line-work';
              patch((s) => ({ ...s, layer: nxt, stepIndex: 0 }));
            }}
          >
            {copy.stillGo}
          </button>
        ) : null}
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            if (!coldHeard && !playing) playCold();
            else goNextLayer();
          }}
        >
          {!coldHeard && !playing ? copy.startListen : copy.caughtGist}
        </button>
      </>
    );
  }

  /* ---------- gist ---------- */
  if (layer === 'gist') {
    const p = prompts[step];
    if (!p) {
      body = <p>没有问题了。</p>;
      dock = (
        <button type="button" className="btn btn-primary" onClick={goNextLayer}>
          继续
        </button>
      );
    } else {
      const isDetail = step >= scene.gist.length;
      body = (
        <div>
          <p className="kicker">{isDetail ? '细节' : '大意'}</p>
          <h2 className="prompt-zh" style={{ margin: '12px 0 16px' }}>
            {p.askZh}
          </h2>
          <textarea
            className="field"
            style={{ marginTop: 18 }}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="用中文或英文都可以，写一句就行。"
            rows={3}
          />
          {msg ? <p className="helper" style={{ marginTop: 10 }}>{msg}</p> : null}
        </div>
      );
      dock = (
        <div className="dock-row">
          {!listeningOnly ? (
            <button
              type="button"
              className="dock-tool"
              onClick={async () => {
                const r = await listenOnce({ lang: 'zh-CN', timeoutMs: 7000 });
                if ('text' in r) setAnswer((a) => (a ? a + ' ' + r.text : r.text));
                else setMsg(copy.asrUnsure);
              }}
            >
              用嘴说
            </button>
          ) : null}
          <button
            type="button"
            className={answer.trim() ? 'btn btn-primary' : 'btn btn-text'}
            style={{ flex: 1, width: 'auto' }}
            disabled={gistBusy}
            onClick={() => {
              if (gistBusyRef.current) return;
              gistBusyRef.current = true;
              setGistBusy(true);
              const blank = !answer.trim();
              const hit = blank ? false : answerHits(answer, p.accept);
              const isG = !isDetail;
              patch((s) => ({
                ...s,
                metrics: {
                  ...s.metrics,
                  gistHits: s.metrics.gistHits + (isG && hit ? 1 : 0),
                  gistTotal: isG ? Math.max(s.metrics.gistTotal, scene.gist.length) : s.metrics.gistTotal,
                  detailHits: s.metrics.detailHits + (!isG && hit ? 1 : 0),
                  detailTotal: !isG ? Math.max(s.metrics.detailTotal, scene.details.length) : s.metrics.detailTotal,
                  gistAnswers: { ...s.metrics.gistAnswers, [p.id]: { text: answer, hit } },
                },
              }));
              if (!blank) {
                setMsg(hit ? (isG ? copy.gistOk : copy.detailOk) : isG ? copy.gistPartial : copy.detailMiss);
              }
              const last = step + 1 >= prompts.length;
              const lastGist = isG && step + 1 >= scene.gist.length;
              const missedAll = lastGist && !hit && state.metrics.gistHits === 0;
              if (missedAll && !blank) setOfferSlow(true);
              const nextStep = step + 1;
              if (gistAdvanceRef.current != null) window.clearTimeout(gistAdvanceRef.current);
              gistAdvanceRef.current = window.setTimeout(() => {
                gistAdvanceRef.current = null;
                setAnswer('');
                setMsg(null);
                if (missedAll && !blank && gistRetry < 1) {
                  setGistRetry(1);
                  setColdHeard(false);
                  patch((s) => ({ ...s, layer: 'cold-listen', stepIndex: 0 }));
                } else if (last || (missedAll && !blank)) {
                  goNextLayer();
                } else {
                  patch((s) => ({ ...s, stepIndex: nextStep }));
                }
                gistAdvanceRef.current = window.setTimeout(() => {
                  gistAdvanceRef.current = null;
                  gistBusyRef.current = false;
                  setGistBusy(false);
                }, 300);
              }, blank ? 0 : 700);
            }}
          >
            {answer.trim() ? copy.nextAsk : copy.skipEmptyAsk}
          </button>
        </div>
      );
    }
  }

  /* ---------- line work ---------- */
  if (layer === 'line-work') {
    const line = linesForWork[step];
    const glue = scene.glue.find((g) => g.lineId === line?.id) || null;
    if (!line) {
      dock = (
        <button type="button" className="btn btn-primary" onClick={goNextLayer}>
          继续
        </button>
      );
    } else {
      body = (
        <div>
          <LineStage
            scene={scene}
            line={line}
            revealLevel={state.revealLevel}
            playing={playing}
            level={recording ? level : playing ? 0.35 : 0}
            glue={glue}
          />
          {msg ? <p className="helper" style={{ marginTop: 12 }}>{msg}</p> : null}
          {selfUrl || recording ? (
            <div style={{ marginTop: 16 }}>
              <ComparePlayer
                modelUrl={contentUrl(line.audio)}
                modelText={line.spoken}
                selfUrl={selfUrl}
                rate={speed}
                listeningOnly={listeningOnly}
              />
            </div>
          ) : null}
        </div>
      );
      dock = (
        <>
          <SpeedToggle value={speed} onChange={onSpeed} />
          <div className="dock-row">
            <button
              type="button"
              className="dock-tool"
              onClick={() => {
                tick('pause');
                playLine(line.audio, line.spoken);
                patch((s) => ({
                  ...s,
                  metrics: {
                    ...s.metrics,
                    replays: { ...s.metrics.replays, [line.id]: (s.metrics.replays[line.id] || 0) + 1 },
                  },
                }));
              }}
            >
              {copy.replay}
            </button>
            <button
              type="button"
              className="dock-tool"
              onClick={() => {
                const nextLevel = (Math.min(2, state.revealLevel + 1) as 0 | 1 | 2);
                // If no meaningZh, skip level 2
                const lv = nextLevel === 2 && !line.meaningZh ? 1 : nextLevel;
                patch((s) => ({
                  ...s,
                  revealLevel: s.revealLevel === 0 ? 1 : lv === s.revealLevel && lv === 1 && line.meaningZh ? 2 : lv,
                  metrics: {
                    ...s.metrics,
                    reveals: { ...s.metrics.reveals, [line.id]: (s.metrics.reveals[line.id] || 0) + (s.revealLevel === 0 ? 1 : 0) },
                    firstListenByLine: {
                      ...s.metrics.firstListenByLine,
                      [line.id]: s.metrics.firstListenByLine[line.id] ?? s.revealLevel === 0,
                    },
                  },
                }));
              }}
            >
              {state.revealLevel === 0 ? copy.revealEn : state.revealLevel === 1 && line.meaningZh ? copy.revealZh : copy.hideText}
            </button>
            {state.revealLevel > 0 ? (
              <button
                type="button"
                className="dock-tool"
                onClick={() => {
                  patch((s) => ({ ...s, revealLevel: 0 }));
                  playLine(line.audio, line.spoken);
                }}
              >
                {copy.hideAndReplay}
              </button>
            ) : null}
          </div>
          {!listeningOnly ? (
            <MicDisc live={recording} level={level} onClick={() => void toggleRec(line.id)} />
          ) : (
            <>
              <p className="helper cjk-wrap" style={{ textAlign: 'center' }}>
                {copy.speakListenOnly}
              </p>
              <button type="button" className="btn btn-text" style={{ width: '100%' }} onClick={() => void retryMic()}>
                {copy.micAllow}
              </button>
            </>
          )}
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              if (recording) {
                void mic.stop();
                setRecording(false);
              }
              if (selfUrlRef.current) {
                URL.revokeObjectURL(selfUrlRef.current);
                selfUrlRef.current = undefined;
              }
              setSelfUrl(undefined);
              if (state.revealLevel === 0) {
                patch((s) => ({
                  ...s,
                  metrics: {
                    ...s.metrics,
                    firstListenByLine: { ...s.metrics.firstListenByLine, [line.id]: true },
                  },
                }));
              }
              logLine(line.id, {
                revealCount: state.metrics.reveals[line.id] || 0,
                firstListenCaught: state.revealLevel === 0,
                replays: state.metrics.replays[line.id] || 0,
              });
              stopPlayback();
              setPlaying(false);
              if (step + 1 >= linesForWork.length) goNextLayer();
              else {
                patch((s) => ({ ...s, stepIndex: s.stepIndex + 1, revealLevel: 0 }));
                const nxt = linesForWork[step + 1];
                if (nxt) {
                  window.setTimeout(() => playLine(nxt.audio, nxt.spoken), 240);
                }
              }
            }}
          >
            {step + 1 >= linesForWork.length ? '去偷语块' : copy.nextLine}
          </button>
        </>
      );
      // autoplay first time on this step
    }
  }

  /* ---------- chunks ---------- */
  if (layer === 'chunks') {
    const personal = step >= chunksForWork.length;
    const chunk = chunksForWork[Math.min(step, chunksForWork.length - 1)];
    if (!chunk) {
      dock = (
        <button type="button" className="btn btn-primary" onClick={goNextLayer}>
          继续
        </button>
      );
    } else if (personal) {
      body = (
        <div>
          <p className="kicker">变成你的一句</p>
          <p className="line-en" style={{ margin: '12px 0' }}>
            {chunk.sayAfter}
          </p>
          <p className="helper">{chunk.meaningZh} 用到今天的说法，说一句你自己的。</p>
          {msg ? <p className="helper" style={{ marginTop: 12 }}>{msg}</p> : null}
          <div style={{ marginTop: 20 }}>
            <ComparePlayer
              modelUrl={contentUrl(chunk.afterAudio || chunk.audio)}
              modelText={chunk.sayAfter}
              selfUrl={selfUrl}
              rate={speed}
              listeningOnly={listeningOnly}
            />
          </div>
        </div>
      );
      dock = recordDock({
        listeningOnly,
        onRetryMic: retryMic,
        recording,
        level,
        onToggle: () => toggleRec(chunk.fromLineId, chunk.id),
        onPlayModel: () => {
          promptEnd.current = 0;
          setPlaying(true);
          playContent(chunk.afterAudio || chunk.audio, chunk.sayAfter, {
            rate: speed,
            onEnd: () => {
              setPlaying(false);
              promptEnd.current = performance.now();
              if (!listeningOnly) void startRec(chunk.fromLineId);
            },
            onError: () => {
              setPlaying(false);
              setMsg(copy.playFailed);
            },
          });
        },
        onNext: goNextLayer,
        nextLabel: '进入你的回合',
      });
    } else {
      const line = scene.lines.find((l) => l.id === chunk.fromLineId);
      body = (
        <div>
          <p className="kicker">{copy.stealThis}</p>
          <h2 className="line-en" style={{ margin: '10px 0 8px' }}>
            {chunk.form}
          </h2>
          <p className="line-zh">{chunk.meaningZh}</p>
          {msg ? <p className="helper" style={{ marginTop: 12 }}>{msg}</p> : null}
          <div style={{ marginTop: 22 }}>
            <ComparePlayer
              modelUrl={contentUrl(chunk.audio || line?.audio)}
              modelText={chunk.form}
              selfUrl={selfUrl}
              rate={speed}
              listeningOnly={listeningOnly}
            />
          </div>
        </div>
      );
      dock = recordDock({
        listeningOnly,
        onRetryMic: retryMic,
        recording,
        level,
        extra: listeningOnly ? undefined : (
          <button
            type="button"
            className="dock-tool"
            onClick={() => {
              setMsg('跟着节奏说，不必盯着每个词。');
              playContent(chunk.audio || line?.audio, chunk.form, { rate: speed });
            }}
          >
            {copy.shadow}
          </button>
        ),
        onToggle: () => toggleRec(chunk.fromLineId, chunk.id),
        onPlayModel: () => {
          setPlaying(true);
          playContent(chunk.audio || line?.audio, chunk.form, {
            rate: speed,
            onEnd: () => {
              setPlaying(false);
              promptEnd.current = performance.now();
              if (!listeningOnly) void startRec(chunk.fromLineId);
            },
            onError: () => {
              setPlaying(false);
              setMsg(copy.playFailed);
            },
          });
        },
        onNext: () => {
          setSelfUrl(undefined);
          setMsg(null);
          if (step + 1 >= (kind === 'micro' ? chunksForWork.length : chunksForWork.length + 1)) goNextLayer();
          else patch((s) => ({ ...s, stepIndex: s.stepIndex + 1 }));
        },
        nextLabel: step + 1 >= chunksForWork.length && kind !== 'micro' ? '用一句自己的' : '下一块',
      });
    }
  }

  /* ---------- speak the scene ---------- */
  if (layer === 'speak-scene') {
    const partner = partnerLines[Math.min(step, partnerLines.length - 1)];
    const mine = userLines[Math.min(step, Math.max(0, userLines.length - 1))];
    const cue = cueHidden ? null : scene.roleplay?.starters?.[step] || mine?.text;
    body = (
      <div>
        <p className="kicker">{copy.yourTurn}</p>
        <p style={{ margin: '10px 0 14px', lineHeight: 1.5 }}>{scene.roleplay.setupZh}</p>
        {partner ? (
          <p className="helper">
            {speakerName(scene, partner.speaker)} 刚说完。轮到你。
          </p>
        ) : (
          <p className="helper">用今天的说法接一句。</p>
        )}
        {cue ? (
          <p className="serif" style={{ marginTop: 16, fontSize: '1.15rem' }}>
            {cue}
          </p>
        ) : null}
        <button type="button" className="btn btn-text" onClick={() => setCueHidden((v) => !v)}>
          {cueHidden ? copy.showCue : copy.hideCue}
        </button>
        {msg ? <p className="helper">{msg}</p> : null}
        <div style={{ marginTop: 16 }}>
          <ComparePlayer
            modelUrl={contentUrl(mine?.audio)}
            modelText={copy.oneWay}
            selfUrl={selfUrl}
            rate={speed}
            listeningOnly={listeningOnly}
          />
        </div>
      </div>
    );
    dock = recordDock({
      listeningOnly,
      onRetryMic: retryMic,
      recording,
      level,
      onToggle: () => toggleRec(mine?.id || `turn-${step}`),
      onPlayModel: () => {
        if (partner) {
          setPlaying(true);
          playContent(partner.audio, partner.spoken, {
            rate: speed,
            onEnd: () => {
              setPlaying(false);
              promptEnd.current = performance.now();
              if (!listeningOnly) void startRec(mine?.id || `turn-${step}`);
            },
            onError: () => {
              setPlaying(false);
              setMsg(copy.playFailed);
            },
          });
        }
      },
      playLabel: partner ? '听对方' : copy.hearModel,
      onNext: () => {
        setSelfUrl(undefined);
        setCueHidden(false);
        if (step + 1 >= exchangeCount) goNextLayer();
        else patch((s) => ({ ...s, stepIndex: s.stepIndex + 1 }));
      },
      nextLabel: step + 1 >= exchangeCount ? '收束' : '下一轮',
    });
  }

  /* ---------- mode extra ---------- */
  if (layer === 'mode-extra') {
    const block = renderModeExtra({
      mode,
      scene,
      step,
      speed,
      playing,
      setPlaying,
      recon,
      setRecon,
      fluencyUrls,
      setFluencyUrls,
      selfUrl,
      listeningOnly,
      onRetryMic: retryMic,
      recording,
      level,
      toggleRec,
      playCold,
      playLine,
      goNextLayer,
      patchStep: (n: number) => patch((s) => ({ ...s, stepIndex: n })),
      msg,
    });
    body = block.body;
    dock = block.dock;
  }

  /* ---------- recap ---------- */
  if (layer === 'recap') {
    body = (
      <Recap
        model={recapModel}
        onDone={() => void finish()}
        onMore={kind === 'full' ? () => patch((s) => ({ ...s, layer: 'chunks', stepIndex: 0 })) : undefined}
        firstRunSpeed={kind === 'first-run'}
        onSpeed={(v) => void finish(v)}
      />
    );
    dock = null;
  }

  return (
    <div className="session">
      {header}
      <div className="session-stage">{body}</div>
      {dock ? <div className="session-dock">{dock}</div> : null}
      {confirm ? (
        <ConfirmSheet title={copy.leaveConfirm} onStay={() => setConfirm(false)} onLeave={onExit} />
      ) : null}
    </div>
  );
}

function layerTitle(layer: LayerId, mode: SequenceMode, step = 0, gistCount = 0): string {
  if (layer === 'gist' && step >= gistCount) return '细节';
  if (layer === 'mode-extra') {
    if (mode === 'fluency') return copy.fluencyTitle;
    if (mode === 'tv-shadow') return copy.tvShadowTitle;
    if (mode === 'easy-listen') return copy.easyListenTitle;
    if (mode === 'dictogloss') return copy.dictoglossTitle;
  }
  const map: Record<LayerId, string> = {
    opening: '开场',
    warmup: '热热身',
    'cold-listen': copy.coldTitle,
    gist: '大意',
    'line-work': copy.lineWork,
    chunks: copy.chunksTitle,
    'speak-scene': copy.yourTurn,
    'mode-extra': '加练',
    recap: '收束',
  };
  return map[layer];
}

function recordDock(opts: {
  listeningOnly: boolean;
  onRetryMic?: () => void;
  recording: boolean;
  level: number;
  onToggle: () => void;
  onPlayModel: () => void;
  onNext: () => void;
  nextLabel: string;
  playLabel?: string;
  extra?: ReactNode;
}) {
  return (
    <>
      <div className="dock-row">
        <button type="button" className="dock-tool" onClick={opts.onPlayModel}>
          {opts.playLabel || copy.hearModel}
        </button>
        {opts.extra}
      </div>
      {opts.listeningOnly ? (
        <>
          <p className="helper cjk-wrap" style={{ textAlign: 'center' }}>
            {copy.listeningOnlyNote}
          </p>
          {opts.onRetryMic ? (
            <button type="button" className="btn btn-text" style={{ width: '100%' }} onClick={() => void opts.onRetryMic?.()}>
              {copy.micAllow}
            </button>
          ) : null}
        </>
      ) : (
        <MicDisc live={opts.recording} level={opts.level} onClick={opts.onToggle} />
      )}
      <button type="button" className="btn btn-primary" onClick={opts.onNext}>
        {opts.nextLabel}
      </button>
    </>
  );
}

function renderModeExtra(opts: {
  mode: SequenceMode;
  scene: Scene;
  step: number;
  speed: Speed;
  playing: boolean;
  setPlaying: (v: boolean) => void;
  recon: string;
  setRecon: (v: string) => void;
  fluencyUrls: string[];
  setFluencyUrls: (fn: (s: string[]) => string[] | string[]) => void;
  selfUrl?: string;
  listeningOnly: boolean;
  onRetryMic?: () => void;
  recording: boolean;
  level: number;
  toggleRec: (lineId: string) => void | Promise<string | undefined>;
  playCold: (o?: { slow?: boolean }) => void;
  playLine: (rel: string | undefined, text: string, onEnd?: () => void) => void;
  goNextLayer: () => void;
  patchStep: (n: number) => void;
  msg: string | null;
}): { body: ReactNode; dock: ReactNode } {
  const { mode, scene, step } = opts;
  if (mode === 'fluency') {
    const labels = ['准备 15 秒', '说 60 秒', '再说 45 秒', '最后 30 秒', '对照'];
    const body = (
      <div>
        <p className="kicker">{copy.fluencyTitle}</p>
        <p style={{ margin: '12px 0', lineHeight: 1.5 }}>{scene.fluency.promptZh}</p>
        <p className="helper">{labels[step]}</p>
        {step === 4 && opts.fluencyUrls.length >= 2 ? (
          <div className="compare" style={{ marginTop: 16 }}>
            <button type="button" onClick={() => playUrl(opts.fluencyUrls[0], { rate: 1 })}>
              第一遍
            </button>
            <button type="button" onClick={() => playUrl(opts.fluencyUrls[opts.fluencyUrls.length - 1], { rate: 1 })}>
              最后一遍
            </button>
          </div>
        ) : null}
      </div>
    );
    const dock =
      step === 4 ? (
        <button type="button" className="btn btn-primary" onClick={opts.goNextLayer}>
          收束
        </button>
      ) : step === 0 ? (
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            opts.patchStep(1);
          }}
        >
          开始说 60 秒
        </button>
      ) : (
        recordDock({
          listeningOnly: opts.listeningOnly,
          onRetryMic: opts.onRetryMic,
          recording: opts.recording,
          level: opts.level,
          onToggle: () => {
            void (async () => {
              const url = await opts.toggleRec(`fluency-${step}`);
              if (url) {
                opts.setFluencyUrls((prev) => {
                  const n = prev.slice();
                  n[step] = url;
                  return n;
                });
              }
            })();
          },
          onPlayModel: () => undefined,
          playLabel: '准备好了',
          onNext: () => opts.patchStep(step + 1),
          nextLabel: step === 3 ? copy.lastVsFirst : '下一段',
        })
      );
    return { body, dock };
  }
  if (mode === 'tv-shadow') {
    const body = (
      <div>
        <p className="kicker">{copy.tvShadowTitle}</p>
        <p style={{ marginTop: 12, lineHeight: 1.5 }}>
          {step === 0 ? '这段你已经听过。跟着走，不必盯着字。' : '现在自己说一句：刚才这段里，你最想留下的是什么。'}
        </p>
      </div>
    );
    const dock =
      step === 0 ? (
        <div className="dock-row">
          <button type="button" className="dock-tool" onClick={() => opts.playCold()}>
            跟着走
          </button>
          <button type="button" className="btn btn-primary" style={{ width: 'auto' }} onClick={() => opts.patchStep(1)}>
            轮到我说
          </button>
        </div>
      ) : (
        recordDock({
          listeningOnly: opts.listeningOnly,
          onRetryMic: opts.onRetryMic,
          recording: opts.recording,
          level: opts.level,
          onToggle: () => opts.toggleRec('tv-free'),
          onPlayModel: () => opts.playCold(),
          onNext: opts.goNextLayer,
          nextLabel: '收束',
        })
      );
    return { body, dock };
  }
  if (mode === 'easy-listen') {
    const asks = ['你怎么看这段？', '有没有一句留下来？', '这像不像你遇过的事？'];
    const body = (
      <div>
        <p className="kicker">{copy.easyListenTitle}</p>
        {step === 0 ? (
          <p style={{ marginTop: 12 }}>用稍慢或另一个声音再听一遍，然后用三句说说你的反应。</p>
        ) : (
          <h2 className="prompt-zh" style={{ marginTop: 16 }}>
            {asks[step - 1]}
          </h2>
        )}
      </div>
    );
    const dock =
      step === 0 ? (
        <div className="dock-row">
          <button type="button" className="dock-tool" onClick={() => opts.playCold({ slow: true })}>
            {copy.slower}
          </button>
          <button type="button" className="btn btn-primary" style={{ width: 'auto' }} onClick={() => opts.patchStep(1)}>
            开始说
          </button>
        </div>
      ) : (
        recordDock({
          listeningOnly: opts.listeningOnly,
          onRetryMic: opts.onRetryMic,
          recording: opts.recording,
          level: opts.level,
          onToggle: () => opts.toggleRec(`react-${step}`),
          onPlayModel: () => opts.playCold({ slow: true }),
          onNext: () => (step >= 3 ? opts.goNextLayer() : opts.patchStep(step + 1)),
          nextLabel: step >= 3 ? '收束' : '下一句',
        })
      );
    return { body, dock };
  }
  // dictogloss
  const span = scene.lines.slice(0, Math.max(3, Math.ceil(scene.lines.length / 2)));
  const body = (
    <div>
      <p className="kicker">{copy.dictoglossTitle}</p>
      {step === 0 ? (
        <p style={{ marginTop: 12 }}>{copy.reconstructHint}</p>
      ) : step === 1 ? (
        <>
          <textarea className="field" value={opts.recon} onChange={(e) => opts.setRecon(e.target.value)} rows={5} />
          <p className="helper" style={{ marginTop: 8 }}>
            {copy.thenSpeak}
          </p>
        </>
      ) : (
        <div>
          <p className="helper">{copy.showOriginal}</p>
          {span.map((l) => (
            <p key={l.id} className="line-en" style={{ marginTop: 8 }}>
              {l.text}
            </p>
          ))}
        </div>
      )}
    </div>
  );
  const dock =
    step === 0 ? (
      <div className="dock-row">
        <button
          type="button"
          className="dock-tool"
          onClick={() => {
            const items = span.map((l) => ({ url: contentUrl(l.audio), text: l.spoken }));
            playSequence(items, { rate: opts.speed });
          }}
        >
          听这一段
        </button>
        <button type="button" className="btn btn-primary" style={{ width: 'auto' }} onClick={() => opts.patchStep(1)}>
          开始重建
        </button>
      </div>
    ) : step === 1 ? (
      recordDock({
        listeningOnly: opts.listeningOnly,
        onRetryMic: opts.onRetryMic,
        recording: opts.recording,
        level: opts.level,
        onToggle: () => opts.toggleRec('dictogloss'),
        onPlayModel: () => undefined,
        onNext: () => opts.patchStep(2),
        nextLabel: copy.showOriginal,
      })
    ) : (
      <button type="button" className="btn btn-primary" onClick={opts.goNextLayer}>
        收束
      </button>
    );
  return { body, dock };
}

