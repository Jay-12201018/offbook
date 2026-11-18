let lock: WakeLockSentinel | null = null;

export async function requestWakeLock(): Promise<void> {
  try {
    if (!('wakeLock' in navigator)) return;
    lock = await navigator.wakeLock.request('screen');
    lock.addEventListener('release', () => {
      lock = null;
    });
  } catch {
    lock = null;
  }
}

export async function releaseWakeLock(): Promise<void> {
  try {
    await lock?.release();
  } catch {
    /* ignore */
  }
  lock = null;
}

export function watchWakeLock(): () => void {
  const onVis = () => {
    if (document.visibilityState === 'visible') void requestWakeLock();
  };
  document.addEventListener('visibilitychange', onVis);
  return () => document.removeEventListener('visibilitychange', onVis);
}
