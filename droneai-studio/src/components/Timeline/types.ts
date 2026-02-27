export interface FormationSpec {
  type: string;
  shape?: string;
  params?: Record<string, unknown>;
}

export interface LightKeyframe {
  t: number;
  color: number[];
}

export interface LightSequence {
  drones: "all" | number[] | { range: [number, number] };
  keyframes: LightKeyframe[];
}

export interface ColorSpec {
  type: string;
  value?: number[];
  start?: number[];
  end?: number[];
  axis?: string;
  sequences?: LightSequence[];
}

export interface TransitionSpec {
  easing: string;
}

export interface TimelineEntry {
  time: number;
  hold?: number;
  formation: FormationSpec;
  color: ColorSpec;
  transition?: TransitionSpec;
}

export interface ShowSpec {
  drone_count: number;
  fps: number;
  timeline: TimelineEntry[];
}

export interface SafetyReport {
  is_safe: boolean;
  min_spacing_found: number;
  max_velocity_found: number;
  max_altitude_found: number;
}

export interface ShowInfo {
  spec: ShowSpec | null;
  safety: SafetyReport | null;
}

export interface TimelineLayerVisibility {
  minimap: boolean;
  droneCount: boolean;
  formations: boolean;
  color: boolean;
  safety: boolean;
}
