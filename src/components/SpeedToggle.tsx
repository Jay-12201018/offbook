import type { Speed } from '@/session/types.ts';
import { copy } from '@/lib/copy.ts';

const OPTIONS: { value: Speed; label: string }[] = [
  { value: 0.85, label: copy.aBitSlow },
  { value: 1, label: copy.natural },
  { value: 1.1, label: copy.aBitFast },
];

export function SpeedToggle({
  value,
  onChange,
}: {
  value: Speed;
  onChange: (s: Speed) => void;
}) {
  return (
    <div className="speed-toggle" role="radiogroup" aria-label={copy.speedDefault}>
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
