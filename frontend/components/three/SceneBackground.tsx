"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import { Earth } from "./Earth";
import { ParticleField } from "./ParticleField";

export function SceneBackground() {
  return (
    <Canvas
      dpr={[0.5, 1.25]}
      camera={{ position: [0, 0, 6.5], fov: 45 }}
      gl={{
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      }}
    >
      <Suspense fallback={null}>
        <color attach="background" args={[0, 0, 0, 0]} />
        <ambientLight intensity={0.25} />
        <directionalLight position={[5, 3, 5]} intensity={0.6} color="#67E8F9" />
        <directionalLight position={[-5, -2, 3]} intensity={0.3} color="#F59E0B" />

        <Earth />
        <ParticleField />
      </Suspense>
    </Canvas>
  );
}