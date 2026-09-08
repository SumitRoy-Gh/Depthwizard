"use client";

import Link from "next/link";
import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  ArrowUpRight,
  Box,
  Check,
  Copy,
  Crosshair,
  FileImage,
  Layers,
  Mountain,
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
import { cn } from "@/lib/cn";

const COPY_CMD =
  "curl -X POST -F \"image=@your_tile.tif\" $DEPTHWIZARD_API/ingest";

export default function HomePage() {
  return (
    <div className="relative">
      <ScrollProgress />
      <Hero />
      <Marquee />
      <Showcase />
      <Story />
      <Studio />
      <FinalCTA />
    </div>
  );
}

/* ============================== HERO ============================== */

function Hero() {
  return (
    <section className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl flex-col items-center justify-center px-6 pb-16 pt-14 text-center">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] bg-[radial-gradient(ellipse_60%_55%_at_50%_0%,rgba(14,116,144,0.07),transparent_65%)]" />
      <Reveal delay={0.05}>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Pill tone="cyan">
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            SIH 26175 · ISRO
          </Pill>
          <Pill tone="muted">Single image → elevation</Pill>
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
          Upload a single aerial image and get back a labeled elevation product —
          metric or relative, always honest — plus an explorable 3D flythrough.

          No signup. No configuration. No hand-waving.



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
          <button className="rounded-full border border-hairline bg-elevated px-7 py-3 text-sm font-medium text-primary transition-colors hover:border-rim">
            Read the technical notes
          </button>
        </Link>
      </Reveal>

      <Reveal delay={0.8} className="mt-12 w-full max-w-2xl">
        <div className="grid grid-cols-3 divide-x divide-hairline rounded-2xl border border-hairline bg-elevated">
          <HeroStat label="Observable stages" value="8" />
          <HeroStat label="Preprocessing tests" value="94 / 94" />
          <HeroStat label="Image → flythrough" value="< 90 s" />
        </div>
      </Reveal>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.6, duration:  1 }}
        className="pointer-events-none absolute bottom-5 left-1/2 hidden -translate-x-1/2 md:block"
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
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-4">
      <p className="font-mono text-2xs uppercase tracking-[0.16em] text-faint">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-primary">{value}</p>
    </div>
  );
}

/* ============================= MARQUEE ============================= */

const MARQUEE_ITEMS = [
  "One image in",
  "No signup",
  "No configuration",
  "Metric or relative — always labeled",
  "Explorable 3D",
  "Every stage observable",
  "ISRO · SIH 26175",
  "Built for disaster response",
];

function Marquee() {
  return (
    <section className="relative overflow-hidden border-y border-hairline bg-stage py-5">
      <ScrollMarquee speed={32} className="text-2xs">
        {MARQUEE_ITEMS.map((item, i) => (
          <span key={i} className="flex items-center gap-12">
            <span
              className={
                i % 2 === 0
                  ? "font-mono uppercase tracking-[0.18em] text-cyan"
                  : "font-mono uppercase tracking-[0.18em] text-muted"
              }
            >
              {item}
            </span>
          </span>
        ))}
      </ScrollMarquee>
    </section>
  );
}

/* ============================== SHARED ============================== */

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
      <p className="font-mono text-2xs uppercase tracking-[0.18em] text-cyan">{eyebrow}</p>
      <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-primary md:text-4xl">
        {title}
      </h2>
      {lede && (
        <p className="mt-3 text-pretty text-sm leading-relaxed text-muted md:text-base">{lede}</p>
      )}
    </RevealOnScroll>
  );
}



/* ============================= SHOWCASE ============================= */

function ArtGrid({
  className,
  size = 10,
  color = "rgba(14,116,144,0.22)",
}: {
  className?: string;
  size?: number;
  color?: string;
}) {
  return (
    <div
      className={cn("absolute inset-0", className)}
      style={{
        backgroundImage: `linear-gradient(to right, ${color} 1px, transparent 1px), linear-gradient(to bottom, ${color} 1px, transparent 1px)`,
        backgroundSize: `${size}px ${size}px`,
      }}
    />
  );
}

