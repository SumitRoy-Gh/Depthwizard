"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, useEffect, useState } from "react";
import { OrbitControls, Environment, PerspectiveCamera } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette, ChromaticAberration } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import * as THREE from "three";
import { viridisColor, terrainColor } from "@/lib/colormap";

const RES = 96;

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Procedurally generate a heightmap — looks like a city block
function generateHeightmap(seed: number): Float32Array {
  const rng = mulberry32(seed);
  const data = new Float32Array(RES * RES);
  // Build terrain with fbm
  for (let y = 0; y < RES; y++) {
    for (let x = 0; x < RES; x++) {
      const nx = x / RES - 0.5;
      const ny = y / RES - 0.5;
      const v =
        Math.sin(nx * 6 + 1) * 0.15 +
        Math.cos(ny * 5 + 2) * 0.18 +
        Math.sin((nx + ny) * 8) * 0.1 +
        (rng() - 0.5) * 0.06;
      data[y * RES + x] = Math.max(0, 0.5 + v);
    }
  }
  // Add some "buildings"
  const rng2 = mulberry32(seed + 1);
  for (let i = 0; i < 18; i++) {
    const cx = Math.floor(rng2() * RES);
    const cy = Math.floor(rng2() * RES);
    const w = 4 + Math.floor(rng2() * 5);
    const h = 4 + Math.floor(rng2() * 5);
    const peak = 0.6 + rng2() * 0.4;
    for (let y = cy; y < cy + h && y < RES; y++) {
      for (let x = cx; x < cx + w && x < RES; x++) {
        const dx = (x - cx) / w;
        const dy = (y - cy) / h;
        const dist = Math.max(Math.abs(dx - 0.5), Math.abs(dy - 0.5));
        const f = Math.max(0, 1 - dist * 2);
        data[y * RES + x] = Math.max(data[y * RES + x], 0.4 + peak * f);
      }
    }
  }
  // Normalize 0..1
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < data.length; i++) {
    if (data[i] < min) min = data[i];
    if (data[i] > max) max = data[i];
  }
  const range = max - min || 1;
  for (let i = 0; i < data.length; i++) {
    data[i] = (data[i] - min) / range;
  }
  return data;
}

interface HeightMeshProps {
  seed: number;
  exaggeration: number;
  colormap: "viridis" | "terrain";
  flythrough: boolean;
}

