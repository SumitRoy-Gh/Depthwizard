"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";
import { Pill } from "@/components/shared/Pill";
import { SliderCompare } from "@/components/compare/SliderCompare";

export default function ComparePage() {
  const params = useParams<{ jobId: string }>();

  return (
    <div className="relative mx-auto max-w-[1400px] px-4 py-6 md:px-6">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6 flex flex-wrap items-end justify-between gap-3"
      >
        <div>
          <div className="flex items-center gap-2">
            <Link href={`/results/${params.jobId}`} className="text-muted transition-colors hover:text-primary">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <p className="font-mono text-2xs uppercase tracking-[0.18em] text-cyan">
              Compare
            </p>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-primary md:text-3xl">
            Raw DAv2 vs. corrected U-Net
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Pill tone="muted">Before / After</Pill>
            <Pill tone="muted">Shared viridis colormap</Pill>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass overflow-hidden rounded-2xl p-4"
      >
        <SliderCompare />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="mt-6 grid gap-4 md:grid-cols-3"
      >
        <Note
          tone="cyan"
          label="What changed"
          text="DAv2 produces relative monocular depth — values are scale-ambiguous. The Correction U-Net learns an affine recalibration plus a residual that corrects flat-ground misjudgments near tall structures."
        />
        <Note
          tone="amber"
          label="What to look for"
          text="Buildings should appear sharper and more vertical. Roads and open ground should be flatter. Color consistency across the scene should be tighter on the corrected side."
        />
        <Note
          tone="emerald"
          label="Why this matters"
          text="Without the U-Net, the heightmap looks plausible but the absolute scale and the metric calibration are wrong. This view proves the correction step is doing real work."
        />
      </motion.div>
    </div>
  );
}

function Note({ tone, label, text }: { tone: "cyan" | "amber" | "emerald"; label: string; text: string }) {
  const tones = {
    cyan: "border-cyan/30 bg-cyan/5 text-cyan",
    amber: "border-amber/30 bg-amber/5 text-amber",
    emerald: "border-emerald/30 bg-emerald/5 text-emerald",
  };
  return (
    <div className={`rounded-2xl border p-4 ${tones[tone]}`}>
      <p className={`font-mono text-2xs uppercase tracking-[0.16em] ${tones[tone].split(" ")[2]}`}>{label}</p>
      <p className="mt-2 text-sm leading-relaxed text-primary">{text}</p>
    </div>
  );
}