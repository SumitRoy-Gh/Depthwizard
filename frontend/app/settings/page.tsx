"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Save, Check } from "lucide-react";
import { useUi } from "@/store/ui-store";
import { Pill } from "@/components/shared/Pill";
import { cn } from "@/lib/cn";

export default function SettingsPage() {
  const {
    exaggeration,
    setExaggeration,
    colormap,
    setColormap,
    overlayOpacity,
    setOverlayOpacity,
    showAdvancedDetail,
    setShowAdvancedDetail,
    defaultExports,
    setDefaultExports,
  } = useUi();

  const [savedAt, setSavedAt] = useState<number | null>(null);

  return (
    <div className="relative mx-auto max-w-3xl px-6 py-12">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <p className="font-mono text-2xs uppercase tracking-[0.18em] text-cyan">Settings</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-primary md:text-4xl">
          Preferences
        </h1>
        <p className="mt-2 text-sm text-muted">
          Defaults for new runs. Stored locally — never sent to a server.
        </p>
      </motion.div>

      <div className="space-y-4">
        <Card title="Display defaults">
          <Row label="Vertical exaggeration" sub={`${exaggeration.toFixed(1)}×`}>
            <input
              type="range"
              min={1}
              max={5}
              step={0.1}
              value={exaggeration}
              onChange={(e) => setExaggeration(parseFloat(e.target.value))}
              className="w-full accent-cyan"
            />
          </Row>
          <Row label="Overlay opacity" sub={`${Math.round(overlayOpacity * 100)}%`}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={overlayOpacity}
              onChange={(e) => setOverlayOpacity(parseFloat(e.target.value))}
              className="w-full accent-cyan"
            />
          </Row>
          <Row label="Default colormap">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setColormap("viridis")}
                className={cn(
                  "relative h-10 overflow-hidden rounded-lg border text-xs font-medium transition-all",
                  colormap === "viridis"
                    ? "border-cyan/50 text-cyan"
                    : "border-white/10 text-muted"
                )}
              >
                <span
                  aria-hidden
                  className="absolute inset-0 opacity-40"
                  style={{ background: "linear-gradient(to right, #440154, #3b528b, #21918c, #5ec962, #fde725)" }}
                />
                <span className="relative">Viridis</span>
              </button>
              <button
                onClick={() => setColormap("terrain")}
                className={cn(
                  "relative h-10 overflow-hidden rounded-lg border text-xs font-medium transition-all",
                  colormap === "terrain"
                    ? "border-cyan/50 text-cyan"
                    : "border-white/10 text-muted"
                )}
              >
                <span
                  aria-hidden
                  className="absolute inset-0 opacity-40"
                  style={{ background: "linear-gradient(to right, #0a1f3a, #2d5a4a, #c2a850, #ffffff)" }}
                />
                <span className="relative">Terrain</span>
              </button>
            </div>
          </Row>
        </Card>

        <Card title="Default outputs">
          <p className="mb-3 text-sm text-muted">
            Pre-checked download formats when a run completes.
          </p>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {(["mesh", "heightmap", "geotiff", "pdf"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setDefaultExports({ [k]: !defaultExports[k] })}
                className={cn(
                  "flex h-12 items-center justify-center gap-2 rounded-lg border text-sm font-medium transition-all",
                  defaultExports[k]
                    ? "border-cyan/40 bg-cyan/10 text-cyan"
                    : "border-white/10 bg-white/5 text-muted"
                )}
              >
                {defaultExports[k] && <Check className="h-3.5 w-3.5" />}
                <span className="capitalize">{k === "geotiff" ? "GeoTIFF" : k}</span>
              </button>
            ))}
          </div>
        </Card>

        <Card title="Pipeline view">
          <button
            onClick={() => setShowAdvancedDetail(!showAdvancedDetail)}
            className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/8 bg-elevated/40 p-4 transition-colors hover:border-white/20"
          >
            <div className="text-left">
              <p className="font-medium text-primary">Always show advanced detail</p>
              <p className="mt-0.5 text-xs text-muted">
                Keep per-stage thumbnails expanded on the processing page.
              </p>
            </div>
            <div
              className={cn(
                "relative h-6 w-11 rounded-full transition-colors",
                showAdvancedDetail ? "bg-cyan" : "bg-white/10"
              )}
            >
              <motion.span
                animate={{ x: showAdvancedDetail ? 22 : 2 }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
                className="absolute top-0.5 h-5 w-5 rounded-full bg-void shadow-glow"
              />
            </div>
          </button>
        </Card>

        <Card title="About these preferences">
          <p className="text-sm text-muted">
            Settings persist in this browser only via localStorage. They never leave your device. To reset, clear your browser data for this site.
          </p>
        </Card>

        {savedAt && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-center gap-2 rounded-full border border-emerald/30 bg-emerald/10 px-4 py-2 text-sm text-emerald"
          >
            <Check className="h-4 w-4" />
            Preferences saved · {new Date(savedAt).toLocaleTimeString()}
          </motion.div>
        )}
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl p-5"
    >
      <h2 className="font-mono text-2xs uppercase tracking-[0.18em] text-cyan">{title}</h2>
      <div className="mt-4 space-y-4">{children}</div>
    </motion.section>
  );
}

function Row({
  label,
  sub,
  children,
}: {
  label: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-sm font-medium text-primary">{label}</span>
        {sub && <span className="font-mono text-2xs tabular-nums text-muted">{sub}</span>}
      </div>
      {children}
    </div>
  );
}