const SHOWCASE = [
  {
    id: "input",
    tag: "S1",
    icon: <FileImage className="h-4 w-4" strokeWidth={1.6} />,
    title: "Input & auto-route",
    body: "Drop a GeoTIFF or a plain JPEG. Geo tags are read — or their absence is noticed — and the run routes itself: metric when it can, relative when it must.",
    preview: (
      <div className="flex items-center gap-3 rounded-xl border border-hairline bg-elevated p-3">
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-hairline bg-gradient-to-br from-cyan/10 to-emerald/10">
          <ArtGrid size={8} />
          <span className="absolute bottom-0.5 right-1 font-mono text-2xs text-cyan">✓ CRS</span>
        </div>
        <div className="text-xs leading-relaxed text-muted">
          <span className="font-medium text-primary">georef.tif</span> · GSD detected · routed to a metric run
        </div>
      </div>
    ),
  },
  {
    id: "preprocess",
    tag: "S2",
    icon: <Layers className="h-4 w-4" strokeWidth={1.6} />,
    title: "Preprocessing",
    body: "Seven tested stages clean the image: radiometric stretch, cloud masking, denoise, contrast, resolution alignment, tiling, normalization.",
    preview: (
      <div className="flex items-center gap-3 rounded-xl border border-hairline bg-elevated p-3">
        <div
          className="relative h-12 w-20 shrink-0 overflow-hidden rounded-lg border border-hairline"
          style={{ background: "linear-gradient(90deg, #E4E3DE 0%, #9EC5CE 45%, #0E7490 100%)" }}
        >
          <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/60" />
          <span className="absolute right-1.5 top-1 h-3 w-1 rounded-full bg-white shadow" />
        </div>
        <div className="text-xs leading-relaxed text-muted">denoise · contrast · cloud-masked regions kept as flags</div>
      </div>
    ),
  },
  {
    id: "height",
    tag: "S3 · S5",
    icon: <Mountain className="h-4 w-4" strokeWidth={1.6} />,
    title: "Height reconstruction",
    body: "A depth backbone, fine-tuned on overhead imagery, estimates relative height from a single view — while bias-aware refinement keeps tall structures tall.",
    preview: (
      <div className="flex items-end gap-1.5 rounded-xl border border-hairline bg-elevated p-3">
        {[10, 16,  8,  20,  12,  18,  9,  15].map((h, i) => (
          <div
            key={i}
            className={cn("w-2 rounded-t-[3px]", i % 2 === 0 ? "bg-cyan/70" : "bg-emerald/60")}
            style={{ height: `${h * 2.2}px` }}
          />
        ))}
        <span className="ml-2 self-center text-xs text-muted">relative depth → corrected heights</span>
      </div>
    ),
  },
{
    id: "calibrate",
    tag: "S4b",
    icon: <Crosshair className="h-4 w-4" strokeWidth={1.6} />,
    title: "Calibration & confidence",
    body: "Georeferenced? Per-region fits against a reference DEM turn relative depth into metric heights — with a confidence mapthat says where to trust it.",
    preview: (
      <div className="flex items-center gap-3 rounded-xl border border-hairline bg-elevated p-3">
        <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded-lg border border-hairline">
          <svg viewBox="0 0 64 40" className="absolute inset-0 h-full w-full" aria-hidden>
            <path d="M 0 24 Q 16 14 32 22 T 64 18" stroke="#0E7490" strokeWidth="1.2" fill="none" />
            <path d="M 0 31 Q 16 24 32 31 T 64 27" stroke="#059669" strokeWidth="1.2" fill="none" />
            {[8, 20, 32,  44,  56].map((x) => (
              <path key={x} d={`M ${x} 0 L ${x} 40`} stroke="rgba(14,116,144,0.18)" strokeWidth="0.6" fill="none" />
            ))}
          </svg>
          <span className="absolute bottom-0.5 right-1 font-mono text-2xs text-emerald">✓ DEM</span>
        </div>
        <div className="text-xs leading-relaxed text-muted">per-region fit vs reference DEM → metric-height confidence map</div>
      </div>
    ),
  },
  {
    id: "scene",
    tag: "S7",
    icon: <Box className="h-4 w-4" strokeWidth={1.6} />,
    title: "3D flythrough",
    body: "The height surface becomes a tiled, LOD-ready mesh with your image projected back as texture. Orbit, pan, zoom — explore.",
    preview: (
      <div className="flex items-center gap-3 rounded-xl border border-hairline bg-elevated p-3">
        <svg viewBox="0 0 64 40" className="h-12 w-16 shrink-0" aria-hidden>
          <path d="M 8 30 L 8 14 L 28 6 L  52 14 L  52 30 Z" fill="rgba(14,116,144,0.08)" stroke="#0E7490" strokeWidth="1" />
          <path d="M 28 6 L  28 22 L  52 30" fill="none" stroke="#059669" strokeWidth="0.8" />
          <path d="M 8 14 L  28 22" fill="none" stroke="#0E7490" strokeWidth="0.8" />
        </svg>
        <div className="text-xs leading-relaxed text-muted">tiled LOD mesh · photo texture · orbit & fly</div>
      </div>
    ),
  },
];

