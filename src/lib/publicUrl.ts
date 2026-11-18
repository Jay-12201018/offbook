/** Resolve a public-dir path against Vite `base` (for example `/offbook/`). */
export function publicUrl(path: string): string {
  const base = import.meta.env.BASE_URL || '/';
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  if (!path) return normalizedBase;
  if (
    path.startsWith('http') ||
    path.startsWith('blob:') ||
    path.startsWith('data:') ||
    path.startsWith('//')
  ) {
    return path;
  }
  if (path === normalizedBase || path.startsWith(normalizedBase)) return path;
  return `${normalizedBase}${path.replace(/^\/+/, '')}`;
}
