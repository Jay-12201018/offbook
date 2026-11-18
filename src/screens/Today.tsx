import { copy } from '@/lib/copy.ts';
import { UnitText } from '@/lib/units.tsx';
import { SceneCard } from '@/components/SceneCard.tsx';
import { comfortableWpmNote, daysSince, isActiveResume } from '@/session/engine.ts';
import type { CatalogEntry, DiagnosticProgress, ResumeState, Settings, TroubleItem } from '@/session/types.ts';

export function Today({
  entry,
  fullResume,
  microResume,
  reviewResume,
  diagnosticResume,
  fullResumeTitle,
  settings,
  troubles,
  onStart,
  onChoose,
  onInstall,
  showInstall,
  isDiagnostic,
  microSceneId,
  reviewSceneId,
}: {
  entry: CatalogEntry | null;
  fullResume?: ResumeState | null;
  microResume?: ResumeState | null;
  reviewResume?: ResumeState | null;
  diagnosticResume?: DiagnosticProgress | null;
  fullResumeTitle?: string;
  settings: Settings;
  troubles: TroubleItem[];
  onStart: (kind: 'full' | 'micro' | 'review' | 'diagnostic', sceneId?: string, opts?: { fresh?: boolean }) => void;
  onChoose: () => void;
  onInstall: () => void;
  showInstall: boolean;
  isDiagnostic?: boolean;
  microSceneId?: string;
  reviewSceneId?: string;
}) {
  const missed = daysSince(settings.lastCompletedAt);
  const midFull = isActiveResume(fullResume) ? fullResume : null;
  const midMicro = isActiveResume(microResume) ? microResume : null;
  const midReview = isActiveResume(reviewResume) ? reviewResume : null;
  const midDiag = diagnosticResume || null;
  const card = entry;
  const cardIsFullResume = !!(midFull && card && midFull.sceneId === card.id);
  const cardIsDiag = !!(isDiagnostic && midDiag);
  const isResume = cardIsFullResume || cardIsDiag;
  const longMiss = missed != null && missed >= 15;
  const shortMiss = missed != null && missed >= 4 && missed < 15;
  const otherFull = midFull && card && midFull.sceneId !== card.id ? midFull : null;
  const wpm = settings.comfortableWpm;
  const wpmNote =
    wpm && settings.diagComplete && !isDiagnostic
      ? comfortableWpmNote(wpm)
      : null;

  return (
    <div className="page">
      <p className="kicker">{copy.appName}</p>
      <div style={{ height: 18 }} />
      {wpmNote ? (
        <p className="helper" style={{ marginBottom: 16 }}>
          <UnitText text={wpmNote} />
        </p>
      ) : null}
      {longMiss ? (
        <p className="helper" style={{ marginBottom: 16 }}>
          <UnitText text={copy.missedVeryLong} />
        </p>
      ) : shortMiss ? (
        <p className="helper" style={{ marginBottom: 16 }}>
          {copy.missedFew}
        </p>
      ) : null}
      {card ? (
        <SceneCard
          entry={card}
          primaryLabel={isResume ? copy.continue : copy.startMinutes(card.estimatedMinutes)}
          resumeHint={isResume ? copy.resumeHere : undefined}
          onPrimary={() => {
            if (cardIsDiag) {
              onStart('diagnostic', card.id);
              return;
            }
            if (cardIsFullResume) {
              onStart('full', card.id);
              return;
            }
            onStart(isDiagnostic ? 'diagnostic' : 'full', card.id, { fresh: !isDiagnostic });
          }}
          minutes={isResume ? undefined : card.estimatedMinutes}
        />
      ) : (
        <p className="helper">{copy.emptyLibrary}</p>
      )}
      {otherFull ? (
        <div>
          <button
            type="button"
            className="linkish"
            onClick={() => onStart('full', otherFull.sceneId)}
          >
            {copy.resumeFullOther(fullResumeTitle || otherFull.sceneId)}
          </button>
        </div>
      ) : null}
      {card ? (
        <div>
          <button
            type="button"
            className="linkish"
            onClick={() => onStart('micro', midMicro?.sceneId || microSceneId || card.id)}
          >
            {midMicro ? copy.resumeMicro : longMiss ? copy.earWarmup : copy.micro}
          </button>
        </div>
      ) : null}
      {(troubles.length > 0 || midReview) && card ? (
        <div>
          <button
            type="button"
            className="linkish"
            onClick={() => onStart('review', midReview?.sceneId || reviewSceneId || troubles[0]?.sceneId || card.id)}
          >
            {midReview ? copy.resumeReview : copy.review}
          </button>
        </div>
      ) : null}
      {settings.firstRunComplete ? (
        <div>
          <button type="button" className="linkish" onClick={onChoose}>
            {copy.chooseScene}
          </button>
        </div>
      ) : null}
      {showInstall ? (
        <div className="install-card">
          <p style={{ marginBottom: 8 }}>{copy.installTitle}</p>
          <button type="button" className="btn btn-soft" onClick={onInstall}>
            怎么加
          </button>
        </div>
      ) : null}
    </div>
  );
}
