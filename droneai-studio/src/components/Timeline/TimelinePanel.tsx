import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SceneData } from "../../types/scene";
import type { ShowInfo, TimelineLayerVisibility } from "./types";
import Minimap from "./Minimap";
import Ruler from "./Ruler";
import DroneCountTrack from "./DroneCountTrack";
import FormationTrack from "./FormationTrack";
import ColorTrack from "./ColorTrack";
import SafetyStrip from "./SafetyStrip";
import ControlsBar from "./ControlsBar";

interface TimelinePanelProps {
  sceneData: SceneData | null;
  showInfo: ShowInfo | null;
  blenderRunning: boolean;
  onFrameChange: (frame: number) => void;
}

const MIN_HEIGHT = 80;
const MAX_HEIGHT = 350;
const DEFAULT_HEIGHT = 160;

export default function TimelinePanel({
  sceneData,
  showInfo,
  blenderRunning,
  onFrameChange,
}: TimelinePanelProps) {
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [layers, setLayers] = useState<TimelineLayerVisibility>({
    minimap: true,
    droneCount: true,
    formations: true,
    color: true,
    safety: true,
  });

  const playRef = useRef<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fps = sceneData?.fps ?? 24;
  const totalFrames = sceneData?.frame_range?.[1] ?? 0;
  const hasShow = totalFrames > 0 && (sceneData?.drones?.length ?? 0) > 0;
  const spec = showInfo?.spec ?? null;
  const entries = spec?.timeline ?? [];

  // Clamp frame on new show
  useEffect(() => {
    if (totalFrames > 0 && currentFrame > totalFrames) {
      setCurrentFrame(0);
      onFrameChange(0);
    }
  }, [totalFrames, currentFrame, onFrameChange]);

  // Send frame to Blender (debounced)
  const sendFrame = useCallback(
    (frame: number) => {
      if (!blenderRunning) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        invoke("set_blender_frame", { frame }).catch(() => {});
      }, 50);
    },
    [blenderRunning]
  );

  // Seek handler
  const handleSeek = useCallback(
    (frame: number) => {
      setCurrentFrame(frame);
      onFrameChange(frame);
      sendFrame(frame);
    },
    [sendFrame, onFrameChange]
  );

  // Playback loop
  useEffect(() => {
    if (!isPlaying || !hasShow) {
      if (playRef.current) cancelAnimationFrame(playRef.current);
      return;
    }
    let lastTime = performance.now();
    const step = (now: number) => {
      const dt = now - lastTime;
      if (dt >= 1000 / (fps * speed)) {
        lastTime = now;
        setCurrentFrame((prev) => {
          const next = prev >= totalFrames ? 0 : prev + 1;
          onFrameChange(next);
          sendFrame(next);
          return next;
        });
      }
      playRef.current = requestAnimationFrame(step);
    };
    playRef.current = requestAnimationFrame(step);
    return () => {
      if (playRef.current) cancelAnimationFrame(playRef.current);
    };
  }, [isPlaying, hasShow, sendFrame, onFrameChange, totalFrames, fps, speed]);

  // Zoom via mouse wheel
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((prev) => Math.max(1, Math.min(10, prev + (e.deltaY > 0 ? -0.2 : 0.2))));
  }, []);

  // Resize drag handle
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = height;
    const move = (ev: MouseEvent) => {
      const delta = startY - ev.clientY;
      setHeight(Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, startH + delta)));
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }, [height]);

  const toggleLayer = (key: keyof TimelineLayerVisibility) => {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (!hasShow) {
    return (
      <div className="h-10 flex items-center justify-center bg-[var(--bg-secondary)] border-t border-[var(--border)]">
        <span className="text-xs text-[var(--text-secondary)]">No show loaded</span>
      </div>
    );
  }

  return (
    <div
      className="border-t border-[var(--border)] flex flex-col bg-[var(--bg-secondary)]"
      style={{ height }}
      onWheel={handleWheel}
    >
      {/* Resize handle */}
      <div
        className="h-1 cursor-ns-resize hover:bg-[var(--accent)]/30 transition-colors"
        onMouseDown={handleResizeStart}
      />

      {/* Layers */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {layers.minimap && (
          <Minimap
            entries={entries}
            totalFrames={totalFrames}
            fps={fps}
            zoom={zoom}
            scrollOffset={scrollOffset}
            onNavigate={setScrollOffset}
          />
        )}

        <Ruler
          totalFrames={totalFrames}
          currentFrame={currentFrame}
          fps={fps}
          zoom={zoom}
          scrollOffset={scrollOffset}
          onSeek={handleSeek}
        />

        {layers.droneCount && spec && (
          <DroneCountTrack droneCount={spec.drone_count} />
        )}

        {layers.formations && entries.length > 0 && (
          <FormationTrack
            entries={entries}
            totalFrames={totalFrames}
            fps={fps}
            zoom={zoom}
            scrollOffset={scrollOffset}
          />
        )}

        {layers.color && entries.length > 0 && (
          <ColorTrack
            entries={entries}
            totalFrames={totalFrames}
            fps={fps}
            zoom={zoom}
            scrollOffset={scrollOffset}
          />
        )}

        {layers.safety && (
          <SafetyStrip safety={showInfo?.safety ?? null} />
        )}
      </div>

      {/* Controls */}
      <ControlsBar
        isPlaying={isPlaying}
        onPlayPause={() => setIsPlaying(!isPlaying)}
        currentFrame={currentFrame}
        totalFrames={totalFrames}
        fps={fps}
        speed={speed}
        onSpeedChange={setSpeed}
        hasShow={hasShow}
        layers={layers}
        onToggleLayer={toggleLayer}
      />
    </div>
  );
}
