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

/** Ground plane — subtle solid disc so you always see "the floor" */
function GroundPlane() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow>
      <circleGeometry args={[60, 64]} />
      <meshStandardMaterial
        color="#0c0c18"
        roughness={0.95}
        metalness={0}
        transparent
        opacity={0.85}
      />
    </mesh>
  );
}

/** Horizon gradient — fake sky via a large backdrop sphere */
function SkySphere() {
  const material = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    // Top (zenith) — dark blue-black
    grad.addColorStop(0, "#06060f");
    // Mid — subtle navy
    grad.addColorStop(0.4, "#0a0a1a");
    // Horizon — slightly lighter with a hint of color
    grad.addColorStop(0.75, "#111128");
    // Below horizon — dark ground match
    grad.addColorStop(1, "#08080f");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 2, 256);
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return new THREE.MeshBasicMaterial({
      map: tex,
      side: THREE.BackSide,
      depthWrite: false,
    });
  }, []);

  return (
    <mesh material={material}>
      <sphereGeometry args={[200, 16, 16]} />
    </mesh>
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
      <color attach="background" args={["#08080f"]} />
      <ambientLight intensity={0.4} />
      <directionalLight position={[20, 40, 20]} intensity={0.15} color="#8888cc" />

      {/* Sky backdrop — gives horizon reference */}
      <SkySphere />

      {/* Ground plane — solid reference surface */}
      <GroundPlane />

      {/* Grid overlay on ground */}
      <Grid
        args={[120, 120]}
        cellSize={2}
        cellColor="#1e1e38"
        sectionSize={10}
        sectionColor="#2e2e58"
        fadeDistance={70}
        fadeStrength={1.5}
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
            gl.setClearColor("#08080f");
          }}
        >
          <SceneContent sceneData={sceneData} currentFrame={currentFrame} />
        </Canvas>
      </div>
    </ViewportErrorBoundary>
  );
}
