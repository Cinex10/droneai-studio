import { useRef, useMemo, useEffect, Component, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Grid, GizmoHelper, GizmoViewport } from "@react-three/drei";
import * as THREE from "three";
import type { SceneData, DroneData } from "../types/scene";
import { interpolateKeyframes } from "../utils/interpolate";

interface DroneViewportProps {
  sceneData: SceneData | null;
  currentFrame: number;
  isDark?: boolean;
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
        <div className="w-full h-full flex items-center justify-center bg-[var(--bg-primary)] text-red-400 text-sm p-4">
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
      <meshBasicMaterial
        toneMapped={false}
        vertexColors
      />
    </instancedMesh>
  );
}

/** Syncs Three.js scene background with theme changes */
function ThemeSync({ isDark }: { isDark: boolean }) {
  const { gl, scene } = useThree();
  useEffect(() => {
    const bg = isDark ? "#1a1a24" : "#e3e2de";
    gl.setClearColor(bg);
    scene.background = new THREE.Color(bg);
  }, [isDark, gl, scene]);
  return null;
}

/** Main viewport scene content */
function SceneContent({
  sceneData,
  currentFrame,
  isDark,
}: {
  sceneData: SceneData | null;
  currentFrame: number;
  isDark: boolean;
}) {
  return (
    <>
      <color attach="background" args={[isDark ? "#1a1a24" : "#e3e2de"]} />
      <ThemeSync isDark={isDark} />
      <ambientLight intensity={isDark ? 0.5 : 0.7} />
      <directionalLight position={[10, 20, 10]} intensity={isDark ? 0.3 : 0.5} />

      {/* Grid floor */}
      <Grid
        args={[100, 100]}
        cellSize={1}
        cellColor={isDark ? "#3a3a4e" : "#c0c0cc"}
        sectionSize={10}
        sectionColor={isDark ? "#4e4e68" : "#a8a8b8"}
        fadeDistance={80}
        fadeStrength={1}
        position={[0, 0, 0]}
      />

      {sceneData?.drones && sceneData.drones.length > 0 && (
        <DroneSwarm drones={sceneData.drones} currentFrame={currentFrame} />
      )}

      <OrbitControls
        makeDefault
        target={[0, 10, 0]}
        maxPolarAngle={Math.PI * 0.85}
      />

      {/* Blender-style XYZ orientation gizmo — top right */}
      <GizmoHelper alignment="top-right" margin={[60, 60]}>
        <GizmoViewport
          axisColors={["#cc3333", "#33cc33", "#3366cc"]}
          labelColor={isDark ? "#fff" : "#333"}
        />
      </GizmoHelper>
    </>
  );
}

export default function DroneViewport({
  sceneData,
  currentFrame,
  isDark = true,
}: DroneViewportProps) {
  return (
    <ViewportErrorBoundary>
      <div className="w-full h-full">
        <Canvas
          camera={{ position: [0, 20, 40], fov: 50 }}
          gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
          onCreated={({ gl }) => {
            gl.setClearColor(isDark ? "#1a1a24" : "#e3e2de");
          }}
        >
          <SceneContent sceneData={sceneData} currentFrame={currentFrame} isDark={isDark} />
        </Canvas>
      </div>
    </ViewportErrorBoundary>
  );
}
