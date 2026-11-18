/** Learner-facing scene titles. Official sequence/scene title fields stay in JSON. */

const TITLES_ZH_BY_ID: Record<string, string> = {
  'diag-listen-150': '周五吃塔可',
  'pack03-03-reservation-under': '预订在陈名下',
};

const TITLE_ALIASES: Record<string, string> = {
  '周五吃 taco': '周五吃塔可',
  '预订在 Chen 名下': '预订在陈名下',
};

export function overlayTitleZh(id?: string | null, existing?: string | null): string {
  if (id && TITLES_ZH_BY_ID[id]) return TITLES_ZH_BY_ID[id];
  const raw = (existing || '').trim();
  if (TITLE_ALIASES[raw]) return TITLE_ALIASES[raw];
  return raw;
}

export function splitCurriculumTitle(title?: string | null): { kicker?: string; title: string } {
  const raw = overlayTitleZh(undefined, title);
  const m = raw.match(/^(今日一场戏)[：:]\s*(.+)$/);
  if (m) return { kicker: m[1], title: overlayTitleZh(undefined, m[2].trim()) };
  return { title: raw };
}

export function shortSceneTitleZh(title?: string | null, fallback = ''): string {
  const { title: short } = splitCurriculumTitle(title);
  return short || fallback;
}

export function learnerTitleZh(id?: string | null, title?: string | null, fallback = ''): string {
  return overlayTitleZh(id, title) || fallback;
}
