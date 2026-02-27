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

  // Generate tick marks — major every N seconds, minor dots in between
  const totalSeconds = totalFrames / fps;
  const majorInterval = totalSeconds <= 15 ? 2 : totalSeconds <= 60 ? 5 : 10;
  const minorInterval = majorInterval <= 2 ? 1 : majorInterval <= 5 ? 1 : 2;

  const ticks: { time: number; major: boolean }[] = [];
  for (let t = 0; t <= totalSeconds; t += minorInterval) {
    ticks.push({ time: t, major: t % majorInterval === 0 });
  }

  const playheadPct = totalFrames > 0 ? frameToX(currentFrame) : 0;

  const formatTick = (t: number) => {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return m > 0 ? `${m}m${s > 0 ? s : ""}` : `${s}s`;
  };

  return (
    <div
      ref={ref}
      className="tl-ruler"
      onClick={handleClick}
    >
      {/* Ticks */}
      {ticks.map((tick) => {
        const left = frameToX(Math.round(tick.time * fps));
        return (
          <div
            key={tick.time}
            className="absolute top-0 h-full"
            style={{ left: `${left}%` }}
          >
            {tick.major ? (
              <>
                <div className="tl-ruler-tick-major" />
                <span className="tl-ruler-label">
                  {formatTick(tick.time)}
                </span>
              </>
            ) : (
              <div className="tl-ruler-tick-minor" />
            )}
          </div>
        );
      })}

      {/* Playhead handle — triangle on ruler */}
      <div
        className="tl-ruler-playhead"
        style={{ left: `${playheadPct}%` }}
        onMouseDown={handleDrag}
      >
        <svg
          width="10"
          height="8"
          viewBox="0 0 10 8"
          className="tl-ruler-playhead-head"
        >
          <path d="M0 0L5 7L10 0Z" fill="var(--accent)" />
        </svg>
      </div>
    </div>
  );
}
