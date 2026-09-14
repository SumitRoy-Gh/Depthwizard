"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Waves, Activity, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/cn";
import { useUi } from "@/store/ui-store";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Zone {
  zone_id: string;
  row: number;
  col: number;
  score: number;
  band: "low" | "medium" | "high";
}

interface RiskZones {
  flood: Zone[];
  earthquake: Zone[];
}

type RiskMode = "flood" | "earthquake";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BAND_STYLES: Record<Zone["band"], { bg: string; text: string; dot: string }> = {
  high:   { bg: "bg-rose/15 border-rose/30",   text: "text-rose",   dot: "bg-rose"   },
  medium: { bg: "bg-amber/10 border-amber/25",  text: "text-amber",  dot: "bg-amber"  },
  low:    { bg: "bg-emerald/10 border-emerald/25", text: "text-emerald", dot: "bg-emerald" },
};

function scoreBar(score: number) {
  // Colour transitions: 0 = emerald, 0.5 = amber, 1 = rose
  const pct = Math.round(score * 100);
  const color =
    score > 0.66 ? "bg-rose" :
    score > 0.33 ? "bg-amber" :
    "bg-emerald";
  return { pct, color };
}

// ---------------------------------------------------------------------------
// Overlay image switcher
// ---------------------------------------------------------------------------

function RiskOverlay({
  mode,
  floodUrl,
  quakeUrl,
  opacity,
}: {
  mode: RiskMode;
  floodUrl?: string;
  quakeUrl?: string;
  opacity: number;
}) {
  const src = mode === "flood" ? floodUrl : quakeUrl;
  if (!src) return null;

  return (
    <AnimatePresence mode="wait">
      <motion.img
        key={mode}
        src={src}
        alt={`${mode} risk overlay`}
        initial={{ opacity: 0 }}
        animate={{ opacity }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        className="pointer-events-none absolute inset-0 h-full w-full object-cover rounded-xl"
        style={{ mixBlendMode: "multiply" }}
      />
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Zone list row
// ---------------------------------------------------------------------------

function ZoneRow({ zone, rank }: { zone: Zone; rank: number }) {
  const s = BAND_STYLES[zone.band];
  const { pct, color } = scoreBar(zone.score);
  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: rank * 0.03 }}
      className={cn(
        "flex items-center gap-3 rounded-xl border px-3 py-2.5",
        s.bg
      )}
    >
      {/* Rank badge */}
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/8 font-mono text-2xs text-muted">
        {rank + 1}
      </span>

      {/* Zone id */}
      <div className="min-w-0 flex-1">
        <p className={cn("font-mono text-xs font-semibold uppercase tracking-[0.12em]", s.text)}>
          Zone {zone.zone_id.toUpperCase()}
        </p>
        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/10">
          <motion.div
            className={cn("h-full rounded-full", color)}
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ delay: rank * 0.03 + 0.15, duration: 0.55, ease: "easeOut" }}
          />
        </div>
      </div>

      {/* Score + band */}
      <div className="text-right shrink-0">
        <span className={cn("font-mono text-xs font-bold tabular-nums", s.text)}>
          {pct}%
        </span>
        <p className="mt-0.5 font-mono text-2xs uppercase tracking-[0.1em] text-faint">
          {zone.band}
        </p>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export interface RiskPanelProps {
  floodRiskUrl?: string;
  quakeRiskUrl?: string;
  riskZonesUrl?: string;
  /** Optional: source image thumbnail to show the overlay on */
  thumbnailUrl?: string;
}

