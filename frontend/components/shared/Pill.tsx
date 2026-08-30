"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/cn";
import { ReactNode } from "react";

export function Pill({
  tone = "cyan",
  children,
  className,
  pulse,
}: {
  tone?: "cyan" | "amber" | "emerald" | "rose" | "muted";
  children: ReactNode;
  className?: string;
  pulse?: boolean;
}) {
  const tones: Record<string, string> = {
    cyan: "border-cyan/30 bg-cyan/10 text-cyan",
    amber: "border-amber/30 bg-amber/10 text-amber",
    emerald: "border-emerald/30 bg-emerald/10 text-emerald",
    rose: "border-rose/30 bg-rose/10 text-rose",
    muted: "border-white/10 bg-white/5 text-muted",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-2xs font-medium uppercase tracking-[0.14em]",
        tones[tone],
        className
      )}
    >
      {pulse && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
        </span>
      )}
      {children}
    </span>
  );
}

export function StatChip({
  label,
  value,
  tone = "primary",
}: {
  label: string;
  value: string | number;
  tone?: "primary" | "cyan" | "amber" | "emerald";
}) {
  const toneClass = {
    primary: "text-primary",
    cyan: "text-cyan",
    amber: "text-amber",
    emerald: "text-emerald",
  }[tone];
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-white/5 bg-elevated/40 px-3 py-2 backdrop-blur">
      <span className="font-mono text-2xs uppercase tracking-[0.16em] text-faint">{label}</span>
      <span className={cn("font-mono text-sm font-medium tabular-nums", toneClass)}>{value}</span>
    </div>
  );
}

export function AnimatedNumber({ value, decimals = 0 }: { value: number; decimals?: number }) {
  return (
    <motion.span
      key={value}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="tabular-nums"
    >
      {value.toFixed(decimals)}
    </motion.span>
  );
}