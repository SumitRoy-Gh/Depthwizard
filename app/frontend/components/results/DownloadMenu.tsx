"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Download, FileType, Box, MapPinned, Layers } from "lucide-react";
import { useState } from "react";
import type { JobStatus } from "@/types/api";
import { Magnetic } from "@/components/shared/Motion";
import { cn } from "@/lib/cn";

export function DownloadMenu({ job }: { job: JobStatus }) {
  const [open, setOpen] = useState(false);

  const items = [
    {
      key: "mesh",
      label: "3D terrain viewer",
      sub: "Orbit, fly, and walk the generated scene",
      icon: Box,
      available: !!job.artifacts?.meshUrl,
      href: job.artifacts?.meshUrl,
      tone: "cyan",
    },
    {
      key: "heightmap",
      label: "DSM raster",
      sub: "Generated surface elevation GeoTIFF",
      icon: Layers,
      available: !!job.artifacts?.heightmapUrl,
      href: job.artifacts?.heightmapUrl,
      tone: "cyan",
    },
    {
      key: "ndsm",
      label: "nDSM raster",
      sub: "Above-ground height GeoTIFF",
      icon: Layers,
      available: !!job.artifacts?.ndsmUrl,
      href: job.artifacts?.ndsmUrl,
      tone: "cyan",
    },
    {
      key: "slope",
      label: "Slope raster",
      sub: "Terrain slope in degrees",
      icon: Layers,
      available: !!job.artifacts?.slopeUrl,
      href: job.artifacts?.slopeUrl,
      tone: "cyan",
    },
    {
      key: "hillshade",
      label: "Hillshade raster",
      sub: "Shaded relief GeoTIFF",
      icon: Layers,
      available: !!job.artifacts?.hillshadeUrl,
      href: job.artifacts?.hillshadeUrl,
      tone: "cyan",
    },
    {
      key: "confidence",
      label: "Confidence raster",
      sub: "Prediction confidence GeoTIFF",
      icon: Layers,
      available: !!job.artifacts?.confidenceUrl,
      href: job.artifacts?.confidenceUrl,
      tone: "cyan",
    },
    {
      key: "geotiff",
      label: "GeoTIFF",
      sub: job.meta.metric ? "Metric raster · CRS preserved" : "Unavailable — not georeferenced",
      icon: MapPinned,
      available: !!job.artifacts?.geotiffUrl,
      href: job.artifacts?.geotiffUrl,
      tone: job.meta.metric ? "cyan" : "muted",
    },
    {
      key: "pdf",
      label: "PDF report",
      sub: "Summary + dataset credits",
      icon: FileType,
      available: !!job.artifacts?.pdfUrl,
      href: job.artifacts?.pdfUrl,
      tone: "cyan",
    },
  ] as const;

  return (
    <div className="relative">
      <Magnetic>
        <button
          onClick={() => setOpen((v) => !v)}
          className="btn-aurora flex items-center gap-2 rounded-full border border-cyan/40 bg-cyan/15 px-4 py-2 text-sm font-medium text-cyan shadow-glow transition-all hover:bg-cyan/25"
        >
          <Download className="h-4 w-4" />
          Download
        </button>
      </Magnetic>

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
                const content = (
                  <>
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
                    {item.available && <Download className="h-3.5 w-3.5 text-muted" />}
                  </>
                );

                return item.available && item.href ? (
                  <a
                    key={item.key}
                    href={item.href}
                    target={item.key === "mesh" ? "_blank" : undefined}
                    rel={item.key === "mesh" ? "noreferrer" : undefined}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-white/5"
                    )}
                  >
                    {content}
                  </a>
                ) : (
                  <button
                    key={item.key}
                    disabled
                    className="flex w-full cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2.5 text-left opacity-50"
                  >
                    {content}
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