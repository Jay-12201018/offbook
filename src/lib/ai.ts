/**
 * DeepSeek client (OpenAI-compatible Chat Completions), called directly from
 * the browser with the user's own key. api.deepseek.com answers CORS
 * preflights for any origin, so no proxy is needed. The key is read from
 * IndexedDB per request and only ever sent to DEEPSEEK_BASE.
 */
import type { Scene } from './content.ts';
import { NAMES } from './content.ts';
import type { EpisodeMeta } from '@/content/season1.ts';
import type { Pace } from './store.ts';

export const DEEPSEEK_BASE = 'https://api.deepseek.com';

export const MODELS = [
  { id: 'deepseek-flash', label: 'deepseek-flash（推荐，快又便宜）' },
  { id: 'deepseek-v4-pro', label: 'deepseek-v4-pro（更强，更慢更贵）' },
];

export type Msg = { role: 'system' | 'user' | 'assistant'; content: string };

export type AiErrorCode = 'auth' | 'balance' | 'rate' | 'network' | 'server' | 'model' | 'aborted' | 'bad';
export class AiError extends Error {
  code: AiErrorCode;
  constructor(code: AiErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

function zhError(status: number, body: string): AiError {
  if (status === 401) return new AiError('auth', '密钥不对：DeepSeek 拒绝了这个 API Key。');
  if (status === 402) return new AiError('balance', 'DeepSeek 账户余额不足，请先充值。');
  if (status === 429) return new AiError('rate', '请求太频繁了，等几秒再试。');
  if (status === 400 && /model/i.test(body)) return new AiError('model', '这个模型名 DeepSeek 不认识，换一个试试。');
  if (status === 422 || status === 400) return new AiError('bad', 'DeepSeek 不接受这次请求（参数错误）。');
  return new AiError('server', `DeepSeek 暂时出错了（${status}），稍后再试。`);
}

async function post(key: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new AiError('aborted', '已取消');
    throw new AiError('network', '连不上 DeepSeek，检查一下网络。');
  }
  if (!res.ok) throw zhError(res.status, await res.text().catch(() => ''));
  return res;
}

function baseBody(model: string, messages: Msg[], extra: Record<string, unknown> = {}) {
  return {
    model,
    messages,
    // Calls need low latency: turn off thinking mode (on by default for V4).
    thinking: { type: 'disabled' },
    temperature: 0.8,
    ...extra,
  };
}

/** Streaming completion. Calls onDelta with each text piece; resolves full text. */
export async function chatStream(
  key: string,
  model: string,
  messages: Msg[],
  onDelta: (t: string) => void,
  opts: { signal?: AbortSignal; maxTokens?: number } = {},
): Promise<string> {
  const res = await post(key, baseBody(model, messages, { stream: true, max_tokens: opts.maxTokens ?? 120 }), opts.signal);
  const reader = res.body?.getReader();
  if (!reader) {
    const j = await res.json();
    const t = j.choices?.[0]?.message?.content ?? '';
    onDelta(t);
    return t;
  }
  const dec = new TextDecoder();
  let buf = '';
  let full = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') return full;
        try {
          const j = JSON.parse(data);
          const d = j.choices?.[0]?.delta?.content;
          if (d) { full += d; onDelta(d); }
        } catch { /* partial / keep-alive */ }
      }
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new AiError('aborted', '已取消');
    throw new AiError('network', '连接中断了。');
  }
  return full;
}

export async function chatJson<T>(key: string, model: string, messages: Msg[], opts: { signal?: AbortSignal; maxTokens?: number } = {}): Promise<T> {
  const res = await post(key, baseBody(model, messages, {
    response_format: { type: 'json_object' },
    max_tokens: opts.maxTokens ?? 500,
    temperature: 0.5,
  }), opts.signal);
  const j = await res.json();
  const text: string = j.choices?.[0]?.message?.content ?? '';
  try {
    return JSON.parse(text.replace(/^```(json)?|```$/g, '').trim()) as T;
  } catch {
    throw new AiError('bad', 'AI 返回的格式不对，再试一次。');
  }
}

export async function chatText(key: string, model: string, messages: Msg[], opts: { signal?: AbortSignal; maxTokens?: number } = {}): Promise<string> {
  const res = await post(key, baseBody(model, messages, { max_tokens: opts.maxTokens ?? 200, temperature: 0.5 }), opts.signal);
  const j = await res.json();
  return (j.choices?.[0]?.message?.content ?? '').trim();
}

/** Verify key with GET /models (free), then a 1-token completion on the chosen model. */
export async function testConnection(key: string, model: string): Promise<{ ok: true; models: string[] } | { ok: false; message: string }> {
  if (!key.trim()) return { ok: false, message: '先填上 API Key。' };
  if (!/^[\x21-\x7e]+$/.test(key.trim())) return { ok: false, message: '密钥里有空格或中文字符，复制时可能多带了东西。' };
  let models: string[] = [];
  try {
    const r = await fetch(`${DEEPSEEK_BASE}/models`, { headers: { Authorization: `Bearer ${key.trim()}` } });
    if (!r.ok) return { ok: false, message: zhError(r.status, await r.text().catch(() => '')).message };
    const j = await r.json();
    models = (j.data ?? []).map((m: { id: string }) => m.id);
  } catch {
    return { ok: false, message: '连不上 DeepSeek，检查一下网络。' };
  }
  try {
    await post(key.trim(), baseBody(model, [{ role: 'user', content: 'Say OK.' }], { max_tokens: 3 }));
  } catch (e) {
    return { ok: false, message: (e as AiError).message };
  }
  return { ok: true, models };
}

