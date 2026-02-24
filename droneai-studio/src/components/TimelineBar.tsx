import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SceneData } from "../types/scene";

interface TimelineBarProps {
  blenderRunning: boolean;
  onFrameChange?: (frame: number) => void;
  sceneData?: SceneData | null;
}

export default function TimelineBar({ blenderRunning, onFrameChange, sceneData }: TimelineBarProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const playRef = useRef<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Derive timeline bounds from scene data, fall back to 0 when no show loaded
  const fps = sceneData?.fps ?? 24;
  const totalFrames = sceneData?.frame_range?.[1] ?? 0;

  // Clamp current frame when totalFrames shrinks (e.g. new show loaded)
  useEffect(() => {
    if (totalFrames > 0 && currentFrame > totalFrames) {
      setCurrentFrame(0);
      onFrameChange?.(0);
    }
  }, [totalFrames, currentFrame, onFrameChange]);

  const sendFrame = useCallback((frame: number) => {
    if (!blenderRunning) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      invoke("set_blender_frame", { frame }).catch(() => {
        // Blender may not be connected yet
      });
    }, 50);
  }, [blenderRunning]);

  const handleScrub = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const frame = Number(e.target.value);
    setCurrentFrame(frame);
    onFrameChange?.(frame);
    sendFrame(frame);
  }, [sendFrame, onFrameChange]);

  // Playback loop
  useEffect(() => {
    if (!isPlaying) {
      if (playRef.current) cancelAnimationFrame(playRef.current);
      return;
    }

    let lastTime = performance.now();
    const step = (now: number) => {
      const dt = now - lastTime;
      if (dt >= 1000 / fps) {
        lastTime = now;
        setCurrentFrame((prev) => {
          const next = prev >= totalFrames ? 0 : prev + 1;
          onFrameChange?.(next);
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
  }, [isPlaying, sendFrame, onFrameChange, totalFrames, fps]);

  const formatTime = (frame: number) => {
    const seconds = Math.floor(frame / fps);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const hasShow = totalFrames > 0;

  return (
    <div className="flex items-center h-full px-4 gap-3 bg-[var(--bg-secondary)]">
      {/* Play/Pause */}
      <button
        onClick={() => hasShow && setIsPlaying(!isPlaying)}
        disabled={!hasShow}
        className="text-[var(--text-primary)] hover:text-[var(--accent)] text-lg disabled:opacity-30 disabled:cursor-default"
      >
        {isPlaying ? "\u23F8" : "\u25B6"}
      </button>

      {/* Scrubber */}
      <input
        type="range"
        min={0}
        max={totalFrames || 1}
        value={currentFrame}
        onChange={handleScrub}
        disabled={!hasShow}
        className="flex-1 h-1 accent-[var(--accent)] disabled:opacity-30"
      />

      {/* Time display */}
      <span className="text-xs text-[var(--text-secondary)] font-mono min-w-[90px] text-right">
        {hasShow
          ? `${formatTime(currentFrame)} / ${formatTime(totalFrames)}`
          : "--:-- / --:--"}
      </span>
    </div>
  );
}
