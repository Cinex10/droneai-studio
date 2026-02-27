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

export default function ColorTrack({ entries, totalFrames, fps, zoom, scrollOffset }: ColorTrackProps) {
  const totalSeconds = totalFrames / fps;
  const timeToPct = (t: number) => ((t / totalSeconds) * 100 * zoom) - scrollOffset;

  // Build gradient stops
  const stops = entries.map((e) => `${colorToCSS(e.color)} ${timeToPct(e.time)}%`).join(", ");

  return (
    <div
      className="h-3 w-full"
      style={{ background: `linear-gradient(to right, ${stops})` }}
    />
  );
}
