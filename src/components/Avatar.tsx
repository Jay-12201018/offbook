import { avatarUrl, NAMES } from '@/lib/content.ts';

export function Avatar({ id, size = 40, ring }: { id: string; size?: number; ring?: boolean }) {
  return (
    <img
      className={`avatar${ring ? ' avatar--ring' : ''}`}
      src={avatarUrl(id)}
      alt={NAMES[id] ?? id}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      draggable={false}
    />
  );
}
