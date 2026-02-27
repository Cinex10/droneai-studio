import { useRef, useMemo, Component, type ReactNode } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import * as THREE from "three";
import type { SceneData, DroneData } from "../types/scene";

interface DroneViewportProps {
  sceneData: SceneData | null;
  currentFrame: number;
}

/** Error boundary to prevent Three.js crashes from taking down the whole app */
class ViewportErrorBoundary extends Component<
  { children: ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };

  static getDerivedStateFromError(err: Error) {
    return { error: err.message };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-[#010102] text-red-400 text-sm p-4">
          <div className="text-center">
            <p>Viewport error: {this.state.error}</p>
            <button
              className="mt-2 px-3 py-1 bg-red-900/50 rounded text-xs hover:bg-red-900"
              onClick={() => this.setState({ error: null })}
            >
              Retry
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Interpolate drone position/color at a given frame from keyframes */
function interpolateKeyframes(
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

/** InstancedMesh renderer for all drones */
function DroneSwarm({
  drones,
  currentFrame,
}: {
  drones: DroneData[];
  currentFrame: number;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const count = drones?.length ?? 0;
  const colorArr = useMemo(
    () => new Float32Array(Math.max(count, 1) * 3),
    [count]
  );

  useFrame(() => {
    if (!meshRef.current || !drones || drones.length === 0) return;

    for (let i = 0; i < drones.length; i++) {
      const d = drones[i];
      const pos = interpolateKeyframes(
        d.keyframes.location,
        currentFrame,
        d.position
      );
      const col = interpolateKeyframes(
        d.keyframes.color,
        currentFrame,
        d.color
      );

      // Blender Z-up -> Three.js Y-up
      dummy.position.set(pos[0], pos[2], -pos[1]);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);

      colorArr[i * 3] = col[0];
      colorArr[i * 3 + 1] = col[1];
      colorArr[i * 3 + 2] = col[2];
    }

    meshRef.current.instanceMatrix.needsUpdate = true;
    meshRef.current.geometry.setAttribute(
      "color",
      new THREE.InstancedBufferAttribute(colorArr, 3)
    );
  });

  if (!drones || drones.length === 0) return null;

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <sphereGeometry args={[0.15, 16, 16]} />
      <meshStandardMaterial
        emissive="white"
        emissiveIntensity={8}
        toneMapped={false}
        vertexColors
      />
    </instancedMesh>
  );
}

/** Colored axis lines — X=red, Y=green, Z=blue, like Blender */
function AxisLines() {
  const xLine = useMemo(() => {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-100, 0, 0),
      new THREE.Vector3(100, 0, 0),
    ]);
    return geo;
  }, []);
  const yLine = useMemo(() => {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, -100),
      new THREE.Vector3(0, 0, 100),
    ]);
    return geo;
  }, []);
  const zLine = useMemo(() => {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 100, 0),
    ]);
    return geo;
  }, []);

  return (
    <group>
      {/* X axis — red */}
      <lineSegments geometry={xLine}>
        <lineBasicMaterial color="#cc3333" opacity={0.6} transparent />
      </lineSegments>
      {/* Y axis (Blender Y → Three Z) — green */}
      <lineSegments geometry={yLine}>
        <lineBasicMaterial color="#33cc33" opacity={0.6} transparent />
      </lineSegments>
      {/* Z axis (Blender Z → Three Y) — blue */}
      <lineSegments geometry={zLine}>
        <lineBasicMaterial color="#3366cc" opacity={0.6} transparent />
      </lineSegments>
    </group>
  );
}

/** Main viewport scene content */
function SceneContent({
  sceneData,
  currentFrame,
}: {
  sceneData: SceneData | null;
  currentFrame: number;
}) {
  return (
    <>
      {/* Blender-style gradient: lighter gray top → darker bottom */}
      <color attach="background" args={["#333333"]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 20, 10]} intensity={0.3} />

      {/* Grid floor — Blender style */}
      <Grid
        args={[100, 100]}
        cellSize={1}
        cellColor="#444444"
        sectionSize={10}
        sectionColor="#555555"
        fadeDistance={80}
        fadeStrength={1}
        position={[0, 0, 0]}
      />

      {/* Colored axis indicators */}
      <AxisLines />

      {sceneData?.drones && sceneData.drones.length > 0 && (
        <DroneSwarm drones={sceneData.drones} currentFrame={currentFrame} />
      )}

      <OrbitControls
        makeDefault
        target={[0, 10, 0]}
        maxPolarAngle={Math.PI * 0.85}
      />
    </>
  );
}

export default function DroneViewport({
  sceneData,
  currentFrame,
}: DroneViewportProps) {
  return (
    <ViewportErrorBoundary>
      <div className="w-full h-full">
        <Canvas
          camera={{ position: [0, 20, 40], fov: 50 }}
          gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
          onCreated={({ gl }) => {
            gl.setClearColor("#333333");
          }}
        >
          <SceneContent sceneData={sceneData} currentFrame={currentFrame} />
        </Canvas>
      </div>
    </ViewportErrorBoundary>
  );
}
