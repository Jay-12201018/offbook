import type {
  DiagnosticProgress,
  LayerId,
  RecapModel,
  ResumeState,
  SequenceMode,
  SessionKind,
  SessionMetrics,
  SessionPlan,
  Scene,
  Speed,
  TroubleItem,
} from '@/session/types.ts';
import { formatTtfw } from '@/lib/vad.ts';

export function emptyMetrics(listeningOnly: boolean): SessionMetrics {
  return {
    gistHits: 0,
    gistTotal: 0,
    detailHits: 0,
    detailTotal: 0,
    gistAnswers: {},
    reveals: {},
    firstListenByLine: {},
    replays: {},
    chunksUsed: [],
    chunkTakes: {},
    ttfwMs: [],
    startedAt: Date.now(),
    listeningOnly,
  };
}

export function buildPlan(opts: {
  kind: SessionKind;
  mode: SequenceMode;
  scene: Scene;
  hasWarmup: boolean;
}): SessionPlan {
  const { kind, mode, scene, hasWarmup } = opts;
  if (kind === 'micro') {
    return {
      kind,
      mode: 'roleplay',
      sceneId: scene.id,
      layers: ['opening', 'cold-listen', 'gist', 'chunks', 'speak-scene', 'recap'],
      skippable: [],
    };
  }
  if (kind === 'review') {
    return {
      kind,
      mode: 'roleplay',
      sceneId: scene.id,
      layers: ['opening', 'line-work', 'chunks', 'speak-scene', 'recap'],
      skippable: [],
    };
  }
  if (kind === 'first-run') {
    return {
      kind,
      mode: 'roleplay',
      sceneId: scene.id,
      layers: ['cold-listen', 'gist', 'line-work', 'chunks', 'recap'],
      skippable: [],
    };
  }
  const layers: LayerId[] = ['opening'];
  if (hasWarmup) layers.push('warmup');
  layers.push('cold-listen', 'gist', 'line-work', 'chunks', 'speak-scene');
  // Mode extras after Speak the Scene. Fluency / 4-3-2 is skippable if time runs long.
  if (mode !== 'roleplay') layers.push('mode-extra');
  layers.push('recap');
  return {
    kind,
    mode,
    sceneId: scene.id,
    layers,
    // Only 4/3/2 (fluency) is cuttable when a full session runs long.
    skippable: mode === 'fluency' ? ['mode-extra'] : [],
  };
}

/** If a full session runs long, cut 4/3/2 (mode-extra) first. Never cut Speak the Scene or recap. */
export function shouldCutExtra(plan: SessionPlan, startedAt: number, now = Date.now()): boolean {
  if (plan.kind !== 'full') return false;
  if (!plan.skippable.includes('mode-extra')) return false;
  const elapsedMin = (now - startedAt) / 60000;
  return elapsedMin >= 20;
}

export function effectiveLayers(plan: SessionPlan, startedAt: number): LayerId[] {
  if (shouldCutExtra(plan, startedAt)) {
    return plan.layers.filter((l) => l !== 'mode-extra');
  }
  return plan.layers;
}

export function nextLayer(plan: SessionPlan, current: LayerId, startedAt: number): LayerId | null {
  const layers = effectiveLayers(plan, startedAt);
  const i = layers.indexOf(current);
  if (i < 0) return layers[0] ?? null;
  return layers[i + 1] ?? null;
}

export function layerLabel(id: LayerId): string {
  switch (id) {
    case 'opening':
      return '开场';
    case 'warmup':
      return '热热身';
    case 'cold-listen':
      return '先听';
    case 'gist':
      return '大意';
    case 'line-work':
      return '逐句';
    case 'chunks':
      return '语块';
    case 'speak-scene':
      return '你的回合';
    case 'mode-extra':
      return '加练';
    case 'recap':
      return '收束';
  }
}

