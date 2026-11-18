import { copy } from '@/lib/copy.ts';
import { LIFE_LABELS } from '@/lib/catalog.ts';
import type { CatalogEntry, LifeArea, SceneRollup } from '@/session/types.ts';

const ORDER: LifeArea[] = ['everyday', 'travel', 'work', 'shows', 'listens', 'interviews'];

const MARK: Record<string, string> = {
  'not-started': copy.markNotStarted,
  'in-progress': copy.markProgress,
  'ear-catching': copy.markCatching,
  'can-say': copy.markCanSay,
};

export function Scenes({
  index,
  states,
  onOpen,
}: {
  index: CatalogEntry[];
  states: Record<string, SceneRollup>;
  onOpen: (id: string) => void;
}) {
  const official = index.filter((s) => s.official !== false && !s.id.startsWith('fallback-'));
  const extras = index.filter((s) => s.official === false || s.id.startsWith('fallback-'));
  const groups = ORDER.map((area) => ({
    area,
    items: official.filter((s) => s.lifeArea === area),
  })).filter((g) => g.items.length);

  return (
    <div className="page">
      <p className="kicker">按生活分，不按级别</p>
      <h1 className="title" style={{ fontSize: '1.8rem', margin: '8px 0 20px' }}>
        {copy.scenes}
      </h1>
      {groups.length === 0 ? <p className="helper">{copy.emptyLibrary}</p> : null}
      {groups.map((g) => (
        <section key={g.area} style={{ marginBottom: 28 }}>
          <h2 className="kicker">{LIFE_LABELS[g.area]}</h2>
          {g.items.map((s) => {
            const st = states[s.id];
            return (
              <button key={s.id} type="button" className="list-row" onClick={() => onOpen(s.id)}>
                <div className="serif" style={{ fontSize: '1.15rem' }}>
                  {s.titleZh || s.title}
                </div>
                <div className="meta">
                  {s.situationZh}
                  {' · '}
                  {MARK[st?.mark || 'not-started']}
                </div>
              </button>
            );
          })}
        </section>
      ))}
      {extras.length > 0 ? (
        <section style={{ marginBottom: 28 }}>
          <h2 className="kicker">其他</h2>
          <p className="helper" style={{ margin: '6px 0 8px' }}>
            额外的练习场，不在这个月的路径里。
          </p>
          {extras.map((s) => {
            const st = states[s.id];
            return (
              <button key={s.id} type="button" className="list-row" onClick={() => onOpen(s.id)}>
                <div className="serif" style={{ fontSize: '1.15rem' }}>
                  {s.titleZh || s.title}
                </div>
                <div className="meta">
                  {s.situationZh}
                  {' · '}
                  {MARK[st?.mark || 'not-started']}
                </div>
              </button>
            );
          })}
        </section>
      ) : null}
    </div>
  );
}
