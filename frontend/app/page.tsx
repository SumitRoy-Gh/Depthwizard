"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Box,
  Check,
  Copy,
  Cpu,
  Crosshair,
  FileImage,
  Scaling,
  ShieldCheck,
} from "lucide-react";
import {
  Reveal,
  RevealOnScroll,
  ScrollMarquee,
  ScrollProgress,
  SplitHeading,
  CharHeading,
} from "@/components/shared/Motion";
import { Pill } from "@/components/shared/Pill";
import { DropZone } from "@/components/upload/DropZone";
import { SampleTiles } from "@/components/upload/SampleTiles";
import { AdvancedOptions } from "@/components/upload/AdvancedOptions";
import { RecentUploads } from "@/components/upload/RecentUploads";

export default function HomePage() {
  return (
    <div className="relative">
      <ScrollProgress />

      {/* ============================== HERO ============================== */}
      <section className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl flex-col items-center justify-center px-6 pb-16 pt-14 text-center">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[480px] bg-[radial-gradient(ellipse_55%_60%_at_50%_0%,rgba(14,116,144,0.08),transparent_65%)]" />

        <Reveal delay={0.05}>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Pill tone="cyan">
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              SIH 26175 · ISRO
            </Pill>
            <Pill tone="muted">Single-view → 3D</Pill>
            <Pill tone="muted">Disaster management</Pill>
          </div>
        </Reveal>

        <h1 className="mt-8 text-balance text-5xl font-semibold leading-[1.02] tracking-tightest text-primary md:text-7xl">
          <SplitHeading text="One overhead image." />
          <br />
          <span className="text-cyan">
            <CharHeading text="A measurable 3D world." />
          </span>
        </h1>

        <Reveal delay={0.55} className="mt-6 max-w-2xl">
          <p className="text-pretty text-base leading-relaxed text-muted md:text-lg">
            DepthWizard estimates elevation from a single image — relative when
            the image has no geo reference, metric when it does — and renders
            the result as an explorable 3D flythrough. Every claim it makes is
            labeled; every stage is visible.
          </p>
        </Reveal>

        <Reveal delay={0.7} className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="#studio">
            <button className="group flex items-center gap-2 rounded-full bg-primary px-7 py-3 text-sm font-medium text-void transition-colors hover:bg-cyan hover:text-white">
              Start a run
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>
          </Link>
          <Link href="/about">
            <button className="rounded-full border border-hairline bg-elevated/70 px-7 py-3 text-sm font-medium text-primary transition-colors hover:border-rim">
              Read the technical notes
            </button>
          </Link>
        </Reveal>

        <Reveal delay={0.85} className="mt-12 w-full max-w-2xl">
          <div className="grid grid-cols-3 divide-x divide-hairline rounded-2xl border border-hairline bg-elevated/60">
            <HeroStat label="Pipeline" value="8 stages" />
            <HeroStat label="Preprocessing tests" value="94 / 94" />
            <HeroStat label="Evaluated against" value="LiDAR DSM" />
          </div>
        </Reveal>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.6, duration: 1 }}
          className="pointer-events-none absolute bottom-6 left-1/2 hidden -translate-x-1/2 md:block"
        >
          <div className="flex h-9 w-5 items-start justify-center rounded-full border border-rim p-1.5">
            <motion.div
              animate={{ y: [0, 10, 0], opacity: [1, 0.2, 1] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
              className="h-1.5 w-1 rounded-full bg-cyan"
            />
          </div>
        </motion.div>
      </section>

      {/* ============================ MARQUEE ============================= */}
      <section className="relative overflow-hidden border-y border-hairline bg-stage py-6">
        <ScrollMarquee speed={34} className="text-2xs">
          {[
            "Datasets",
            "ISPRS Vaihingen",
            "ISPRS Potsdam",
            "DFC2019",
            "Reference DEM",
            "SRTM / Copernicus",
            "Methods",
            "Depth Anything V2",
            "Sat3R-style RPC fine-tuning",
            "Per-region RANSAC",
            "Head-tail-cut refinement",
          ].map((item, i) => (
            <span key={i} className="flex items-center gap-12">
              <span
                className={
                  i % 2 === 0
                    ? "font-mono uppercase tracking-[0.18em] text-cyan"
                    : "text-muted"
                }
              >
                {item}
              </span>
            </span>
          ))}
        </ScrollMarquee>
      </section>

      <Capabilities />
      <Pipeline />
      <Terminal />
      <Story />
      <Studio />
      <FinalCTA />
    </div>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-4">
      <p className="font-mono text-2xs uppercase tracking-[0.16em] text-faint">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-primary">
        {value}
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Shared section furniture
--------------------------------------------------------------------------- */

function SectionHead({
  eyebrow,
  title,
  lede,
}: {
  eyebrow: string;
  title: string;
  lede?: string;
}) {
  return (
    <RevealOnScroll className="mx-auto max-w-2xl text-center">
      <p className="font-mono text-2xs uppercase tracking-[0.18em] text-cyan">
        {eyebrow}
      </p>
      <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-primary md:text-4xl">
        {title}
      </h2>
      {lede && (
        <p className="mt-3 text-pretty text-sm leading-relaxed text-muted md:text-base">
          {lede}
        </p>
      )}
    </RevealOnScroll>
  );
}

/* ============================ CAPABILITIES ============================ */

const CAPABILITIES = [
  {
    icon: <FileImage className="h-5 w-5" strokeWidth={1.6} />,
    title: "Any overhead image",
    body: "GeoTIFF keeps its CRS and GSD; plain JPEG/PNG gets a relative surface. Inputs are routed automatically — no configuration.",
  },
  {
    icon: <Cpu className="h-5 w-5" strokeWidth={1.6} />,
    title: "Fine-tuned depth backbone",
    body: "DINOv2 + DPT (Depth Anything V2 init), fine-tuned against satellite RPC geometry — not a frozen off-the-shelf guess.",
  },
  {
    icon: <Crosshair className="h-5 w-5" strokeWidth={1.6} />,
    title: "Geometry-aware calibration",
    body: "Semantic regions (ground / building / vegetation) each get their own RANSAC fit against SRTM / Copernicus DEM.",
  },
  {
    icon: <Scaling className="h-5 w-5" strokeWidth={1.6} />,
    title: "Bias-aware refinement",
    body: "Adaptive bins with a head-tail cut fix the classic failure: regressions that flatten rare, tall structures.",
  },
  {
    icon: <ShieldCheck className="h-5 w-5" strokeWidth={1.6} />,
    title: "Honest confidence",
    body: "Metric vs relative is a first-class badge. DEM cross-check and cloud flags are surfaced — failures are visible, never silent.",
  },
  {
    icon: <Box className="h-5 w-5" strokeWidth={1.6} />,
    title: "Tiled 3D flythrough",
    body: "LOD heightmap-to-mesh with the original image projected as texture. Orbit, pan, zoom — at interactive frame rates.",
  },
];

function Capabilities() {
  return (
    <section className="relative mx-auto max-w-7xl px-6 py-24">
      <SectionHead
        eyebrow="What it does"
        title="Everything a height model owes you"
        lede="Adopted from published research, integrated end-to-end: one image in — a validated elevation product and a flythrough out."
      />
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CAPABILITIES.map((c, i) => (
          <RevealOnScroll key={c.title} delay={i * 0.06} y={20}>
            <div className="group h-full rounded-2xl border border-hairline bg-elevated p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-rim hover:shadow-[0_16px_40px_-24px_rgba(20,23,28,0.25)]">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan/25 bg-cyan/10 text-cyan">
                {c.icon}
              </div>
              <h3 className="mt-4 text-base font-semibold text-primary">
                {c.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{c.body}</p>
            </div>
          </RevealOnScroll>
        ))}
      </div>
    </section>
  );
}

/* ============================== PIPELINE ============================== */

const STEPS: {
  n: string;
  tag: string;
  title: string;
  body: string;
  branch?: boolean;
}[] = [
  {
    n: "01",
    tag: "S1",
    title: "Input & auto-detection",
    body: "rasterio parses CRS, geotransform, GSD and RPC tags. The geo reference is retained for the whole run.",
  },
  {
    n: "02",
    tag: "S2",
    title: "Preprocessing",
    body: "Radiometric stretch → cloud/shadow mask → denoise → CLAHE → resolution align → tiling → normalize.",
  },
  {
    n: "03",
    tag: "S3",
    title: "Depth backbone",
    body: "DINOv2 + DPT fine-tuned with RPC-aware pseudo-depth supervision produces relative depth d̂.",
  },
  {
    n: "04",
    tag: "S4",
    title: "The branch",
    body: "No geo reference? d̂ is the product (rDSM). Georeferenced? per-region RANSAC vs DEM → metric ẑ.",
    branch: true,
  },
  {
    n: "05",
    tag: "S5",
    title: "Bias-aware refinement",
    body: "Adaptive bins + head-tail cut correct the long-tail bias that flattens building heights.",
  },
  {
    n: "06",
    tag: "S6",
    title: "DSM & products",
    body: "Outlier removal, smoothing, gap fill → DSM, nDSM, slope, hillshade and a confidence map.",
  },
  {
    n: "07",
    tag: "S7",
    title: "Tiled 3D mesh",
    body: "LOD heightmap-to-mesh; the original image is projected back as texture for the flythrough.",
  },
  {
    n: "08",
    tag: "S8",
    title: "Evaluation",
    body: "RMSE / MAE / correlation against LiDAR, broken out by terrain type and region class.",
  },
];

function Pipeline() {
  return (
    <section className="relative border-y border-hairline bg-stage py-24">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHead
          eyebrow="How a run works"
          title="Eight stages. One honest branch."
          lede="The canonical workflow from the technical documentation — deterministic, tested, and observable at every step."
        />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <RevealOnScroll key={s.n} delay={i * 0.05} y={18}>
              <div
                className={`relative h-full rounded-2xl border bg-elevated p-5 transition-colors duration-300 ${
                  s.branch
                    ? "border-cyan/35 shadow-[0_10px_30px_-18px_rgba(14,116,144,0.5)]"
                    : "border-hairline hover:border-rim"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-2xs tabular-nums text-faint">
                    {s.n}
                  </span>
                  <span
                    className={`rounded-md border px-1.5 py-0.5 font-mono text-2xs uppercase tracking-[0.14em] ${
                      s.branch
                        ? "border-cyan/40 bg-cyan/10 text-cyan"
                        : "border-hairline bg-stage/60 text-muted"
                    }`}
                  >
                    {s.tag}
                  </span>
                </div>
                <h3 className="mt-3 text-sm font-semibold text-primary">
                  {s.title}
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-muted">
                  {s.body}
                </p>
                {s.branch && (
                  <div className="mt-3 flex gap-1.5">
                    <span className="rounded-md border border-amber/40 bg-amber/10 px-1.5 py-0.5 font-mono text-2xs text-amber">
                      4a relative
                    </span>
                    <span className="rounded-md border border-emerald/40 bg-emerald/10 px-1.5 py-0.5 font-mono text-2xs text-emerald">
                      4b metric
                    </span>
                  </div>
                )}
                {i < STEPS.length - 1 && (
                  <span className="pointer-events-none absolute -right-3 top-1/2 z-10 hidden h-px w-5 bg-rim lg:block" />
                )}
              </div>
            </RevealOnScroll>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============================== TERMINAL ============================== */

const TERMINAL_LINES: { text: string; className?: string }[] = [
  { text: "$ dw ingest potsdam_block_04.tif" },
  { text: "✓ S1 metadata       CRS: EPSG:32633 · GSD 0.05 m · RPC present" },
  { text: "✓ S2 preprocess     7 stages · 512² tiles · 3.1 s" },
  { text: "✓ S3 backbone       d̂ (1024²) relative depth · 1.8 s" },
  {
    text: "◆ S4 branch         georeferenced → per-region RANSAC vs Copernicus DEM",
    className: "text-cyan-glow",
  },
  { text: "✓ S4b calibration   3 region classes · DEM cross-check 0.94 · 0.9 s" },
  { text: "✓ S5 refine         head-tail cut · bias-corrected heights" },
  { text: "✓ S6 products       DSM · nDSM · slope · hillshade · confidence" },
  { text: "✓ S7 mesh           tiled LOD + photo texture · 2.4 s" },
  { text: "→ job complete      metric DSM ready · flythrough available", className: "text-emerald-glow" },
];

const COPY_CMD = 'curl -X POST -F "image=@your_tile.tif" $DEPTHWIZARD_API/ingest';

function Terminal() {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(COPY_CMD);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — no-op */
    }
  };

  return (
    <section className="relative mx-auto max-w-5xl px-6 py-24">
      <SectionHead
        eyebrow="Watch a run"
        title="Every stage talks back"
        lede="The processing page streams a live event per stage — with thumbnails, timings and named failure states. Here is what a georeferenced run sounds like."
      />

      <RevealOnScroll delay={0.1} className="mt-12">
        <div className="overflow-hidden rounded-2xl border border-hairline bg-[#14171C] shadow-[0_30px_80px_-40px_rgba(20,23,28,0.5)]">
          <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
            <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
            <span className="ml-3 font-mono text-2xs uppercase tracking-[0.16em] text-white/40">
              depthwizard · job 8f3a2c
            </span>
            <button
              onClick={copy}
              className="ml-auto flex items-center gap-1.5 rounded-md border border-white/15 px-2.5 py-1 font-mono text-2xs text-white/60 transition-colors hover:border-white/40 hover:text-white"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 text-[#6EE7B7]" /> copied
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" /> copy api call
                </>
              )}
            </button>
          </div>
          {/* The terminal stays dark in both themes — it IS the contrast moment */}
          <div className="overflow-x-auto px-5 py-4 font-mono text-xs leading-[1.9] text-white/85">
            {TERMINAL_LINES.map((line, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -6 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.6 }}
                transition={{ duration: 0.35, delay: i * 0.09 }}
                className={`whitespace-pre ${line.className ?? ""}`}
              >
                {line.text}
              </motion.div>
            ))}
            <motion.span
              animate={{ opacity: [1, 0.15, 1] }}
              transition={{ duration: 1.1, repeat: Infinity }}
              className="mt-1 inline-block h-3.5 w-2 bg-[#67E8F9] align-middle"
            />
          </div>
        </div>
      </RevealOnScroll>
    </section>
  );
}

/* =============================== STORY =============================== */

function Story() {
  return (
    <section className="relative border-y border-hairline bg-stage py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <RevealOnScroll>
            <p className="font-mono text-2xs uppercase tracking-[0.18em] text-cyan">
              Why single-view
            </p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-primary md:text-4xl">
              When one image is all you get.
            </h2>
            <div className="mt-5 space-y-4 text-pretty text-sm leading-relaxed text-muted md:text-base">
              <p>
                Elevation data anchors disaster response, urban planning and
                infrastructure monitoring — but stereo pairs, LiDAR and InSAR
                are expensive, sensor-dependent and slow to deploy when time
                matters. Sometimes a single archived or freshly tasked optical
                image is the only input you have.
              </p>
              <p>
                Monocular depth models were built for ground-level photos and
                predict scale-ambiguous depth. DepthWizard closes that gap with
                RPC-aware fine-tuning, region-wise calibration against a
                reference DEM, and a bias correction for the tall structures
                regressions love to flatten — then shows you exactly how much
                to trust the result.
              </p>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              <Pill tone="cyan">Depth Anything V2</Pill>
              <Pill tone="muted">Sat3R-style fine-tuning</Pill>
              <Pill tone="muted">RANSAC</Pill>
              <Pill tone="muted">Head-tail-cut refinement</Pill>
            </div>
          </RevealOnScroll>

          <RevealOnScroll delay={0.12}>
            <div className="rounded-3xl border border-hairline bg-elevated p-8">
              <p className="font-mono text-2xs uppercase tracking-[0.18em] text-cyan">
                Built for SIH 26175
              </p>
              <p className="mt-4 text-pretty text-base leading-relaxed text-primary">
                “No new model architecture, loss function, or training
                algorithm is proposed. Our contribution is the integration of
                these existing techniques into a single deployable pipeline —
                the auto-routing logic, and the interactive 3D visualization
                layer.”
              </p>
              <p className="mt-4 text-xs leading-relaxed text-muted">
                — the novelty statement we hold ourselves to. Every technique
                is adopted from cited published work; every performance claim
                is labeled by evidence type.
              </p>
              <div className="mt-6 flex items-center justify-between border-t border-hairline pt-5">
                <div className="flex gap-6">
                  <StoryStat value="ISRO" label="Issued by" />
                  <StoryStat value="50 / 50" label="DSM · Visualization" />
                  <StoryStat value="3" label="Benchmark datasets" />
                </div>
              </div>
            </div>
          </RevealOnScroll>
        </div>
      </div>
    </section>
  );
}

function StoryStat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-lg font-semibold text-primary">{value}</p>
      <p className="mt-0.5 font-mono text-2xs uppercase tracking-[0.14em] text-faint">
        {label}
      </p>
    </div>
  );
}

/* =============================== STUDIO =============================== */

const PIPELINE_LABELS = [
  "Input & auto-detection",
  "Preprocessing (7 stages)",
  "Depth backbone (fine-tuned)",
  "Calibration branch",
  "Bias-aware refinement",
  "DSM & derived products",
  "Tiled 3D mesh",
  "Evaluation vs LiDAR",
];

function Studio() {
  return (
    <section id="studio" className="relative mx-auto max-w-7xl scroll-mt-20 px-6 py-24">
      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <RevealOnScroll>
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="font-mono text-2xs uppercase tracking-[0.18em] text-cyan">
                  Studio
                </p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight text-primary">
                  Drop a tile to begin.
                </h2>
                <p className="mt-2 text-sm text-muted">
                  Auto-detects format, GSD, CRS. The backend keeps the source
                  of truth — the frontend only previews.
                </p>
              </div>
              <Pill tone="muted">S1–S8</Pill>
            </div>
          </RevealOnScroll>

          <RevealOnScroll delay={0.08}>
            <DropZone />
          </RevealOnScroll>

          <RevealOnScroll delay={0.12}>
            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-hairline" />
              <span className="font-mono text-2xs uppercase tracking-[0.18em] text-faint">
                or try a sample
              </span>
              <span className="h-px flex-1 bg-hairline" />
            </div>
          </RevealOnScroll>

          <RevealOnScroll delay={0.16}>
            <SampleTiles />
          </RevealOnScroll>

          <RevealOnScroll delay={0.2}>
            <AdvancedOptions />
          </RevealOnScroll>

          <RevealOnScroll delay={0.24}>
            <RecentUploads />
          </RevealOnScroll>
        </div>

        {/* Side rail — pipeline overview */}
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <RevealOnScroll delay={0.1}>
            <div className="rounded-2xl border border-hairline bg-elevated p-5">
              <p className="font-mono text-2xs uppercase tracking-[0.18em] text-cyan">
                What runs
              </p>
              <h3 className="mt-2 text-lg font-semibold text-primary">
                Canonical 8-stage workflow
              </h3>
              <p className="mt-1.5 text-sm text-muted">
                Every step observable. The processing page shows a live
                thumbnail per stage.
              </p>
              <ol className="mt-5 space-y-2.5 text-sm">
                {PIPELINE_LABELS.map((label, i) => (
                  <li key={i} className="flex items-center gap-3">
                    <span className="font-mono text-2xs tabular-nums text-faint">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="h-1 w-1 rounded-full bg-cyan" />
                    <span className="text-primary">{label}</span>
                  </li>
                ))}
              </ol>
            </div>
          </RevealOnScroll>

          <RevealOnScroll delay={0.18}>
            <div className="rounded-2xl border border-cyan/30 bg-cyan/5 p-5">
              <h3 className="text-sm font-semibold text-primary">
                Metric or relative — always labeled
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">
                Georeferenced inputs are calibrated against a reference DEM and
                ship a confidence map. Everything else says “relative” out
                loud, and GeoTIFF export stays disabled.
              </p>
            </div>
          </RevealOnScroll>
        </aside>
      </div>
    </section>
  );
}

/* ============================== FINAL CTA ============================== */

function FinalCTA() {
  return (
    <section className="relative mx-auto max-w-7xl px-6 pb-24">
      <RevealOnScroll>
        <div className="dot-grid relative overflow-hidden rounded-4xl border border-hairline bg-elevated px-8 py-16 text-center md:py-20">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_80%_at_50%_120%,rgba(14,116,144,0.1),transparent_60%)]" />
          <p className="relative font-mono text-2xs uppercase tracking-[0.18em] text-cyan">
            Ready when you are
          </p>
          <h2 className="relative mx-auto mt-4 max-w-2xl text-balance text-4xl font-semibold leading-[1.05] tracking-tight text-primary md:text-5xl">
            One tile in. <span className="text-cyan">A world out.</span>
          </h2>
          <p className="relative mx-auto mt-4 max-w-lg text-pretty text-sm leading-relaxed text-muted">
            No signup, no queue, no lock-in. One image is the only ticket in.
          </p>
          <div className="relative mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="#studio">
              <button className="group flex items-center gap-2 rounded-full bg-primary px-8 py-3.5 text-sm font-medium text-void transition-colors hover:bg-cyan hover:text-white">
                Launch the Studio
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </button>
            </Link>
            <Link href="/history">
              <button className="rounded-full border border-hairline bg-elevated px-8 py-3.5 text-sm font-medium text-primary transition-colors hover:border-rim">
                View past runs
              </button>
            </Link>
          </div>
          <div className="relative mt-10 flex flex-wrap items-center justify-center gap-2">
            {[
              "No signup",
              "No cloud",
              "Metric-honest",
              "Pipeline-transparent",
              "One image in",
            ].map((p) => (
              <Pill key={p} tone="muted">
                {p}
              </Pill>
            ))}
          </div>
        </div>
      </RevealOnScroll>
    </section>
  );
}