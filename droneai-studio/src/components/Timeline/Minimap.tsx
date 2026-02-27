import type { TimelineEntry } from "./types";

interface MinimapProps {
  entries: TimelineEntry[];
  totalFrames: number;
  fps: number;
  zoom: number;
  scrollOffset: number;
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
  onNavigate,
}: MinimapProps) {
  const totalSeconds = totalFrames / fps;
  const viewportWidthPct = (1 / zoom) * 100;
  const viewportLeftPct = (scrollOffset / (100 * zoom)) * 100;

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickPct = (e.clientX - rect.left) / rect.width;
    const newOffset = clickPct * 100 * zoom - viewportWidthPct / 2;
    onNavigate(Math.max(0, newOffset));
  };

  return (
    <div
      className="relative h-3 bg-[var(--bg-tertiary)] cursor-pointer"
      onClick={handleClick}
    >
      {/* Formation blocks */}
      {entries.map((entry, i) => {
        const nextTime = i < entries.length - 1 ? entries[i + 1].time : totalSeconds;
        const left = (entry.time / totalSeconds) * 100;
        const width = ((nextTime - entry.time) / totalSeconds) * 100;
        return (
          <div
            key={i}
            className="absolute top-0.5 bottom-0.5 rounded-sm opacity-70"
            style={{
              left: `${left}%`,
              width: `${Math.max(width, 1)}%`,
              backgroundColor: colorToCSS(entry.color),
            }}
          />
        );
      })}

      {/* Viewport indicator */}
      {zoom > 1 && (
        <div
          className="absolute top-0 h-full border border-[var(--accent)] opacity-50 rounded-sm"
          style={{ left: `${viewportLeftPct}%`, width: `${viewportWidthPct}%` }}
        />
      )}
    </div>
  );
}
