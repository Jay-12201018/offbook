export function AmplitudeMeter({ level, bars = 7 }: { level: number; bars?: number }) {
  return (
    <div className="meter" aria-hidden="true">
      {Array.from({ length: bars }, (_, i) => {
        const mid = (bars - 1) / 2;
        const dist = Math.abs(i - mid) / mid;
        const h = 6 + Math.max(0, level - dist * 0.35) * 26;
        return <span key={i} style={{ height: `${h}px` }} />;
      })}
    </div>
  );
}
