import type { ShowInfo } from "./Timeline/types";
import type { SceneData } from "../types/scene";

interface ShowStatsHUDProps {
  sceneData: SceneData | null;
  showInfo: ShowInfo | null;
}

export default function ShowStatsHUD({ sceneData, showInfo }: ShowStatsHUDProps) {
  const drones = sceneData?.drones?.length ?? 0;
  const fps = sceneData?.fps ?? 24;
  const totalFrames = sceneData?.frame_range?.[1] ?? 0;
  const duration = totalFrames > 0 ? totalFrames / fps : 0;
  const safety = showInfo?.safety;
  const spec = showInfo?.spec;

  if (drones === 0 && !spec) return null;

  const isSafe = safety?.is_safe ?? true;

  return (
    <div className="absolute top-3 left-3 z-10 pointer-events-none select-none">
      <div
        className="flex items-center gap-3 px-3 py-1.5 rounded-md text-[11px] font-mono"
        style={{
          background: "rgba(10, 10, 15, 0.75)",
          backdropFilter: "blur(8px)",
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {/* Drone count */}
        {drones > 0 && (
          <span className="text-[var(--text-secondary)]">
            <span className="text-[var(--text-primary)]">{spec?.drone_count ?? drones}</span> drones
          </span>
        )}

        {/* Duration */}
        {duration > 0 && (
          <>
            <span className="text-[var(--border)]">|</span>
            <span className="text-[var(--text-secondary)]">
              <span className="text-[var(--text-primary)]">{duration.toFixed(1)}</span>s
            </span>
          </>
        )}

        {/* Safety stats */}
        {safety && (
          <>
            <span className="text-[var(--border)]">|</span>
            <span className="text-[var(--text-secondary)]">
              <span className="text-[var(--text-primary)]">{safety.min_spacing_found.toFixed(1)}</span>m min
            </span>
            <span className="text-[var(--text-secondary)]">
              <span className="text-[var(--text-primary)]">{safety.max_velocity_found.toFixed(1)}</span>m/s
            </span>
            <span className="text-[var(--text-secondary)]">
              <span className="text-[var(--text-primary)]">{safety.max_altitude_found.toFixed(1)}</span>m alt
            </span>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded"
              style={{
                background: isSafe ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)",
                color: isSafe ? "#4ade80" : "#f87171",
              }}
            >
              {isSafe ? "SAFE" : "WARN"}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
