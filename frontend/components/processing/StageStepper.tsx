"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Check, Loader2, SkipForward, AlertTriangle } from "lucide-react";
import type { StageInfo } from "@/types/api";
import { cn } from "@/lib/cn";

const ICONS = {
  complete: Check,
  running: Loader2,
  pending: () => <span className="block h-1.5 w-1.5 rounded-full bg-muted" />,
  skipped: SkipForward,
  failed: AlertTriangle,
};

const TONES: Record<string, string> = {
  complete: "text-emerald border-emerald/40 bg-emerald/10",
  running: "text-cyan border-cyan/40 bg-cyan/10",
  pending: "text-muted border-white/10 bg-elevated/40",
  skipped: "text-faint border-white/10 bg-elevated/40",
  failed: "text-rose border-rose/40 bg-rose/10",
};

export function StageStepper({
  stages,
  activeIndex,
}: {
  stages: StageInfo[];
  activeIndex: number;
}) {
  return (
    <ol className="relative space-y-1.5">
      {/* Connecting line */}
      <div className="absolute left-[19px] top-4 h-[calc(100%-2rem)] w-px bg-gradient-to-b from-cyan/40 via-white/8 to-transparent" />

      {stages.map((s, i) => {
        const isActive = i === activeIndex;
        const Icon = ICONS[s.status];
        return (
          <motion.li
            key={s.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05, duration: 0.4 }}
            className={cn(
              "relative flex items-start gap-4 rounded-xl border p-3 transition-all",
              isActive ? "border-cyan/30 bg-cyan/5 shadow-glow" : "border-white/8 bg-elevated/30"
            )}
          >
            {/* Marker */}
            <div className="relative shrink-0">
              {isActive && (
                <motion.span
                  className="absolute -inset-2 rounded-full bg-cyan/30 blur-md"
                  animate={{ opacity: [0.4, 0.8, 0.4] }}
                  transition={{ duration: 1.6, repeat: Infinity }}
                />
              )}
              <div
                className={cn(
                  "relative flex h-10 w-10 items-center justify-center rounded-full border",
                  TONES[s.status]
                )}
              >
                {s.status === "running" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-medium text-primary">{s.label}</h3>
                <span className="font-mono text-2xs uppercase tracking-[0.14em] text-faint">
                  {String(s.index).padStart(2, "0")} / {stages.length}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted">{s.description}</p>
              <AnimatePresence>
                {s.status === "running" && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-2 overflow-hidden"
                  >
                    <div className="h-1 overflow-hidden rounded-full bg-elevated">
                      <motion.div
                        className="h-full rounded-full bg-gradient-to-r from-cyan to-emerald"
                        animate={{ x: ["-100%", "100%"] }}
                        transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                        style={{ width: "30%" }}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              {s.status === "failed" && s.reason && (
                <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-rose/30 bg-rose/10 px-2.5 py-1 text-xs text-rose">
                  <AlertTriangle className="h-3.5 w-3.5" /> {s.reason}
                </p>
              )}
              {s.status === "complete" && s.durationMs != null && (
                <p className="mt-1.5 font-mono text-2xs uppercase tracking-[0.14em] text-faint">
                  {(s.durationMs / 1000).toFixed(2)}s
                </p>
              )}
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
}