export function buildRecap(
  scene: Scene,
  metrics: SessionMetrics,
  nextTitleZh: string,
  nextId: string | null,
  kind: SessionKind = 'full',
  cutExtra = false,
): RecapModel {
  const used = metrics.chunksUsed;
  const usedLabel =
    used.length === 0
      ? ''
      : used.length === 1
        ? `「${labelChunk(scene, used[0])}」`
        : `「${used.map((id) => labelChunk(scene, id)).join('」「')}」`;

  let ttfwLine: string | null = null;
  if (metrics.ttfwMs.length >= 1) {
    const last = metrics.ttfwMs[metrics.ttfwMs.length - 1];
    const first = metrics.ttfwMs[0];
    if (metrics.ttfwMs.length >= 2 && last + 200 < first) {
      ttfwLine = `你开口从 ${formatTtfw(first)} 变成了 ${formatTtfw(last)}。`;
    } else {
      ttfwLine = `这次开口大约在 ${formatTtfw(last)}。`;
    }
  }

  const cutLine = cutExtra ? '今天时长够了，限时说留到下次。' : null;

  if (kind === 'micro') {
    return {
      gistLine:
        metrics.gistHits > 0
          ? '这 8 分钟，大意你抓住了。'
          : '这 8 分钟，你把这场听过、说过一遍。',
      revealLine: '',
      chunkLine: usedLabel ? `留下了${usedLabel}。` : '',
      ttfwLine,
      cutLine,
      nextSceneTitleZh: nextTitleZh,
      nextSceneId: nextId,
      close: '这就够了。',
    };
  }
  if (kind === 'review') {
    return {
      gistLine: '今天只练了你卡住的地方。',
      revealLine: '',
      chunkLine: usedLabel ? `又拿起了${usedLabel}。` : '卡住的说法，下次再碰也会熟一点。',
      ttfwLine,
      cutLine,
      nextSceneTitleZh: nextTitleZh,
      nextSceneId: nextId,
      close: '这就够了。',
    };
  }

  const gistLine =
    metrics.gistTotal === 0
      ? '今天你把这场戏听完了。'
      : metrics.gistHits >= metrics.gistTotal
        ? '第一遍你抓住了这场对话的大意。'
        : metrics.gistHits > 0
          ? '第一遍你抓住了一部分大意，细节可以下次再稳。'
          : '第一遍大意还没抓住。这不是退步——你开始听见以前滑过去的声音了。';

  const lineCount = scene.lines.length || 1;
  const revealed = Object.values(metrics.reveals).filter((n) => n > 0).length;
  const revealLine =
    kind === 'first-run'
      ? revealed === 0
        ? '逐句的时候你没有急着看英文。'
        : `逐句的时候有 ${revealed} 句你看了英文。`
      : revealed === 0
        ? `逐句的时候，${lineCount} 句里你都没有急着看英文。`
        : `逐句的时候，${lineCount} 句里有 ${revealed} 句你看了英文。`;

  const chunkLine =
    used.length === 0
      ? '今天的语块可以下次再拿出来用。'
      : `你用了${usedLabel}。`;

  return {
    gistLine,
    revealLine,
    chunkLine,
    ttfwLine,
    cutLine,
    nextSceneTitleZh: nextTitleZh,
    nextSceneId: nextId,
    close: '这就够了。',
  };
}

function labelChunk(scene: Scene, id: string): string {
  return scene.chunks.find((c) => c.id === id)?.form.replace(/…/g, '').trim() || id;
}

export function daysSince(ts?: number | null): number | null {
  if (!ts) return null;
  return Math.floor((Date.now() - ts) / 86400000);
}

export function inferTroubles(opts: {
  events: { sceneId: string; lineId: string; revealCount?: number; ttfwMs?: number }[];
  unusedChunkIds: { sceneId: string; chunkId: string; form: string }[];
}): TroubleItem[] {
  const items: TroubleItem[] = [];
  const revealCount: Record<string, number> = {};
  const ttfw: Record<string, number[]> = {};
  for (const ev of opts.events) {
    const k = `${ev.sceneId}:${ev.lineId}`;
    revealCount[k] = (revealCount[k] || 0) + (ev.revealCount || 0);
    if (ev.ttfwMs != null) {
      (ttfw[k] ||= []).push(ev.ttfwMs);
    }
  }
  for (const [k, n] of Object.entries(revealCount)) {
    if (n >= 2) {
      const [sceneId, lineId] = k.split(':');
      items.push({ kind: 'glue', sceneId, lineId, reason: 'needed-text' });
    }
  }
  for (const [k, arr] of Object.entries(ttfw)) {
    const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
    if (avg >= 3000) {
      const [sceneId, lineId] = k.split(':');
      items.push({ kind: 'ttfw', sceneId, lineId, reason: 'slow-start' });
    }
  }
  for (const c of opts.unusedChunkIds) {
    items.push({ kind: 'chunk', sceneId: c.sceneId, chunkId: c.chunkId, reason: 'unused' });
  }
  return items.slice(0, 12);
}

export function defaultResume(
  sceneId: string,
  kind: SessionKind,
  mode: SequenceMode,
  listeningOnly: boolean,
): ResumeState {
  return {
    sceneId,
    kind,
    mode,
    layer: kind === 'first-run' ? 'cold-listen' : 'opening',
    stepIndex: 0,
    revealLevel: 0,
    startedAt: Date.now(),
    updatedAt: Date.now(),
    metrics: emptyMetrics(listeningOnly),
  };
}

export function isDiagnosticProgress(v: unknown): v is DiagnosticProgress {
  return !!v && typeof v === 'object' && (v as { kind?: string }).kind === 'diagnostic' && 'sub' in (v as object);
}

export function isActiveResume(r?: ResumeState | null): boolean {
  return !!r;
}

/** Honest, small mapping: 120-ish stays a bit slower; 150+ stays at natural speed. Never auto-speed-up. */
export function speedFromComfortableWpm(wpm: number): Speed {
  if (wpm > 0 && wpm <= 130) return 0.85;
  return 1;
}

export function comfortableWpmNote(wpm: number): string {
  if (wpm > 0 && wpm <= 130) return '按你定位的耳朵，先从稍慢开始。';
  return '按你定位的耳朵，用自然速度开始。';
}
