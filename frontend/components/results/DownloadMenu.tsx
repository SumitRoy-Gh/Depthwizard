"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Download, FileType, Box, MapPinned, Layers } from "lucide-react";
import { useState } from "react";
import type { JobStatus } from "@/types/api";
import { cn } from "@/lib/cn";

export function DownloadMenu({ job }: { job: JobStatus }) {
  const [open, setOpen] = useState(false);

  const items = [
    {
      key: "mesh",
      label: "GLB mesh",
      sub: "3D mesh · Three.js compatible",
      icon: Box,
      available: !!job.artifacts?.meshUrl,
      tone: "cyan",
    },
    {
      key: "heightmap",
      label: "PNG heightmap",
      sub: "Viridis-colored heightmap",
      icon: Layers,
      available: !!job.artifacts?.heightmapUrl,
      tone: "cyan",
    },
    {
      key: "geotiff",
      label: "GeoTIFF",
      sub: job.meta.metric ? "Metric raster · CRS preserved" : "Unavailable — not georeferenced",
      icon: MapPinned,
      available: !!job.artifacts?.geotiffUrl,
      tone: job.meta.metric ? "cyan" : "muted",
    },
    {
      key: "pdf",
      label: "PDF report",
      sub: "Summary + dataset credits",
      icon: FileType,
      available: !!job.artifacts?.pdfUrl,
      tone: "cyan",
    },
  ] as const;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="btn-aurora flex items-center gap-2 rounded-full border border-cyan/40 bg-cyan/15 px-4 py-2 text-sm font-medium text-cyan shadow-glow transition-all hover:bg-cyan/25"
      >
        <Download className="h-4 w-4" />
        Download
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: 6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.97 }}
              transition={{ duration: 0.18 }}
              className="glass-strong absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl p-2"
            >
              {items.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.key}
                    disabled={!item.available}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                      item.available
                        ? "hover:bg-white/5"
                        : "cursor-not-allowed opacity-50"
                    )}
                  >
                    <div className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                      item.available ? "bg-cyan/10 text-cyan" : "bg-white/5 text-muted"
                    )}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-primary">{item.label}</p>
                      <p className="truncate font-mono text-2xs uppercase tracking-[0.12em] text-faint">
                        {item.sub}
                      </p>
                    </div>
                    {item.available && (
                      <Download className="h-3.5 w-3.5 text-muted" />
                    )}
                  </button>
                );
              })}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}