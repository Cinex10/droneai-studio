import { useState } from "react";
import type { TimelineEntry } from "./types";

interface FormationTrackProps {
  entries: TimelineEntry[];
  totalFrames: number;
  fps: number;
  zoom: number;
  scrollOffset: number;
}

function colorToCSS(color: { type: string; value?: number[]; start?: number[] }): string {
  const rgb = color.value || color.start || [1, 1, 1];
  return `rgb(${Math.round(rgb[0] * 255)}, ${Math.round(rgb[1] * 255)}, ${Math.round(rgb[2] * 255)})`;
}

export default function FormationTrack({
  entries,
  totalFrames,
  fps,
  zoom,
  scrollOffset,
}: FormationTrackProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const totalSeconds = totalFrames / fps;

  const timeToPct = (time: number) =>
    ((time / totalSeconds) * 100 * zoom) - scrollOffset;

  return (
    <div className="relative h-12 bg-[var(--bg-primary)]">
      {entries.map((entry, i) => {
        const nextTime = i < entries.length - 1 ? entries[i + 1].time : entry.time + 2;
        const holdEnd = i < entries.length - 1
          ? entry.time + (nextTime - entry.time) * 0.7
          : totalSeconds;
        const left = timeToPct(entry.time);
        const width = timeToPct(holdEnd) - left;
        const shapeName = entry.formation.shape || entry.formation.type;

        return (
          <div key={i}>
            {/* Formation card */}
            <div
              className="absolute top-1 bottom-1 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] flex flex-col justify-center px-2 overflow-hidden cursor-default hover:border-[var(--accent)] transition-colors"
              style={{ left: `${left}%`, width: `${Math.max(width, 2)}%` }}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              <span className="text-[10px] text-[var(--text-primary)] font-medium truncate capitalize">
                {shapeName}
              </span>
              <div className="flex items-center gap-1 mt-0.5">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: colorToCSS(entry.color) }}
                />
                <span className="text-[9px] text-[var(--text-secondary)]">
                  {entry.time}s
                </span>
              </div>

              {/* Tooltip */}
              {hoveredIdx === i && (
                <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-2 py-1 text-[10px] text-[var(--text-primary)] whitespace-nowrap z-20 shadow-lg">
                  {shapeName}
                  {entry.formation.params &&
                    Object.entries(entry.formation.params)
                      .map(([k, v]) => ` · ${k}: ${v}`)
                      .join("")}
                </div>
              )}
            </div>

            {/* Transition block */}
            {i < entries.length - 1 && (
              <div
                className="absolute top-3 bottom-3 flex items-center justify-center"
                style={{
                  left: `${timeToPct(holdEnd)}%`,
                  width: `${timeToPct(nextTime) - timeToPct(holdEnd)}%`,
                }}
              >
                <div className="w-full h-px bg-[var(--text-secondary)] opacity-30" />
                <span className="absolute text-[8px] text-[var(--text-secondary)] opacity-60 bg-[var(--bg-primary)] px-1">
                  {entries[i + 1].transition?.easing?.replace("_", " ") || "ease"}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
