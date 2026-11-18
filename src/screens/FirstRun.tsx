import { useState } from 'react';
import { copy } from '@/lib/copy.ts';
import { unlockAudio } from '@/lib/audio.ts';
import { enableMic } from '@/lib/micAccess.ts';
import { saveSettings } from '@/lib/db.ts';

export function FirstRun({
  onContinue,
}: {
  onContinue: (listeningOnly: boolean) => void;
}) {
  const [beat, setBeat] = useState(0);
  const [micMsg, setMicMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (beat === 0) {
    return (
      <div className="page" style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <p className="kicker">{copy.appNameEn}</p>
          <h1 className="title" style={{ margin: '12px 0 16px' }}>
            {copy.appName}
          </h1>
          <p className="serif cjk-wrap" style={{ fontSize: '1.35rem', lineHeight: 1.45 }}>
            {copy.promise}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            void unlockAudio();
            setBeat(1);
          }}
        >
          {copy.start}
        </button>
      </div>
    );
  }

  if (beat === 1) {
    return (
      <div className="page" style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <p className="serif cjk-wrap" style={{ fontSize: '1.3rem', lineHeight: 1.5 }}>
            {copy.firstRunHow}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            void unlockAudio();
            setBeat(2);
          }}
        >
          {copy.continue}
        </button>
      </div>
    );
  }

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <p className="serif cjk-wrap" style={{ fontSize: '1.3rem', lineHeight: 1.5 }}>
          {copy.micAsk}
        </p>
        {micMsg ? (
          <p className="helper cjk-wrap" style={{ marginTop: 18 }}>
            {micMsg}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        className="btn btn-primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          void unlockAudio();
          const ok = await enableMic();
          setBusy(false);
          if (ok) onContinue(false);
          else setMicMsg(copy.micDenied);
        }}
      >
        {micMsg ? copy.micRetry : copy.micAllow}
      </button>
      <button
        type="button"
        className="btn btn-text"
        style={{ width: '100%', marginTop: 8 }}
        disabled={busy}
        onClick={async () => {
          void unlockAudio();
          await saveSettings({ micAllowed: false });
          onContinue(true);
        }}
      >
        {copy.listenOnly}
      </button>
    </div>
  );
}
