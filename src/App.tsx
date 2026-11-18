import { useCallback, useEffect, useMemo, useState } from 'react';
import { TabBar, type TabId } from '@/components/TabBar.tsx';
import { unlockAudio } from '@/lib/audio.ts';
import { ConfirmSheet } from '@/components/ConfirmSheet.tsx';
import {
  allLineEvents,
  allSceneState,
  getResumes,
  getSettings,
  saveSettings,
} from '@/lib/db.ts';
import {
  currentSequenceSession,
  entryById,
  loadIndex,
  loadScene,
  loadSequence,
  modeForScene,
  nextSceneId,
  nextSequenceSession,
  pickMicroScene,
  sessionForScene,
} from '@/lib/catalog.ts';
import { DIAGNOSTIC_BRIEFING } from '@/content/situations-zh.ts';
import { shortSceneTitleZh } from '@/lib/displayTitle.ts';
import { copy } from '@/lib/copy.ts';
import { isStandalone, listenInstallPrompt } from '@/lib/install.ts';
import { requestPersistOnce } from '@/lib/persist.ts';
import { schedulePrefetch } from '@/lib/prefetchAudio.ts';
import { applyTheme } from '@/lib/theme.ts';
import { releaseWakeLock, requestWakeLock, watchWakeLock } from '@/lib/wakeLock.ts';
import { buildPlan, inferTroubles, isActiveResume, speedFromComfortableWpm } from '@/session/engine.ts';
import { DiagnosticScreen } from '@/screens/Diagnostic.tsx';
import { FirstRun } from '@/screens/FirstRun.tsx';
import { InstallGuide } from '@/screens/InstallGuide.tsx';
import { Progress } from '@/screens/Progress.tsx';
import { Scenes } from '@/screens/Scenes.tsx';
import { SessionScreen } from '@/screens/Session.tsx';
import { Settings as SettingsScreen } from '@/screens/Settings.tsx';
import { Today } from '@/screens/Today.tsx';
import type {
  CatalogEntry,
  DiagnosticProgress,
  ResumeMap,
  Scene,
  SceneRollup,
  Sequence,
  SequenceDay,
  SequenceMode,
  SessionKind,
  Settings,
  Speed,
  TroubleItem,
} from '@/session/types.ts';

type Route = TabId | 'session' | 'first-run' | 'install';

function parseHash(): { route: Route; scene?: string; kind?: SessionKind } {
  const raw = (location.hash || '#/').replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  const q = new URLSearchParams(qs || '');
  const parts = path.split('/').filter(Boolean);
  const head = parts[0] || 'today';
  if (head === 'session') {
    return {
      route: 'session',
      scene: q.get('scene') || undefined,
      kind: (q.get('kind') as SessionKind) || 'full',
    };
  }
  if (head === 'onboarding' || head === 'first-run') return { route: 'first-run' };
  if (head === 'install') return { route: 'install' };
  if (head === 'scenes' || head === 'progress' || head === 'settings' || head === 'today') {
    return { route: head };
  }
  return { route: 'today' };
}

function setHash(route: Route, params?: { scene?: string; kind?: SessionKind }, opts?: { replace?: boolean }) {
  let h = `#/${route === 'today' ? '' : route}`;
  if (route === 'today') h = '#/';
  if (route === 'session') {
    const q = new URLSearchParams();
    if (params?.scene) q.set('scene', params.scene);
    if (params?.kind) q.set('kind', params.kind);
    h = `#/session?${q.toString()}`;
  }
  if (location.hash !== h) {
    if (opts?.replace) history.replaceState(null, '', h);
    else history.pushState(null, '', h);
  }
}

