import { copy } from '@/lib/copy.ts';

export function ConfirmSheet({
  title,
  onStay,
  onLeave,
  stayLabel,
  leaveLabel,
}: {
  title: string;
  onStay: () => void;
  onLeave: () => void;
  stayLabel?: string;
  leaveLabel?: string;
}) {
  return (
    <div className="confirm-mask" role="dialog" aria-modal="true" aria-label={title}>
      <div className="confirm-sheet">
        <p className="serif" style={{ fontSize: '1.2rem', marginBottom: 18 }}>
          {title}
        </p>
        <button type="button" className="btn btn-primary" onClick={onLeave}>
          {leaveLabel || copy.back}
        </button>
        <button type="button" className="btn btn-ghost" style={{ width: '100%' }} onClick={onStay}>
          {stayLabel || copy.stay}
        </button>
      </div>
    </div>
  );
}
