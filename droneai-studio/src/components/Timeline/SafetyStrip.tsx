import type { SafetyReport } from "./types";

interface SafetyStripProps {
  safety: SafetyReport | null;
}

export default function SafetyStrip({ safety }: SafetyStripProps) {
  const isSafe = safety?.is_safe ?? true;
  const bgColor = isSafe ? "bg-green-900/40" : "bg-red-900/40";
  const label = safety
    ? isSafe
      ? `Safe · ${safety.min_spacing_found.toFixed(1)}m min · ${safety.max_velocity_found.toFixed(1)}m/s max`
      : `Violations · ${safety.min_spacing_found.toFixed(1)}m min spacing`
    : "No data";

  return (
    <div className={`h-3 flex items-center px-3 ${bgColor}`}>
      <span className="text-[8px] text-[var(--text-secondary)] font-mono">{label}</span>
    </div>
  );
}
