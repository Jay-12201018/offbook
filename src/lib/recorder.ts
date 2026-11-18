import { getAudioContext } from '@/lib/audio.ts';

export function pickMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const types = [
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
    'audio/aac',
    'audio/webm;codecs=opus',
    'audio/webm',
  ];
  return types.find((t) => MediaRecorder.isTypeSupported(t)) || '';
}

export interface RecResult {
  blob: Blob;
  mime: string;
  durationMs: number;
  silent: boolean;
}

export class MicRecorder {
  private stream: MediaStream | null = null;
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private startedAt = 0;
  private mime = '';
  private raf = 0;
  onLevel?: (level: number) => void;

  async prepare(): Promise<MediaStream> {
    if (this.stream && this.stream.getAudioTracks().some((t) => t.readyState === 'live')) {
      return this.stream;
    }
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') await ctx.resume();
    this.source = ctx.createMediaStreamSource(this.stream);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.7;
    this.source.connect(this.analyser);
    // Do not connect to destination (no monitoring / feedback).
    this.loopLevel();
    return this.stream;
  }

  private loopLevel(): void {
    const tick = () => {
      this.raf = requestAnimationFrame(tick);
      if (!this.analyser || !this.onLevel) return;
      const buf = new Uint8Array(this.analyser.fftSize);
      this.analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buf.length);
      this.onLevel(Math.min(1, rms * 4));
    };
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(tick);
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  isRecording(): boolean {
    return this.rec?.state === 'recording';
  }

  async start(): Promise<void> {
    const stream = await this.prepare();
    this.chunks = [];
    this.mime = pickMime();
    this.rec = this.mime
      ? new MediaRecorder(stream, { mimeType: this.mime })
      : new MediaRecorder(stream);
    this.mime = this.rec.mimeType || this.mime;
    this.rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };
    this.startedAt = performance.now();
    this.rec.start();
  }

  async stop(): Promise<RecResult> {
    const rec = this.rec;
    if (!rec || rec.state === 'inactive') {
      return { blob: new Blob(), mime: this.mime, durationMs: 0, silent: true };
    }
    const durationMs = Math.round(performance.now() - this.startedAt);
    const blob = await new Promise<Blob>((resolve) => {
      rec.onstop = () => resolve(new Blob(this.chunks, { type: this.mime || 'audio/webm' }));
      rec.stop();
    });
    this.rec = null;
    const silent = durationMs < 300 || blob.size < 800;
    return { blob, mime: this.mime, durationMs, silent };
  }

  release(): void {
    cancelAnimationFrame(this.raf);
    this.rec?.state === 'recording' && this.rec.stop();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    try {
      this.source?.disconnect();
    } catch {
      /* already down */
    }
    this.source = null;
    this.analyser = null;
    this.rec = null;
  }
}

export const mic = new MicRecorder();
