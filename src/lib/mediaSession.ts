export function setMediaSession(opts: {
  title: string;
  artist?: string;
  onPlay?: () => void;
  onPause?: () => void;
}): void {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: opts.title,
      artist: opts.artist || '脱稿 Offbook',
    });
    navigator.mediaSession.setActionHandler('play', opts.onPlay ?? null);
    navigator.mediaSession.setActionHandler('pause', opts.onPause ?? null);
  } catch {
    /* some handlers unsupported */
  }
}

export function clearMediaSession(): void {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = null;
    navigator.mediaSession.setActionHandler('play', null);
    navigator.mediaSession.setActionHandler('pause', null);
  } catch {
    /* ignore */
  }
}