export function RiskPanel({
  floodRiskUrl,
  quakeRiskUrl,
  riskZonesUrl,
  thumbnailUrl,
}: RiskPanelProps) {
  const [mode, setMode] = useState<RiskMode>("flood");
  const [zones, setZones] = useState<RiskZones | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const overlayOpacity = useUi((s) => s.overlayOpacity);

  // Fetch risk_zones.json when URL is available
  useEffect(() => {
    if (!riskZonesUrl) return;
    fetch(riskZonesUrl)
      .then((r) => r.json())
      .then((d) => setZones(d as RiskZones))
      .catch(() => setLoadErr(true));
  }, [riskZonesUrl]);

  const hasData = !!(floodRiskUrl || quakeRiskUrl);
  if (!hasData) {
    return (
      <div className="glass rounded-2xl p-5 text-center">
        <p className="font-mono text-2xs uppercase tracking-[0.16em] text-faint">
          Risk analysis unavailable
        </p>
        <p className="mt-1 text-xs text-muted">
          No risk data in this result — re-process with the updated backend.
        </p>
      </div>
    );
  }

  const activeZones = zones ? (mode === "flood" ? zones.flood : zones.earthquake) : [];

  return (
    <div className="space-y-3">
      {/* ── Header + mode toggle ─────────────────────────────── */}
      <div className="glass rounded-2xl p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="font-mono text-2xs uppercase tracking-[0.18em] text-rose">
              Disaster Risk
            </p>
            <h3 className="mt-1 text-base font-semibold text-primary">
              Proxy analysis
            </h3>
          </div>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="rounded-lg p-1.5 text-muted transition-colors hover:text-primary"
            aria-label="Toggle risk panel"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>

        {/* Mode toggle pills */}
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => setMode("flood")}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2 text-sm font-medium transition-all",
              mode === "flood"
                ? "border-cyan/40 bg-cyan/15 text-cyan shadow-[0_0_12px_-4px_rgba(14,165,233,0.4)]"
                : "border-hairline text-muted hover:text-primary"
            )}
          >
            <Waves className="h-3.5 w-3.5" />
            Flood
          </button>
          <button
            onClick={() => setMode("earthquake")}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2 text-sm font-medium transition-all",
              mode === "earthquake"
                ? "border-amber/40 bg-amber/10 text-amber shadow-[0_0_12px_-4px_rgba(245,158,11,0.35)]"
                : "border-hairline text-muted hover:text-primary"
            )}
          >
            <Activity className="h-3.5 w-3.5" />
            Earthquake
          </button>
        </div>

        {/* Methodology note */}
        <p className="mt-3 text-xs leading-relaxed text-muted">
          {mode === "flood"
            ? "Relative ground elevation from the bare-earth model. Low spots pooling water = higher risk."
            : "Building density × height variance from the surface model. Structurally irregular clusters = higher risk."}
        </p>
        <p className="mt-1 font-mono text-2xs uppercase tracking-[0.12em] text-faint">
          Rule-based proxy · no external hazard data
        </p>
      </div>

      {/* ── Overlay preview ──────────────────────────────────── */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            {/* Composite: thumbnail + overlay */}
            <div className="relative aspect-square overflow-hidden rounded-xl border border-white/8 bg-elevated/60">
              {thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thumbnailUrl}
                  alt="Source imagery"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-grid opacity-40" />
              )}
              <RiskOverlay
                mode={mode}
                floodUrl={floodRiskUrl}
                quakeUrl={quakeRiskUrl}
                opacity={overlayOpacity}
              />
              {/* Legend */}
              <div className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 backdrop-blur">
                <div className="h-2 w-8 rounded-full bg-gradient-to-r from-emerald-500 to-rose-500" />
                <span className="font-mono text-2xs text-white/70">Low → High</span>
              </div>
            </div>

            {/* Zone ranked list */}
            <div className="mt-3 glass rounded-2xl p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="font-mono text-2xs uppercase tracking-[0.16em] text-cyan">
                  {mode === "flood" ? "Flood" : "Earthquake"} zones · worst first
                </p>
                {loadErr && (
                  <span className="flex items-center gap-1 text-xs text-amber">
                    <AlertTriangle className="h-3 w-3" />
                    Failed to load
                  </span>
                )}
              </div>

              {!zones && !loadErr && (
                <div className="flex items-center gap-2 py-2">
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-cyan border-t-transparent" />
                  <span className="text-xs text-muted">Loading zones…</span>
                </div>
              )}

              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1 scrollbar-thin">
                {activeZones.slice(0, 12).map((z, i) => (
                  <ZoneRow key={z.zone_id} zone={z} rank={i} />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
