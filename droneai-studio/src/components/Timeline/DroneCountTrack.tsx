interface DroneCountTrackProps {
  droneCount: number;
}

export default function DroneCountTrack({ droneCount }: DroneCountTrackProps) {
  return (
    <div className="h-4 flex items-center px-3 bg-[var(--bg-primary)] border-b border-[var(--border)]">
      <span className="text-[9px] text-[var(--text-secondary)] font-mono">
        {droneCount} drones
      </span>
    </div>
  );
}
