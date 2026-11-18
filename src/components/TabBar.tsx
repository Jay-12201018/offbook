import { copy } from '@/lib/copy.ts';

const TABS = [
  { id: 'today', label: copy.today },
  { id: 'scenes', label: copy.scenes },
  { id: 'progress', label: copy.progress },
  { id: 'settings', label: copy.settings },
] as const;

export type TabId = (typeof TABS)[number]['id'];

export function TabBar({ current, onChange }: { current: TabId; onChange: (id: TabId) => void }) {
  return (
    <div className="tab-bar">
      <nav aria-label="主导航">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-current={current === t.id ? 'page' : undefined}
            onClick={() => onChange(t.id)}
          >
            <span className="dot" aria-hidden="true" />
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
