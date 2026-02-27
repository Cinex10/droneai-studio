import type { TimelineEntry, ColorSpec } from "./types";

interface ColorTrackProps {
  entries: TimelineEntry[];
  totalFrames: number;
  fps: number;
  zoom: number;
  scrollOffset: number;
}

function rgbToCSS(rgb: number[], alpha = 1): string {
  const r = Math.round(rgb[0] * 255);
  const g = Math.round(rgb[1] * 255);
  const b = Math.round(rgb[2] * 255);
  return alpha < 1
    ? `rgba(${r}, ${g}, ${b}, ${alpha})`
    : `rgb(${r}, ${g}, ${b})`;
}

/** Extract a representative CSS gradient for a ColorSpec within its time span. */
function colorSpecToGradient(color: ColorSpec, nextColor: ColorSpec | null): string {
  if (color.type === "program" && color.sequences && color.sequences.length > 0) {
    // Find the "all" sequence, or fall back to the first one
    const seq = color.sequences.find((s) => s.drones === "all") || color.sequences[0];
    if (seq.keyframes.length === 0) {
      return rgbToCSS([1, 1, 1], 0.7);
    }
    if (seq.keyframes.length === 1) {
      return rgbToCSS(seq.keyframes[0].color, 0.7);
    }
    // Build a multi-stop gradient from the keyframes
    const maxT = seq.keyframes[seq.keyframes.length - 1].t || 1;
    const stops = seq.keyframes.map((kf) => {
      const pct = maxT > 0 ? (kf.t / maxT) * 100 : 0;
      return `${rgbToCSS(kf.color, 0.7)} ${pct.toFixed(1)}%`;
    });
    return `linear-gradient(to right, ${stops.join(", ")})`;
  }

  // solid / gradient — existing behavior
  const startRGB = color.value || color.start || [1, 1, 1];
  const endRGB = nextColor
    ? nextColor.value || nextColor.start || [1, 1, 1]
    : startRGB;
  return `linear-gradient(to right, ${rgbToCSS(startRGB, 0.7)}, ${rgbToCSS(endRGB, 0.7)})`;
}

function colorSpecToEdge(color: ColorSpec): string {
  if (color.type === "program" && color.sequences && color.sequences.length > 0) {
    const seq = color.sequences.find((s) => s.drones === "all") || color.sequences[0];
    if (seq.keyframes.length > 0) {
      return rgbToCSS(seq.keyframes[0].color);
    }
  }
  return rgbToCSS(color.value || color.start || [1, 1, 1]);
}

export default function ColorTrack({ entries, totalFrames, fps, zoom, scrollOffset }: ColorTrackProps) {
  const totalSeconds = totalFrames / fps;
  const timeToPct = (t: number) => ((t / totalSeconds) * 100 * zoom) - scrollOffset;

  return (
    <div className="tl-track tl-track-color relative">
      {entries.map((entry, i) => {
        const nextTime = i < entries.length - 1 ? entries[i + 1].time : totalSeconds;
        const left = timeToPct(entry.time);
        const width = timeToPct(nextTime) - left;
        const nextColor = i < entries.length - 1 ? entries[i + 1].color : null;

        return (
          <div
            key={i}
            className="tl-color-block"
            style={{
              left: `${left}%`,
              width: `${width}%`,
              background: colorSpecToGradient(entry.color, nextColor),
              borderLeft: `2px solid ${colorSpecToEdge(entry.color)}`,
            }}
          />
        );
      })}
    </div>
  );
}
