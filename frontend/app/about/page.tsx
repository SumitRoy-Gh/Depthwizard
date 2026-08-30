"use client";

import { motion } from "framer-motion";
import { Layers, Cpu, Mountain, GitBranch, Database, AlertTriangle, Sparkles } from "lucide-react";
import { Pill } from "@/components/shared/Pill";

const STAGES = [
  { id: "1", title: "Radiometric Correction", desc: "Percentile stretch to uint8 + DAv2 RGB proxy (IR-R-G → R-G-G)." },
  { id: "2", title: "Cloud & Shadow Masking", desc: "Nodata + perceptual luminance + spectral saturation → boolean valid_mask." },
  { id: "3", title: "Noise Reduction", desc: "Edge-preserving bilateral filter on imagery; masked median on DSM." },
  { id: "4", title: "CLAHE Contrast", desc: "Local 8×8 histogram equalization with contrast clipping at β = 2.0." },
  { id: "5", title: "Resolution Handling", desc: "Align to target GSD (default 0.09 m/px) — bilinear for arrays, NN for masks." },
  { id: "6", title: "Tiling / Stitching", desc: "512×512 patches; cosine-weighted feathered reconstruction for inference." },
  { id: "7", title: "Depth Estimation (DAv2)", desc: "Frozen Depth Anything v2 (Base) producing relative depth D_prior." },
  { id: "8", title: "Correction U-Net", desc: "[RGB, D_prior] → 4-channel input → calibrated metric DSM." },
];

const DATASETS = [
  { name: "ISPRS Vaihingen", license: "For scientific use, attribution required", note: "Aerial · 9 cm/px · IR-R-G · DSM ground truth" },
  { name: "ISPRS Potsdam", license: "For scientific use, attribution required", note: "Aerial · 5 cm/px · IR-R-G · DSM ground truth" },
  { name: "DFC2019", license: "Open benchmark", note: "Multi-platform overhead imagery" },
];

export default function AboutPage() {
  return (
    <div className="relative mx-auto max-w-5xl px-6 py-12 md:py-16">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-10"
      >
        <p className="font-mono text-2xs uppercase tracking-[0.18em] text-cyan">About</p>
        <h1 className="mt-2 text-balance text-4xl font-semibold tracking-tightest text-primary md:text-5xl">
          What DepthWizard is, and isn’t.
        </h1>
        <p className="mt-4 max-w-2xl text-pretty text-base leading-relaxed text-muted">
          A research demo for monocular single-view height estimation, built on a
          seven-stage preprocessing pipeline, a frozen foundation model
          (Depth Anything v2), and a small calibration U-Net. Trained and
          validated on public aerial benchmarks.
        </p>
      </motion.div>

      {/* Architecture overview */}
      <section className="mb-12">
        <h2 className="flex items-center gap-2 font-mono text-2xs uppercase tracking-[0.18em] text-cyan">
          <GitBranch className="h-3.5 w-3.5" />
          Architecture
        </h2>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 grid gap-3"
        >
          {STAGES.map((s, i) => (
            <div
              key={s.id}
              className="glass flex items-start gap-4 rounded-2xl p-4"
            >
              <span className="font-mono text-lg tabular-nums text-faint">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="flex-1">
                <p className="font-medium text-primary">{s.title}</p>
                <p className="mt-1 text-sm text-muted">{s.desc}</p>
              </div>
              {i < 6 && <Pill tone="muted">preprocess</Pill>}
              {i === 6 && <Pill tone="cyan">DAv2</Pill>}
              {i === 7 && <Pill tone="cyan">U-Net</Pill>}
            </div>
          ))}
        </motion.div>
      </section>

      {/* Models */}
      <section className="mb-12">
        <h2 className="flex items-center gap-2 font-mono text-2xs uppercase tracking-[0.18em] text-cyan">
          <Cpu className="h-3.5 w-3.5" />
          Models
        </h2>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <ModelCard
            name="Depth Anything v2 (Base)"
            role="Frozen feature extractor"
            detail="Outputs relative monocular depth D_prior. Trained on a large natural-image corpus. We do not fine-tune."
            icon={Mountain}
          />
          <ModelCard
            name="Correction U-Net"
            role="Trainable calibration head"
            detail="Learns H_pred = a·D_prior + b + R(I, D) from 4-channel [RGB, D_prior] input on aerial imagery + LiDAR pairs."
            icon={Layers}
          />
        </div>
      </section>

      {/* Datasets */}
      <section className="mb-12">
        <h2 className="flex items-center gap-2 font-mono text-2xs uppercase tracking-[0.18em] text-cyan">
          <Database className="h-3.5 w-3.5" />
          Datasets
        </h2>

        <div className="mt-4 grid gap-3">
          {DATASETS.map((d) => (
            <div key={d.name} className="glass rounded-2xl p-4">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-medium text-primary">{d.name}</p>
                <Pill tone="muted">{d.license}</Pill>
              </div>
              <p className="mt-2 text-sm text-muted">{d.note}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Honest scope */}
      <section>
        <h2 className="flex items-center gap-2 font-mono text-2xs uppercase tracking-[0.18em] text-amber">
          <AlertTriangle className="h-3.5 w-3.5" />
          What this is not
        </h2>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 rounded-2xl border border-amber/30 bg-amber/5 p-5"
        >
          <ul className="space-y-2 text-sm text-primary">
            <li className="flex gap-2">
              <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-amber" />
              <span>Trained and validated on aerial/satellite imagery of specific regions. Accuracy on arbitrary user photos — especially non-georeferenced ones — is not guaranteed.</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-amber" />
              <span>Not a real-time multi-user system. Sessions are local-only.</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-amber" />
              <span>Not a replacement for LiDAR or photogrammetry for sub-decimeter surveying.</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-amber" />
              <span>Not certified for safety-, life-, or mission-critical decisions.</span>
            </li>
          </ul>
        </motion.div>
      </section>
    </div>
  );
}

function ModelCard({
  name,
  role,
  detail,
  icon: Icon,
}: {
  name: string;
  role: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="glass relative overflow-hidden rounded-2xl p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan/10 text-cyan">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="font-medium text-primary">{name}</p>
          <p className="font-mono text-2xs uppercase tracking-[0.16em] text-faint">{role}</p>
        </div>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-muted">{detail}</p>
      <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-cyan/5 blur-2xl" />
    </div>
  );
}