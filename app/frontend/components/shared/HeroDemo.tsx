"use client";

/* ── HeroDemo ────────────────────────────────────────────────────────────────
   Landing-hero pipeline preview — one seamless loop, three phases:

     01 · ingest   flat satellite tile locks in (crisp grid + block footprints)
     02 · sweep    a scanline walks the map; rows pop into extruded columns
     03 · fly      camera tilts + yaws over the voxel city, peaks glow, then
                   the scene eases flat again so the loop never snaps

   Crisp by construction: DPR-aware backbuffer, painter's-algorithm quads with
   hairline strokes (no translucent-rect mush), pixel-snapped map art, glow
   only on wavefront + peak caps. Zero WebGL · theme-aware · pauses offscreen
   · reduced-motion safe.
   ────────────────────────────────────────────────────────────────────────── */

import { useEffect, useRef, useState } from "react";

type RGB = [number, number, number];
type Theme = { accent: RGB; glow: RGB; deep: RGB; ink: RGB };

const PHASE_MS = [1500, 2900, 5200] as const;
const TOTAL_MS = PHASE_MS[0] + PHASE_MS[1] + PHASE_MS[2];
const PHASE_LABELS = [
  "01 · ingest — tile",
  "02 · depth sweep",
  "03 · 3d flythrough",
] as const;
const COLS = 26;
const ROWS = 26;
const CHROME_TOP = 40; // title bar height (px)
const CHROME_BOTTOM = 34; // status bar height (px)

