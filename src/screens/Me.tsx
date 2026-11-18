import { useEffect, useRef, useState } from 'react';
import { useApp, weekCount } from '@/lib/appState.tsx';
import { EPISODES } from '@/content/season1.ts';
import { Icon } from '@/components/Icon.tsx';
import { toast } from '@/components/Toast.tsx';
import { MODELS, preferredModel, testConnection } from '@/lib/ai.ts';
import { clearDebug, debugEnabled, debugEvents, envSummary, fmtEvent, setDebugEnabled, subscribeDebug } from '@/lib/debug.ts';
import { allCalls, exportBackup, getApiKey, importBackup, resetAll, setApiKey, type Pace } from '@/lib/store.ts';
import { englishVoices, pickVoice, speak, waitVoices } from '@/lib/tts.ts';
import { isIos, isStandalone } from '@/lib/install.ts';
import { publicUrl } from '@/lib/publicUrl.ts';

export function Me() {
  const { settings, update, progress, phraseCount, days, refresh } = useApp();
  const [speakSecs, setSpeakSecs] = useState(0);
  const [calls, setCalls] = useState(0);
  useEffect(() => {
    void allCalls().then((c) => { setCalls(c.length); setSpeakSecs(Math.round(c.reduce((s, x) => s + (x.speakMs || 0), 0) / 1000)); });
  }, []);
  const done = EPISODES.filter((e) => progress[e.id]?.done).length;

  return (
    <div className="page me">
      <header className="page__head"><h1 className="title-lg">我</h1></header>

      <div className="stat-grid">
        <div className="stat-tile"><b>{done}<small>/7</small></b><span>完成集数</span></div>
        <div className="stat-tile"><b>{phraseCount}</b><span>会说的句子</span></div>
        <div className="stat-tile"><b>{weekCount(days)}</b><span>本周练了几天</span></div>
        <div className="stat-tile"><b>{speakSecs === 0 ? "—" : speakSecs >= 60 ? `${Math.floor(speakSecs / 60)}分` : `${speakSecs}秒`}</b><span>{calls} 通电话开口</span></div>
      </div>

      <AiSection />

      <section className="group">
        <h2 className="group__title">练习</h2>
        <div className="group__row">
          <span>语速</span>
          <div className="seg">
            {(['slow', 'ok', 'fast'] as Pace[]).map((p) => (
              <button key={p} className={settings.pace === p ? 'is-on' : ''} onClick={() => void update({ pace: p })}>
                {p === 'slow' ? '偏慢' : p === 'ok' ? '正好' : '偏快'}
              </button>
            ))}
          </div>
        </div>
        <label className="group__row">
          <span>看剧时默认显示英文</span>
          <input type="checkbox" className="switch" checked={settings.showEnglish} onChange={(e) => void update({ showEnglish: e.target.checked })} />
        </label>
        <VoicePicker />
      </section>

      <DataSection onChanged={refresh} />

      <section className="group">
        <h2 className="group__title">装到主屏幕</h2>
        <p className="group__text">
          {isStandalone() ? '已经从主屏幕打开，很好。' : isIos() ? 'Safari 底部点「分享」→「添加到主屏幕」，之后从图标打开。' : 'Chrome 菜单 →「添加到主屏幕」或「安装应用」。'}
        </p>
      </section>

      <section className="group">
        <h2 className="group__title">关于</h2>
        <p className="group__text">脱稿 Offbook 2.0 · 第一季第 1–7 集。全部对白为原创。没有账号，进度只存在这台设备。</p>
        <Licenses />
      </section>

      <DebugSection />
    </div>
  );
}

