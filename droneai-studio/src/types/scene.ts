export interface Keyframe {
  frame: number;
  value: number[];
}

export interface DroneData {
  name: string;
  position: [number, number, number];
  color: [number, number, number, number];
  emission_strength: number;
  keyframes: {
    location: Keyframe[];
    color: Keyframe[];
  };
}

export interface SceneData {
  frame_range: [number, number];
  fps: number;
  drones: DroneData[];
}
