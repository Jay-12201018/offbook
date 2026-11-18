import { getAudioContext, unlockAudio } from '@/lib/audio.ts';

/** Soft UI tick via Web Audio — not a media element (WebKit 321436). */
export function tick(kind: 'pause' | 'rec' = 'pause'): void {
  try {
    void unlockAudio();
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = kind === 'rec' ? 660 : 420;
    const now = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.035, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);
  } catch {
    /* ignore */
  }
}
