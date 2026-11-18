export type Speed = 0.85 | 1 | 1.1;
export type ThemePref = 'auto' | 'light' | 'dark';
export type SessionKind = 'full' | 'micro' | 'review' | 'first-run' | 'diagnostic';
export type SequenceMode =
  | 'roleplay'
  | 'fluency'
  | 'tv-shadow'
  | 'easy-listen'
  | 'dictogloss'
  | 'diagnostic';
export type LifeArea =
  | 'everyday'
  | 'travel'
  | 'work'
  | 'shows'
  | 'listens'
  | 'interviews';
export type LayerId =
  | 'opening'
  | 'warmup'
  | 'cold-listen'
  | 'gist'
  | 'line-work'
  | 'chunks'
  | 'speak-scene'
  | 'mode-extra'
  | 'recap';

export interface Speaker {
  id: string;
  name: string;
  gender?: string;
  voiceId?: string;
}

export interface SceneLine {
  id: string;
  speaker: string;
  text: string;
  spoken: string;
  meaningZh?: string;
  audio?: string;
  durationMs?: number;
  asHeard?: string;
}

export interface Prompt {
  id: string;
  askZh: string;
  askEn: string;
  accept: string[];
}

export interface Glue {
  id: string;
  lineId: string;
  span: string;
  hear: string;
  noteZh: string;
  standard: string;
}

export interface Chunk {
  id: string;
  form: string;
  meaningZh: string;
  fromLineId: string;
  sayAfter: string;
  audio?: string;
  durationMs?: number;
  afterAudio?: string;
  afterDurationMs?: number;
}

export interface Roleplay {
  setupZh: string;
  aiRole: string;
  variants: string[];
  mustUse: string[];
  starters: string[];
}

export interface Scene {
  id: string;
  packId?: string;
  dayInPack?: number;
  title: string;
  titleZh: string;
  setting: string;
  situationZh?: string;
  speakers: Speaker[];
  register: 'daily' | 'tv' | 'podcast' | 'work' | 'travel';
  lifeArea: LifeArea;
  skillNode?: string;
  targetWpm: number;
  slowerWpm: number;
  durationSec: number;
  estimatedMinutes: number;
  newItems: string[];
  lines: SceneLine[];
  gist: Prompt[];
  details: Prompt[];
  glue: Glue[];
  chunks: Chunk[];
  roleplay: Roleplay;
  fluency: { promptZh: string; promptEn: string };
  warmupLineIds: string[];
  audioFull?: string;
  audioFullDurationMs?: number;
  official?: boolean;
}

export interface CatalogEntry {
  id: string;
  title: string;
  titleZh: string;
  situationZh: string;
  setting: string;
  lifeArea: LifeArea;
  register: Scene['register'];
  packId: string | null;
  dayInPack: number | null;
  estimatedMinutes: number;
  targetWpm: number;
  slowerWpm: number;
  durationSec: number;
  official?: boolean;
}

export interface SequenceDay {
  day: number;
  sceneId: string;
  sceneIds?: string[];
  mode: SequenceMode;
  titleZh?: string;
  titleEn?: string;
  packId?: string;
  warmupFrom?: string;
  note?: string;
}

export interface Sequence {
  firstRunSceneId: string | null;
  titleZh?: string;
  days: SequenceDay[];
}

export interface Pack {
  id: string;
  titleZh: string;
  titleEn?: string;
  weekThemeZh?: string;
  register?: string;
  sceneIds: string[];
  official?: boolean;
}

export interface SkillNode {
  id: string;
  titleZh: string;
  titleEn?: string;
  phase?: string;
  weeks?: string;
  packs?: string[];
  passZh?: string;
  pass?: string;
  children?: string[];
  sketched?: boolean;
}

export interface SkillTree {
  version?: number;
  introZh: string;
  introEn?: string;
  nodes: SkillNode[];
  edges?: { from: string; to: string }[];
}

