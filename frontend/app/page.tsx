"use client";

import dynamic from "next/dynamic";
import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import {
  ArrowRight,
  Sparkles,
  Cpu,
  ScanLine,
  Mountain,
  MousePointer2,
  Layers,
  Gauge,
  Eye,
  Wand2,
  Boxes,
  FileImage,
} from "lucide-react";
import {
  SplitHeading,
  CharHeading,
  Reveal,
  RevealOnScroll,
  Parallax,
  ScrollMarquee,
  ScrollProgress,
  Magnetic,
} from "@/components/shared/Motion";
import { Pill } from "@/components/shared/Pill";
import { DropZone } from "@/components/upload/DropZone";
import { SampleTiles } from "@/components/upload/SampleTiles";
import { AdvancedOptions } from "@/components/upload/AdvancedOptions";
import { RecentUploads } from "@/components/upload/RecentUploads";
import { LiveTelemetryStrip } from "@/components/shared/LiveTelemetryStrip";
import Link from "next/link";

const HeroScene = dynamic(
  () => import("@/components/three/HeroScene").then((m) => m.HeroScene),
  { ssr: false }
);

export default function HomePage() {
  return (
    <div className="relative">
      <ScrollProgress />

      {/* ============================== HERO ============================== */}
      <section className="relative flex min-h-[calc(100vh-4rem)] items-center pb-20 pt-10 md:pt-16">
        {/* The globe bleeds to the viewport edge. NOTE: no pointer-events-none
            here — the canvas owns drag/zoom, so events must reach it. The
            right-edge fade below IS pointer-events-none so it never blocks. */}
        <div className="absolute inset-y-0 right-0 hidden w-[56vw] max-w-[860px] md:block">
          <FadeOutOnScroll>
            <HeroScene />
          </FadeOutOnScroll>

          {/* Interaction hint */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2.2, duration: 1 }}
            className="pointer-events-none absolute bottom-10 right-10 flex items-center gap-2 rounded-full border border-white/8 bg-void/50 px-3 py-1.5 font-mono text-2xs uppercase tracking-[0.16em] text-faint backdrop-blur"
          >
            <MousePointer2 className="h-3 w-3 text-cyan/70" />
            drag to orbit · scroll to zoom
          </motion.div>

          {/* Soft fade on the right edge so the globe melts into the page */}
          <div className="pointer-events-none absolute inset-y-0 right-0 w-28 bg-gradient-to-r from-transparent to-void" />
        </div>

        {/* Mobile: the globe sits behind everything as a soft glow accent */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_40%,rgba(34,211,238,0.12),transparent_55%)] md:hidden" />

        {/* Text column */}
        <div className="relative mx-auto w-full max-w-7xl px-6">
          <Parallax strength={30} className="w-full max-w-3xl">
            <LiveTelemetryStrip />

            <Reveal delay={0.15} className="mt-8">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone="cyan">
                  <Sparkles className="h-3 w-3" /> v0.1 · Live
                </Pill>
                <Pill tone="muted">Single-view · 2D → 3D</Pill>
                <Pill tone="muted">Depth Anything v2</Pill>
              </div>
            </Reveal>

            <h1 className="mt-6 text-balance text-5xl font-semibold leading-[0.95] tracking-tightest text-primary md:text-7xl">
              <SplitHeading text="From one image," />
              <br />
              <span className="text-gradient-aurora">
                <CharHeading text="a 3D world." />
              </span>
            </h1>

            <Reveal delay={0.7} className="mt-6 max-w-xl">
              <p className="text-pretty text-lg leading-relaxed text-muted">
                Drop an overhead tile. We stretch the dynamic range, mask clouds,
                run a frozen monocular foundation model, then calibrate it into
                metric height. The result rises out of the canvas in twelve
                seconds — grab the globe and look around while you wait.
              </p>
            </Reveal>

            <Reveal delay={0.9} className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="#studio">
                <Magnetic strength={0.15}>
                  <button className="btn-aurora group flex items-center gap-2 rounded-full border border-cyan/40 bg-cyan/15 px-7 py-3 text-sm font-medium text-cyan shadow-glow transition-all hover:bg-cyan/25">
                    Start a run
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </button>
                </Magnetic>
              </Link>
              <Link href="/about">
                <button className="rounded-full border border-white/10 bg-elevated/40 px-7 py-3 text-sm font-medium text-primary backdrop-blur transition-all hover:border-white/20">
                  Read the technical notes
                </button>
              </Link>
            </Reveal>

            {/* Key stats */}
            <Reveal delay={1.1}>
              <div className="mt-10 grid max-w-xl grid-cols-3 gap-2">
                <Stat label="Pipeline stages" value="7 + U-Net" />
                <Stat label="Mean latency" value="~12 s" />
                <Stat label="Tested on" value="Vaihingen" />
              </div>
            </Reveal>
          </Parallax>
        </div>

        {/* Scroll cue */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.4, duration: 1 }}
          className="pointer-events-none absolute bottom-6 left-1/2 hidden -translate-x-1/2 md:block"
        >
          <div className="flex h-9 w-5 items-start justify-center rounded-full border border-white/15 p-1.5">
            <motion.div
              animate={{ y: [0, 10, 0], opacity: [1, 0.2, 1] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
              className="h-1.5 w-1 rounded-full bg-cyan"
            />
          </div>
        </motion.div>
      </section>

      {/* ============================ PIPELINE ============================ */}
      <PipelineSection />

      {/* ============================= BENTO ============================== */}
      <FeaturesBento />

      {/* ============================= STUDIO ============================= */}
      <section id="studio" className="relative mx-auto max-w-7xl scroll-mt-20 px-6 pb-16">
        <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            <RevealOnScroll>
              <div className="flex items-end justify-between">
                <div>
                  <p className="font-mono text-2xs uppercase tracking-[0.18em] text-cyan">
                    Studio
                  </p>
                  <h2 className="mt-2 text-3xl font-semibold tracking-tight text-primary">
                    Drop a tile to begin.
                  </h2>
                  <p className="mt-2 text-sm text-muted">
                    Auto-detects format, GSD, CRS. Backend keeps source of truth
                    — frontend only previews.
                  </p>
                </div>
                <Pill tone="muted">7 stages</Pill>
              </div>
            </RevealOnScroll>

            <RevealOnScroll delay={0.1}>
              <DropZone />
            </RevealOnScroll>

            <RevealOnScroll delay={0.15}>
              <div className="flex items-center gap-2">
                <span className="h-px flex-1 bg-white/8" />
                <span className="font-mono text-2xs uppercase tracking-[0.18em] text-faint">
                  or try one
                </span>
                <span className="h-px flex-1 bg-white/8" />
              </div>
            </RevealOnScroll>

            <RevealOnScroll delay={0.2}>
              <SampleTiles />
            </RevealOnScroll>

            <RevealOnScroll delay={0.25}>
              <AdvancedOptions />
            </RevealOnScroll>

            <RevealOnScroll delay={0.3}>
              <RecentUploads />
            </RevealOnScroll>
          </div>

          {/* Side rail — pipeline overview */}
          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <RevealOnScroll delay={0.1}>
              <div className="glass rounded-2xl p-5">
                <p className="font-mono text-2xs uppercase tracking-[0.18em] text-cyan">
                  What runs
                </p>
                <h3 className="mt-2 text-lg font-semibold text-primary">
                  7-stage pipeline
                </h3>
                <p className="mt-1.5 text-sm text-muted">
                  Every step observable. The processing page shows a live
                  thumbnail per stage.
                </p>

                <ol className="mt-5 space-y-2.5 text-sm">
                  {[
                    "Radiometric correction",
                    "Cloud / shadow masking",
                    "Bilateral denoise",
                    "CLAHE contrast",
                    "Resolution align",
                    "DAv2 depth prior",
                    "Correction U-Net",
                  ].map((label, i) => (
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

            <RevealOnScroll delay={0.2}>
              <div className="glass rounded-2xl p-5">
                <p className="font-mono text-2xs uppercase tracking-[0.18em] text-amber">
                  Honest scope
                </p>
                <h3 className="mt-2 text-lg font-semibold text-primary">
                  What this isn&apos;t
                </h3>
                <ul className="mt-3 space-y-2 text-sm text-muted">
                  {[
                    "Not a real-time multi-user system — session-scoped only.",
                    "Not sub-decimeter accurate on arbitrary phone photos.",
                    "Not a replacement for LiDAR — built for accessibility.",
                  ].map((item, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-amber" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </RevealOnScroll>
          </aside>
        </div>
      </section>

      {/* ============================ MARQUEE ============================= */}
      <section className="relative overflow-hidden border-y border-white/5 bg-void/40 py-8 backdrop-blur">
        <ScrollMarquee speed={36} className="text-2xs">
          <span className="font-mono uppercase tracking-[0.18em] text-faint">Datasets</span>
          <span className="text-muted">ISPRS Vaihingen</span>
          <span className="text-muted">ISPRS Potsdam</span>
          <span className="text-muted">DFC2019</span>
          <span className="h-3 w-px bg-white/10" />
          <span className="font-mono uppercase tracking-[0.18em] text-faint">Models</span>
          <span className="text-muted">Depth Anything v2 (Base)</span>
          <span className="text-muted">Correction U-Net</span>
          <span className="h-3 w-px bg-white/10" />
          <span className="font-mono uppercase tracking-[0.18em] text-faint">Built with</span>
          <span className="text-muted">Three.js</span>
          <span className="text-muted">MapLibre</span>
          <span className="text-muted">React Query</span>
          <span className="h-3 w-px bg-white/10" />
          <span className="font-mono uppercase tracking-[0.18em] text-faint">Pipeline</span>
          <span className="text-muted">Radiometric</span>
          <span className="text-muted">Masking</span>
          <span className="text-muted">Denoise</span>
          <span className="text-muted">CLAHE</span>
          <span className="text-muted">Resolution</span>
          <span className="text-muted">DAv2</span>
          <span className="text-muted">U-Net</span>
        </ScrollMarquee>
      </section>

      {/* ============================== CTA =============================== */}
      <FinalCTA />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className="group rounded-xl border border-white/8 bg-elevated/40 p-3 backdrop-blur transition-colors hover:border-cyan/30"
    >
      <p className="font-mono text-2xs uppercase tracking-[0.16em] text-faint">{label}</p>
      <p className="mt-1 text-base font-medium text-primary">{value}</p>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Pipeline — horizontal stepper visualizing the 7 stages as a flowing beam
// ---------------------------------------------------------------------------

function PipelineSection() {
  const steps = [
    { n: "01", label: "Radiometric", detail: "Dark-object subtraction", icon: ScanLine },
    { n: "02", label: "Masking", detail: "Cloud + shadow maps", icon: Eye },
    { n: "03", label: "Denoise", detail: "Bilateral, edge-safe", icon: Cpu },
    { n: "04", label: "Contrast", detail: "CLAHE per-tile", icon: Gauge },
    { n: "05", label: "Resolution", detail: "GSD harmonize", icon: Boxes },
    { n: "06", label: "DAv2", detail: "Relative depth prior", icon: Mountain },
    { n: "07", label: "U-Net", detail: "Metric calibration", icon: Wand2 },
  ];

  return (
    <section className="relative mx-auto max-w-7xl px-6 py-20">
      <RevealOnScroll>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-2xs uppercase tracking-[0.18em] text-cyan">
              Under the hood
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-primary md:text-4xl">
              Seven stages. Zero blind spots.
            </h2>
          </div>
          <p className="max-w-sm text-sm leading-relaxed text-muted">
            A deterministic preprocessing ladder feeds a frozen foundation model,
            then a learned correction head turns relative depth into metric
            height.
          </p>
        </div>
      </RevealOnScroll>

      <RevealOnScroll delay={0.15}>
        <div className="relative mt-12">
          {/* The connecting beam */}
          <div className="absolute left-0 right-0 top-[22px] hidden h-px bg-gradient-to-r from-cyan/40 via-emerald/30 to-amber/40 lg:block" />

          <ol className="grid gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-7">
            {steps.map((s, i) => (
              <motion.li
                key={s.n}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ delay: i * 0.07, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                className="group relative"
              >
                {/* Node on the beam */}
                <div className="relative z-10 mb-4 hidden lg:block">
                  <span className="block h-[10px] w-[10px] rounded-full border border-cyan/50 bg-void shadow-glow transition-transform duration-300 group-hover:scale-125" />
                </div>
                <div className="flex items-center gap-3 lg:block">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/8 bg-elevated/60 text-cyan backdrop-blur transition-all duration-300 group-hover:border-cyan/40 group-hover:shadow-glow">
                    <s.icon className="h-5 w-5" strokeWidth={1.5} />
                  </div>
                  <div className="lg:mt-3">
                    <p className="font-mono text-2xs tabular-nums text-faint">{s.n}</p>
                    <p className="mt-0.5 text-sm font-medium text-primary">{s.label}</p>
                    <p className="mt-0.5 text-xs leading-snug text-muted">{s.detail}</p>
                  </div>
                </div>
              </motion.li>
            ))}
          </ol>
        </div>
      </RevealOnScroll>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Features — bento grid
// ---------------------------------------------------------------------------

function FeaturesBento() {
  return (
    <section className="relative mx-auto max-w-7xl px-6 py-10">
      <div className="grid gap-4 md:grid-cols-6">
        {/* Large cell — 3D flythrough */}
        <RevealOnScroll className="md:col-span-4">
          <div className="glass group relative h-full overflow-hidden rounded-3xl p-7">
            <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-cyan/10 blur-3xl transition-opacity duration-700 group-hover:opacity-150" />
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan/30 bg-cyan/10 text-cyan shadow-glow">
              <Mountain className="h-6 w-6" strokeWidth={1.5} />
            </div>
            <h3 className="mt-5 text-xl font-semibold text-primary">
              Cinematic 3D flythrough
            </h3>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
              The predicted height model becomes an explorable mesh with
              exaggeration control, a scripted camera sweep, and vertical
              color-mapping. What the model saw is what you fly through.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Pill tone="cyan">Orbit / pan / zoom</Pill>
              <Pill tone="muted">Height exaggeration</Pill>
              <Pill tone="muted">Viridis colormap</Pill>
            </div>
          </div>
        </RevealOnScroll>

        {/* Tall cell — observability */}
        <RevealOnScroll delay={0.1} className="md:col-span-2">
          <div className="glass relative h-full overflow-hidden rounded-3xl p-7">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald/30 bg-emerald/10 text-emerald shadow-glow-emerald">
              <Eye className="h-6 w-6" strokeWidth={1.5} />
            </div>
            <h3 className="mt-5 text-xl font-semibold text-primary">
              Every stage observable
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              A live thumbnail per stage, timings per tile, and named failure
              states — no raw stack traces, ever.
            </p>
            <div className="mt-6 space-y-2">
              {["Radiometric ✓ 0.8s", "Masking ✓ 1.2s", "DAv2 … running"].map(
                (line, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-lg border border-white/5 bg-void/50 px-3 py-2 font-mono text-2xs"
                  >
                    <span className={i === 2 ? "text-cyan" : "text-muted"}>{line}</span>
                    {i === 2 && (
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan" />
                    )}
                  </div>
                )
              )}
            </div>
          </div>
        </RevealOnScroll>

        {/* Small cells */}
        <RevealOnScroll delay={0.15} className="md:col-span-2">
          <FeatureCard
            icon={<FileImage className="h-6 w-6" strokeWidth={1.5} />}
            tone="amber"
            title="Any overhead image"
            body="GeoTIFF keeps metric scale via GSD. Plain JPEG/PNG still gets a beautiful relative surface."
          />
        </RevealOnScroll>
        <RevealOnScroll delay={0.2} className="md:col-span-2">
          <FeatureCard
            icon={<Layers className="h-6 w-6" strokeWidth={1.5} />}
            tone="cyan"
            title="Tiling & stitching"
            body="Big rasters are split, processed in parallel, and re-stitched with feathered seams — no grid artifacts."
          />
        </RevealOnScroll>
        <RevealOnScroll delay={0.25} className="md:col-span-2">
          <FeatureCard
            icon={<Gauge className="h-6 w-6" strokeWidth={1.5} />}
            tone="emerald"
            title="Built for demo day"
            body="DPR-capped rendering, 30fps degrade path, cached fallbacks. Works on judge laptops, not just workstations."
          />
        </RevealOnScroll>
      </div>
    </section>
  );
}

function FeatureCard({
  icon,
  tone,
  title,
  body,
}: {
  icon: React.ReactNode;
  tone: "cyan" | "amber" | "emerald";
  title: string;
  body: string;
}) {
  const tones = {
    cyan: "border-cyan/30 bg-cyan/10 text-cyan",
    amber: "border-amber/30 bg-amber/10 text-amber shadow-glow-amber",
    emerald: "border-emerald/30 bg-emerald/10 text-emerald shadow-glow-emerald",
  };
  return (
    <div className="glass group h-full rounded-3xl p-7 transition-colors duration-300 hover:border-white/12">
      <div
        className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${tones[tone]}`}
      >
        {icon}
      </div>
      <h3 className="mt-5 text-lg font-semibold text-primary">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Final CTA
// ---------------------------------------------------------------------------

function FinalCTA() {
  return (
    <section className="relative mx-auto max-w-7xl px-6 py-24">
      <RevealOnScroll>
        <div className="glass-strong relative overflow-hidden rounded-4xl px-8 py-16 text-center md:py-20">
          {/* Glow field */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_80%_at_50%_120%,rgba(34,211,238,0.14),transparent_60%)]" />
          <div className="pointer-events-none absolute inset-0 bg-grid opacity-30" />

          <p className="relative font-mono text-2xs uppercase tracking-[0.18em] text-cyan">
            Ready when you are
          </p>
          <h2 className="relative mx-auto mt-4 max-w-2xl text-balance text-4xl font-semibold leading-[1.05] tracking-tight text-primary md:text-5xl">
            One tile in. <span className="text-gradient-aurora">A world out.</span>
          </h2>
          <p className="relative mx-auto mt-4 max-w-lg text-pretty text-sm leading-relaxed text-muted">
            No signup, no queue, no cloud. Your image never leaves the machine.
          </p>
          <div className="relative mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="#studio">
              <Magnetic strength={0.15}>
                <button className="btn-aurora group flex items-center gap-2 rounded-full border border-cyan/40 bg-cyan/15 px-8 py-3.5 text-sm font-medium text-cyan shadow-glow transition-all hover:bg-cyan/25">
                  Launch the Studio
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </button>
              </Magnetic>
            </Link>
            <Link href="/history">
              <button className="rounded-full border border-white/10 bg-elevated/40 px-8 py-3.5 text-sm font-medium text-primary backdrop-blur transition-all hover:border-white/20">
                View past runs
              </button>
            </Link>
          </div>
        </div>
      </RevealOnScroll>
    </section>
  );
}

/**
 * Fades out + scales down its children as the user scrolls past them.
 * Used to gracefully retire the hero globe once the user moves on.
 */
function FadeOutOnScroll({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const opacity = useTransform(scrollYProgress, [0, 0.6, 1], [1, 0.6, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.85]);
  return (
    <motion.div ref={ref} style={{ opacity, scale }} className="h-full w-full">
      {children}
    </motion.div>
  );
}