function Showcase() {
  const [active, setActive] = useState(1);
  const reduced = useReducedMotion();

  return (
    <section id="how-it-works" className="relative border-y border-hairline bg-stage py-24">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHead
          eyebrow="See it in action"
          title="From one image to a world, step by step"
          lede="Hover a stage — or tap on touch — to take a closer look. Each panel expands to show what that stage hands you."
        />
        <RevealOnScroll delay={0.08} className="mt-12">
          <div className="flex h-[460px] gap-2 overflow-hidden rounded-3xl border border-hairline bg-elevated p-2 md:h-[420px]">
            {SHOWCASE.map((s, i) => {
              const isActive = active === i;
              return (
                <motion.button
                  key={s.id}
                  type="button"
                  aria-expanded={isActive}
                  aria-label={s.title}
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onClick={() => setActive(i)}
                  animate={{ flexGrow: isActive ? 1 : 0.09 }}
                  transition={{ duration: reduced ? 0.08 : 0.55, ease: [0.22, 1, 0.36, 1] }}
                  className={cn(
                    "group relative min-w-0 overflow-hidden rounded-2xl border text-left transition-colors duration-300",
                    isActive ? "border-cyan/25 bg-elevated" : "border-hairline bg-elevated hover:border-cyan/20"
                  )}
                >
                  <div
                    className={cn(
                      "pointer-events-none absolute inset-y-0 left-0 z-10 flex w-11 flex-col items-center gap-2.5 py-5 transition-opacity duration-200 md:w-14",
                      isActive ? "opacity-0" : "opacity-100"
                    )}
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-cyan/20 bg-cyan/10 text-cyan">
                      {s.icon}
                    </span>
                    <span className="hidden font-mono text-2xs uppercase tracking-[0.22em] text-faint [writing-mode:vertical-rl] md:block">
                      {s.title}
                    </span>
                  </div>
                  <div
                    className={cn(
                      "absolute inset-0 flex flex-col p-5 pl-16 transition-opacity duration-300 md:pl-20",
                      isActive ? "opacity-100" : "opacity-0"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="rounded-md border border-cyan/25 bg-cyan/10 px-1.5 py-0.5 font-mono text-2xs uppercase tracking-[0.14em] text-cyan">
                        {s.tag}
                      </span>
                      <span className="font-mono text-2xs tabular-nums tracking-[0.18em] text-faint">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                    </div>
                    <h3 className="mt-3 text-lg font-semibold tracking-tight text-primary md:text-xl">{s.title}</h3>
                    <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">{s.body}</p>
                    <div className="mt-auto hidden pt-4 md:block">{s.preview}</div>
                  </div>
                </motion.button>
              );
            })}
          </div>
        </RevealOnScroll>
        <RevealOnScroll delay={0.15} className="mt-6 text-center">
          <p className="font-mono text-2xs uppercase tracking-[0.18em] text-faint">desktop · hover — touch · tap</p>
        </RevealOnScroll>
      </div>
    </section>
  );
}

function Story() {
  return (
    <section className="relative mx-auto max-w-7xl px-6 py-24">
      <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
        <RevealOnScroll>
          <p className="font-mono text-2xs uppercase tracking-[0.18em] text-cyan">Why it matters</p>
          <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-primary md:text-4xl">
            When one image is all you get.
          </h2>
          <div className="mt-5 space-y-4 text-pretty text-sm leading-relaxed text-muted md:text-base">
            <p>
              Elevation data anchors disaster response, urban planning and
              infrastructure monitoring — but stereo pairs, LiDAR and InSAR are
              expensive, sensor-dependentand slow to deploy when time matters.
              Sometimes a single archived or freshly tasked optical image is all
              you have.



            </p>
            <p>
              Depth models estimate relative height from one view; a metric answer
              needs a reference. DepthWizard routes the honest path: when geo
              tags exist, it calibrates against a reference DEM and reports meters;
              when they don't, it says “relative” out loud—and never pretends


              otherwise.



            </p>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <Pill tone="cyan">Metric or relative</Pill>
            <Pill tone="muted">Pipeline-transparent</Pill>
            <Pill tone="muted">No signup</Pill>
            <Pill tone="muted">Explorable 3D</Pill>
          </div>
        </RevealOnScroll>

        <RevealOnScroll delay={0.12}>
          <div className="dot-grid relative overflow-hidden rounded-3xl border border-hairline bg-elevated p-8">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_100%_0%,rgba(14,116,144,0.06),transparent_60%)]" />
            <p className="relative font-mono text-2xs uppercase tracking-[0.18em] text-cyan">Built for SIH 26175</p>
            <p className="relative mt-4 text-pretty text-base leading-relaxed text-primary">
              “No new model architecture, loss function, or training algorithm is
              proposed. Our contribution is the integration of these existing
              techniques into a single deployable pipeline — the auto-routing
              logic,and the interactive 3D visualization layer.”
            </p>
            <p className="relative mt-4 text-xs leading-relaxed text-muted">
              — the novelty statement we hold ourselves to. Every technique is
              adopted from cited published work; every performance claim is
              labeled by evidence type.

            </p>
            <div className="relative mt-6 flex items-center justify-between border-t border-hairline pt-5">
              <StoryStat value="ISRO" label="Issued by" />
              <StoryStat value="50 / 50" label="Evaluation weight" />
              <StoryStat value="3" label="Benchmark datasets" />
            </div>
          </div>
        </RevealOnScroll>
      </div>
    </section>
  );
}

