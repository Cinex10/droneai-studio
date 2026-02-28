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
  zoom: number;
  onZoomChange: (zoom: number) => void;
}

const SPEEDS = [0.5, 1, 2];

function formatTime(frame: number, fps: number): string {
  const totalSec = Math.floor(frame / fps);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
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
  zoom,
  onZoomChange,
}: ControlsBarProps) {
  const cycleSpeed = () => {
    const idx = SPEEDS.indexOf(speed);
    onSpeedChange(SPEEDS[(idx + 1) % SPEEDS.length]);
  };

  const layerKeys: { key: keyof TimelineLayerVisibility; label: string }[] = [
    { key: "preview", label: "V" },
    { key: "formations", label: "F" },
    { key: "color", label: "C" },
  ];

  return (
    <div className="tl-toolbar">
      {/* Left section: layer toggles */}
      <div className="tl-toolbar-section">
        {layerKeys.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => onToggleLayer(key)}
            className={`tl-toolbar-toggle ${layers[key] ? "active" : ""}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Center section: playback controls + time */}
      <div className="tl-toolbar-center">
        {/* Skip back */}
        <button
          onClick={() => {/* seek to start handled by parent */}}
          disabled={!hasShow}
          className="tl-toolbar-btn"
          title="Skip to start"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <rect x="1" y="2" width="1.5" height="8" rx="0.5" />
            <path d="M10 2L4 6L10 10V2Z" />
          </svg>
        </button>

        {/* Play / Pause */}
        <button
          onClick={onPlayPause}
          disabled={!hasShow}
          className="tl-toolbar-play"
          title={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <rect x="3" y="2" width="3" height="10" rx="0.5" />
              <rect x="8" y="2" width="3" height="10" rx="0.5" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <path d="M3 1.5L12 7L3 12.5V1.5Z" />
            </svg>
          )}
        </button>

        {/* Skip forward */}
        <button
          onClick={() => {/* seek to end handled by parent */}}
          disabled={!hasShow}
          className="tl-toolbar-btn"
          title="Skip to end"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <rect x="9.5" y="2" width="1.5" height="8" rx="0.5" />
            <path d="M2 2L8 6L2 10V2Z" />
          </svg>
        </button>

        {/* Divider */}
        <div className="tl-toolbar-divider" />

        {/* Time display */}
        <span className="tl-toolbar-time">
          {hasShow
            ? `${formatTime(currentFrame, fps)} / ${formatTime(totalFrames, fps)}`
            : "--:-- / --:--"}
        </span>

        {/* Divider */}
        <div className="tl-toolbar-divider" />

        {/* Speed */}
        <button
          onClick={cycleSpeed}
          disabled={!hasShow}
          className="tl-toolbar-speed"
        >
          {speed}x
        </button>
      </div>

      {/* Right section: zoom */}
      <div className="tl-toolbar-section">
        <button
          className="tl-toolbar-btn"
          onClick={() => onZoomChange(Math.max(1, zoom - 0.5))}
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="5" cy="5" r="3.5" />
            <line x1="7.5" y1="7.5" x2="10" y2="10" />
            <line x1="3" y1="5" x2="7" y2="5" />
          </svg>
        </button>
        <input
          type="range"
          min="1"
          max="10"
          step="0.1"
          value={zoom}
          onChange={(e) => onZoomChange(parseFloat(e.target.value))}
          className="tl-zoom-slider"
        />
        <button
          className="tl-toolbar-btn"
          onClick={() => onZoomChange(Math.min(10, zoom + 0.5))}
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="5" cy="5" r="3.5" />
            <line x1="7.5" y1="7.5" x2="10" y2="10" />
            <line x1="3" y1="5" x2="7" y2="5" />
            <line x1="5" y1="3" x2="5" y2="7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
