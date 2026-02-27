import type { TimelineEntry } from "./types";

interface FormationTrackProps {
  entries: TimelineEntry[];
  totalFrames: number;
  fps: number;
  zoom: number;
  scrollOffset: number;
}

// Shape glyphs — tiny geometric hints for each formation type
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
    <div className="tl-track relative" style={{ background: "var(--bg-primary)" }}>
      {entries.map((entry, i) => {
        const hold = entry.hold ?? 0;
        const nextTime = i < entries.length - 1 ? entries[i + 1].time : totalSeconds;
        const holdEnd = hold > 0 ? entry.time + hold : entry.time;
        const shapeName = entry.formation.shape || entry.formation.type;
        const glyph = SHAPE_GLYPHS[shapeName] ?? "◇";
        const ledColor = colorToCSS(entry.color);

        // The full clip spans from entry.time to nextTime
        const clipLeft = timeToPct(entry.time);
        const clipWidth = timeToPct(nextTime) - clipLeft;

        // Hold portion as a fraction of the clip
        const holdFraction = hold > 0 ? (holdEnd - entry.time) / (nextTime - entry.time) : 0;

        return (
          <div
            key={i}
            className="tl-clip"
            style={{
              left: `${clipLeft}%`,
              width: `${clipWidth}%`,
            }}
          >
            {/* Hold portion — bright solid */}
            {holdFraction > 0 && (
              <div
                className="tl-clip-hold"
                style={{
                  width: `${holdFraction * 100}%`,
                  background: colorToRGBA(entry.color, 0.45),
                }}
              />
            )}

            {/* Transition portion — dimmer gradient */}
            <div
              className="tl-clip-body"
              style={{
                width: holdFraction > 0 ? `${(1 - holdFraction) * 100}%` : "100%",
                background: holdFraction > 0
                  ? `linear-gradient(to right, ${colorToRGBA(entry.color, 0.3)}, ${
                      i < entries.length - 1
                        ? colorToRGBA(entries[i + 1].color, 0.18)
                        : colorToRGBA(entry.color, 0.12)
                    })`
                  : colorToRGBA(entry.color, 0.35),
              }}
            />

            {/* Left accent edge */}
            <div
              className="tl-clip-edge"
              style={{ background: ledColor }}
            />

            {/* Label overlay */}
            <div className="tl-clip-label">
              <span className="tl-clip-glyph" style={{ color: ledColor }}>{glyph}</span>
              <span className="tl-clip-name">{shapeName}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
