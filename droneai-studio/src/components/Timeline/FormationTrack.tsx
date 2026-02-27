import type { TimelineEntry } from "./types";

interface FormationTrackProps {
  entries: TimelineEntry[];
  totalFrames: number;
  fps: number;
  zoom: number;
  scrollOffset: number;
  droneCount: number;
}

const SHAPE_GLYPHS: Record<string, string> = {
  grid: "⊞",
  circle: "◎",
  heart: "♥",
  star: "✦",
  spiral: "◌",
  sphere: "◉",
  text: "A",
  positions: "⊡",
  parametric: "◇",
};

function colorToCSS(color: { type: string; value?: number[]; start?: number[] }): string {
  const rgb = color.value || color.start || [1, 1, 1];
  return `rgb(${Math.round(rgb[0] * 255)}, ${Math.round(rgb[1] * 255)}, ${Math.round(rgb[2] * 255)})`;
}

function colorToRGBA(color: { type: string; value?: number[]; start?: number[] }, a: number): string {
  const rgb = color.value || color.start || [1, 1, 1];
  return `rgba(${Math.round(rgb[0] * 255)}, ${Math.round(rgb[1] * 255)}, ${Math.round(rgb[2] * 255)}, ${a})`;
}

/** Extract altitude from params — handles altitude, altitude_start, or radius for sphere */
function getAltitude(params?: Record<string, unknown>): number | null {
  if (!params) return null;
  if (typeof params.altitude === "number") return params.altitude;
  if (typeof params.altitude_start === "number") return params.altitude_start;
  return null;
}

/** How many drones this formation uses (positions type has explicit count) */
function getActiveDrones(entry: TimelineEntry, total: number): number {
  if (entry.formation.type === "positions" && Array.isArray(entry.formation.params?.positions)) {
    return (entry.formation.params.positions as unknown[]).length;
  }
  return total;
}

export default function FormationTrack({
  entries,
  totalFrames,
  fps,
  zoom,
  scrollOffset,
  droneCount,
}: FormationTrackProps) {
  const totalSeconds = totalFrames / fps;

  const timeToPct = (time: number) =>
    ((time / totalSeconds) * 100 * zoom) - scrollOffset;

  return (
    <div className="tl-track relative" style={{ background: "var(--bg-primary)" }}>
      {entries.map((entry, i) => {
        const hold = entry.hold ?? 0;
        const nextTime = i < entries.length - 1 ? entries[i + 1].time : totalSeconds;
        const holdEnd = hold > 0 ? entry.time + hold : entry.time;
        const hasTransition = i < entries.length - 1 && holdEnd < nextTime;
        const shapeName = entry.formation.shape || entry.formation.type;
        const glyph = SHAPE_GLYPHS[shapeName] ?? "◇";
        const ledColor = colorToCSS(entry.color);

        // Formation block: entry.time → holdEnd (solid)
        const formEnd = hold > 0 ? holdEnd : Math.min(entry.time + 1.5, nextTime);
        const formLeft = timeToPct(entry.time);
        const formWidth = timeToPct(formEnd) - formLeft;

        // Transition block: holdEnd → nextTime
        const transLeft = timeToPct(holdEnd > entry.time ? holdEnd : formEnd);
        const transWidth = timeToPct(nextTime) - transLeft;

        // Data readouts
        const altitude = getAltitude(entry.formation.params);
        const activeDrones = getActiveDrones(entry, droneCount);

        return (
          <div key={i}>
            {/* Formation block — solid colored */}
            <div
              className="tl-clip"
              style={{
                left: `${formLeft}%`,
                width: `${formWidth}%`,
              }}
            >
              <div
                className="tl-clip-fill"
                style={{ background: colorToRGBA(entry.color, 0.4) }}
              />
              <div
                className="tl-clip-edge"
                style={{ background: ledColor }}
              />

              {/* Content overlay — two rows */}
              <div className="tl-clip-content">
                {/* Row 1: glyph + name */}
                <div className="tl-clip-row-name">
                  <span className="tl-clip-glyph" style={{ color: ledColor }}>{glyph}</span>
                  <span className="tl-clip-name">{shapeName}</span>
                </div>

                {/* Row 2: data chips */}
                <div className="tl-clip-row-data">
                  {/* Altitude */}
                  {altitude !== null && (
                    <span className="tl-chip">
                      <span className="tl-chip-icon">↑</span>
                      {altitude}m
                    </span>
                  )}

                  {/* Hold time */}
                  {hold > 0 && (
                    <span className="tl-chip">
                      <span className="tl-chip-icon">⏸</span>
                      {hold >= 10 ? Math.round(hold) : hold.toFixed(1)}s
                    </span>
                  )}

                  {/* Drone count */}
                  {droneCount > 0 && (
                    <span className="tl-chip">
                      <span className="tl-chip-icon">●</span>
                      {activeDrones}/{droneCount}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Transition zone */}
            {hasTransition && transWidth > 0 && (
              <div
                className="tl-transition"
                style={{
                  left: `${transLeft}%`,
                  width: `${transWidth}%`,
                }}
              >
                <div
                  className="tl-transition-fill"
                  style={{
                    background: `linear-gradient(to right, ${colorToRGBA(entry.color, 0.15)}, ${
                      colorToRGBA(entries[i + 1].color, 0.15)
                    })`,
                  }}
                />
                <div className="tl-transition-stripes" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
