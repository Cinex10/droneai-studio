import { useRef, useCallback } from "react";

interface RulerProps {
  totalFrames: number;
  currentFrame: number;
  fps: number;
  zoom: number;
  scrollOffset: number;
  onSeek: (frame: number) => void;
}

export default function Ruler({
  totalFrames,
  currentFrame,
  fps,
  zoom,
  scrollOffset,
  onSeek,
}: RulerProps) {
  const ref = useRef<HTMLDivElement>(null);

  const frameToX = useCallback(
    (frame: number) => ((frame / totalFrames) * 100 * zoom) - scrollOffset,
    [totalFrames, zoom, scrollOffset]
  );

  const xToFrame = useCallback(
    (clientX: number) => {
      if (!ref.current) return 0;
      const rect = ref.current.getBoundingClientRect();
      const x = clientX - rect.left + scrollOffset;
      const pct = x / (rect.width * zoom);
      return Math.round(Math.max(0, Math.min(totalFrames, pct * totalFrames)));
    },
    [totalFrames, zoom, scrollOffset]
  );

  const handleClick = (e: React.MouseEvent) => {
    onSeek(xToFrame(e.clientX));
  };

  const handleDrag = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const move = (ev: MouseEvent) => onSeek(xToFrame(ev.clientX));
      const up = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    },
    [xToFrame, onSeek]
  );

  // Generate tick marks
  const totalSeconds = totalFrames / fps;
  const tickInterval = totalSeconds <= 30 ? 2 : totalSeconds <= 120 ? 5 : 10;
  const ticks: { time: number; frame: number }[] = [];
  for (let t = 0; t <= totalSeconds; t += tickInterval) {
    ticks.push({ time: t, frame: Math.round(t * fps) });
  }

  const playheadPct = totalFrames > 0 ? frameToX(currentFrame) : 0;

  const formatTick = (t: number) => {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return m > 0 ? `${m}:${s.toString().padStart(2, "0")}` : `${s}s`;
  };

  return (
    <div
      ref={ref}
      className="relative h-4 bg-[var(--bg-secondary)] cursor-pointer select-none overflow-hidden"
      onClick={handleClick}
    >
      {/* Ticks */}
      {ticks.map((tick) => (
        <div
          key={tick.frame}
          className="absolute top-0 h-full flex flex-col items-center"
          style={{ left: `${frameToX(tick.frame)}%` }}
        >
          <div className="w-px h-2 bg-[var(--text-secondary)] opacity-40" />
          <span className="text-[8px] text-[var(--text-secondary)] opacity-60 mt-px whitespace-nowrap">
            {formatTick(tick.time)}
          </span>
        </div>
      ))}

      {/* Playhead */}
      <div
        className="absolute top-0 w-0.5 h-full bg-[var(--accent)] z-10 cursor-ew-resize"
        style={{ left: `${playheadPct}%` }}
        onMouseDown={handleDrag}
      >
        <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-2 h-2 bg-[var(--accent)] rounded-full" />
      </div>
    </div>
  );
}