export function HeroDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState(0);
  const phaseRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const heights = buildHeights();

    /* ── size (DPR-aware) ──────────────────────────────────────────────── */
    let w = 0;
    let h = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = wrap.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (reduced) drawStatic(ctx, w, h, heights);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    /* ── visibility — pause when scrolled away, resume seamlessly ──────── */
    let visible = true;
    let start = performance.now();
    let last = start;
    const io = new IntersectionObserver(
      (entries) => {
        visible = entries[0]?.isIntersecting ?? true;
        if (visible && !reduced) {
          start = performance.now() - (last - start);
          last = performance.now();
        }
      },
      { threshold: 0.05 }
    );
    io.observe(wrap);

    /* ── frame loop ────────────────────────────────────────────────────── */
    let raf = 0;
    let pingClock = 0;

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (!visible) {
        last = now;
        return;
      }
      last = now;

      const elapsed = (now - start) % TOTAL_MS;
      let phase = 0;
      let phaseT = 0;
      for (let i = 0, acc = 0; i < 3; i++) {
        if (elapsed < acc + PHASE_MS[i]) {
          phase = i;
          phaseT = (elapsed - acc) / PHASE_MS[i];
          break;
        }
        acc += PHASE_MS[i];
      }
      if (phase !== phaseRef.current) {
        phaseRef.current = phase;
        setPhase(phase);
      }

      const th = readTheme();

      /* camera + scene state — every value is continuous across phase
         boundaries so the loop hands off without a visible snap */
      let tilt = 0;
      let yaw = 0;
      let liftAmp = 0;
      let pulse = 0;
      let tileAlpha = 1;
      let brackets = 0;
      let scan = -1;
      let pingT = -1;
      let rowFn: (r: number) => number = () => 0;

      if (phase === 0) {
        /* ingest — map is live, brackets lock on */
        tileAlpha = 1;
        brackets = smooth(phaseT * 2 - 0.4);
      } else if (phase === 1) {
        /* sweep — scanline walks the map, rows pop behind it */
        tileAlpha = 1;
        brackets = 1;
        scan = smooth(phaseT);
        liftAmp = 0.62 * smooth(phaseT * 6);
        tilt = 0.3 * smooth(phaseT);
        rowFn = (r) => smooth((scan - (r + 0.5) / ROWS) * ROWS * 0.42);
      } else {
        /* fly — airborne: tilt up, orbit out, then settle flat */
        const e = smooth(Math.sin(Math.min(1, phaseT) * Math.PI));
        tilt = lerp(0.3, 1, e);
        yaw = Math.sin(phaseT * Math.PI) * 0.34;
        liftAmp = 0.62 + 0.38 * e;
        pulse = e;
        tileAlpha = 1 - e * 0.8;
        brackets = 1 - e;
        rowFn = (r) => 1 - smooth((phaseT - 0.8) / 0.2); // fold back flat
        pingClock += 16.7;
        pingT = (pingClock % 1500) / 1500;
      }

      ctx.clearRect(0, 0, w, h);
      drawTile(ctx, w, h, heights, th, { alpha: tileAlpha, scan, brackets });
      drawSurface(ctx, w, h, heights, th, {
        alpha: 1,
        tilt,
        yaw,
        liftAmp,
        rowFn,
        pulse,
        pingT,
      });
      drawVignette(ctx, w, h);
    };

    if (reduced) {
      drawStatic(ctx, w, h, heights);
    } else {
      raf = requestAnimationFrame(draw);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl border border-hairline bg-void/40 shadow-[0_40px_90px_-40px_rgba(20,17,14,0.55)] ring-1 ring-white/5"
    >
      {/* Title bar — designed window chrome */}
      <div className="absolute inset-x-0 top-0 z-10 flex h-10 items-center gap-2 border-b border-hairline bg-elevated/80 px-4 backdrop-blur">
        <span className="h-2 w-2 rounded-full bg-rose/70" />
        <span className="h-2 w-2 rounded-full bg-amber/70" />
        <span className="h-2 w-2 rounded-full bg-emerald/70" />
        <span className="ml-2 font-mono text-2xs uppercase tracking-[0.16em] text-faint">
          depthwizard · pipeline preview
        </span>
        <span className="ml-auto flex items-center gap-2.5 font-mono text-2xs uppercase tracking-[0.14em]">
          <span
            key={phase}
            className="animate-[rise_0.45s_ease-out_both] text-cyan"
          >
            {PHASE_LABELS[phase]}
          </span>
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cyan" />
          </span>
        </span>
      </div>

      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Status bar — elevation ramp legend */}
      <div className="absolute inset-x-0 bottom-0 z-10 flex h-[34px] items-center gap-2.5 border-t border-hairline bg-elevated/80 px-4 backdrop-blur">
        <span className="font-mono text-2xs uppercase tracking-[0.14em] text-faint">
          elevation
        </span>
        <span
          className="h-1 w-20 rounded-full sm:w-28"
          style={{
            background:
              "linear-gradient(90deg, #2E2620 0%, var(--accent-cyan-deep) 42%, var(--accent-cyan) 74%, var(--accent-cyan-glow) 100%)",
          }}
        />
        <span className="font-mono text-2xs uppercase tracking-[0.14em] text-faint">
          low
        </span>
        <span className="font-mono text-2xs uppercase tracking-[0.14em] text-muted">
          high
        </span>
        <span className="ml-auto hidden font-mono text-2xs tabular-nums tracking-[0.14em] text-faint sm:block">
          26×26 grid · relative elevation
        </span>
      </div>
    </div>
  );
}

/* ── shared helpers ────────────────────────────────────────────────────────── */

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const clamp = (t: number, a: number, b: number) => (t < a ? a : t > b ? b : t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/* smoothstep easing */
const smooth = (t: number) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};

/* pop-in with a little overshoot — extruded columns feel alive */
const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const x = clamp01(t);
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

