import type { TimelineLayerVisibility } from "./types";

interface ControlsBarProps {
  isPlaying: boolean;
  onPlayPause: () => void;
  currentFrame: number;
  totalFrames: number;
  fps: number;
  speed: number;
  onSpeedChange: (speed: number) => void;
  hasShow: boolean;
  layers: TimelineLayerVisibility;
  onToggleLayer: (layer: keyof TimelineLayerVisibility) => void;
}

const SPEEDS = [0.5, 1, 2];

function formatTime(frame: number, fps: number): string {
  const seconds = Math.floor(frame / fps);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export default function ControlsBar({
  isPlaying,
  onPlayPause,
  currentFrame,
  totalFrames,
  fps,
  speed,
  onSpeedChange,
  hasShow,
  layers,
  onToggleLayer,
}: ControlsBarProps) {
  const cycleSpeed = () => {
    const idx = SPEEDS.indexOf(speed);
    onSpeedChange(SPEEDS[(idx + 1) % SPEEDS.length]);
  };

  const layerKeys: { key: keyof TimelineLayerVisibility; label: string }[] = [
    { key: "minimap", label: "M" },
    { key: "droneCount", label: "D" },
    { key: "formations", label: "F" },
    { key: "color", label: "C" },
    { key: "safety", label: "S" },
  ];

  return (
    <div className="flex items-center h-8 px-3 gap-3 bg-[var(--bg-tertiary)] border-t border-[var(--border)]">
      {/* Play/Pause */}
      <button
        onClick={onPlayPause}
        disabled={!hasShow}
        className="text-[var(--text-primary)] hover:text-[var(--accent)] text-sm disabled:opacity-30 disabled:cursor-default w-5"
      >
        {isPlaying ? "\u23F8" : "\u25B6"}
      </button>

      {/* Time display */}
      <span className="text-xs text-[var(--text-secondary)] font-mono">
        {hasShow
          ? `${formatTime(currentFrame, fps)} / ${formatTime(totalFrames, fps)}`
          : "--:-- / --:--"}
      </span>

      {/* Speed */}
      <button
        onClick={cycleSpeed}
        disabled={!hasShow}
        className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-secondary)] disabled:opacity-30"
      >
        {speed}x
      </button>

      <div className="flex-1" />

      {/* Layer toggles */}
      <div className="flex gap-1">
        {layerKeys.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => onToggleLayer(key)}
            className={`text-[10px] w-5 h-5 rounded font-mono ${
              layers[key]
                ? "bg-[var(--accent)]/20 text-[var(--accent)]"
                : "bg-[var(--bg-secondary)] text-[var(--text-secondary)]"
            } hover:opacity-80`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
