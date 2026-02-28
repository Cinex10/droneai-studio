import { useRef, useEffect, useState, useCallback } from "react";
import * as THREE from "three";
import type { SceneData } from "../../types/scene";
import type { TimelineEntry } from "./types";
import { interpolateKeyframes } from "../../utils/interpolate";

interface FormationPreviewTrackProps {
  entries: TimelineEntry[];
  sceneData: SceneData;
  totalFrames: number;
  fps: number;
  zoom: number;
  scrollOffset: number;
}

const THUMB_W = 64;
const THUMB_H = 48;

/** Render a single formation thumbnail using offscreen Three.js */
function renderThumbnail(
  renderer: THREE.WebGLRenderer,
  sceneData: SceneData,
  entryTime: number,
  fps: number,
  _entryColor: { type: string; value?: number[]; start?: number[] }
): string {
  const frame = Math.round(entryTime * fps);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a12);

  // Collect drone positions and colors at this frame
  const positions: THREE.Vector3[] = [];
  const colors: THREE.Color[] = [];

  for (const drone of sceneData.drones) {
    const pos = interpolateKeyframes(drone.keyframes.location, frame, drone.position as number[]);
    const col = interpolateKeyframes(drone.keyframes.color, frame, drone.color as number[]);

    // Blender Z-up → Three.js Y-up: (x, z, -y)
    const v = new THREE.Vector3(pos[0], pos[2], -pos[1]);
    positions.push(v);
    colors.push(new THREE.Color(col[0], col[1], col[2]));
  }

  if (positions.length === 0) {
    // Empty — return blank
    renderer.render(scene, new THREE.OrthographicCamera());
    return renderer.domElement.toDataURL("image/png");
  }

  // Add spheres
  const geo = new THREE.SphereGeometry(0.15, 8, 8);
  for (let i = 0; i < positions.length; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: colors[i] });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(positions[i]);
    scene.add(mesh);
  }

  // Compute bounding box in XY (front view)
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  for (const p of positions) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  // Add padding
  const padX = (maxX - minX) * 0.15 + 0.5;
  const padY = (maxY - minY) * 0.15 + 0.5;
  minX -= padX; maxX += padX;
  minY -= padY; maxY += padY;

  // Maintain aspect ratio to fit THUMB_W x THUMB_H
  const aspect = THUMB_W / THUMB_H;
  const bboxW = maxX - minX;
  const bboxH = maxY - minY;
  const bboxAspect = bboxW / bboxH;

  let left, right, top, bottom;
  if (bboxAspect > aspect) {
    // Wider — fit width, expand height
    left = minX; right = maxX;
    const centerY = (minY + maxY) / 2;
    const halfH = bboxW / aspect / 2;
    bottom = centerY - halfH; top = centerY + halfH;
  } else {
    // Taller — fit height, expand width
    bottom = minY; top = maxY;
    const centerX = (minX + maxX) / 2;
    const halfW = bboxH * aspect / 2;
    left = centerX - halfW; right = centerX + halfW;
  }

  // Front view camera: looking from +Z toward -Z
  const camera = new THREE.OrthographicCamera(left, right, top, bottom, 0.1, 1000);
  camera.position.set((left + right) / 2, (top + bottom) / 2, 50);
  camera.lookAt((left + right) / 2, (top + bottom) / 2, 0);

  renderer.render(scene, camera);
  const dataUrl = renderer.domElement.toDataURL("image/png");

  // Cleanup
  geo.dispose();
  scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      (obj.material as THREE.Material).dispose();
    }
  });

  return dataUrl;
}

export default function FormationPreviewTrack({
  entries,
  sceneData,
  totalFrames,
  fps,
  zoom,
  scrollOffset,
}: FormationPreviewTrackProps) {
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const [thumbnails, setThumbnails] = useState<Map<number, string>>(new Map());
  const lastSpecRef = useRef<string>("");

  const totalSeconds = totalFrames / fps;
  const timeToPct = (time: number) =>
    ((time / totalSeconds) * 100 * zoom) - scrollOffset;

  // Generate thumbnails when data changes
  const generateThumbnails = useCallback(() => {
    if (!sceneData || sceneData.drones.length === 0 || entries.length === 0) return;

    // Check if we already generated for this data
    const specKey = `${entries.length}-${entries.map(e => `${e.time}-${e.formation.shape}`).join(",")}`;
    if (specKey === lastSpecRef.current) return;
    lastSpecRef.current = specKey;

    // Create renderer if needed
    if (!rendererRef.current) {
      rendererRef.current = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
      });
      rendererRef.current.setSize(THUMB_W, THUMB_H);
    }

    const newThumbs = new Map<number, string>();
    for (let i = 0; i < entries.length; i++) {
      const url = renderThumbnail(
        rendererRef.current,
        sceneData,
        entries[i].time,
        fps,
        entries[i].color
      );
      newThumbs.set(i, url);
    }
    setThumbnails(newThumbs);
  }, [sceneData, entries, fps]);

  useEffect(() => {
    generateThumbnails();
  }, [generateThumbnails]);

  // Dispose renderer on unmount
  useEffect(() => {
    return () => {
      if (rendererRef.current) {
        rendererRef.current.dispose();
        rendererRef.current = null;
      }
    };
  }, []);

  return (
    <div className="tl-track tl-track-preview" style={{ background: "var(--bg-primary)" }}>
      {entries.map((entry, i) => {
        const hold = entry.hold ?? 0;
        const nextTime = i < entries.length - 1 ? entries[i + 1].time : totalSeconds;
        const formEnd = hold > 0 ? entry.time + hold : Math.min(entry.time + 1.5, nextTime);
        const formLeft = timeToPct(entry.time);
        const formWidth = timeToPct(formEnd) - formLeft;
        const shapeName = entry.formation.shape || entry.formation.type;
        const thumbUrl = thumbnails.get(i);

        return (
          <div
            key={i}
            className="tl-preview-card"
            style={{
              left: `${formLeft}%`,
              width: `${formWidth}%`,
            }}
          >
            {/* Thumbnail image */}
            <div className="tl-preview-thumb">
              {thumbUrl ? (
                <img
                  src={thumbUrl}
                  alt={shapeName}
                  className="tl-preview-img"
                  draggable={false}
                />
              ) : (
                <div className="tl-preview-placeholder" />
              )}
            </div>
            {/* Formation name */}
            <span className="tl-preview-name">{shapeName}</span>
          </div>
        );
      })}
    </div>
  );
}