/** Parse "#rrggbb" / "#rgb" into [r, g, b]. */
const hexToRgb = (hex: string, fallback: RGB): RGB => {
  const m = hex.trim().match(/^#([0-9a-f]{6}|[0-9a-f]{3})$/i);
  if (!m) return fallback;
  let s = m[1];
  if (s.length === 3) s = s.split("").map((c) => c + c).join("");
  return [
    parseInt(s.slice(0, 2), 16),
    parseInt(s.slice(2, 4), 16),
    parseInt(s.slice(4, 6), 16),
  ];
};

const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

const rgbStr = (c: RGB, a: number) =>
  `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;

/** Live theme tokens (hex aliases from globals.css). */
function readTheme(): Theme {
  const pick = (name: string, fb: RGB): RGB => {
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();
    return v ? hexToRgb(v, fb) : fb;
  };
  return {
    accent: pick("--accent-cyan", [214, 116, 86]),
    glow: pick("--accent-cyan-glow", [232, 148, 118]),
    deep: pick("--accent-cyan-deep", [172, 84, 58]),
    ink: pick("--text-primary", [237, 233, 225]),
  };
}

/* ── height field ──────────────────────────────────────────────────────────── */

const C_BASE: RGB = [46, 38, 30]; // dark warm base for the ramp

/** Deterministic pseudo-city height field, normalized 0..1. */
function buildHeights(): Float32Array {
  const heights = new Float32Array(COLS * ROWS);
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const v =
        Math.sin(x * 0.42 + 1.7) * 0.1 +
        Math.cos(y * 0.36 + 0.6) * 0.1 +
        Math.sin((x * 0.8 + y * 1.3) * 0.35) * 0.08 +
        Math.cos(Math.hypot(x - 13, y - 15) * 0.5) * 0.06;
      heights[y * COLS + x] = Math.max(0, 0.3 + v);
    }
  }
  const blocks: Array<[number, number, number, number, number]> = [
    [2, 3, 4, 5, 0.92], [8, 2, 3, 4, 0.7], [14, 3, 5, 6, 0.98], [21, 5, 3, 4, 0.6],
    [3, 12, 4, 4, 0.75], [9, 14, 3, 3, 0.85], [16, 13, 4, 5, 0.65], [21, 15, 3, 3, 0.8],
    [5, 20, 5, 4, 0.7], [14, 20, 3, 3, 0.58], [19, 21, 4, 3, 0.52],
  ];
  for (const [bx, by, bw, bh, peak] of blocks) {
    for (let y = by; y < by + bh && y < ROWS; y++) {
      for (let x = bx; x < bx + bw && x < COLS; x++) {
        heights[y * COLS + x] = Math.max(heights[y * COLS + x], peak);
      }
    }
  }
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < heights.length; i++) {
    min = Math.min(min, heights[i]);
    max = Math.max(max, heights[i]);
  }
  const range = max - min || 1;
  for (let i = 0; i < heights.length; i++) {
    heights[i] = (heights[i] - min) / range;
  }
  return heights;
}

function tallestOf(heights: Float32Array): number {
  let t = 0;
  for (let i = 1; i < heights.length; i++) {
    if (heights[i] > heights[t]) t = i;
  }
  return t;
}

/* ── color ramps ───────────────────────────────────────────────────────────── */

/** Height → color: dark base → terracotta deep → accent, glow on the tips. */
function rampRgb(th: Theme, t: number): RGB {
  const c =
    t < 0.55
      ? mix(C_BASE, th.deep, t / 0.55)
      : mix(th.deep, th.accent, (t - 0.55) / 0.45);
  return t > 0.86 ? mix(c, th.glow, ((t - 0.86) / 0.14) * 0.7) : c;
}

/** Top-face color with a hot "just-popped" flash mixed in. */
function topColor(th: Theme, t: number, flash: number): RGB {
  const c = rampRgb(th, t);
  return flash > 0 ? mix(c, [255, 243, 230], flash * 0.8) : c;
}

/** Wall shade — same ramp darkened so faces read as solid geometry. */
function wallColor(th: Theme, t: number, k: number, a: number): string {
  const c = rampRgb(th, t);
  return rgbStr([c[0] * k, c[1] * k, c[2] * k], a);
}

/* ── flat map tile ─────────────────────────────────────────────────────────── */

interface TileOpts {
  alpha: number;
  scan: number; // -1 = idle, 0..1 = sweep position
  brackets: number; // corner-bracket lock-in 0..1
}

/** Pixel-snapped satellite tile — footprints come from the same height field
    the 3D surface uses, so the map and the city read as one dataset. */
function drawTile(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  heights: Float32Array,
  th: Theme,
  o: TileOpts
) {
  if (o.alpha <= 0.002) return;
  const areaH = h - CHROME_TOP - CHROME_BOTTOM;
  const padX = Math.round(w * 0.14);
  const padY = Math.round(areaH * 0.1);
  const x0 = padX;
  const y0 = CHROME_TOP + padY;
  const tw = w - padX * 2;
  const thh = areaH - padY * 2;
  const cw = tw / COLS;
  const ch = thh / ROWS;

  /* map body — slightly darker than the panel for contrast */
  ctx.globalAlpha = o.alpha;
  ctx.fillStyle = "rgba(0,0,0,0.16)";
  ctx.fillRect(x0, y0, tw, thh);

  /* block footprints, straight from the height field */
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const t = heights[row * COLS + col];
      if (t < 0.3) continue;
      const bx = Math.round(x0 + col * cw);
      const by = Math.round(y0 + row * ch);
      const bw = Math.round(x0 + (col + 1) * cw) - bx;
      const bh = Math.round(y0 + (row + 1) * ch) - by;
      ctx.fillStyle = rgbStr(rampRgb(th, t), 0.72);
      ctx.fillRect(bx, by, bw, bh);
      if (t > 0.7) {
        /* rooftop parapet detail on tall blocks */
        ctx.strokeStyle = "rgba(255,246,236,0.14)";
        ctx.lineWidth = 1;
        ctx.strokeRect(bx + 1.5, by + 1.5, bw - 3, bh - 3);
      }
    }
  }

  /* survey grid — pixel-snapped hairlines, crisp at any DPR */
  ctx.strokeStyle = "rgba(237,233,225,0.07)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let gx = 0; gx <= COLS; gx += 2) {
    const x = Math.round(x0 + gx * cw) + 0.5;
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y0 + thh);
  }
  for (let gy = 0; gy <= ROWS; gy += 2) {
    const y = Math.round(y0 + gy * ch) + 0.5;
    ctx.moveTo(x0, y);
    ctx.lineTo(x0 + tw, y);
  }
  ctx.stroke();

  /* frame */
  ctx.strokeStyle = rgbStr(th.ink, 0.26);
  ctx.strokeRect(
    Math.round(x0) + 0.5,
    Math.round(y0) + 0.5,
    Math.round(tw) - 1,
    Math.round(thh) - 1
  );

  /* corner brackets lock on during ingest */
  if (o.brackets > 0.01) {
    const L = 9;
    ctx.strokeStyle = rgbStr(th.accent, 0.9 * o.brackets);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x0, y0 + L); ctx.lineTo(x0, y0); ctx.lineTo(x0 + L, y0);
    ctx.moveTo(x0 + tw - L, y0); ctx.lineTo(x0 + tw, y0); ctx.lineTo(x0 + tw, y0 + L);
    ctx.moveTo(x0 + tw, y0 + thh - L); ctx.lineTo(x0 + tw, y0 + thh); ctx.lineTo(x0 + tw - L, y0 + thh);
    ctx.moveTo(x0 + L, y0 + thh); ctx.lineTo(x0, y0 + thh); ctx.lineTo(x0, y0 + thh - L);
    ctx.stroke();
    ctx.lineWidth = 1;
  }
  ctx.globalAlpha = 1;

  /* scanline — glowing wavefront with a soft trail */
  if (o.scan > 0 && o.scan < 1) {
    const sy = y0 + o.scan * thh;
    const [ar, ag, ab] = th.accent;
    const grad = ctx.createLinearGradient(0, sy - 64, 0, sy);
    grad.addColorStop(0, `rgba(${ar},${ag},${ab},0)`);
    grad.addColorStop(1, `rgba(${ar},${ag},${ab},0.2)`);
    ctx.fillStyle = grad;
    ctx.fillRect(x0, sy - 64, tw, 64);
    ctx.save();
    ctx.shadowColor = `rgba(${ar},${ag},${ab},0.9)`;
    ctx.shadowBlur = 9;
    ctx.strokeStyle = rgbStr(th.glow, 0.95);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x0, sy);
    ctx.lineTo(x0 + tw, sy);
    ctx.stroke();
    ctx.restore();
  }
}

/* ── extruded voxel surface ────────────────────────────────────────────────── */

interface SurfaceOpts {
  alpha: number;
  tilt: number; // 0 = top-down map, 1 = full oblique horizon
  yaw: number; // orbit (radians)
  liftAmp: number; // global extrusion amplitude 0..1
  rowFn: (r: number) => number; // per-row pop progress 0..1
  pulse: number; // fly-phase energy 0..1 (drives glow + ping)
  pingT: number; // -1 = off, else 0..1 ring cycle
}

/** Painter's-algorithm voxel city. Every cell is a real quad with shaded
    walls and a hairline-edged top face — crisp geometry, not blurred rects. */
function drawSurface(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  heights: Float32Array,
  th: Theme,
  o: SurfaceOpts
) {
  if (o.alpha <= 0.002 || o.liftAmp <= 0.002) return;
  const areaH = h - CHROME_TOP - CHROME_BOTTOM;
  const scale = Math.min(w * 0.4, areaH * 0.6);
  const cx = w / 2;
  const cy = CHROME_TOP + areaH * (0.5 + o.tilt * 0.05);
  const squash = lerp(1, 0.4, o.tilt);
  const liftPx = scale * 0.62 * o.liftAmp;
  const cosY = Math.cos(o.yaw);
  const sinY = Math.sin(o.yaw);
  const hs = 1 / COLS;
  const tallest = tallestOf(heights);

  /* per-row pop (easeOutBack gives the columns a springy landing) */
  const pops = new Float32Array(ROWS);
  for (let r = 0; r < ROWS; r++) pops[r] = easeOutBack(o.rowFn(r / (ROWS - 1)));
  if (pops.every((p) => p <= 0.02)) return;

  /* ground-plane projection: rotate (yaw) → squash (tilt) → perspective */
  const project = (gx: number, gy: number, hgt: number): [number, number] => {
    const rx = gx * cosY - gy * sinY;
    const ry = gx * sinY + gy * cosY;
    const per = clamp(1 / (1 - ry * 0.3 * o.tilt), 0.55, 2.2);
    return [cx + rx * scale * per, cy + ry * scale * squash * per - hgt * liftPx * per];
  };

  /* warm under-glow while airborne — cheap depth cue */
  if (o.pulse > 0.03) {
    const [ar, ag, ab] = th.accent;
    const g = ctx.createRadialGradient(cx, cy + areaH * 0.16, 10, cx, cy + areaH * 0.16, scale * 1.6);
    g.addColorStop(0, `rgba(${ar},${ag},${ab},${0.13 * o.pulse})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, CHROME_TOP, w, areaH);
  }

  for (let row = 0; row < ROWS; row++) {
    const pop = pops[row];
    if (pop <= 0.02) continue;
    const gy = -1 + ((row + 0.5) * 2) / ROWS;
    /* aerial perspective — far rows recede */
    const dFade = o.alpha * lerp(0.66, 1, row / (ROWS - 1));
    const flash = clamp(1 - pop, 0, 1);

    for (let col = 0; col < COLS; col++) {
      const i = row * COLS + col;
      const t = heights[i];
      const hgt = t * pop;
      const gx = -1 + ((col + 0.5) * 2) / COLS;

      const [ax, ay] = project(gx - hs, gy - hs, hgt);
      const [bx, by] = project(gx + hs, gy - hs, hgt);
      const [cx2, cy2] = project(gx + hs, gy + hs, hgt);
      const [dx, dy] = project(gx - hs, gy + hs, hgt);

      /* south wall — faces the camera for |yaw| < 90° */
      const nbS = row + 1 < ROWS ? heights[i + COLS] * pops[row + 1] : 0;
      if (hgt - nbS > 0.01) {
        const [g0x, g0y] = project(gx - hs, gy + hs, nbS);
        const [g1x, g1y] = project(gx + hs, gy + hs, nbS);
        ctx.fillStyle = wallColor(th, t, 0.58, dFade);
        ctx.beginPath();
        ctx.moveTo(g0x, g0y);
        ctx.lineTo(g1x, g1y);
        ctx.lineTo(cx2, cy2);
        ctx.lineTo(dx, dy);
        ctx.closePath();
        ctx.fill();
      }

      /* east or west wall depending on orbit direction */
      if (sinY > 0.05) {
        const nbE = col + 1 < COLS ? heights[i + 1] * pops[row] : 0;
        if (hgt - nbE > 0.01) {
          const [e0x, e0y] = project(gx + hs, gy - hs, nbE);
          const [e1x, e1y] = project(gx + hs, gy + hs, nbE);
          ctx.fillStyle = wallColor(th, t, 0.4, dFade);
          ctx.beginPath();
          ctx.moveTo(e0x, e0y);
          ctx.lineTo(e1x, e1y);
          ctx.lineTo(cx2, cy2);
          ctx.lineTo(bx, by);
          ctx.closePath();
          ctx.fill();
        }
      } else if (sinY < -0.05) {
        const nbW = col > 0 ? heights[i - 1] * pops[row] : 0;
        if (hgt - nbW > 0.01) {
          const [w0x, w0y] = project(gx - hs, gy - hs, nbW);
          const [w1x, w1y] = project(gx - hs, gy + hs, nbW);
          ctx.fillStyle = wallColor(th, t, 0.4, dFade);
          ctx.beginPath();
          ctx.moveTo(w0x, w0y);
          ctx.lineTo(w1x, w1y);
          ctx.lineTo(dx, dy);
          ctx.lineTo(ax, ay);
          ctx.closePath();
          ctx.fill();
        }
      }

      /* top face — solid fill + hairline edge = crisp voxels */
      ctx.fillStyle = rgbStr(topColor(th, t, flash), dFade);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.lineTo(cx2, cy2);
      ctx.lineTo(dx, dy);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = `rgba(12,10,8,${0.42 * dFade})`;
      ctx.lineWidth = 1;
      ctx.stroke();

      /* glowing caps on the tall towers */
      if (t > 0.72 && o.pulse > 0.05) {
        ctx.save();
        ctx.shadowColor = `rgba(${th.glow[0]},${th.glow[1]},${th.glow[2]},${0.8 * o.pulse})`;
        ctx.shadowBlur = 10 * o.pulse;
        ctx.fillStyle = rgbStr(mix(topColor(th, t, 0), th.glow, 0.45), dFade);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  /* ping ring on the tallest tower */
  if (o.pingT >= 0 && o.pulse > 0.1) {
    const row0 = Math.floor(tallest / COLS);
    const col0 = tallest % COLS;
    const gx = -1 + ((col0 + 0.5) * 2) / COLS;
    const gy = -1 + ((row0 + 0.5) * 2) / ROWS;
    const [px, py] = project(gx, gy, heights[tallest] * pops[row0]);
    const t = o.pingT;
    ctx.strokeStyle = `rgba(${th.glow[0]},${th.glow[1]},${th.glow[2]},${(1 - t) * 0.55 * o.pulse})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(px, py - 2, 3 + t * 15, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/* ── finishing layers ──────────────────────────────────────────────────────── */

/** Soft edge vignette — focuses the eye without washing anything out. */
function drawVignette(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const cy = CHROME_TOP + (h - CHROME_TOP - CHROME_BOTTOM) * 0.5;
  const g = ctx.createRadialGradient(
    w / 2,
    cy,
    Math.min(w, h) * 0.38,
    w / 2,
    cy,
    Math.max(w, h) * 0.72
  );
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.36)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/** Reduced-motion fallback — one composed, perfectly still frame. */
function drawStatic(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  heights: Float32Array
) {
  const th = readTheme();
  ctx.clearRect(0, 0, w, h);
  drawTile(ctx, w, h, heights, th, { alpha: 1, scan: -1, brackets: 1 });
  drawSurface(ctx, w, h, heights, th, {
    alpha: 1,
    tilt: 0.55,
    yaw: 0.3,
    liftAmp: 0.9,
    rowFn: () => 1,
    pulse: 0.5,
    pingT: -1,
  });
  drawVignette(ctx, w, h);
}
