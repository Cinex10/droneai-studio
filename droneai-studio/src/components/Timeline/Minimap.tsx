import type { TimelineEntry } from "./types";

interface MinimapProps {
  entries: TimelineEntry[];
  totalFrames: number;
  fps: number;
  zoom: number;
  scrollOffset: number;
  currentFrame: number;
  onNavigate: (scrollOffset: number) => void;
}

function colorToCSS(c: { value?: number[]; start?: number[] }): string {
  const rgb = c.value || c.start || [0.5, 0.5, 0.5];
  return `rgb(${Math.round(rgb[0] * 255)}, ${Math.round(rgb[1] * 255)}, ${Math.round(rgb[2] * 255)})`;
}

export default function Minimap({
  entries,
  totalFrames,
  fps,
  zoom,
  scrollOffset,
  currentFrame,
  onNavigate,
}: MinimapProps) {
  const totalSeconds = totalFrames / fps;
  const viewportWidthPct = (1 / zoom) * 100;
  const viewportLeftPct = (scrollOffset / (100 * zoom)) * 100;
  const playheadPct = totalFrames > 0 ? (currentFrame / totalFrames) * 100 : 0;

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickPct = (e.clientX - rect.left) / rect.width;
    const newOffset = clickPct * 100 * zoom - viewportWidthPct / 2;
    onNavigate(Math.max(0, newOffset));
  };

  return (
    <div
      className="relative h-5 cursor-pointer flex-shrink-0 border-b"
      style={{
        backgroundColor: "var(--bg-tertiary)",
        borderColor: "var(--border)",
      }}
      onClick={handleClick}
    >
      {/* Formation blocks — colored segments */}
      {entries.map((entry, i) => {
        const hold = entry.hold ?? 0;
        const nextTime = i < entries.length - 1 ? entries[i + 1].time : totalSeconds;
        const holdEnd = hold > 0 ? entry.time + hold : entry.time;
        const left = (entry.time / totalSeconds) * 100;
        const holdWidth = ((holdEnd - entry.time) / totalSeconds) * 100;
        const transWidth = ((nextTime - holdEnd) / totalSeconds) * 100;

        return (
          <div key={i}>
            {/* Hold block — solid color */}
            <div
              className="absolute top-1 bottom-1 rounded-sm"
              style={{
                left: `${left}%`,
                width: `${Math.max(holdWidth || 0.8, 0.8)}%`,
                backgroundColor: colorToCSS(entry.color),
                opacity: 0.7,
              }}
            />
            {/* Transition — faded connector */}
            {i < entries.length - 1 && transWidth > 0.5 && (
              <div
                className="absolute top-2 bottom-2 rounded-sm"
                style={{
                  left: `${((holdEnd) / totalSeconds) * 100}%`,
                  width: `${transWidth}%`,
                  background: `linear-gradient(to right, ${colorToCSS(entry.color)}, ${colorToCSS(entries[i + 1].color)})`,
                  opacity: 0.2,
                }}
              />
            )}
          </div>
        );
      })}

      {/* Playhead */}
      <div
        className="absolute top-0 h-full w-px z-10"
        style={{
          left: `${playheadPct}%`,
          backgroundColor: "var(--accent)",
        }}
      />

      {/* Viewport indicator when zoomed */}
      {zoom > 1 && (
        <div
          className="absolute top-0 h-full rounded-sm"
          style={{
            left: `${viewportLeftPct}%`,
            width: `${viewportWidthPct}%`,
            border: "1px solid var(--accent)",
            opacity: 0.4,
          }}
        />
      )}
    </div>
  );
}
