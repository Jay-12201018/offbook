import { AmplitudeMeter } from '@/components/AmplitudeMeter.tsx';
import { copy } from '@/lib/copy.ts';

export function MicDisc({
  live,
  level,
  onClick,
  disabled,
  label,
}: {
  live: boolean;
  level: number;
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}) {
  const halo = 0.92 + Math.min(0.2, level * 0.25);
  return (
    <button
      type="button"
      className={`mic-disc${live ? ' live' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={live}
      aria-label={label || (live ? copy.stop : copy.record)}
    >
      <span className="halo" style={{ transform: `scale(${halo})` }} />
      {live ? <AmplitudeMeter level={level} /> : <span>{copy.record}</span>}
    </button>
  );
}
