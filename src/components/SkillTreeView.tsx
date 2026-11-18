import type { SkillNode, SkillTree } from '@/session/types.ts';
import { UnitText } from '@/lib/units.tsx';

function weeksZh(weeks?: string): string | undefined {
  if (!weeks) return undefined;
  let w = weeks.trim();
  w = w.replace(/\s*months\b/i, ' 个月').replace(/\s*month\b/i, ' 个月');
  w = w.replace(/\s*weeks\b/i, ' 周').replace(/\s*week\b/i, ' 周');
  if (/^\d/.test(w) && !/[月周]/.test(w)) w = `${w} 周`;
  return w.replace(/\s+/g, ' ').trim();
}


export type NodeStatus = 'reached' | 'in-reach' | 'ahead';

export function SkillTreeView({
  tree,
  statusFor,
}: {
  tree: SkillTree;
  statusFor: (node: SkillNode) => NodeStatus;
}) {
  const phases = new Map<string, SkillNode[]>();
  for (const n of tree.nodes) {
    const key = n.phase || '';
    const arr = phases.get(key) || [];
    arr.push(n);
    phases.set(key, arr);
  }
  const phaseOrder = ['0', 'A', 'B', 'C', 'D', 'beyond'];
  const labels: Record<string, string> = {
    '0': '开始',
    A: '阶段 A',
    B: '阶段 B',
    C: '阶段 C',
    D: '阶段 D',
    beyond: '更远',
  };

  return (
    <section className="skill-tree">
      <h2 className="kicker">技能树</h2>
      <p className="helper" style={{ margin: '8px 0 18px' }}>
        {tree.introZh}
      </p>
      {[...phases.keys()]
        .sort((a, b) => phaseOrder.indexOf(a) - phaseOrder.indexOf(b))
        .map((phase) => (
          <div key={phase} className="skill-phase">
            {labels[phase] ? <p className="kicker">{labels[phase]}</p> : null}
            {(phases.get(phase) || []).map((n) => {
              const st = statusFor(n);
              return (
                <article key={n.id} className={`skill-node ${st}${n.sketched ? ' sketched' : ''}`}>
                  <h3 className="serif" style={{ fontSize: '1.1rem', marginBottom: 6 }}>
                    {n.titleZh}
                  </h3>
                  {weeksZh(n.weeks) ? <p className="helper"><UnitText text={weeksZh(n.weeks)!} /></p> : null}
                  <p style={{ lineHeight: 1.5, marginTop: 6 }}>{n.passZh ? <UnitText text={n.passZh} /> : null}</p>
                  {st === 'reached' ? (
                    <p className="sage" style={{ marginTop: 8, fontSize: '0.9rem' }}>
                      这一步你已经走过了。
                    </p>
                  ) : st === 'in-reach' ? (
                    <p className="helper" style={{ marginTop: 8 }}>
                      这是现在正在靠近的能力。
                    </p>
                  ) : n.sketched ? (
                    <p className="helper" style={{ marginTop: 8 }}>
                      更远处先看见就好，现在不用做。
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>
        ))}
    </section>
  );
}
