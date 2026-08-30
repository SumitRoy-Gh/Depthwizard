"use client";

import { motion } from "framer-motion";
import { useTilt } from "@/components/shared/Motion";
import { Pill } from "@/components/shared/Pill";
import { cn } from "@/lib/cn";
import { useState } from "react";

const SAMPLES = [
  {
    id: "vaihingen",
    title: "Vaihingen tile",
    subtitle: "ISPRS benchmark · 9 cm/px",
    tone: "emerald" as const,
    badge: "Georeferenced",
    // Generated abstract gradient — Vaihingen-like rooftops
    art: (
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-[#1a3a2e] via-[#0d2418] to-[#020a08]" />
        <svg viewBox="0 0 200 200" className="absolute inset-0 h-full w-full">
          <defs>
            <pattern id="grid1" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(110,231,183,0.18)" strokeWidth="0.4" />
            </pattern>
          </defs>
          <rect width="200" height="200" fill="url(#grid1)" />
          {/* Buildings */}
          {[40, 80, 130, 165].map((x, i) =>
            [40, 75, 120, 155].map((y, j) => (
              <rect
                key={`${i}-${j}`}
                x={x}
                y={y}
                width={20 + ((i + j) % 3) * 6}
                height={20 + ((i * j + 1) % 4) * 4}
                fill={`rgba(${110 - i * 10}, ${180 + j * 8}, ${170 - j * 10}, ${0.4 + ((i + j) % 3) * 0.1})`}
                stroke="rgba(110,231,183,0.3)"
                strokeWidth="0.3"
              />
            ))
          )}
          {/* Trees */}
          {Array.from({ length: 30 }).map((_, i) => (
            <circle
              key={i}
              cx={(i * 37) % 200}
              cy={((i * 53) % 200)}
              r={2 + (i % 3)}
              fill="rgba(16,185,129,0.4)"
            />
          ))}
        </svg>
        <div className="absolute inset-0 bg-gradient-to-t from-void/80 via-transparent to-transparent" />
      </div>
    ),
  },
  {
    id: "potsdam",
    title: "Potsdam block",
    subtitle: "ISPRS benchmark · 5 cm/px",
    tone: "cyan" as const,
    badge: "Georeferenced",
    art: (
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0a2030] via-[#061828] to-[#020a10]" />
        <svg viewBox="0 0 200 200" className="absolute inset-0 h-full w-full">
          <defs>
            <pattern id="grid2" width="10" height="10" patternUnits="userSpaceOnUse">
              <path d="M 10 0 L 0 0 0 10" fill="none" stroke="rgba(103,232,249,0.15)" strokeWidth="0.3" />
            </pattern>
          </defs>
          <rect width="200" height="200" fill="url(#grid2)" />
          {/* Dense city blocks */}
          {Array.from({ length: 16 }).map((_, i) => {
            const x = (i % 4) * 50 + 5;
            const y = Math.floor(i / 4) * 50 + 5;
            return (
              <rect
                key={i}
                x={x}
                y={y}
                width={38}
                height={38}
                fill={`rgba(${20 + i * 8}, ${90 + (i % 3) * 30}, ${120 + (i % 4) * 20}, ${0.4 + (i % 5) * 0.05})`}
                stroke="rgba(103,232,249,0.2)"
                strokeWidth="0.3"
              />
            );
          })}
          {/* Roads */}
          <line x1="0" y1="100" x2="200" y2="100" stroke="rgba(34,211,238,0.5)" strokeWidth="3" />
          <line x1="100" y1="0" x2="100" y2="200" stroke="rgba(34,211,238,0.5)" strokeWidth="3" />
        </svg>
        <div className="absolute inset-0 bg-gradient-to-t from-void/80 via-transparent to-transparent" />
      </div>
    ),
  },
  {
    id: "drone",
    title: "Drone snapshot",
    subtitle: "Non-georeferenced JPEG",
    tone: "amber" as const,
    badge: "Relative-only",
    art: (
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-[#3a2810] via-[#1a1408] to-[#0a0703]" />
        <svg viewBox="0 0 200 200" className="absolute inset-0 h-full w-full">
          <defs>
            <pattern id="grid3" width="25" height="25" patternUnits="userSpaceOnUse">
              <path d="M 25 0 L 0 0 0 25" fill="none" stroke="rgba(252,211,77,0.15)" strokeWidth="0.3" />
            </pattern>
          </defs>
          <rect width="200" height="200" fill="url(#grid3)" />
          {/* Industrial complex */}
          <rect x="30" y="50" width="80" height="50" fill="rgba(120,80,30,0.5)" stroke="rgba(252,211,77,0.3)" strokeWidth="0.4" />
          <rect x="120" y="60" width="50" height="80" fill="rgba(80,55,20,0.6)" stroke="rgba(252,211,77,0.3)" strokeWidth="0.4" />
          <circle cx="60" cy="140" r="15" fill="rgba(180,120,40,0.4)" stroke="rgba(252,211,77,0.4)" strokeWidth="0.5" />
          <circle cx="100" cy="160" r="10" fill="rgba(180,120,40,0.5)" />
        </svg>
        <div className="absolute inset-0 bg-gradient-to-t from-void/80 via-transparent to-transparent" />
      </div>
    ),
  },
];

export function SampleTiles({ onPick }: { onPick?: (id: string) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {SAMPLES.map((s, i) => (
        <SampleTile key={s.id} sample={s} index={i} onPick={onPick} />
      ))}
    </div>
  );
}

function SampleTile({
  sample,
  index,
  onPick,
}: {
  sample: typeof SAMPLES[number];
  index: number;
  onPick?: (id: string) => void;
}) {
  const { srx, sry, onMove, onLeave } = useTilt(6);
  const [hover, setHover] = useState(false);

  return (
    <motion.button
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6 + index * 0.08, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); onLeave(); }}
      onMouseMove={onMove}
      style={{ rotateX: srx, rotateY: sry, transformStyle: "preserve-3d" }}
      onClick={() => onPick?.(sample.id)}
      className="group relative overflow-hidden rounded-2xl border border-white/8 bg-elevated/30 text-left transition-all hover:border-cyan/30 hover:shadow-glow"
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        {sample.art}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-void via-void/30 to-transparent" />
        <div className="absolute right-2 top-2">
          <Pill tone={sample.tone}>{sample.badge}</Pill>
        </div>
        <motion.div
          animate={{ opacity: hover ? 1 : 0 }}
          className="absolute inset-0 bg-gradient-to-t from-cyan/15 via-transparent to-transparent"
        />
      </div>
      <div className="p-3">
        <p className="text-sm font-medium text-primary">{sample.title}</p>
        <p className="mt-0.5 font-mono text-2xs uppercase tracking-[0.14em] text-faint">
          {sample.subtitle}
        </p>
      </div>
    </motion.button>
  );
}