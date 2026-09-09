"use client";

import { motion } from "framer-motion";
import {
  Mountain,
  Crosshair,
  Cpu,
  GitBranch,
  Database,
  AlertTriangle,
} from "lucide-react";
import { Pill } from "@/components/shared/Pill";

const STAGES: {
  id: string;
  title: string;
  desc: string;
  tag: "preprocess" | "backbone" | "branch" | "mesh" | "evaluate" | null;
}[] = [
  {
    id: "S1",
    title: "Input & auto-detection",
    desc: "rasterio parses CRS, geotransform, GSD and RPC tags. Geo reference is retained for the whole run — never discarded.",
    tag: null,
  },
  {
    id: "S2",
    title: "Preprocessing",
    desc: "Seven deterministic stages — radiometric stretch, cloud/shadow mask, denoise, CLAHE, resolution align, tiling, normalize. 94 / 94 tests pass.",
    tag: "preprocess",
  },
  {
    id: "S3",
    title: "Depth backbone",
    desc: "DINOv2 encoder + DPT decoder (Depth Anything V2 init), fine-tuned with RPC-aware pseudo-depth supervision → relative depth d̂.",
    tag: "backbone",
  },
  {
    id: "S4",
    title: "The branch",
    desc: "Non-georeferenced? d̂ is the product (rDSM). Georeferenced? per-region RANSAC against SRTM/Copernicus DEM turns depth into metric heights ẑ, with a confidence flag.",
    tag: "branch",
  },
  {
    id: "S5",
    title: "Bias-aware refinement",
    desc: "Adaptive height bins with a head-tail cut correct the long-tail bias that flattens rare, tall structures.",
    tag: null,
  },
  {
    id: "S6",
    title: "DSM & derived products",
    desc: "Outlier removal, smoothing, gap fill → DSM, nDSM, slope, hillshade and a confidence map.",
    tag: null,
  },
  {
    id: "S7",
    title: "Tiled 3D mesh",
    desc: "LOD heightmap-to-mesh with the original image projected back as texture — the flythrough asset.",
    tag: "mesh",
  },
  {
    id: "S8",
    title: "Evaluation",
    desc: "RMSE / MAE / correlation against LiDAR, broken out by terrain type and region class.",
    tag: "evaluate",
  },
];

const DATASETS = [
  { name: "ISPRS Vaihingen", license: "Scientific use, attribution required", note: "Aerial · 9 cm/px · IR-R-G · DSM ground truth" },
  { name: "ISPRS Potsdam", license: "Scientific use, attribution required", note: "Aerial · 5 cm/px · IR-R-G · DSM ground truth" },
  { name: "DFC2019", license: "Open benchmark", note: "Multi-platform overhead imagery" },
];

const MODELS = [
  {
    name: "Fine-tuned depth backbone",
    role: "S3 · DINOv2 + DPT",
    detail:
      "Depth Anything V2 init, fine-tuned with RPC-aware pseudo-depth supervision (Sat3R-style) so relative depth is valid for overhead imagery, not just ground photos.",
    icon: Mountain,
  },
  {
    name: "Per-region calibration",
    role: "S4b · RANSAC vs DEM",
    detail:
      "Off-the-shelf segmentation separates ground, building and vegetation; each region gets its own affine fit against SRTM or Copernicus DEM. Metric heights ship with a confidence flag.",
    icon: Crosshair,
  },
  {
    name: "Bias-aware refinement",
    role: "S5 · adaptive bins",
    detail:
      "Adaptive height bins with a head-tail cut keep tall structures from being flattened by regression to the mean.",
    icon: Cpu,
  },
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
          A research demo for SIH 26175: one optical image in — a labeled
          elevation product and an explorable 3D flythrough out. Metric when
          geo tags exist, relative otherwise, honest either way.
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
            <div key={s.id} className="glass flex items-start gap-4 rounded-2xl p-4">
              <span className="mt-0.5 font-mono text-sm tabular-nums text-faint">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-primary">{s.title}</p>
                  {s.tag && (
                    <Pill tone={s.tag === "backbone" || s.tag === "branch" ? "cyan" : "muted"}>
                      {s.tag}
                    </Pill>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted">{s.desc}</p>
              </div>
            </div>
          ))}
        </motion.div>
      </section>

      {/* Models */}
      <section className="mb-12">
        <h2 className="flex items-center gap-2 font-mono text-2xs uppercase tracking-[0.18em] text-cyan">
          <Cpu className="h-3.5 w-3.5" />
          Model stack
        </h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {MODELS.map((m) => (
            <ModelCard key={m.name} name={m.name} role={m.role} detail={m.detail} icon={m.icon} />
          ))}
        </div>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted">
          Technique novelty is not claimed — every method is adopted from cited
          published work. Our contribution is the integration: auto-routing,
          the observable pipeline, and the interactive 3D layer.
        </p>
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
              <div className="flex flex-wrap items-baseline justify-between gap-2">
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