function StoryStat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-lg font-semibold text-primary">{value}</p>
      <p className="mt-0.5 font-mono text-2xs uppercase tracking-[0.14em] text-faint">{label}</p>
    </div>
  );
}

const OUTPUTS = [
  "Height model — DSM, meters when georeferenced",
  "Confidence map — where the result is solid",
  "Tiled 3D mesh + photo texture — flythrough ready",
  "nDSM · slope · hillshade — derived products",
  "GeoTIFF export — when metric heights are possible",
];

function Studio() {
  return (
    <section id="studio" className="relative mx-auto max-w-7xl scroll-mt-20 px-6 py-24">
      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <RevealOnScroll>
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="font-mono text-2xs uppercase tracking-[0.18em] text-cyan">Studio</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight text-primary">
                  Turn a tile into terrain.

                </h2>
                <p className="mt-2 text-sm text-muted">
                  One image in — auto-detected, routed, and previewed. Generate when you're ready.



                </p>
              </div>
              <Pill tone="muted">No signup</Pill>
            </div>
          </RevealOnScroll>

          <RevealOnScroll delay={0.08}>
            <DropZone />
          </RevealOnScroll>

          <RevealOnScroll delay={0.12}>
            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-hairline" />
              <span className="font-mono text-2xs uppercase tracking-[0.18em] text-faint">or try a sample</span>
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

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <RevealOnScroll delay={0.1}>
            <div className="rounded-2xl border border-hairline bg-elevated p-5">
              <p className="font-mono text-2xs uppercase tracking-[0.18em] text-cyan">What you get</p>
              <h3 className="mt-2 text-lg font-semibold text-primary">A briefed result, not a black box</h3>
              <ul className="mt-5 space-y-2.5 text-sm">
                {OUTPUTS.map((o, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="mt-0.5 font-mono text-2xs tabular-nums text-faint">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-cyan" />
                    <span className="text-primary">{o}</span>
                  </li>
                ))}
              </ul>
            </div>
          </RevealOnScroll>

          <RevealOnScroll delay={0.18}>
            <div className="rounded-2xl border border-cyan/25 bg-cyan/5 p-5">
              <h3 className="text-sm font-semibold text-primary">Metric or relative — always labeled</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">
                Georeferenced inputs are calibrated against a reference DEM and ship
                a confidence map. Everything else says “relative” out loud, and
                GeoTIFF export stays disabled. No silent failures. No fake meters.




              </p>
            </div>
          </RevealOnScroll>
        </aside>
      </div>
    </section>
  );
}

