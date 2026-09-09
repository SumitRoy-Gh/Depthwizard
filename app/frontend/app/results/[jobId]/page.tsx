"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Layers, Box } from "lucide-react";
import { useJobStatus } from "@/lib/jobs";
import { useUi } from "@/store/ui-store";
import { Pill } from "@/components/shared/Pill";
import { MetadataStrip } from "@/components/results/MetadataStrip";
import { MapPanel } from "@/components/results/MapPanel";
import { ResultControls } from "@/components/results/ResultControls";
import { DownloadMenu } from "@/components/results/DownloadMenu";

const FlythroughViewer = dynamic(
  () => import("@/components/three/FlythroughViewer").then((m) => m.FlythroughViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center rounded-2xl border border-white/8 bg-elevated/40">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-cyan border-t-transparent" />
          <p className="mt-3 font-mono text-2xs uppercase tracking-[0.16em] text-faint">
            Initializing scene…
          </p>
        </div>
      </div>
    ),
  }
);

export default function ResultsPage() {
  const params = useParams<{ jobId: string }>();
  const { data, isLoading, error } = useJobStatus(params.jobId);
  const exaggeration = useUi((s) => s.exaggeration);
  const colormap = useUi((s) => s.colormap);

  // Derive deterministic seed from jobId so the demo heightmap is consistent
  const seed = useMemoSeed(params.jobId);

  if (error || isLoading || !data) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-6 py-24">
        <div className="glass-strong rounded-2xl p-8 text-center">
          <p className="font-mono text-2xs uppercase tracking-[0.18em] text-faint">
            {error ? "Error" : "Loading"}
          </p>
          <p className="mt-2 text-sm text-muted">
            {error?.message ?? "Fetching job artifacts…"}
          </p>
          <Link href="/" className="mt-6 inline-block rounded-full border border-cyan/40 bg-cyan/15 px-5 py-2 text-sm text-cyan">
            ← Back
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative mx-auto max-w-[1600px] px-4 py-6 md:px-6">
      {/* Top bar */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-4 flex flex-wrap items-end justify-between gap-3"
      >
        <div>
          <div className="flex items-center gap-2">
            <Link href="/" className="text-muted transition-colors hover:text-primary">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <p className="font-mono text-2xs uppercase tracking-[0.18em] text-cyan">Results</p>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-primary md:text-3xl">
            {data.meta.filename}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Pill tone={data.meta.metric ? "emerald" : "amber"}>
              {data.meta.metric ? "Metric" : "Relative-only"}
            </Pill>
            {data.meta.crs && <Pill tone="emerald">{data.meta.crs}</Pill>}
            {data.meta.gsdM && (
              <Pill tone="emerald">{(data.meta.gsdM * 100).toFixed(1)} cm/px</Pill>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/results/${params.jobId}/compare`}
            className="flex items-center gap-2 rounded-full border border-white/10 bg-elevated/40 px-4 py-2 text-sm text-primary transition-colors hover:border-white/20"
          >
            <Layers className="h-4 w-4" />
            Compare raw vs corrected
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <DownloadMenu job={data} />
        </div>
      </motion.div>

      {/* Two-panel layout */}
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.05 }}
            className="relative aspect-[16/10] overflow-hidden rounded-2xl border border-white/8 bg-elevated/40"
          >
            <FlythroughViewer
              seed={seed}
              exaggeration={exaggeration}
              colormap={colormap}
            />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="relative aspect-[16/7] overflow-hidden rounded-2xl border border-white/8"
          >
            <MapPanel georeferenced={data.meta.isGeoreferenced} />
          </motion.div>

          <MetadataStrip meta={data.meta} />
        </div>

        <motion.aside
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className="space-y-4"
        >
          <ResultControls />

          {!data.meta.isGeoreferenced && (
            <div className="rounded-2xl border border-amber/30 bg-amber/5 p-4">
              <p className="flex items-center gap-2 font-mono text-2xs uppercase tracking-[0.16em] text-amber">
                <Box className="h-3.5 w-3.5" />
                Honest scope
              </p>
              <p className="mt-2 text-sm leading-relaxed text-primary">
                Heights are reported as <strong>relative</strong> values — this image was not georeferenced, so elevations are not in real-world units.
              </p>
              <p className="mt-2 text-xs text-muted">
                GeoTIFF export is disabled. PNG heightmap and GLB mesh remain available.
              </p>
            </div>
          )}

          <div className="glass rounded-2xl p-4">
            <p className="font-mono text-2xs uppercase tracking-[0.18em] text-cyan">Pipeline</p>
            <h3 className="mt-2 text-lg font-semibold text-primary">Run summary</h3>
            <div className="mt-3 space-y-2">
              {data.stages.slice(0, 6).map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate text-muted">{s.label}</span>
                  <span className="font-mono text-2xs uppercase tracking-[0.14em] text-primary">
                    {s.status === "complete" ? "✓" : s.status === "skipped" ? "skip" : s.status}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted">
              Total <span className="text-primary">{data.meta.totalDurationMs ? `${(data.meta.totalDurationMs / 1000).toFixed(1)}s` : "—"}</span>
            </p>
          </div>
        </motion.aside>
      </div>
    </div>
  );
}

function useMemoSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}