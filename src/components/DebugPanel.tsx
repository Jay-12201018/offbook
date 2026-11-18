import { useEffect, useState } from 'react';
import { debugEnabled, debugEvents, fmtEvent, subscribeDebug } from '@/lib/debug.ts';

/** Compact live event list shown on practice screens when "debug 语音" is on. */
export function DebugOverlay({ lines = 7 }: { lines?: number }) {
  const [, tick] = useState(0);
  useEffect(() => subscribeDebug(() => tick((n) => n + 1)), []);
  if (!debugEnabled()) return null;
  const ev = debugEvents().slice(-lines);
  return (
    <div className="debug-overlay" aria-hidden="true">
      {ev.length ? ev.map((e, i) => <div key={i}>{fmtEvent(e)}</div>) : <div>debug: no events yet</div>}
    </div>
  );
}