export default function App() {
  const [route, setRoute] = useState<Route>(() => parseHash().route);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [index, setIndex] = useState<CatalogEntry[]>([]);
  const [sequence, setSequence] = useState<Sequence>({ firstRunSceneId: null, days: [] });
  const [resumes, setResumes] = useState<ResumeMap>({});
  const [pendingFull, setPendingFull] = useState<{ sceneId: string; sess?: SequenceDay | null } | null>(null);
  const [diagResume, setDiagResume] = useState<DiagnosticProgress | null>(null);
  const [states, setStates] = useState<Record<string, SceneRollup>>({});
  const [troubles, setTroubles] = useState<TroubleItem[]>([]);
  const [scene, setScene] = useState<Scene | null>(null);
  const [kind, setKind] = useState<SessionKind>('full');
  const [mode, setMode] = useState<SequenceMode>('roleplay');
  const [listeningOnly, setListeningOnly] = useState(false);
  const [fresh, setFresh] = useState(false);
  const [hasWarmup, setHasWarmup] = useState(false);
  const [warmupClip, setWarmupClip] = useState<{ titleZh: string; items: { url?: string; text: string }[] } | null>(null);
  const [ready, setReady] = useState(false);
  const [seqSession, setSeqSession] = useState<SequenceDay | null>(null);
  const [diagListens, setDiagListens] = useState<Scene[]>([]);
  const [diagSpeak, setDiagSpeak] = useState<Scene | null>(null);

  useEffect(() => {
    listenInstallPrompt();
    const onFirst = () => {
      void unlockAudio();
      window.removeEventListener('pointerdown', onFirst);
    };
    window.addEventListener('pointerdown', onFirst, { once: true });
    const onHash = () => {
      const p = parseHash();
      setRoute(p.route);
    };
    window.addEventListener('hashchange', onHash);
    window.addEventListener('popstate', onHash);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('popstate', onHash);
    };
  }, []);

  const refreshLocal = useCallback(async () => {
    const [s, slots, rolls, evs] = await Promise.all([
      getSettings(),
      getResumes(),
      allSceneState(),
      allLineEvents(),
    ]);
    setSettings(s);
    applyTheme(s.theme);
    setResumes(slots);
    setDiagResume(slots.diagnostic || null);
    const map: Record<string, SceneRollup> = {};
    for (const row of rolls) map[row.sceneId] = row;
    setStates(map);
    const unused: { sceneId: string; chunkId: string; form: string }[] = [];
    for (const row of rolls) {
      for (const id of row.unusedChunkIds || []) {
        unused.push({ sceneId: row.sceneId, chunkId: id, form: row.chunkForms?.[id] || id });
      }
    }
    setTroubles(
      inferTroubles({
        events: evs,
        unusedChunkIds: unused,
      }),
    );
    setListeningOnly(s.micAllowed === false);
    return s;
  }, []);

  useEffect(() => {
    void (async () => {
      const [idx, seq, s] = await Promise.all([loadIndex(), loadSequence(), refreshLocal()]);
      setIndex(idx);
      setSequence(seq);
      const slots = await getResumes();
      const hasResume = !!(slots.full || slots.micro || slots.review || slots.diagnostic || slots['first-run']);
      if (!s.firstRunComplete && !hasResume && !s.lastCompletedAt && !s.diagComplete) {
        setRoute('first-run');
        setHash('first-run');
      } else {
        const parsed = parseHash();
        setRoute(parsed.route === 'first-run' ? 'today' : parsed.route);
        if (parsed.route === 'session' && parsed.scene) {
          await openSession(
            parsed.scene,
            parsed.kind || 'full',
            false,
            sessionForScene(seq, parsed.scene),
            seq,
          );
        }
      }
      if (isStandalone()) void requestPersistOnce();
      setReady(true);
    })();
  }, [refreshLocal]);

  useEffect(() => {
    if (!ready || !sequence.days.length) return;
    const ids: string[] = [];
    const today = currentSequenceSession(sequence, settings?.lastSequenceSession);
    if (today) {
      if (today.sceneIds?.length) ids.push(...today.sceneIds);
      else if (today.sceneId) ids.push(today.sceneId);
      if (today.warmupFrom) ids.push(today.warmupFrom);
      const nxt = nextSequenceSession(sequence, today);
      if (nxt) {
        if (nxt.sceneIds?.length) ids.push(...nxt.sceneIds);
        else if (nxt.sceneId) ids.push(nxt.sceneId);
        if (nxt.warmupFrom) ids.push(nxt.warmupFrom);
      }
    }
    for (const r of [resumes.full, resumes.micro, resumes.review]) {
      if (r?.sceneId) ids.push(r.sceneId);
    }
    return schedulePrefetch(ids);
  }, [ready, sequence, settings?.lastSequenceSession, resumes.full, resumes.micro, resumes.review]);

  useEffect(() => {
    if (settings) applyTheme(settings.theme);
    if (!settings || settings.theme !== 'auto') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => applyTheme('auto');
    mq.addEventListener('change', sync);
    const id = window.setInterval(sync, 60_000);
    return () => {
      mq.removeEventListener('change', sync);
      window.clearInterval(id);
    };
  }, [settings]);

  useEffect(() => {
    if (route === 'session') {
      void requestWakeLock();
      const stop = watchWakeLock();
      return () => {
        stop();
        void releaseWakeLock();
      };
    }
    return;
  }, [route]);

  const todaySession = useMemo(
    () => currentSequenceSession(sequence, settings?.lastSequenceSession),
    [sequence, settings?.lastSequenceSession],
  );

  const todayEntry = useMemo(() => {
    if (!index.length) return null;
    if (todaySession) {
      const e = entryById(index, todaySession.sceneId) || entryById(index, todaySession.sceneIds?.[0] || '');
      if (e) {
        return {
          ...e,
          titleZh: todaySession.titleZh || e.titleZh,
          title: todaySession.titleZh || e.titleZh || e.title,
          situationZh:
            todaySession.mode === 'diagnostic'
              ? DIAGNOSTIC_BRIEFING
              : e.situationZh || '',
          estimatedMinutes: todaySession.mode === 'diagnostic' ? 15 : e.estimatedMinutes,
        };
      }
    }
    const first = sequence.days[0]?.sceneId || index.find((s) => s.official !== false)?.id || index[0].id;
    return entryById(index, first) || index[0];
  }, [index, todaySession, sequence]);

  async function openDiagnostic(sess: SequenceDay) {
    const ids = sess.sceneIds || [];
    const loaded = (await Promise.all(ids.map((id) => loadScene(id)))).filter(Boolean) as Scene[];
    const speak = loaded.find((s) => /speak/i.test(s.id)) || loaded[loaded.length - 1] || null;
    const listens = loaded.filter((s) => s.id !== speak?.id);
    setDiagListens(listens);
    setDiagSpeak(speak);
    setSeqSession(sess);
    setKind('diagnostic');
    setMode('diagnostic');
    setScene(listens[0] || speak);
    setFresh(false);
    setRoute('session');
    setHash('session', { scene: sess.sceneId, kind: 'diagnostic' });
  }

  async function openSession(
    sceneId: string,
    k: SessionKind,
    startFresh: boolean,
    sess?: SequenceDay | null,
    seqOverride?: Sequence,
  ) {
    const seq = seqOverride ?? sequence;
    const found = sess || sessionForScene(seq, sceneId) || null;
    if ((k === 'diagnostic' || found?.mode === 'diagnostic') && (found?.sceneIds?.length || 0) > 1 && k !== 'micro' && k !== 'review') {
      await openDiagnostic(found!);
      return;
    }
    const sc = await loadScene(sceneId);
    if (!sc) return;
    const m = (k === 'micro' ? 'roleplay' : found?.mode && found.mode !== 'diagnostic' ? found.mode : modeForScene(seq, sceneId));
    setSeqSession(found);
    setScene(sc);
    setKind(k);
    setMode(m);
    setFresh(startFresh);
    let clip: { titleZh: string; items: { url?: string; text: string }[] } | null = null;
    const warmupFrom =
      k === 'full'
        ? found?.warmupFrom ||
          (settings?.lastSceneId && settings.lastSceneId !== sceneId ? settings.lastSceneId : undefined)
        : undefined;
    if (warmupFrom) {
      const w = await loadScene(warmupFrom);
      if (w) {
        const preferred = w.warmupLineIds?.length
          ? w.lines.filter((l) => w.warmupLineIds.includes(l.id))
          : [];
        const lines = (preferred.length ? preferred : w.lines).slice(0, 2);
        clip = {
          titleZh: w.titleZh,
          items: lines.map((l) => ({ url: l.audio, text: l.spoken || l.text })),
        };
      }
    }
    setWarmupClip(clip);
    setHasWarmup(!!clip);
    setRoute('session');
    setHash('session', { scene: sceneId, kind: k });
  }

  async function finishSession(
    sceneId: string,
    k: SessionKind,
    extra?: { comfortableWpm?: number; speed?: Speed; speedChosen?: boolean },
  ) {
    const sess = seqSession || sessionForScene(sequence, sceneId);
    const cur = settings?.lastSequenceSession ?? -1;
    const patch: Partial<Settings> = {
      lastSceneId: sceneId,
      lastCompletedAt: Date.now(),
      firstRunComplete: true,
    };
    if (sess && sess.day > cur) patch.lastSequenceSession = sess.day;
    if (k === 'diagnostic' || sess?.mode === 'diagnostic') patch.diagComplete = true;
    if (extra?.comfortableWpm) {
      patch.comfortableWpm = extra.comfortableWpm;
      if (extra.speedChosen && extra.speed) patch.speed = extra.speed;
      else patch.speed = speedFromComfortableWpm(extra.comfortableWpm);
    }
    const next = await saveSettings(patch);
    setSettings(next);
    await refreshLocal();
    go('today');
  }

  function requestStartFull(sceneId: string, sess?: SequenceDay | null, fresh = false) {
    const mid = isActiveResume(resumes.full) ? resumes.full : null;
    if (mid && (fresh || mid.sceneId !== sceneId)) {
      setPendingFull({ sceneId, sess: sess || null });
      return;
    }
    void openSession(sceneId, 'full', fresh && !mid, sess);
  }

  const go = (r: Route) => {
    setRoute(r);
    if (r !== 'session') setHash(r);
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
  };

  useEffect(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
  }, [route]);

  const reportDiagScene = useCallback((id: string) => {
    setHash('session', { scene: id, kind: 'diagnostic' }, { replace: true });
  }, []);

  const allowMic = useCallback((allowed: boolean) => {
    setListeningOnly(!allowed);
    if (allowed) {
      void saveSettings({ micAllowed: true }).then(setSettings);
    }
  }, []);


  const showInstallHint =
    !!settings?.firstRunComplete &&
    !!settings.lastCompletedAt &&
    !settings.installHintDismissed &&
    !isStandalone();

  if (!ready || !settings) {
    return (
      <div className="app-shell">
        <div className="session-stage">
          <p className="serif" style={{ textAlign: 'center' }}>
            {copy.appName}
          </p>
        </div>
      </div>
    );
  }

  const sessionPlan = scene
    ? buildPlan({
        kind,
        mode,
        scene,
        hasWarmup: hasWarmup && kind === 'full',
      })
    : null;

  const nextEntry = scene ? entryById(index, nextSceneId(sequence, scene.id, index) || '') || null : null;

  return (
    <div className="app-shell">
      <div className="rotate-gate" role="dialog">
        {copy.rotate}
      </div>
      {route === 'first-run' && (
        <div className="app-main">
          <FirstRun
            onContinue={async (only) => {
              setListeningOnly(only);
              const next = await saveSettings({ firstRunComplete: true, micAllowed: !only });
              setSettings(next);
              const first = sequence.days.find((d) => d.mode === 'diagnostic') || sequence.days[0] || todaySession;
              if (first?.mode === 'diagnostic') await openDiagnostic(first);
              else if (first?.sceneId) await openSession(first.sceneId, 'first-run', true, first);
            }}
          />
        </div>
      )}
      {route === 'session' && kind === 'diagnostic' && diagListens.length > 0 && (
        <DiagnosticScreen
          scenes={diagListens}
          speak={diagSpeak}
          speed={settings.speed}
          onSpeed={(s: Speed) => {
            void saveSettings({ speed: s }).then(setSettings);
          }}
          listeningOnly={listeningOnly}
          nextTitleZh={
            (() => {
              const n = todaySession ? nextSequenceSession(sequence, todaySession) : undefined;
              const e = n
                ? entryById(index, n.sceneId) || entryById(index, n.sceneIds?.[0] || '')
                : nextEntry;
              return shortSceneTitleZh(e?.titleZh || n?.titleZh || nextEntry?.titleZh, '下一场');
            })()
          }
          initial={diagResume}
          onProgressScene={reportDiagScene}
          onMicAllowed={allowMic}
          onExit={() => {
            void refreshLocal();
            go('today');
          }}
          onFinished={(result) => {
            void finishSession(diagListens[0]?.id || 'diag-listen-120', 'diagnostic', result);
          }}
        />
      )}
      {route === 'session' && kind !== 'diagnostic' && scene && sessionPlan && (
        <SessionScreen
          scene={scene}
          kind={kind}
          mode={mode}
          plan={sessionPlan}
          speed={settings.speed}
          onSpeed={(s: Speed) => {
            void saveSettings({ speed: s }).then(setSettings);
          }}
          listeningOnly={listeningOnly}
          onMicAllowed={allowMic}
          onExit={() => {
            void refreshLocal();
            go('today');
          }}
          onFinished={() => {
            void finishSession(scene.id, kind);
          }}
          nextEntry={
            (seqSession &&
              (() => {
                const n = nextSequenceSession(sequence, seqSession);
                if (!n) return nextEntry;
                const e = entryById(index, n.sceneId) || entryById(index, n.sceneIds?.[0] || '');
                return e
                  ? { ...e, titleZh: shortSceneTitleZh(e.titleZh || n.titleZh, e.titleZh || n.titleZh || '') }
                  : nextEntry;
              })()) ||
            nextEntry
          }
          troubles={troubles}
          forceFresh={fresh}
          warmupClip={warmupClip}
        />
      )}
      {route !== 'session' && route !== 'first-run' && (
        <>
          <div className="app-main has-tabs">
            {route === 'today' && (
              <Today
                entry={todayEntry}
                fullResume={resumes.full}
                microResume={resumes.micro}
                reviewResume={resumes.review}
                diagnosticResume={resumes.diagnostic}
                fullResumeTitle={resumes.full ? entryById(index, resumes.full.sceneId)?.titleZh : undefined}
                settings={settings}
                troubles={troubles}
                isDiagnostic={todaySession?.mode === 'diagnostic'}
                microSceneId={todayEntry ? pickMicroScene(index, states, todayEntry.id) : undefined}
                reviewSceneId={troubles[0]?.sceneId}
                onStart={(k, id, opts) => {
                  const sid = id || todayEntry!.id;
                  if (k === 'diagnostic' || (k === 'full' && todaySession?.mode === 'diagnostic' && (todaySession.sceneId === sid || todaySession.sceneIds?.includes(sid)))) {
                    if (todaySession) void openDiagnostic(todaySession);
                    return;
                  }
                  if (k === 'full') {
                    const mid = isActiveResume(resumes.full) ? resumes.full : null;
                    if (mid && mid.sceneId === sid && !opts?.fresh) {
                      void openSession(sid, 'full', false, todaySession);
                      return;
                    }
                    const sess = todaySession && (todaySession.sceneId === sid || todaySession.sceneIds?.includes(sid)) ? todaySession : sessionForScene(sequence, sid);
                    requestStartFull(sid, sess, !!opts?.fresh || !(mid && mid.sceneId === sid));
                    return;
                  }
                  const midKind = k === 'micro' ? resumes.micro : resumes.review;
                  const same = midKind && midKind.sceneId === sid;
                  void openSession(sid, k, !same);
                }}
                onChoose={() => go('scenes')}
                onInstall={() => go('install')}
                showInstall={showInstallHint}
              />
            )}
            {route === 'scenes' && (
              <Scenes
                index={index}
                states={states}
                onOpen={(id) => {
                  const mid = isActiveResume(resumes.full) ? resumes.full : null;
                  requestStartFull(id, sessionForScene(sequence, id), !(mid && mid.sceneId === id));
                }}
              />
            )}
            {route === 'progress' && (
              <Progress
                index={index}
                settings={settings}
                states={states}
                onOpenScene={(id) => requestStartFull(id, sessionForScene(sequence, id), false)}
              />
            )}
            {route === 'settings' && (
              <SettingsScreen
                settings={settings}
                onSettings={(s) => {
                  setSettings(s);
                  setListeningOnly(s.micAllowed === false);
                }}
                onInstall={() => go('install')}
                onImported={() => void refreshLocal()}
              />
            )}
            {route === 'install' && (
              <InstallGuide
                onBack={() => go('settings')}
                onDismiss={() => {
                  void saveSettings({ installHintDismissed: true }).then(setSettings);
                  go('today');
                }}
              />
            )}
          </div>
          {route !== 'install' ? (
            <TabBar current={route} onChange={(id) => go(id)} />
          ) : null}
        </>
      )}
      {pendingFull ? (
        <ConfirmSheet
          title={copy.replaceFull}
          leaveLabel={copy.replaceFullGo}
          stayLabel={copy.replaceFullStay}
          onStay={() => setPendingFull(null)}
          onLeave={() => {
            const p = pendingFull;
            setPendingFull(null);
            void openSession(p.sceneId, 'full', true, p.sess);
          }}
        />
      ) : null}
    </div>
  );
}

