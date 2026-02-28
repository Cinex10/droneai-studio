/** Interpolate a value at a given frame from a sorted keyframe array */
export function interpolateKeyframes(
  keyframes: { frame: number; value: number[] }[],
  frame: number,
  fallback: number[]
): number[] {
  if (keyframes.length === 0) return fallback;
  if (frame <= keyframes[0].frame) return keyframes[0].value;
  if (frame >= keyframes[keyframes.length - 1].frame)
    return keyframes[keyframes.length - 1].value;

  for (let i = 0; i < keyframes.length - 1; i++) {
    const a = keyframes[i];
    const b = keyframes[i + 1];
    if (frame >= a.frame && frame <= b.frame) {
      const t = (frame - a.frame) / (b.frame - a.frame);
      return a.value.map((v, j) => v + (b.value[j] - v) * t);
    }
  }
  return fallback;
}