function AiSection() {
  const { settings, update, hasKey, refresh } = useApp();
  const [key, setKey] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string; detail?: string } | null>(null);
  const options = settings.aiModels.length ? settings.aiModels : MODELS.map((m) => m.id);
  const custom = !options.includes(settings.aiModel);
  const [customModel, setCustomModel] = useState(custom ? settings.aiModel : '');
  const labelOf = (id: string) => MODELS.find((m) => m.id === id)?.label ?? id;

  useEffect(() => { void getApiKey().then(setKey); }, []);

  async function save() {
    const k = key.trim();
    await setApiKey(k);
    const back = await getApiKey();
    await refresh();
    toast(k ? (back === k ? '密钥已保存在这台设备' : '保存失败：存储不可用') : '已清除');
  }

  async function test() {
    setBusy(true);
    setResult(null);
    const r = await testConnection(key.trim(), settings.aiModel);
    setBusy(false);
    if (r.models?.length) {
      // Populate the dropdown from the live list; keep current model if it exists there.
      const keep = r.models.includes(settings.aiModel) ? settings.aiModel : preferredModel(r.models) ?? settings.aiModel;
      await update({ aiModels: r.models, aiModel: keep });
    }
    if (r.ok) {
      await setApiKey(key.trim());
      await update({ aiModel: r.usedModel });
      await refresh();
      setResult({
        ok: true,
        msg: '连上了，通话会用 AI 实时对话。',
        detail: `模型 ${r.model}${r.tokens ? ` · 用了 ${r.tokens} tokens` : ''}\nAI 回复：“${r.reply}”`,
      });
    } else setResult({ ok: false, msg: r.message });
  }

  async function clear() {
    setKey('');
    setResult(null);
    await setApiKey('');
    await refresh();
    toast('密钥已从这台设备删除');
  }

  return (
    <section className="group group--ai" id="ai">
      <div className="group__title-row">
        <h2 className="group__title"><Icon name="spark" size={18} /> AI 对话</h2>
        <span className={`pill ${hasKey ? 'pill--ok' : 'pill--soft'}`}>{hasKey ? '已保存密钥' : '未设置'}</span>
      </div>
      <p className="group__text">填上你自己的 DeepSeek API Key，通话里的 Maya、Chris 就由 AI 实时扮演，提示和小结也由 AI 生成。不填也能用剧本通话。</p>

      <label className="field">
        <span className="field__label">DeepSeek API Key</span>
        <div className="field__input">
          <Icon name="key" size={18} />
          <input
            type={show ? 'text' : 'password'}
            value={key}
            onChange={(e) => { setKey(e.target.value); setResult(null); }}
            placeholder="sk-..."
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            name="deepseek-key"
            inputMode="text"
            aria-label="DeepSeek API Key"
          />
          <button type="button" className="icon-btn icon-btn--faint" onClick={() => setShow((v) => !v)} aria-label={show ? '隐藏密钥' : '显示密钥'}>
            <Icon name={show ? 'eyeOff' : 'eye'} size={18} />
          </button>
        </div>
      </label>

      <label className="field">
        <span className="field__label">模型{settings.aiModels.length ? '（来自你账户的模型列表）' : '（点「测试连接」后会读取你账户可用的模型）'}</span>
        <select
          className="select"
          value={custom ? '__custom' : settings.aiModel}
          onChange={(e) => {
            const v = e.target.value;
            if (v === '__custom') void update({ aiModel: customModel || settings.aiModel });
            else { setCustomModel(''); void update({ aiModel: v }); }
            setResult(null);
          }}
        >
          {options.map((id) => <option key={id} value={id}>{labelOf(id)}</option>)}
          <option value="__custom">其他（自己填）</option>
        </select>
        {custom && (
          <input
            className="text-input"
            value={customModel}
            onChange={(e) => setCustomModel(e.target.value)}
            onBlur={() => customModel.trim() && void update({ aiModel: customModel.trim() })}
            placeholder="模型名"
            autoCapitalize="off"
            spellCheck={false}
          />
        )}
      </label>

      <div className="row gap wrap">
        <button className="btn btn--primary" onClick={() => void test()} disabled={busy || !key.trim()}>{busy ? '测试中…' : '测试连接'}</button>
        <button className="btn btn--soft" onClick={() => void save()} disabled={busy}>保存</button>
        <button className="btn btn--ghost" onClick={() => void clear()} disabled={busy || (!key && !hasKey)}>清除</button>
      </div>
      {result && (
        <div className={`test-result ${result.ok ? 'is-ok' : 'is-err'}`} role="status">
          <b>{result.ok ? '✓ ' : '✕ '}{result.msg}</b>
          {result.detail && <span>{result.detail}</span>}
        </div>
      )}

      <ul className="privacy">
        <li>密钥只存在这台设备的浏览器里。浏览器和主屏幕图标是两份存储，要在你实际使用的那个里填。</li>
        <li>只发送给 api.deepseek.com，不经过任何别的服务器。</li>
        <li>不会写进「导出备份」，也不会上传到 GitHub。</li>
        <li>费用按 DeepSeek 用量从你自己的账户扣，一通电话大约几分钱人民币。</li>
      </ul>
      <a className="link-btn" href="https://platform.deepseek.com/api_keys" target="_blank" rel="noreferrer">去 DeepSeek 开放平台拿密钥 →</a>
    </section>
  );
}