/* ---------------- prompts ---------------- */

const LEVEL: Record<Pace, string> = {
  slow: 'The learner is a lower-intermediate listener. Use short, clear sentences (max 12 words), very common words, few idioms.',
  ok: 'The learner is intermediate. Sound natural but clear: max 18 words per reply, common contractions are fine.',
  fast: 'The learner is upper-intermediate. Talk at natural speed with normal reductions (gonna, wanna, kinda); max 25 words per reply.',
};

export function roleplaySystem(scene: Scene, ep: EpisodeMeta, partner: string, pace: Pace, maxTurns: number): string {
  const name = NAMES[partner] ?? 'Maya';
  const others = scene.speakers.filter((s) => s.id !== partner).map((s) => s.name);
  return [
    `You are ${name} in a short spoken roleplay that helps a Chinese adult practice everyday American English. The learner talks to you through speech recognition.`,
    `Scene: ${scene.setting} (Shown to the learner as: ${ep.call.sceneZh})`,
    `Your character: ${scene.roleplay.aiRole}`,
    `The learner's brief (in Chinese): ${scene.roleplay.setupZh} The learner plays the friend opposite you${others.length ? ` (in the original episode that was ${others.join(' / ')})` : ''}; address the learner as "you", don't use a name for them.`,
    `Optional twist, use at most one and only if the talk stalls: ${scene.roleplay.variants.join(' | ')}`,
    `Phrases the learner just practiced: ${scene.chunks.map((c) => c.form).join(' | ')}. Create natural openings for them, never ask the learner to use them.`,
    '',
    'Rules:',
    `- Speak only as ${name}. Casual, natural General American spoken English. 1-2 short sentences per reply. Use contractions.`,
    `- ${LEVEL[pace]}`,
    '- Output only the words you say out loud: no emojis, stage directions, asterisks, lists, markdown, translations or quotation marks.',
    '- Stay inside the scene. End most replies with something the learner can react to.',
    '- Never lecture or explain grammar. If the learner makes a mistake, recast it naturally inside your reply (learner: "I pay this one." you: "Oh, you\'ve got this one? You sure?").',
    '- If the learner uses Chinese or seems lost, make your next line simpler and offer an easy either/or choice.',
    '- The learner\'s words come from speech recognition and may be garbled. Guess the most likely meaning; only ask them to repeat if you truly cannot.',
    `- After about ${maxTurns} learner replies, wrap up the scene with one short friendly closing line and put the token [END] at the very end. Do not use [END] before the learner has replied at least ${Math.min(3, maxTurns)} times, unless they say goodbye.`,
  ].join('\n');
}

export function openingUser(): Msg {
  return { role: 'user', content: '[The scene starts now. Say your opening line to me.]' };
}

export function wrapUpNudge(): Msg {
  return { role: 'system', content: 'Time to wrap up: reply to the learner, then close the scene in the same message and end with [END].' };
}

export interface AiHint { zh: string; first: string; line: string }

export function hintMessages(history: Msg[], partner: string): Msg[] {
  const convo = history
    .filter((m) => m.role !== 'system' && !m.content.startsWith('[The scene'))
    .map((m) => `${m.role === 'assistant' ? NAMES[partner] ?? 'Partner' : 'Learner'}: ${m.content.replace(/\[END\]/g, '')}`)
    .join('\n');
  return [
    {
      role: 'system',
      content:
        'You coach a Chinese learner in a live English roleplay. Suggest ONE natural, short reply (max 12 words, everyday General American) the learner could say next. Respond as JSON: {"zh": "<what to express, in simplified Chinese, max 15 characters, like 告诉她这次你来付>", "first": "<the first 2-3 words of the reply, then …>", "line": "<the full reply>"}',
    },
    { role: 'user', content: convo || '(no conversation yet)' },
  ];
}

export interface AiRecap {
  pairs: { said: string; better: string; noteZh: string }[];
  phrases: { en: string; zh: string }[];
  praiseZh: string;
}

export function recapMessages(turns: { partner: string; user: string }[], partner: string): Msg[] {
  const convo = turns.map((t) => `${NAMES[partner] ?? 'Partner'}: ${t.partner}\nLearner: ${t.user || '(silent)'}`).join('\n');
  return [
    {
      role: 'system',
      content: [
        'You review a short English roleplay by a Chinese adult learner (transcribed by speech recognition, so ignore obvious recognition glitches and missing punctuation).',
        'Return JSON:',
        '{"pairs":[{"said":"<the learner\'s exact words>","better":"<a more natural thing a friendly American would say with the same meaning; keep it short and casual>","noteZh":"<why, in simplified Chinese, max 18 characters>"}],',
        ' "phrases":[{"en":"<useful phrase from this conversation>","zh":"<Chinese meaning, short>"}],',
        ' "praiseZh":"<one concrete, warm sentence in simplified Chinese about what the learner did well, max 25 characters>"}',
        'pairs: up to 3 of the learner\'s lines that gain the most from a better version (skip lines that are already natural; if all are natural, return the best one with a small polish). phrases: exactly 3, short (2-7 words), reusable in daily life.',
      ].join('\n'),
    },
    { role: 'user', content: convo },
  ];
}

export function explainMessages(line: string, sceneSetting: string): Msg[] {
  return [
    {
      role: 'system',
      content: '你是一位懂美式口语的中文老师。用简体中文简短解释这句台词（不超过 70 个字）：意思、语气，以及口语里怎么连读或缩读。不要用 markdown，不要分条。',
    },
    { role: 'user', content: `场景：${sceneSetting}\n台词：${line}` },
  ];
}
