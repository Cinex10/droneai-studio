import type { TimelineEntry } from "./types";

interface FormationTrackProps {
  entries: TimelineEntry[];
  totalFrames: number;
  fps: number;
  zoom: number;
  scrollOffset: number;
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
        const hasTransition = i < entries.length - 1 && holdEnd < nextTime;
        const shapeName = entry.formation.shape || entry.formation.type;
        const glyph = SHAPE_GLYPHS[shapeName] ?? "◇";
        const ledColor = colorToCSS(entry.color);

        // Formation block: entry.time → holdEnd (solid)
        // If no hold, use a minimum visual width up to nextTime
        const formEnd = hold > 0 ? holdEnd : Math.min(entry.time + 1.5, nextTime);
        const formLeft = timeToPct(entry.time);
        const formWidth = timeToPct(formEnd) - formLeft;

        // Transition block: holdEnd → nextTime (dimmer, different style)
        const transLeft = timeToPct(holdEnd > entry.time ? holdEnd : formEnd);
        const transWidth = timeToPct(nextTime) - transLeft;

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
              <div className="tl-clip-label">
                <span className="tl-clip-glyph" style={{ color: ledColor }}>{glyph}</span>
                <span className="tl-clip-name">{shapeName}</span>
              </div>
            </div>

            {/* Transition zone — distinct visual */}
            {hasTransition && transWidth > 0 && (
              <div
                className="tl-transition"
                style={{
                  left: `${transLeft}%`,
                  width: `${transWidth}%`,
                }}
              >
                {/* Gradient from current to next color */}
                <div
                  className="tl-transition-fill"
                  style={{
                    background: `linear-gradient(to right, ${colorToRGBA(entry.color, 0.15)}, ${
                      colorToRGBA(entries[i + 1].color, 0.15)
                    })`,
                  }}
                />
                {/* Diagonal stripes to mark transition */}
                <div className="tl-transition-stripes" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
