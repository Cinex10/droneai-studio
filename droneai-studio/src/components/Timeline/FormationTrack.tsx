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

function colorToGlow(color: { type: string; value?: number[]; start?: number[] }): string {
  const rgb = color.value || color.start || [1, 1, 1];
  return `rgba(${Math.round(rgb[0] * 255)}, ${Math.round(rgb[1] * 255)}, ${Math.round(rgb[2] * 255)}, 0.15)`;
}

function fmtTime(s: number): string {
  return s >= 10 ? `${Math.round(s)}` : s.toFixed(1);
}

/** Easing curve as tiny SVG path */
function EasingIcon({ easing }: { easing: string }) {
  const e = easing.toLowerCase().replace(/\s/g, "_");
  // d paths for a 12x8 viewBox
  let d = "M0 8 L12 0"; // linear default
  if (e.includes("ease_in_out") || e === "ease") d = "M0 8 C4 8 8 0 12 0";
  else if (e.includes("ease_in")) d = "M0 8 C6 8 12 2 12 0";
  else if (e.includes("ease_out")) d = "M0 8 C0 4 6 0 12 0";
  return (
    <svg width="12" height="8" viewBox="0 0 12 8" fill="none" className="flex-shrink-0 opacity-40">
      <path d={d} stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
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
    <div className="relative flex-1 min-h-0" style={{ background: "var(--bg-primary)" }}>
      {entries.map((entry, i) => {
        const hold = entry.hold ?? 0;
        const nextTime = i < entries.length - 1 ? entries[i + 1].time : totalSeconds;
        const holdEnd = hold > 0 ? entry.time + hold : entry.time;
        const transitionDuration = nextTime - holdEnd;

        const shapeName = entry.formation.shape || entry.formation.type;
        const glyph = SHAPE_GLYPHS[shapeName] ?? "◇";
        const altitude = entry.formation.params?.altitude;
        const radius = entry.formation.params?.radius;
        const scale = entry.formation.params?.scale;
        const spacing = entry.formation.params?.spacing;
        const ledColor = colorToCSS(entry.color);
        const ledGlow = colorToGlow(entry.color);

        const easing = i < entries.length - 1
          ? entries[i + 1].transition?.easing?.replace(/_/g, " ") ?? "ease"
          : null;

        // Card positioning
        const cardLeft = timeToPct(entry.time);
        const cardEnd = timeToPct(hold > 0 ? holdEnd : Math.min(entry.time + 2, nextTime));
        const cardWidth = Math.max(cardEnd - cardLeft, 4);

        // Hold zone (if hold > 0, extends card with a striped tail)
        const holdLeft = timeToPct(entry.time);
        const holdWidth = hold > 0 ? timeToPct(holdEnd) - holdLeft : 0;

        return (
          <div key={i}>
            {/* Hold zone — striped background behind card */}
            {hold > 0 && holdWidth > 0 && (
              <div
                className="absolute top-0 bottom-0"
                style={{
                  left: `${holdLeft}%`,
                  width: `${holdWidth}%`,
                  background: `repeating-linear-gradient(
                    -45deg,
                    transparent,
                    transparent 3px,
                    ${ledGlow} 3px,
                    ${ledGlow} 4px
                  )`,
                  opacity: 0.6,
                }}
              />
            )}

            {/* Formation card */}
            <div
              className="absolute top-1 bottom-1 flex overflow-hidden"
              style={{
                left: `${cardLeft}%`,
                width: `${cardWidth}%`,
                minWidth: 56,
              }}
            >
              {/* LED color edge */}
              <div
                className="w-[3px] flex-shrink-0 rounded-l"
                style={{
                  background: ledColor,
                  boxShadow: `0 0 6px ${ledColor}, 0 0 12px ${ledGlow}`,
                }}
              />

              {/* Card body */}
              <div
                className="flex-1 flex flex-col justify-center gap-px px-2 py-1 rounded-r"
                style={{
                  background: "var(--bg-secondary)",
                  borderTop: "1px solid var(--border)",
                  borderRight: "1px solid var(--border)",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                {/* Row 1: Glyph + shape name */}
                <div className="flex items-center gap-1.5">
                  <span
                    className="text-[11px] leading-none"
                    style={{ color: ledColor }}
                  >
                    {glyph}
                  </span>
                  <span
                    className="text-[10px] font-semibold uppercase tracking-wide leading-none truncate"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {shapeName}
                  </span>
                </div>

                {/* Row 2: Params grid */}
                <div
                  className="flex items-center gap-2 text-[8px] leading-none"
                  style={{
                    color: "var(--text-secondary)",
                    fontFamily: "ui-monospace, 'SF Mono', 'Cascadia Code', monospace",
                  }}
                >
                  {/* Time */}
                  <span>
                    <span style={{ opacity: 0.5 }}>t</span>
                    {fmtTime(entry.time)}
                    <span style={{ opacity: 0.4 }}>s</span>
                  </span>

                  {/* Altitude */}
                  {altitude !== undefined && (
                    <span>
                      <span style={{ opacity: 0.5 }}>h</span>
                      {String(altitude)}
                      <span style={{ opacity: 0.4 }}>m</span>
                    </span>
                  )}

                  {/* Radius */}
                  {radius !== undefined && (
                    <span>
                      <span style={{ opacity: 0.5 }}>r</span>
                      {String(radius)}
                    </span>
                  )}

                  {/* Scale */}
                  {scale !== undefined && (
                    <span>
                      <span style={{ opacity: 0.5 }}>s</span>
                      {String(scale)}
                    </span>
                  )}

                  {/* Spacing */}
                  {spacing !== undefined && (
                    <span>
                      <span style={{ opacity: 0.5 }}>sp</span>
                      {String(spacing)}
                    </span>
                  )}

                  {/* Hold */}
                  {hold > 0 && (
                    <span style={{ color: ledColor, opacity: 0.7 }}>
                      {fmtTime(hold)}
                      <span style={{ opacity: 0.5 }}>s hold</span>
                    </span>
                  )}
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
                {/* Connector line */}
                <div
                  className="w-full h-0"
                  style={{
                    borderTop: "1px solid rgba(136, 136, 160, 0.12)",
                  }}
                />
                {/* Easing badge */}
                <div
                  className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1 px-1.5 py-0.5 rounded-full"
                  style={{
                    background: "var(--bg-primary)",
                    border: "1px solid var(--border)",
                  }}
                >
                  {easing && <EasingIcon easing={easing} />}
                  <span
                    className="text-[7px] uppercase tracking-wider leading-none"
                    style={{
                      color: "var(--text-secondary)",
                      opacity: 0.6,
                      fontFamily: "ui-monospace, 'SF Mono', 'Cascadia Code', monospace",
                    }}
                  >
                    {fmtTime(transitionDuration)}s
                  </span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
