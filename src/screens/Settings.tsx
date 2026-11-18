import { useEffect, useState } from 'react';
import { copy } from '@/lib/copy.ts';
import { LicenseDoc } from '@/components/LicenseDoc.tsx';
import { SpeedToggle } from '@/components/SpeedToggle.tsx';
import { exportProgress, getSettings, importProgress, saveSettings, type ExportPayload } from '@/lib/db.ts';
import { enableMic } from '@/lib/micAccess.ts';
import { UnitText } from '@/lib/units.tsx';
import { comfortableWpmNote } from '@/session/engine.ts';
import { formatBytes, storageEstimate } from '@/lib/persist.ts';
import { publicUrl } from '@/lib/publicUrl.ts';
import type { Settings as SettingsT, Speed, ThemePref } from '@/session/types.ts';

function localIsoDate(timeZone = 'Asia/Shanghai'): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function Settings({
  settings,
  onSettings,
  onInstall,
  onImported,
}: {
  settings: SettingsT;
  onSettings: (s: SettingsT) => void;
  onInstall: () => void;
  onImported?: () => void;
}) {
  const [licenses, setLicenses] = useState<string | null>(null);
  const [storage, setStorage] = useState<string>('');
  const [msg, setMsg] = useState<string | null>(null);
  const [micNote, setMicNote] = useState<string | null>(null);

  useEffect(() => {
    void storageEstimate().then((e) => {
      if (e) setStorage(copy.storageUsed(formatBytes(e.usage)));
    });
  }, []);

  const patch = async (p: Partial<SettingsT>) => {
    const next = await saveSettings(p);
    onSettings(next);
  };

  const doExport = async (includeRecordings = true) => {
    setMsg(copy.exportPreparing);
    try {
      const data = await exportProgress(includeRecordings);
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      const size = formatBytes(blob.size);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const stamp = localIsoDate();
      a.download = includeRecordings
        ? `offbook-progress-${stamp}.json`
        : `offbook-progress-${stamp}-no-audio.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg(copy.exportDone(size, includeRecordings));
    } catch {
      setMsg('这次导出没完成，再试一次。');
    }
  };

  const doImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text()) as ExportPayload;
        await importProgress(data);
        const s = await getSettings();
        onSettings(s);
        onImported?.();
        setMsg('进度已导入。');
      } catch {
        setMsg('这份文件读不出来。');
      }
    };
    input.click();
  };

  return (
    <div className="page">
      <p className="kicker">{copy.settings}</p>
      <h1 className="title" style={{ fontSize: '1.8rem', margin: '8px 0 22px' }}>
        设置
      </h1>

      <section style={{ marginBottom: 28 }}>
        <h2 className="kicker">{copy.speedDefault}</h2>
        <div style={{ marginTop: 10 }}>
          <SpeedToggle value={settings.speed} onChange={(s: Speed) => void patch({ speed: s })} />
        </div>
        <p className="helper" style={{ marginTop: 10 }}>
          {copy.speedHelp}
        </p>
        {settings.comfortableWpm ? (
          <p className="helper" style={{ marginTop: 10 }}>
            <UnitText text={`${copy.wpmMark(settings.comfortableWpm)} ${comfortableWpmNote(settings.comfortableWpm)}`} />
          </p>
        ) : null}
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 className="kicker">{copy.theme}</h2>
        <div className="speed-toggle" style={{ marginTop: 10 }}>
          {(['auto', 'light', 'dark'] as ThemePref[]).map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={settings.theme === t}
              onClick={() => void patch({ theme: t })}
            >
              {t === 'auto' ? copy.themeAuto : t === 'light' ? copy.themeLight : copy.themeDark}
            </button>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 className="kicker">麦克风</h2>
        {settings.micAllowed === true ? (
          <p className="helper" style={{ marginTop: 10 }}>
            {copy.micOn}
          </p>
        ) : (
          <>
            <p className="helper cjk-wrap" style={{ marginTop: 10 }}>
              {copy.micSettingsHint}
            </p>
            <button
              type="button"
              className="list-row"
              style={{ marginTop: 8 }}
              onClick={async () => {
                const ok = await enableMic();
                if (ok) {
                  const s = await getSettings();
                  onSettings(s);
                  setMicNote(copy.micOn);
                } else {
                  setMicNote(copy.micDenied);
                }
              }}
            >
              {copy.micAllow}
            </button>
          </>
        )}
        {micNote ? <p className="helper" style={{ marginTop: 8 }}>{micNote}</p> : null}
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 className="kicker">安装</h2>
        <button type="button" className="list-row" onClick={onInstall}>
          {copy.installTitle}
        </button>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 className="kicker">进度</h2>
        <button type="button" className="list-row" onClick={() => void doExport(true)}>
          {copy.export}
        </button>
        <button type="button" className="list-row" onClick={() => void doExport(false)}>
          {copy.exportNoAudio}
        </button>
        <button type="button" className="list-row" onClick={doImport}>
          {copy.import}
        </button>
        <p className="helper" style={{ marginTop: 8 }}>
          {copy.exportHint}
        </p>
        {msg ? <p className="helper">{msg}</p> : null}
        {storage ? (
          <p className="helper" style={{ marginTop: 8 }}>
            {storage}
          </p>
        ) : null}
        <p className="helper cjk-wrap" style={{ marginTop: 10 }}>
          {copy.storageSplit}
        </p>
        <p className="helper cjk-wrap" style={{ marginTop: 8 }}>
          {copy.httpsMic}
        </p>
      </section>

      <section id="licenses" style={{ scrollMarginBottom: 'calc(var(--tab-height) + var(--safe-bottom) + 24px)' }}>
        <h2 className="kicker">{copy.licenses}</h2>
        {licenses ? (
          <>
            <p className="helper" style={{ margin: '10px 0 14px' }}>
              {copy.licensesIntro}
            </p>
            <LicenseDoc source={licenses} />
          </>
        ) : (
          <button
            type="button"
            className="list-row"
            onClick={async () => {
              const text = await fetch(publicUrl('/content/licenses.md')).then((r) => r.text());
              setLicenses(text);
            }}
          >
            查看 Piper、声音和 Source Serif 4 的许可
          </button>
        )}
      </section>

      <p className="helper" style={{ marginTop: 32 }}>
        {copy.appName} / {copy.appNameEn}。本地练习工具，没有账号，也没有云同步。
      </p>
    </div>
  );
}
