"use client";

import dynamic from "next/dynamic";

const SceneBackground = dynamic(
  () => import("@/components/three/SceneBackground").then((m) => m.SceneBackground),
  { ssr: false }
);

export function BackgroundCanvas() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <SceneBackground />
      {/* Edge gradient overlays */}
      <div className="absolute inset-x-0 top-0 h-32 edge-glow-top" />
      <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-void via-void/60 to-transparent" />
      <div className="absolute inset-0 bg-grid opacity-60" />
      <div className="absolute inset-0 vignette" />
    </div>
  );
}