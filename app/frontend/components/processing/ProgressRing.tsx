"use client";

import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { useEffect, useState } from "react";

export function ProgressRing({
  value,
  label,
  size = 96,
}: {
  value: number; // 0..1
  label?: string;
  size?: number;
}) {
  const r = size / 2 - 6;
  const c = 2 * Math.PI * r;
  const animatedValue = useMotionValue(0);
  const dashOffset = useTransform(animatedValue, (v) => c * (1 - v));
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const controls = animate(animatedValue, value, { duration: 0.8, ease: [0.22, 1, 0.36, 1] });
    const unsub = animatedValue.on("change", (v) => setDisplay(v));
    return () => {
      controls.stop();
      unsub();
    };
  }, [value, animatedValue]);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="h-full w-full -rotate-90" viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id={`prog-${size}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#22D3EE" />
            <stop offset="100%" stopColor="#10B981" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="3"
          fill="none"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={`url(#prog-${size})`}
          strokeWidth="3"
          fill="none"
          strokeDasharray={c}
          style={{ strokeDashoffset: dashOffset }}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-lg tabular-nums text-primary">
          {Math.round(display * 100)}%
        </span>
        {label && (
          <span className="font-mono text-2xs uppercase tracking-[0.14em] text-faint">
            {label}
          </span>
        )}
      </div>
    </div>
  );
}