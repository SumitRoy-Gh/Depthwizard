"use client";

import dynamic from "next/dynamic";

const HeroScene = dynamic(
  () => import("@/components/three/HeroScene").then((m) => m.HeroScene),
  { ssr: false }
);

export function BackgroundCanvas() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {/* Deep-space base gradients */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_65%_at_75%_-5%,rgba(34,211,238,0.10),transparent_60%),radial-gradient(ellipse_70%_55%_at_10%_105%,rgba(16,185,129,0.07),transparent_60%),radial-gradient(ellipse_55%_45%_at_85%_100%,rgba(245,158,11,0.05),transparent_65%)]" />

      {/* CSS starfield — two parallax layers, far cheaper than a WebGL ctx */}
      <div className="stars stars-far" />
      <div className="stars stars-near" />

      {/* Structural grid + vignette */}
      <div className="absolute inset-0 bg-grid opacity-50" />
      <div className="absolute inset-0 vignette" />

      {/* Edge glows */}
      <div className="absolute inset-x-0 top-0 h-32 edge-glow-top" />
      <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-void via-void/60 to-transparent" />
    </div>
  );
}

export { HeroScene };
