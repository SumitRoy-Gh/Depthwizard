"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, RefreshCw, AlertTriangle, CheckCircle2, Activity } from "lucide-react";
import { useJobStatus } from "@/lib/jobs";
import { StageStepper } from "@/components/processing/StageStepper";
import { StageThumbnail } from "@/components/processing/StageThumbnail";
import { ProgressRing } from "@/components/processing/ProgressRing";
import { Pill } from "@/components/shared/Pill";
import Link from "next/link";

export default function ProcessingPage() {
  const params = useParams<{ jobId: string }>();
  const router = useRouter();
  const { data, isLoading, error } = useJobStatus(params.jobId);

  useEffect(() => {
    if (data?.overall === "complete") {
      const t = setTimeout(() => {
        router.push(`/results/${params.jobId}`);
      }, 1600);
      return () => clearTimeout(t);
    }
  }, [data?.overall, params.jobId, router]);

  if (error) {
    return (
      <CenterShell>
        <div className="glass-strong rounded-2xl p-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-rose/10 text-rose">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-semibold text-primary">Job not found</h2>
          <p className="mt-2 text-sm text-muted">{error.message}</p>
          <Link href="/" className="mt-6 inline-block rounded-full border border-cyan/40 bg-cyan/15 px-5 py-2 text-sm text-cyan">
            Try another image
          </Link>
        </div>
      </CenterShell>
    );
  }

  if (isLoading || !data) {
    return (
      <CenterShell>
        <div className="glass-strong rounded-2xl p-8 text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-2 border-cyan border-t-transparent" />
          <p className="mt-4 font-mono text-2xs uppercase tracking-[0.18em] text-faint">
            Loading job…
          </p>
        </div>
      </CenterShell>
    );
  }

  const completed = data.stages.filter((s) => s.status === "complete").length;
  const total = data.stages.length;
  const progress = completed / total;
  const activeIndex = data.stages.findIndex((s) => s.status === "running");
  const failed = data.overall === "failed";
  const completedAll = data.overall === "complete";

  return (
    <div className="relative mx-auto max-w-7xl px-6 py-10">
      {/* Top bar */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-end justify-between gap-3"
      >
        <div>
          <p className="font-mono text-2xs uppercase tracking-[0.18em] text-cyan">Processing</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-primary md:text-4xl">
            {data.meta.filename}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Pill tone={data.meta.metric ? "emerald" : "amber"}>
              {data.meta.metric ? "Georeferenced" : "Relative-only"}
            </Pill>
            <Pill tone="muted">job {data.meta.jobId.slice(-6)}</Pill>
            <Pill tone="muted">{data.meta.modelVariant}</Pill>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <ProgressRing value={progress} label="complete" />
          <div className="space-y-1">
            <p className="font-mono text-2xs uppercase tracking-[0.16em] text-faint">
              {completedAll ? "Finalizing" : "Running"}
            </p>
            <p className="text-3xl font-semibold tabular-nums text-primary">
              {completed} <span className="text-faint">/ {total}</span>
            </p>
            {data.etaSeconds != null && (
              <p className="font-mono text-2xs uppercase tracking-[0.16em] text-muted">
                ETA {data.etaSeconds}s
              </p>
            )}
          </div>
        </div>
      </motion.div>

      {/* Overall status banner */}
      <AnimatePresence mode="wait">
        {completedAll ? (
          <motion.div
            key="done"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-6 flex items-center justify-between gap-4 rounded-2xl border border-emerald/30 bg-emerald/10 px-5 py-4"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald/20 text-emerald">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium text-primary">Pipeline complete</p>
                <p className="text-sm text-muted">Routing to results viewer…</p>
              </div>
            </div>
            <Link
              href={`/results/${params.jobId}`}
              className="btn-aurora rounded-full border border-emerald/40 bg-emerald/15 px-5 py-2 text-sm font-medium text-emerald"
            >
              View results
            </Link>
          </motion.div>
        ) : failed ? (
          <motion.div
            key="failed"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-6 flex items-center justify-between gap-4 rounded-2xl border border-rose/30 bg-rose/10 px-5 py-4"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-rose/20 text-rose">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium text-primary">Pipeline failed</p>
                <p className="text-sm text-muted">
                  {data.stages.find((s) => s.status === "failed")?.reason ?? "Unknown failure"}
                </p>
              </div>
            </div>
            <Link
              href="/"
              className="rounded-full border border-rose/40 bg-rose/10 px-5 py-2 text-sm text-rose"
            >
              Try another image
            </Link>
          </motion.div>
        ) : (
          <motion.div
            key="running"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mt-6 flex items-center gap-3 rounded-2xl border border-cyan/30 bg-cyan/5 px-5 py-4"
          >
            <div className="relative">
              <Activity className="h-5 w-5 text-cyan" />
              <motion.span
                className="absolute inset-0 rounded-full bg-cyan/40 blur-md"
                animate={{ opacity: [0.3, 0.8, 0.3] }}
                transition={{ duration: 1.4, repeat: Infinity }}
              />
            </div>
            <p className="font-mono text-2xs uppercase tracking-[0.18em] text-cyan">
              {data.stages[activeIndex]?.label ?? "Initializing"}…
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Two-column main */}
      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_460px]">
        {/* Left — stepper */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass rounded-2xl p-5"
        >
          <h2 className="mb-4 flex items-center gap-2 font-mono text-2xs uppercase tracking-[0.18em] text-cyan">
            <RefreshCw className="h-3.5 w-3.5" />
            Pipeline progress
          </h2>
          <StageStepper stages={data.stages} activeIndex={activeIndex === -1 ? completed : activeIndex} />
        </motion.div>

        {/* Right — thumbnails grid */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-3"
        >
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-mono text-2xs uppercase tracking-[0.18em] text-cyan">
              <ArrowRight className="h-3.5 w-3.5" />
              Stage outputs
            </h2>
            <span className="font-mono text-2xs uppercase tracking-[0.14em] text-faint">
              {data.stages.filter((s) => s.status === "complete").length} / {data.stages.length}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {data.stages.map((s, i) => (
              <StageThumbnail key={s.id} stage={s} index={i} />
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function CenterShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-24">
      {children}
    </div>
  );
}