function HeightMesh({ seed, exaggeration, colormap, flythrough }: HeightMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  const { geometry, positions } = useMemo(() => {
    const data = generateHeightmap(seed);
    const geom = new THREE.PlaneGeometry(10, 10, RES - 1, RES - 1);
    const pos = geom.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);

    for (let i = 0; i < pos.count; i++) {
      const x = i % RES;
      const y = Math.floor(i / RES);
      const h = data[y * RES + x];
      pos.setZ(i, h * 2.5 * exaggeration);

      const c = colormap === "viridis" ? viridisColor(h) : terrainColor(h);
      colors[i * 3 + 0] = c[0];
      colors[i * 3 + 1] = c[1];
      colors[i * 3 + 2] = c[2];
    }
    pos.needsUpdate = true;
    geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geom.computeVertexNormals();
    return { geometry: geom, positions: pos };
  }, [seed, exaggeration, colormap]);

  // Animate if flythrough mode changes the scene
  useFrame((state) => {
    if (meshRef.current && flythrough) {
      meshRef.current.rotation.y = Math.sin(state.clock.getElapsedTime() * 0.1) * 0.05;
    }
  });

  return (
    <mesh ref={meshRef} geometry={geometry} rotation={[-Math.PI / 2, 0, 0]}>
      <meshStandardMaterial
        vertexColors
        roughness={0.55}
        metalness={0.15}
        flatShading={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

interface FlythroughCameraProps {
  active: boolean;
  onComplete: () => void;
}

function FlythroughCamera({ active, onComplete }: FlythroughCameraProps) {
  const { camera } = useThree();
  const tRef = useRef(0);
  const doneRef = useRef(false);

  useFrame((_, dt) => {
    if (!active || doneRef.current) return;
    tRef.current += dt;
    const t = tRef.current;
    const duration = 12;
    if (t >= duration) {
      doneRef.current = true;
      onComplete();
      return;
    }
    const p = t / duration;
    // Cinematic path: rise → orbit → dive → pull back
    const ease = (x: number) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

    let x: number, y: number, z: number, lookY: number;
    if (p < 0.18) {
      const u = ease(p / 0.18);
      x = 0; y = 8 + (1 - u) * 8; z = 8 + (1 - u) * 6;
      lookY = 0;
    } else if (p < 0.45) {
      const u = ease((p - 0.18) / 0.27);
      x = u * 9; y = 8 - u * 5; z = 8 - u * 1.5;
      lookY = u * 0.5;
    } else if (p < 0.7) {
      const u = ease((p - 0.45) / 0.25);
      x = 9 - u * 9; y = 3 - u * 1.5; z = 6.5 + u * 2;
      lookY = 0.5 + u * 0.3;
    } else if (p < 0.9) {
      const u = ease((p - 0.7) / 0.2);
      x = -u * 3; y = 1.5 + u * 2; z = 8.5 + u * 1.5;
      lookY = 0.8 - u * 0.3;
    } else {
      const u = ease((p - 0.9) / 0.1);
      x = -3 + u * 3; y = 3.5 + u * 4.5; z = 10 - u * 2;
      lookY = 0.5;
    }

    camera.position.set(x, y, z);
    camera.lookAt(0, lookY, 0);
  });

  return null;
}

export interface FlythroughViewerProps {
  seed: number;
  exaggeration: number;
  colormap: "viridis" | "terrain";
}

export function FlythroughViewer({ seed, exaggeration, colormap }: FlythroughViewerProps) {
  const [flythrough, setFlythrough] = useState(false);
  const [key, setKey] = useState(0);

  const startFlythrough = () => {
    setKey((k) => k + 1);
    setFlythrough(true);
  };

  return (
    <div className="relative h-full w-full">
      <Canvas
        key={key}
        dpr={[0.75, 1.5]}
        gl={{ antialias: true, powerPreference: "high-performance" }}
      >
        <PerspectiveCamera makeDefault position={[8, 8, 8]} fov={45} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 8, 3]} intensity={1.4} color="#67E8F9" />
        <directionalLight position={[-5, 3, -3]} intensity={0.6} color="#F59E0B" />
        <Environment preset="night" />

        <HeightMesh seed={seed} exaggeration={exaggeration} colormap={colormap} flythrough={flythrough} />
        <FlythroughCamera active={flythrough} onComplete={() => setFlythrough(false)} />

        {!flythrough && (
          <OrbitControls
            enableDamping
            dampingFactor={0.08}
            rotateSpeed={0.5}
            minDistance={3}
            maxDistance={30}
            target={[0, 0.5, 0]}
          />
        )}

        <gridHelper args={[20, 40, "#22D3EE", "#1F2530"]} position={[0, -0.05, 0]} />

        <EffectComposer>
          <Bloom intensity={0.4} luminanceThreshold={0.5} luminanceSmoothing={0.4} />
          <ChromaticAberration
            blendFunction={BlendFunction.NORMAL}
            offset={[0.0005, 0.0008] as any}
            radialModulation={false}
            modulationOffset={0}
          />
          <Vignette eskil={false} offset={0.15} darkness={0.7} />
        </EffectComposer>
      </Canvas>

      {/* Overlay HUD */}
      <div className="pointer-events-none absolute inset-0">
        {/* Top-left: scene info */}
        <div className="pointer-events-auto absolute left-4 top-4 flex items-center gap-2">
          <Pill tone="cyan">3D</Pill>
          <span className="font-mono text-2xs uppercase tracking-[0.16em] text-muted">
            viridis · {exaggeration.toFixed(1)}×
          </span>
        </div>

        {/* Top-right: flythrough CTA */}
        <div className="pointer-events-auto absolute right-4 top-4 flex items-center gap-2">
          <button
            onClick={startFlythrough}
            disabled={flythrough}
            className="btn-aurora flex items-center gap-2 rounded-full border border-cyan/40 bg-cyan/15 px-4 py-2 text-sm font-medium text-cyan shadow-glow transition-all hover:bg-cyan/25 disabled:opacity-50"
          >
            <PlayIcon />
            {flythrough ? "Flying…" : "Fly this path"}
          </button>
        </div>

        {/* Bottom-right: camera controls hint */}
        <div className="pointer-events-none absolute bottom-4 right-4 rounded-lg border border-white/8 bg-void/60 px-3 py-1.5 backdrop-blur">
          <span className="font-mono text-2xs uppercase tracking-[0.14em] text-faint">
            drag · zoom · WASD
          </span>
        </div>

        {/* Bottom-left: scale legend */}
        <div className="pointer-events-none absolute bottom-4 left-4 flex items-end gap-2">
          <div className="flex flex-col items-start gap-1">
            <span className="font-mono text-2xs uppercase tracking-[0.14em] text-faint">Height</span>
            <div className="flex items-center gap-2">
              <div
                className="h-2 w-32 rounded-full"
                style={{
                  background:
                    colormap === "viridis"
                      ? "linear-gradient(to right, #440154, #3b528b, #21918c, #5ec962, #fde725)"
                      : "linear-gradient(to right, #0a1f3a, #1a3a5c, #2d5a4a, #6b8e4e, #c2a850, #8b5a2b, #ffffff)",
                }}
              />
            </div>
            <div className="flex w-32 justify-between font-mono text-2xs tabular-nums text-faint">
              <span>0 m</span>
              <span>peak</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 12 12" className="h-3 w-3" fill="currentColor">
      <path d="M3 2.5v7l6-3.5z" />
    </svg>
  );
}

function Pill({ tone, children }: { tone: string; children: React.ReactNode }) {
  const toneClass = {
    cyan: "border-cyan/30 bg-cyan/10 text-cyan",
    emerald: "border-emerald/30 bg-emerald/10 text-emerald",
    amber: "border-amber/30 bg-amber/10 text-amber",
  }[tone] || "border-white/10 bg-white/5 text-muted";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-2xs font-medium uppercase tracking-[0.14em] ${toneClass}`}>
      {children}
    </span>
  );
}