/**
 * Energy-based VAD for time-to-first-word.
 * Measures ms from a t0 (end of prompt / start of record) to the first
 * voiced frame. Does not depend on ASR.
 */
export class EnergyVad {
  private analyser: AnalyserNode;
  private buf: Uint8Array<ArrayBuffer>;
  private startedAt: number;
  private noise = 0.02;
  private voicedMs = 0;
  private lastTs = 0;
  firstVoiceMs: number | null = null;
  private raf = 0;

  constructor(analyser: AnalyserNode, startedAt = performance.now()) {
    this.analyser = analyser;
    this.buf = new Uint8Array(new ArrayBuffer(analyser.fftSize));
    this.startedAt = startedAt;
    this.lastTs = startedAt;
    // briefly sample noise floor
    this.calibrate();
  }

  private rms(): number {
    this.analyser.getByteTimeDomainData(this.buf);
    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) {
      const v = (this.buf[i] - 128) / 128;
      sum += v * v;
    }
    return Math.sqrt(sum / this.buf.length);
  }

  private calibrate(): void {
    const samples: number[] = [];
    for (let i = 0; i < 6; i++) samples.push(this.rms());
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    this.noise = Math.max(0.015, mean * 1.4);
  }

  start(): void {
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      if (this.firstVoiceMs != null) return;
      const now = performance.now();
      const dt = now - this.lastTs;
      this.lastTs = now;
      const r = this.rms();
      const threshold = Math.max(0.035, this.noise * 2.2);
      if (r > threshold) {
        this.voicedMs += dt;
        if (this.voicedMs >= 40) {
          this.firstVoiceMs = Math.max(0, Math.round(now - this.startedAt - this.voicedMs));
        }
      } else {
        this.voicedMs = 0;
      }
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): number | null {
    cancelAnimationFrame(this.raf);
    return this.firstVoiceMs;
  }
}

export function formatTtfw(ms: number): string {
  const s = ms / 1000;
  return `${s.toFixed(1)} 秒`;
}
