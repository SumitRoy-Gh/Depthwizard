"use client";

import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles, Cpu, ScanLine, Mountain } from "lucide-react";
import { SplitHeading, CharHeading, Reveal, Magnetic } from "@/components/shared/Motion";
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
      {/* Hero */}
      <section className="relative mx-auto max-w-7xl px-6 pb-12 pt-12 md:pt-20">
        {/* Hero 3D background — right-anchored */}
        <div className="pointer-events-none absolute -right-32 top-0 hidden h-[640px] w-[640px] opacity-80 md:block">
          <HeroScene />
        </div>

        <div className="relative max-w-3xl">
          <LiveTelemetryStrip />

          <Reveal delay={0.2} className="mt-8">
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

          <Reveal delay={0.8} className="mt-6 max-w-xl">
            <p className="text-pretty text-lg leading-relaxed text-muted">
              Drop an overhead tile. We stretch the dynamic range, mask clouds,
              run a frozen monocular foundation model, then calibrate it into
              metric height. The result rises out of the canvas in twelve seconds.
            </p>
          </Reveal>

          <Reveal delay={1.0} className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="#studio">
              <Magnetic strength={0.15}>
                <button className="btn-aurora group flex items-center gap-2 rounded-full border border-cyan/40 bg-cyan/15 px-6 py-3 text-sm font-medium text-cyan shadow-glow transition-all hover:bg-cyan/25">
                  Start a run
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </button>
              </Magnetic>
            </Link>
            <Link href="/about">
              <button className="rounded-full border border-white/10 bg-elevated/40 px-6 py-3 text-sm font-medium text-primary backdrop-blur transition-all hover:border-white/20">
                Read the technical notes
              </button>
            </Link>
          </Reveal>

          {/* Key stats */}
          <Reveal delay={1.2}>
            <div className="mt-10 grid max-w-xl grid-cols-3 gap-2">
              <Stat label="Pipeline stages" value="7 + U-Net" />
              <Stat label="Mean latency" value="~12 s" />
              <Stat label="Tested on" value="Vaihingen" />
            </div>
          </Reveal>
        </div>
      </section>

      {/* Studio */}
      <section id="studio" className="relative mx-auto max-w-7xl px-6 pb-16">
        <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            <Reveal>
              <div className="flex items-end justify-between">
                <div>
                  <p className="font-mono text-2xs uppercase tracking-[0.18em] text-cyan">
                    Studio
                  </p>
                  <h2 className="mt-2 text-3xl font-semibold tracking-tight text-primary">
                    Drop a tile to begin.
                  </h2>
                  <p className="mt-2 text-sm text-muted">
                    Auto-detects format, GSD, CRS. Backend keeps source of truth — frontend only previews.
                  </p>
                </div>
                <Pill tone="muted">7 stages</Pill>
              </div>
            </Reveal>

            <Reveal delay={0.15}>
              <DropZone />
            </Reveal>

            <Reveal delay={0.25}>
              <div className="flex items-center gap-2">
                <span className="h-px flex-1 bg-white/8" />
                <span className="font-mono text-2xs uppercase tracking-[0.18em] text-faint">
                  or try one
                </span>
                <span className="h-px flex-1 bg-white/8" />
              </div>
            </Reveal>

            <Reveal delay={0.3}>
              <SampleTiles />
            </Reveal>

            <Reveal delay={0.4}>
              <AdvancedOptions />
            </Reveal>

            <Reveal delay={0.5}>
              <RecentUploads />
            </Reveal>
          </div>

          {/* Side rail — pipeline overview */}
          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <Reveal delay={0.2}>
              <div className="glass rounded-2xl p-5">
                <p className="font-mono text-2xs uppercase tracking-[0.18em] text-cyan">
                  What runs
                </p>
                <h3 className="mt-2 text-lg font-semibold text-primary">
                  7-stage pipeline
                </h3>
                <p className="mt-1.5 text-sm text-muted">
                  Every step observable. The processing page shows a live thumbnail per stage.
                </p>

                <ol className="mt-5 space-y-2.5 text-sm">
                  {[
                    { label: "Radiometric correction", icon: ScanLine },
                    { label: "Cloud / shadow masking", icon: ScanLine },
                    { label: "Bilateral denoise", icon: Cpu },
                    { label: "CLAHE contrast", icon: Cpu },
                    { label: "Resolution align", icon: Cpu },
                    { label: "DAv2 depth prior", icon: Mountain },
                    { label: "Correction U-Net", icon: Mountain },
                  ].map((step, i) => (
                    <li key={i} className="flex items-center gap-3">
                      <span className="font-mono text-2xs tabular-nums text-faint">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="h-1 w-1 rounded-full bg-cyan" />
                      <span className="text-primary">{step.label}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </Reveal>

            <Reveal delay={0.35}>
              <div className="glass rounded-2xl p-5">
                <p className="font-mono text-2xs uppercase tracking-[0.18em] text-amber">
                  Honest scope
                </p>
                <h3 className="mt-2 text-lg font-semibold text-primary">
                  What this isn't
                </h3>
                <ul className="mt-3 space-y-2 text-sm text-muted">
                  <li className="flex gap-2">
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-amber" />
                    <span>Not a real-time multi-user system — session-scoped only.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-amber" />
                    <span>Not sub-decimeter accurate on arbitrary phone photos.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-amber" />
                    <span>Not a replacement for LiDAR — built for accessibility.</span>
                  </li>
                </ul>
              </div>
            </Reveal>
          </aside>
        </div>
      </section>

      {/* Marquee */}
      <section className="relative border-y border-white/5 bg-void/40 py-6 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-12 gap-y-3 px-6 text-2xs">
          <span className="font-mono uppercase tracking-[0.18em] text-faint">Datasets</span>
          {["ISPRS Vaihingen", "ISPRS Potsdam", "DFC2019"].map((d) => (
            <span key={d} className="text-muted">{d}</span>
          ))}
          <span className="h-3 w-px bg-white/10" />
          <span className="font-mono uppercase tracking-[0.18em] text-faint">Models</span>
          <span className="text-muted">Depth Anything v2 (Base)</span>
          <span className="text-muted">Correction U-Net</span>
          <span className="h-3 w-px bg-white/10" />
          <span className="font-mono uppercase tracking-[0.18em] text-faint">Built with</span>
          <span className="text-muted">Three.js · MapLibre · React Query</span>
        </div>
      </section>
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