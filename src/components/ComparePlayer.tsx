import { useEffect, useRef, useState } from 'react';
import { copy } from '@/lib/copy.ts';
import { playUrl, stopPlayback } from '@/lib/audio.ts';
import type { Speed } from '@/session/types.ts';

export function ComparePlayer({
  modelUrl,
  modelText,
  selfUrl,
  rate,
  autoPlay = true,
  listeningOnly = false,
}: {
  modelUrl?: string;
  modelText?: string;
  selfUrl?: string;
  rate: Speed;
  autoPlay?: boolean;
  listeningOnly?: boolean;
}) {
  const [which, setWhich] = useState<'model' | 'self' | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const played = useRef<string | undefined>(undefined);

  const clearWhich = () => setWhich(null);
  const fail = () => {
    setWhich(null);
    setNote(copy.playFailed);
  };

  const play = (side: 'model' | 'self') => {
    stopPlayback();
    setNote(null);
    setWhich(side);
    if (side === 'model') {
      if (modelUrl) playUrl(modelUrl, { rate, onEnd: clearWhich, onError: fail });
      else setWhich(null);
    } else if (selfUrl) {
      playUrl(selfUrl, { rate: 1, onEnd: clearWhich, onError: fail });
    } else setWhich(null);
  };

  useEffect(() => {
    if (!autoPlay || !selfUrl || played.current === selfUrl) return;
    played.current = selfUrl;
    stopPlayback();
    setNote(null);
    const playSelf = () => {
      setWhich('self');
      playUrl(selfUrl, { rate: 1, onEnd: clearWhich, onError: fail });
    };
    if (modelUrl) {
      setWhich('model');
      playUrl(modelUrl, { rate, onEnd: playSelf, onError: fail });
    } else {
      playSelf();
    }
  }, [autoPlay, selfUrl, modelUrl, rate]);

  return (
    <div>
      <p className="helper" style={{ marginBottom: 10 }}>
        {note || (listeningOnly ? copy.compareHintListenOnly : copy.compareHint)}
      </p>
      <div className="compare">
        <button type="button" aria-pressed={which === 'model'} onClick={() => play('model')}>
          <span>{copy.model}</span>
          {modelText ? <span className="sub">{modelText}</span> : null}
        </button>
        <button
          type="button"
          aria-pressed={which === 'self'}
          onClick={() => play('self')}
          disabled={!selfUrl}
        >
          <span>{copy.mine}</span>
          <span className="sub">{selfUrl ? '刚才那条' : '还没有录音'}</span>
        </button>
      </div>
    </div>
  );
}