function DebugSection() {
  const [on, setOn] = useState(debugEnabled());
  const [, tick] = useState(0);
  useEffect(() => subscribeDebug(() => tick((n) => n + 1)), []);
  const text = () => `${envSummary()}\n---\n${debugEvents().map(fmtEvent).join('\n')}`;
  return (
    <section className="group group--debug">
      <label className="group__row">
        <span>debug 语音</span>
        <input type="checkbox" className="switch" checked={on} onChange={(e) => { setDebugEnabled(e.target.checked); setOn(e.target.checked); }} />
      </label>
      {on && (
        <>
          <p className="group__text">打开后，通话和跟读页面上方会显示识别 / 发声 / AI 请求的事件。出问题时点「复制」发给我。不会记录密钥本身。</p>
          <pre className="debug-log">{text()}</pre>
          <div className="row gap">
            <button className="btn btn--soft" onClick={async () => {
              try { await navigator.clipboard.writeText(text()); toast('已复制'); } catch { toast('复制失败，可以长按选中'); }
            }}>复制</button>
            <button className="btn btn--ghost" onClick={clearDebug}>清空</button>
          </div>
        </>
      )}
    </section>
  );
}

function VoicePicker() {
  const { settings, update } = useApp();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => { void waitVoices().then(() => setVoices(englishVoices())); }, []);
  if (!voices.length) return null;
  const f = pickVoice('female', settings.voiceURI);
  const m = pickVoice('male', settings.voiceURIMale);
  const row = (label: string, cur: SpeechSynthesisVoice | null, key: 'voiceURI' | 'voiceURIMale', sample: string) => (
    <div className="group__row group__row--stack">
      <span>{label}</span>
      <div className="row gap">
        <select className="select select--sm" value={cur?.voiceURI ?? ''} onChange={(e) => void update({ [key]: e.target.value || null })}>
          {voices.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}
        </select>
        <button className="icon-btn icon-btn--mint" onClick={() => void speak(sample, { voice: pickVoice(key === 'voiceURI' ? 'female' : 'male', settings[key]) })} aria-label="试听"><Icon name="volume" size={18} /></button>
      </div>
    </div>
  );
  return (
    <>
      {row('通话声音（女）', f, 'voiceURI', "Hey! You wanna just split this?")}
      {row('通话声音（男）', m, 'voiceURIMale', "Nah, I got this. Seriously.")}
    </>
  );
}

function DataSection({ onChanged }: { onChanged: () => Promise<void> }) {
  const file = useRef<HTMLInputElement>(null);
  const [confirm, setConfirm] = useState(false);

  async function doExport() {
    const b = await exportBackup();
    const blob = new Blob([JSON.stringify(b)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `offbook-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('备份已导出（不含 API 密钥）');
  }

  async function doImport(f: File) {
    try {
      await importBackup(JSON.parse(await f.text()));
      await onChanged();
      toast('已导入');
    } catch {
      toast('这个文件不是脱稿 2.0 的备份');
    }
  }

  return (
    <section className="group">
      <h2 className="group__title">数据</h2>
      <p className="group__text">浏览器和主屏幕图标是两份分开的存储，换地方用前先导出。</p>
      <div className="row gap wrap">
        <button className="btn btn--soft" onClick={() => void doExport()}>导出备份</button>
        <button className="btn btn--soft" onClick={() => file.current?.click()}>导入备份</button>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void doImport(f); e.target.value = ''; }} />
        {!confirm ? (
          <button className="btn btn--ghost" onClick={() => setConfirm(true)}>清空进度</button>
        ) : (
          <button className="btn btn--danger" onClick={async () => { await resetAll(); setConfirm(false); await onChanged(); toast('进度已清空（密钥保留）'); }}>确定清空</button>
        )}
      </div>
    </section>
  );
}

function Licenses() {
  const [text, setText] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="link-btn" onClick={async () => {
        setOpen(true);
        if (text === null) setText(await fetch(publicUrl('content/licenses.md')).then((r) => r.text()).catch(() => '加载失败'));
      }}>声音与软件许可</button>
      {open && (
        <div className="sheet-backdrop" onClick={() => setOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="许可">
            <div className="sheet__grip" />
            <div className="licenses">
              {(text ?? '…').split(/\n{2,}/).map((block, i) => {
                const b = block.trim();
                if (b.startsWith('# ')) return <h2 key={i} className="title-md">{b.slice(2)}</h2>;
                if (b.startsWith('## ')) return <h3 key={i}>{b.slice(3)}</h3>;
                return <p key={i}>{b.replace(/\*\*/g, '')}</p>;
              })}
            </div>
            <button className="btn btn--soft btn--block" onClick={() => setOpen(false)}>关闭</button>
          </div>
        </div>
      )}
    </>
  );
}
