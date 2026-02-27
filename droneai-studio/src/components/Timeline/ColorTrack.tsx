import type { TimelineEntry } from "./types";

interface ColorTrackProps {
  entries: TimelineEntry[];
  totalFrames: number;
  fps: number;
  zoom: number;
  scrollOffset: number;
}

function colorToCSS(c: { value?: number[]; start?: number[] }): string {
  const rgb = c.value || c.start || [1, 1, 1];
  return `rgb(${Math.round(rgb[0] * 255)}, ${Math.round(rgb[1] * 255)}, ${Math.round(rgb[2] * 255)})`;
}

function colorToRGBA(c: { value?: number[]; start?: number[] }, a: number): string {
  const rgb = c.value || c.start || [1, 1, 1];
  return `rgba(${Math.round(rgb[0] * 255)}, ${Math.round(rgb[1] * 255)}, ${Math.round(rgb[2] * 255)}, ${a})`;
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
        const nextColor = i < entries.length - 1 ? entries[i + 1].color : entry.color;

        return (
          <div
            key={i}
            className="tl-color-block"
            style={{
              left: `${left}%`,
              width: `${width}%`,
              background: `linear-gradient(to right, ${colorToRGBA(entry.color, 0.7)}, ${colorToRGBA(nextColor, 0.7)})`,
              borderLeft: `2px solid ${colorToCSS(entry.color)}`,
            }}
          />
        );
      })}
    </div>
  );
}