function FinalCTA() {
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
    <section className="relative mx-auto max-w-7xl px-6 pb-24">
      <RevealOnScroll>
        <div className="dot-grid relative overflow-hidden rounded-4xl border border-hairline bg-elevated px-8 py-16 text-center md:py-20">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_80%_at_50%_120%,rgba(14,116,144,0.08),transparent_60%)]" />
          <p className="relative font-mono text-2xs uppercase tracking-[0.18em] text-cyan">Ready when you are</p>
          <h2 className="relative mx-auto mt-4 max-w-2xl text-balance text-4xl font-semibold leading-[1.05] tracking-tight text-primary md:text-5xl">
            One tile in. <span className="text-cyan">A world out.</span>
          </h2>
          <p className="relative mx-auto mt-4 max-w-lg text-pretty text-sm leading-relaxed text-muted">
            No signup, no queue, no lock-in. One image is the only ticket in.



          </p>

          <div className="relative mx-auto mt-8 max-w-2xl overflow-hidden rounded-2xl border border-hairline bg-[#0B0E14] text-left shadow-[0_30px_80px_-40px_rgba(20,23,28,0.35)]">
            <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
              <span className="ml-3 hidden font-mono text-2xs uppercase tracking-[0.16em] text-white/45 sm:block">
                depthwizard · run one-liner
              </span>
              <button
                onClick={copy}
                className="ml-auto flex items-center gap-1.5 rounded-md border border-white/15 px-2.5 py-1 font-mono text-2xs text-white/60 transition-colors hover:border-white/40 hover:text-white"
              >
                {copied ? (
                  <><Check className="h-3 w-3 text-[#6EE7B7]" />copied</>
                ) : (
                  <><Copy className="h-3 w-3" />copy api call</>
                )}
              </button>
            </div>
            <div className="overflow-x-auto px-5 py-4 font-mono text-xs leading-relaxed text-white/85">
              <span className="text-white/40">$ </span>
              {COPY_CMD}
              <motion.span
                animate={{ opacity: [1, 0.15, 1] }}
                transition={{ duration: 1.1, repeat: Infinity }}
                className="mt-1 inline-block h-3.5 w-2 align-middle bg-[#67E8F9]"
              />
            </div>
          </div>

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

          <div className="relative mt-8 flex flex-wrap items-center justify-center gap-2">
            {["No signup", "No cloud", "Metric-honest", "Pipeline-transparent", "One image in"].map((p) => (
              <Pill key={p} tone="muted">{p}</Pill>
            ))}
          </div>
        </div>
      </RevealOnScroll>
    </section>
  );
}