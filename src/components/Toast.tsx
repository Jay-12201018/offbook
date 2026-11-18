import { useEffect, useState } from 'react';

type Listener = (msg: string) => void;
const listeners = new Set<Listener>();
export function toast(msg: string): void {
  listeners.forEach((l) => l(msg));
}

export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    let t = 0;
    const l: Listener = (m) => {
      setMsg(m);
      window.clearTimeout(t);
      t = window.setTimeout(() => setMsg(null), 2600);
    };
    listeners.add(l);
    return () => { listeners.delete(l); window.clearTimeout(t); };
  }, []);
  return msg ? <div className="toast" role="status">{msg}</div> : null;
}
