export interface FormationSpec {
  type: string;
  shape?: string;
  params?: Record<string, unknown>;
}

export interface ColorSpec {
  type: string;
  value?: number[];
  start?: number[];
  end?: number[];
  axis?: string;
}

export interface TransitionSpec {
  easing: string;
}

export interface TimelineEntry {
  time: number;
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
