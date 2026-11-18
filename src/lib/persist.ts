import { getSettings, saveSettings } from '@/lib/db.ts';
import { isStandalone } from '@/lib/install.ts';

export async function requestPersistOnce(): Promise<boolean | null> {
  if (!isStandalone()) return null;
  if (!navigator.storage?.persist) return null;
  const settings = await getSettings();
  if (settings.persistAsked) {
    try {
      return await navigator.storage.persisted();
    } catch {
      return null;
    }
  }
  try {
    const ok = await navigator.storage.persist();
    await saveSettings({ persistAsked: true });
    return ok;
  } catch {
    await saveSettings({ persistAsked: true });
    return null;
  }
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const est = await navigator.storage?.estimate();
    if (!est) return null;
    return { usage: est.usage ?? 0, quota: est.quota ?? 0 };
  } catch {
    return null;
  }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
