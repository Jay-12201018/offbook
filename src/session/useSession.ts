import { useCallback, useEffect, useRef, useState } from 'react';
import { clearResume, saveResume, getResume, putLineEvent, putSceneState, addSession, saveSettings } from '@/lib/db.ts';
import { defaultResume, effectiveLayers, nextLayer } from '@/session/engine.ts';
import type {
  LayerId,
  ResumeState,
  SequenceMode,
  SessionKind,
  SessionMetrics,
  SessionPlan,
  Scene,
} from '@/session/types.ts';

export function useSession(opts: {
  scene: Scene;
  kind: SessionKind;
  mode: SequenceMode;
  plan: SessionPlan;
  listeningOnly: boolean;
  forceFresh?: boolean;
}) {
  const { scene, kind, mode, plan, listeningOnly, forceFresh } = opts;
  const [state, setState] = useState<ResumeState | null>(null);
  const stateRef = useRef<ResumeState | null>(null);
  stateRef.current = state;

  useEffect(() => {
    let cancel = false;
    (async () => {
      const existing = forceFresh ? null : await getResume(kind);
      const resume =
        existing && existing.sceneId === scene.id && existing.kind === kind
          ? existing
          : defaultResume(scene.id, kind, mode, listeningOnly);
      if (!cancel) setState(resume);
    })();
    return () => {
      cancel = true;
    };
  }, [scene.id, kind, mode, listeningOnly, forceFresh]);

  const persist = useCallback((next: ResumeState | null) => {
    if (!next) {
      void clearResume(kind);
      return;
    }
    void saveResume(next);
  }, [kind]);

  useEffect(() => {
    const flush = () => {
      if (stateRef.current) void saveResume(stateRef.current);
    };
    const onVis = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVis);
      flush();
    };
  }, []);

  const patch = useCallback(
    (fn: (s: ResumeState) => ResumeState) => {
      setState((prev) => {
        if (!prev) return prev;
        const next = fn(prev);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const goLayer = useCallback(
    (layer: LayerId, step = 0) => {
      patch((s) => ({ ...s, layer, stepIndex: step, revealLevel: 0 }));
    },
    [patch],
  );

  const advance = useCallback(() => {
    patch((s) => {
      const nxt = nextLayer(plan, s.layer, s.startedAt);
      if (!nxt) return s;
      return { ...s, layer: nxt, stepIndex: 0, revealLevel: 0 };
    });
  }, [patch, plan]);

  const complete = useCallback(
    async (metrics: SessionMetrics) => {
      const done = { ...metrics, completedAt: Date.now() };
      const lineCount = scene.lines.length || 1;
      const revealed = Object.values(done.reveals).filter((n) => n > 0).length;
      await addSession({
        sceneId: scene.id,
        kind,
        mode,
        startedAt: done.startedAt,
        completedAt: done.completedAt,
        metrics: done,
      });
      const unused = scene.chunks.filter((c) => !done.chunksUsed.includes(c.id));
      await putSceneState({
        sceneId: scene.id,
        startedAt: done.startedAt,
        completedAt: done.completedAt,
        firstListenCatch: done.gistHits > 0,
        revealRate: revealed / lineCount,
        lastKind: kind,
        mark:
          done.chunksUsed.length >= 2 && done.gistHits >= Math.max(1, done.gistTotal - 1)
            ? 'can-say'
            : done.gistHits > 0
              ? 'ear-catching'
              : 'in-progress',
        unusedChunkIds: unused.map((c) => c.id),
        chunkForms: Object.fromEntries(scene.chunks.map((c) => [c.id, c.form])),
      });
      await saveSettings({ lastSceneId: scene.id, lastCompletedAt: done.completedAt });
      await clearResume(kind);
      return done;
    },
    [scene, kind, mode],
  );

  const logLine = useCallback(
    (lineId: string, extra: Parameters<typeof putLineEvent>[0] extends infer T ? Omit<T, 'sceneId' | 'lineId' | 'at'> : never) => {
      void putLineEvent({
        sceneId: scene.id,
        lineId,
        at: Date.now(),
        ...extra,
      });
    },
    [scene.id],
  );

  return {
    state,
    setState,
    patch,
    goLayer,
    advance,
    complete,
    logLine,
    layers: state ? effectiveLayers(plan, state.startedAt) : plan.layers,
  };
}
