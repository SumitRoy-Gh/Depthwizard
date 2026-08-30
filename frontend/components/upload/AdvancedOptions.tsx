"use client";

import { motion } from "framer-motion";
import { ChevronDown, Settings2 } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";

export function AdvancedOptions() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-white/8 bg-elevated/30">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-sm text-muted transition-colors hover:text-primary"
      >
        <span className="flex items-center gap-2">
          <Settings2 className="h-4 w-4" />
          <span>Advanced options</span>
          <span className="font-mono text-2xs uppercase tracking-[0.16em] text-faint">
            optional
          </span>
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.3 }}>
          <ChevronDown className="h-4 w-4" />
        </motion.span>
      </button>

      <motion.div
        initial={false}
        animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="overflow-hidden"
      >
        <div className="grid gap-4 border-t border-white/5 p-4 md:grid-cols-3">
          <OptionRow
            label="Target GSD"
            sub="Override default 0.09 m/px"
            control={
              <select className={selectClass}>
                <option>Auto-detect</option>
                <option>0.05 m/px</option>
                <option>0.09 m/px</option>
                <option>0.15 m/px</option>
                <option>0.30 m/px</option>
                <option>0.50 m/px</option>
              </select>
            }
          />
          <OptionRow
            label="Model variant"
            sub="Trained checkpoint"
            control={
              <select className={selectClass}>
                <option>vaihingen-multi-v1</option>
                <option>vaihingen-only</option>
                <option>potsdam-only</option>
              </select>
            }
          />
          <OptionRow
            label="Output formats"
            sub="Pre-checked defaults"
            control={
              <div className="flex flex-wrap gap-1.5">
                {["OBJ", "GLB", "PNG", "GeoTIFF", "PDF"].map((f) => (
                  <span
                    key={f}
                    className={cn(
                      "rounded-md border px-2 py-1 font-mono text-2xs uppercase tracking-[0.14em] transition-colors",
                      ["OBJ", "GLB", "PNG"].includes(f)
                        ? "border-cyan/40 bg-cyan/10 text-cyan"
                        : "border-white/10 bg-white/5 text-muted"
                    )}
                  >
                    {f}
                  </span>
                ))}
              </div>
            }
          />
        </div>
      </motion.div>
    </div>
  );
}

const selectClass =
  "w-full rounded-lg border border-white/10 bg-void/60 px-3 py-2 text-sm text-primary focus:border-cyan focus:outline-none focus:ring-1 focus:ring-cyan/40";

function OptionRow({
  label,
  sub,
  control,
}: {
  label: string;
  sub: string;
  control: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-primary">{label}</span>
        <span className="font-mono text-2xs uppercase tracking-[0.14em] text-faint">
          {sub}
        </span>
      </div>
      {control}
    </div>
  );
}