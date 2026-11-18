import { AmplitudeMeter } from '@/components/AmplitudeMeter.tsx';
import { RevealText } from '@/components/RevealText.tsx';
import { speakerName } from '@/content/normalize.ts';
import type { Glue, Scene, SceneLine } from '@/session/types.ts';

export function LineStage({
  scene,
  line,
  revealLevel,
  playing,
  level,
  glue,
  hideIdentity,
}: {
  scene: Scene;
  line?: SceneLine;
  revealLevel: 0 | 1 | 2;
  playing?: boolean;
  level?: number;
  glue?: Glue | null;
  hideIdentity?: boolean;
}) {
  return (
    <div>
      {!hideIdentity && line ? (
        <div className="speaker">{speakerName(scene, line.speaker)}</div>
      ) : (
        <div className="speaker">{playing ? '在听' : '一场对话'}</div>
      )}
      <div className="waveform">{playing ? <AmplitudeMeter level={level ?? 0.2} /> : null}</div>
      {line && !hideIdentity ? <RevealText line={line} level={revealLevel} /> : <div className="reveal-slot" />}
      {glue && revealLevel >= 1 ? (
        <div className="glue-note">
          <div className="kicker" style={{ marginBottom: 6 }}>
            胶水
          </div>
          <p>
            你听到的是 <span className="serif glue-cite">{glue.hear}</span>
            {glue.standard !== glue.hear ? (
              <>
                ，写下来是 <span className="serif glue-cite">{glue.standard}</span>
              </>
            ) : null}
            。{glue.noteZh}
          </p>
        </div>
      ) : null}
    </div>
  );
}