export interface AudioCues {
  sceneId: string;
  full?: { file: string; durationMs: number; gapMs?: number };
  lines: Record<
    string,
    {
      file: string;
      durationMs: number;
      fullStartMs?: number;
      voice?: string;
      speaker?: string;
    }
  >;
  chunks?: Record<
    string,
    {
      file?: string;
      durationMs?: number;
      afterFile?: string;
      afterDurationMs?: number;
      voice?: string;
    }
  >;
}

export interface SessionMetrics {
  gistHits: number;
  gistTotal: number;
  detailHits: number;
  detailTotal: number;
  gistAnswers: Record<string, { text: string; hit: boolean }>;
  reveals: Record<string, number>;
  firstListenByLine: Record<string, boolean>;
  replays: Record<string, number>;
  chunksUsed: string[];
  chunkTakes: Record<string, number>;
  ttfwMs: number[];
  startedAt: number;
  completedAt?: number;
  listeningOnly: boolean;
}

export interface ResumeState {
  sceneId: string;
  kind: SessionKind;
  mode: SequenceMode;
  layer: LayerId;
  stepIndex: number;
  revealLevel: 0 | 1 | 2;
  startedAt: number;
  updatedAt: number;
  metrics: SessionMetrics;
}

export type DiagnosticSub = 'intro' | 'cold' | 'gist' | 'prep' | 'talk' | 'recap';

export interface DiagnosticProgress {
  kind: 'diagnostic';
  stage: number;
  sub: DiagnosticSub;
  promptI: number;
  answer: string;
  hits: boolean[][];
  replayUsed: boolean;
  heard?: boolean;
  ttfwMs?: number;
  comfortableWpm?: number;
  speed?: Speed;
  speedChosen?: boolean;
  prepLeft?: number;
  startedAt: number;
  updatedAt: number;
}

export type StoredResume = ResumeState | DiagnosticProgress;

export type ResumeMap = {
  full?: ResumeState;
  micro?: ResumeState;
  review?: ResumeState;
  diagnostic?: DiagnosticProgress;
  'first-run'?: ResumeState;
};

export interface SessionPlan {
  kind: SessionKind;
  mode: SequenceMode;
  sceneId: string;
  layers: LayerId[];
  skippable: LayerId[];
}

export interface Settings {
  uiLanguage: 'zh' | 'en';
  speed: Speed;
  theme: ThemePref;
  installHintDismissed: boolean;
  firstRunComplete: boolean;
  micAllowed: boolean | null;
  persistAsked: boolean;
  lastSceneId?: string;
  lastCompletedAt?: number;
  lastOpenedAt?: number;
  lastSequenceSession?: number;
  diagComplete?: boolean;
  comfortableWpm?: number;
}

export interface LineEvent {
  id?: number;
  sceneId: string;
  lineId: string;
  firstListenCaught?: boolean;
  revealCount?: number;
  replays?: number;
  saidWithoutText?: boolean;
  recordingId?: string;
  asrTranscript?: string;
  ttfwMs?: number;
  at: number;
}

export interface SceneRollup {
  sceneId: string;
  startedAt?: number;
  completedAt?: number;
  firstListenCatch?: boolean;
  revealRate?: number;
  lastKind?: SessionKind;
  mark: 'not-started' | 'in-progress' | 'ear-catching' | 'can-say';
  unusedChunkIds?: string[];
  chunkForms?: Record<string, string>;
}

export interface RecapModel {
  gistLine: string;
  revealLine: string;
  chunkLine: string;
  ttfwLine: string | null;
  cutLine?: string | null;
  nextSceneTitleZh: string;
  nextSceneId: string | null;
  close: string;
}

export interface TroubleItem {
  kind: 'glue' | 'chunk' | 'ttfw' | 'dry';
  sceneId: string;
  lineId?: string;
  chunkId?: string;
  reason: string;
}
