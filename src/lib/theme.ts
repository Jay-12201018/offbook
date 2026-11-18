import type { ThemePref } from '@/session/types.ts';

export function resolveTheme(pref: ThemePref): 'light' | 'dark' {
  if (pref === 'light' || pref === 'dark') return pref;
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  const hour = new Date().getHours();
  if (hour >= 21 || hour < 6) return 'dark';
  return 'light';
}

export function applyTheme(pref: ThemePref): 'light' | 'dark' {
  const theme = resolveTheme(pref);
  const root = document.documentElement;
  root.dataset.theme = theme;
  const color = theme === 'dark' ? '#14110E' : '#F3EEE4';
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.setAttribute('content', color);
  }
  return theme;
}
