import type { ReactNode } from 'react';
import { copy } from '@/lib/copy.ts';
import { UnitText } from '@/lib/units.tsx';
import type { RecapModel } from '@/session/types.ts';

export function Recap({
  model,
  onDone,
  onMore,
  extra,
  firstRunSpeed,
  onSpeed,
}: {
  model: RecapModel;
  onDone: () => void;
  onMore?: () => void;
  extra?: ReactNode;
  firstRunSpeed?: boolean;
  onSpeed?: (v: 'ok' | 'fast' | 'slow') => void;
}) {
  return (
    <div>
      <p className="kicker">今天</p>
      <h2 className="title" style={{ fontSize: '1.6rem', margin: '8px 0 16px' }}>
        <UnitText text={model.close} />
      </h2>
      {model.gistLine ? (
        <p className="recap-line" style={{ lineHeight: 1.55, marginBottom: 12 }}>
          <UnitText text={model.gistLine} />
        </p>
      ) : null}
      {model.revealLine ? (
        <p className="recap-line" style={{ lineHeight: 1.55, marginBottom: 12 }}>
          <UnitText text={model.revealLine} />
        </p>
      ) : null}
      {model.chunkLine ? (
        <p className="recap-line" style={{ lineHeight: 1.55, marginBottom: 12 }}>
          <UnitText text={model.chunkLine} />
        </p>
      ) : null}
      {model.ttfwLine ? (
        <p className="recap-line" style={{ lineHeight: 1.55, marginBottom: 12 }}>
          <UnitText text={model.ttfwLine} />
        </p>
      ) : null}
      {model.cutLine ? (
        <p className="helper recap-line" style={{ marginBottom: 12 }}>
          <UnitText text={model.cutLine} />
        </p>
      ) : null}
      <p className="serif recap-line" style={{ fontSize: '1.15rem', margin: '20px 0' }}>
        <UnitText text={copy.nextNamed(model.nextSceneTitleZh)} />
      </p>
      {extra}
      {firstRunSpeed && onSpeed ? (
        <div style={{ margin: '16px 0 8px' }}>
          <p style={{ marginBottom: 10 }}>{copy.speedAsk}</p>
          <div className="dock-row">
            <button type="button" className="dock-tool" onClick={() => onSpeed('slow')}>
              {copy.speedSlow}
            </button>
            <button type="button" className="dock-tool" onClick={() => onSpeed('ok')}>
              {copy.speedOk}
            </button>
            <button type="button" className="dock-tool" onClick={() => onSpeed('fast')}>
              {copy.speedFast}
            </button>
          </div>
        </div>
      ) : null}
      <button type="button" className="btn btn-primary" style={{ marginTop: 16 }} onClick={onDone}>
        {copy.enough}
      </button>
      {onMore ? (
        <button type="button" className="btn btn-text" style={{ width: '100%', marginTop: 8 }} onClick={onMore}>
          {copy.moreLines}
        </button>
      ) : null}
    </div>
  );
}
