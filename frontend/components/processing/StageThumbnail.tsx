"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef, useState, useEffect } from "react";
import * as THREE from "three";
import type { StageInfo } from "@/types/api";
import { cn } from "@/lib/cn";

// Tiny R3F scene that generates a synthetic preview matching the stage's
// visual character (mask, denoise, CLAHE, depth, mesh etc.). No external assets.
function StageThumbnailCanvas({ stageIndex, seed }: { stageIndex: number; seed: number }) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (meshRef.current) {
      meshRef.current.rotation.y = t * 0.15;
      meshRef.current.rotation.x = Math.sin(t * 0.3) * 0.1;
    }
  });

  const material = useMemo(() => {
    if (stageIndex === 0) {
      // Ingest: orange tone-mapped preview
      return (
        <meshStandardMaterial color="#F59E0B" roughness={0.5} metalness={0.1} />
      );
    }
    if (stageIndex === 1) {
      // Radiometric: cyan, soft
      return (
        <meshStandardMaterial color="#22D3EE" roughness={0.4} metalness={0.2} />
      );
    }
    if (stageIndex === 2) {
      // Mask: emissive boolean-like
      return (
        <meshStandardMaterial color="#10B981" emissive="#10B981" emissiveIntensity={0.4} roughness={0.6} />
      );
    }
    if (stageIndex === 3) {
      // Noise reduction: smoother
      return (
        <meshStandardMaterial color="#67E8F9" roughness={0.2} metalness={0.4} />
      );
    }
    if (stageIndex === 4) {
      // CLAHE: high contrast
      return (
        <meshStandardMaterial color="#FCD34D" roughness={0.5} metalness={0.3} />
      );
    }
    if (stageIndex === 5) {
      // Resolution: amber
      return (
        <meshStandardMaterial color="#F59E0B" roughness={0.4} metalness={0.2} />
      );
    }
    if (stageIndex === 6) {
      // DAv2: viridis-like deep blue→green
      return (
        <meshStandardMaterial color="#10B981" emissive="#22D3EE" emissiveIntensity={0.3} roughness={0.5} />
      );
    }
    // U-Net: warm gold with high emissive
    return (
      <meshStandardMaterial color="#F59E0B" emissive="#FCD34D" emissiveIntensity={0.5} roughness={0.3} />
    );
  }, [stageIndex]);

  const geometry = useMemo(() => {
    if (stageIndex === 6 || stageIndex === 7) {
      // Heightmap-like displaced plane
      const geom = new THREE.PlaneGeometry(1.8, 1.8, 32, 32);
      const positions = geom.attributes.position as THREE.BufferAttribute;
      const rng = mulberry32(seed);
      for (let i = 0; i < positions.count; i++) {
        const z = (rng() - 0.5) * 0.4 + Math.sin(i * 0.3) * 0.08;
        positions.setZ(i, z);
      }
      positions.needsUpdate = true;
      geom.computeVertexNormals();
      return geom;
    }
    return new THREE.BoxGeometry(1.2, 0.4, 1.2);
  }, [stageIndex, seed]);

  return (
    <Canvas
      dpr={[0.5, 1]}
      camera={{ position: [0, 0.6, 2.4], fov: 45 }}
      gl={{ antialias: true, alpha: true }}
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 3, 3]} intensity={1.2} color="#67E8F9" />
      <directionalLight position={[-3, -2, 1]} intensity={0.5} color="#F59E0B" />
      <mesh ref={meshRef} geometry={geometry}>
        {material}
      </mesh>
    </Canvas>
  );
}

// Mulberry32 — deterministic seed for stable visual previews
function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function StageThumbnail({
  stage,
  index,
}: {
  stage: StageInfo;
  index: number;
}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (stage.status === "complete") {
      const t = setTimeout(() => setShow(true), 200);
      return () => clearTimeout(t);
    }
  }, [stage.status]);

  const placeholderSeed = useMemo(() => index * 7919 + 31, [index]);

  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-white/8 bg-elevated/60">
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, scale: 1.05 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="absolute inset-0"
          >
            <StageThumbnailCanvas stageIndex={index} seed={placeholderSeed} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Placeholder state */}
      {!show && (
        <div className="absolute inset-0 flex items-center justify-center">
          {stage.status === "running" ? (
            <div className="shimmer h-full w-full" />
          ) : stage.status === "pending" ? (
            <span className="font-mono text-2xs uppercase tracking-[0.16em] text-faint">
              waiting
            </span>
          ) : stage.status === "skipped" ? (
            <span className="font-mono text-2xs uppercase tracking-[0.16em] text-faint">
              skipped
            </span>
          ) : null}
        </div>
      )}

      {/* Overlay label */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-void via-void/80 to-transparent p-2">
        <p className="font-mono text-2xs uppercase tracking-[0.14em] text-muted">
          {stage.label}
        </p>
      </div>

      {/* Glow ring on complete */}
      {stage.status === "complete" && (
        <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-emerald/30" />
      )}
    </div>
  );
}