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

  // Build rows: [label, value]
  const rows: [string, string][] = [];

  if (drones > 0) {
    rows.push(["Drones", String(spec?.drone_count ?? drones)]);
  }
  if (duration > 0) {
    rows.push(["Duration", `${duration.toFixed(1)}s`]);
  }
  if (safety) {
    rows.push(["Min spacing", `${safety.min_spacing_found.toFixed(1)}m`]);
    rows.push(["Max velocity", `${safety.max_velocity_found.toFixed(1)}m/s`]);
    rows.push(["Max altitude", `${safety.max_altitude_found.toFixed(1)}m`]);
  }

  return (
    <div className="absolute top-2 left-2 z-10 pointer-events-none select-none">
      <div className="hud-panel">
        <div className="hud-grid">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <span className="hud-label">{label}</span>
              <span className="hud-value">{value}</span>
            </div>
          ))}
        </div>

        {/* Safety badge — full width below the grid */}
        {safety && (
          <div
            className="hud-badge"
            style={{
              background: isSafe ? "rgba(34, 197, 94, 0.12)" : "rgba(239, 68, 68, 0.12)",
              color: isSafe ? "#4ade80" : "#f87171",
            }}
          >
            {isSafe ? "SAFE" : "WARN"}
          </div>
        )}
      </div>
    </div>
  );
}
