/** Minimal MediaRecorder for "样子 / 我的" compare when speech recognition is missing. */
let stream: MediaStream | null = null;
let rec: MediaRecorder | null = null;
let chunks: Blob[] = [];

export function recorderSupported(): boolean {
  return typeof window !== 'undefined' && 'MediaRecorder' in window && !!navigator.mediaDevices?.getUserMedia;
}

function mime(): string {
  for (const m of ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm']) {
    if (MediaRecorder.isTypeSupported?.(m)) return m;
  }
  return '';
}

export async function startRecording(): Promise<void> {
  stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  chunks = [];
  const m = mime();
  rec = new MediaRecorder(stream, m ? { mimeType: m } : undefined);
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  rec.start();
}

export function stopRecording(): Promise<string | null> {
  return new Promise((resolve) => {
    if (!rec) return resolve(null);
    const r = rec;
    r.onstop = () => {
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
      rec = null;
      resolve(chunks.length ? URL.createObjectURL(new Blob(chunks, { type: r.mimeType || 'audio/webm' })) : null);
    };
    r.stop();
  });
}
