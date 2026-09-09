"use client";

import { cn } from "@/lib/cn";

export function Slider({
  value,
  min,
  max,
  step,
  onChange,
  display,
  className,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  display?: string;
  className?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="relative h-1.5 rounded-full bg-elevated">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-cyan to-emerald"
          style={{ width: `${pct}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="absolute inset-0 w-full cursor-pointer appearance-none bg-transparent [&::-webkit-slider-thumb]:relative [&::-webkit-slider-thumb]:-mt-1 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-cyan [&::-webkit-slider-thumb]:bg-void [&::-webkit-slider-thumb]:shadow-glow [&::-webkit-slider-thumb]:transition-all hover:[&::-webkit-slider-thumb]:scale-110"
          style={{ zIndex: 1 }}
        />
      </div>
      {display && (
        <div className="flex items-center justify-between font-mono text-2xs">
          <span className="uppercase tracking-[0.14em] text-faint">{min}</span>
          <span className="tabular-nums text-primary">{display}</span>
          <span className="uppercase tracking-[0.14em] text-faint">{max}</span>
        </div>
      )}
    </div>
  );
}