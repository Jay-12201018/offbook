import { saveSettings } from '@/lib/db.ts';
import { mic } from '@/lib/recorder.ts';

/** Prompt for the mic and persist success. Returns false on deny or API error. */
export async function enableMic(): Promise<boolean> {
  try {
    await mic.prepare();
    await saveSettings({ micAllowed: true });
    return true;
  } catch {
    return false;
  }
}
