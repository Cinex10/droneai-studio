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

function formatDuration(seconds: number): string {
  return seconds >= 10 ? `${Math.round(seconds)}s` : `${seconds.toFixed(1)}s`;
}

export default function FormationTrack({
  entries,
  totalFrames,
  fps,
  zoom,
  scrollOffset,
}: FormationTrackProps) {
  const totalSeconds = totalFrames / fps;

  const timeToPct = (time: number) =>
    ((time / totalSeconds) * 100 * zoom) - scrollOffset;

  return (
    <div className="relative flex-1 min-h-0 bg-[var(--bg-primary)]">
      {entries.map((entry, i) => {
        const hold = entry.hold ?? 0;
        const nextTime = i < entries.length - 1 ? entries[i + 1].time : totalSeconds;
        const holdEnd = hold > 0 ? entry.time + hold : entry.time;
        const transitionDuration = nextTime - holdEnd;

        const shapeName = entry.formation.shape || entry.formation.type;
        const altitude = entry.formation.params?.altitude;
        const easing = i < entries.length - 1
          ? entries[i + 1].transition?.easing?.replace(/_/g, " ") ?? "ease"
          : null;

        // Card spans from entry.time to holdEnd (or a minimum width)
        const cardLeft = timeToPct(entry.time);
        const cardRight = timeToPct(hold > 0 ? holdEnd : Math.min(entry.time + 1.5, nextTime));
        const cardWidth = Math.max(cardRight - cardLeft, 3);

        return (
          <div key={i}>
            {/* Formation card */}
            <div
              className="absolute top-1 bottom-1 rounded overflow-hidden flex flex-col"
              style={{
                left: `${cardLeft}%`,
                width: `${cardWidth}%`,
                minWidth: 60,
              }}
            >
              {/* Color accent bar at top */}
              <div
                className="h-0.5 w-full flex-shrink-0"
                style={{ backgroundColor: colorToCSS(entry.color) }}
              />

              {/* Card body */}
              <div
                className="flex-1 px-1.5 py-0.5 flex flex-col justify-center border border-t-0 rounded-b"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  borderColor: "var(--border)",
                }}
              >
                {/* Shape name */}
                <span className="text-[10px] text-[var(--text-primary)] font-medium capitalize truncate leading-tight">
                  {shapeName}
                </span>

                {/* Config row */}
                <div className="flex items-center gap-1.5 mt-0.5 text-[8px] text-[var(--text-secondary)] leading-tight">
                  {altitude !== undefined && (
                    <span>{String(altitude)}m</span>
                  )}
                  {hold > 0 && (
                    <span className="opacity-70">{formatDuration(hold)} hold</span>
                  )}
                  <span className="opacity-50">{formatDuration(entry.time)}</span>
                </div>
              </div>
            </div>

            {/* Transition connector */}
            {i < entries.length - 1 && transitionDuration > 0.1 && (
              <div
                className="absolute flex items-center"
                style={{
                  left: `${timeToPct(holdEnd)}%`,
                  width: `${Math.max(timeToPct(nextTime) - timeToPct(holdEnd), 1)}%`,
                  top: "50%",
                  transform: "translateY(-50%)",
                }}
              >
                {/* Dashed line */}
                <div
                  className="w-full h-0"
                  style={{
                    borderTop: "1px dashed rgba(136, 136, 160, 0.25)",
                  }}
                />
                {/* Transition label */}
                <span
                  className="absolute left-1/2 -translate-x-1/2 text-[7px] uppercase tracking-wider px-1"
                  style={{
                    color: "var(--text-secondary)",
                    opacity: 0.5,
                    backgroundColor: "var(--bg-primary)",
                  }}
                >
                  {easing} {formatDuration(transitionDuration)}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
