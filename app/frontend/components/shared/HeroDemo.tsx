"use client";

/* ── HeroDemo ───────────────────────────────────────────────────────────────
   A self-contained 2D-canvas animation for the landing hero. It loops:
     1. An aerial image tile fades in (procedural city block).
     2. A scanline sweeps down, building an extruded height surface.
     3. The surface tilts up into a rotating 3D flythrough mesh.
   Theme-aware via CSS variables, pauses offscreen, honors reduced motion,
   and uses zero WebGL — so the landing stays fast and SSR-safe.
   ------------------------------------------------------------------------ */

import { useEffect, useRef } from "react";

const STAGES = [
  { label: "input", note: "one overhead image" },
  { label: "estimate", note: "relative height per pixel" },
  { label: "explore", note: "orbit · pan · zoom" },
];

type Phase = "input" | "sweep" | "fly";

const PHASE_MS = { input: 1500, sweep: 2600, fly: 4200 } as const;
const TOTAL_MS = PHASE_MS.input + PHASE_MS.sweep + PHASE_MS.fly;
const COLS = 22;
const ROWS = 22;

export function HeroDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /* Resize with devicePixelRatio */
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
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    /* Theme colors (read live so switching routes re-themes the demo) */
    const colorOf = (name: string, fallback: string) => {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    };
    const accent = () => colorOf("--accent-cyan", "#D67456");
    const accentSoft = () => colorOf("--accent-cyan-glow", "#E89476");
    const ink = () => colorOf("--text-primary", "#EDE9E1");
    const muted = () => colorOf("--text-muted", "#A0998D");
    const faint = () => colorOf("--text-faint", "#706A60");

    /* Deterministic height field — city-block feel */
    const heights = buildHeights();

    /* Animation loop */
    let raf = 0;
    let visible = true;
    let start = performance.now();
    let last = start;

    const io = new IntersectionObserver(
      (entries) => {
        visible = entries[0]?.isIntersecting ?? true;
        if (visible && !reduced) {
          /* resume from where we paused instead of snapping */
          start = performance.now() - (last - start);
          last = performance.now();
        }
      },
      { threshold: 0.05 }
    );
    io.observe(wrap);

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (!visible) {
        last = now;
        return;
      }
      last = now;

      const elapsed = (now - start) % TOTAL_MS;
      const phase: Phase =
        elapsed < PHASE_MS.input
          ? "input"
          : elapsed < PHASE_MS.input + PHASE_MS.sweep
            ? "sweep"
            : "fly";
      const phaseT =
        phase === "input"
          ? elapsed / PHASE_MS.input
          : phase === "sweep"
            ? (elapsed - PHASE_MS.input) / PHASE_MS.sweep
            : (elapsed - PHASE_MS.input - PHASE_MS.sweep) / PHASE_MS.fly;

      const surfaceAlpha =
        phase === "input" ? 0 : phase === "sweep" ? Math.min(1, phaseT * 1.6) : 1;
      const tileAlpha =
        phase === "input" ? 0.12 + phaseT * 0.88 : phase === "sweep" ? 0.35 : 0.14;
      const flyT = phase === "fly" ? easeInOut(Math.min(1, phaseT * 1.25)) : 0;
      const spin =
        phase === "fly" ? phaseT * Math.PI * 0.5 : 0;

      ctx.clearRect(0, 0, w, h);
      ctx.save();
      /* content sits below the panel title bar */
      ctx.translate(0, 38);

      drawTile(
        ctx, w, h - 38, tileAlpha,
        accent(), faint(), ink(),
        phase === "sweep" ? phaseT : 1,
        1 - flyT * 0.5
      );

      drawSurface(ctx, w, h - 38, surfaceAlpha, flyT, spin, heights, {
        accent: accent(),
        accentSoft: accentSoft(),
        ink: ink(),
      });

      /* Stage caption + progress dots */
      const stageIdx = phase === "input" ? 0 : phase === "sweep" ? 1 : 2;
      ctx.font = "500 11px 'JetBrains Mono', ui-monospace, monospace";
      ctx.textAlign = "left";
      ctx.fillStyle = muted();
      ctx.fillText(`// ${STAGES[stageIdx].label}`, 14, h - 64);
      ctx.fillStyle = faint();
      ctx.fillText(STAGES[stageIdx].note, 14, h - 50);
      for (let i = 0; i < STAGES.length; i++) {
        ctx.beginPath();
        ctx.arc(16 + i * 14, 14, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = i === stageIdx ? accent() : "rgba(128,120,108,0.35)";
        ctx.fill();
      }
      ctx.restore();
    };

    if (reduced) {
      drawStatic(ctx, w, h, heights, accent(), faint(), muted(), ink());
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
      className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl border border-hairline bg-stage/60 shadow-[0_30px_80px_-40px_rgba(20,17,14,0.45)]"
    >
      {/* Panel chrome — reads as a designed window, not a loose canvas */}
      <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-2 border-b border-hairline bg-elevated/80 px-4 py-2.5 backdrop-blur">
        <span className="h-2 w-2 rounded-full bg-rose/70" />
        <span className="h-2 w-2 rounded-full bg-amber/70" />
        <span className="h-2 w-2 rounded-full bg-emerald/70" />
        <span className="ml-2 font-mono text-2xs uppercase tracking-[0.16em] text-faint">
          depthwizard · pipeline preview
        </span>
        <span className="ml-auto font-mono text-2xs uppercase tracking-[0.14em] text-cyan">
          live
        </span>
      </div>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}

/* ── helpers ────────────────────────────────────────────────────────────── */

const easeInOut = (t: number) =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

/** Deterministic pseudo-city height field, normalized 0..1. */
function buildHeights(): Float32Array {
  const heights = new Float32Array(COLS * ROWS);
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const v =
        Math.sin(x * 0.7 + 1.3) * 0.12 +
        Math.cos(y * 0.6 + 2.1) * 0.14 +
        Math.sin((x + y) * 0.45) * 0.1;
      heights[y * COLS + x] = Math.max(0, 0.35 + v);
    }
  }
  const blocks: Array<[number, number, number, number, number]> = [
    [3, 3, 5, 4, 0.95],
    [12, 2, 4, 6, 0.8],
    [6, 12, 4, 4, 0.7],
    [14, 12, 6, 7, 0.9],
    [2, 16, 4, 3, 0.6],
    [10, 17, 3, 3, 0.75],
    [17, 6, 3, 3, 0.65],
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

/** Flat aerial tile with city-block art + optional scanline. */
function drawTile(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  alpha: number,
  accent: string,
  faint: string,
  ink: string,
  sweep: number,
  flatT: number
) {
  if (alpha <= 0.001) return;
  const pad = Math.min(w, h) * 0.14;
  const tw = w - pad * 2;
  const th = h - pad * 2;
  const x0 = pad;
  const y0 = pad + flatT * th * 0.08;

  ctx.save();
  /* Tile body */
  ctx.globalAlpha = alpha * 0.3;
  ctx.fillStyle = faint;
  ctx.fillRect(x0, y0, tw, th);

  /* Grid streets — quiet, the surface is the hero */
  ctx.globalAlpha = alpha * 0.28;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1;
  const cell = tw / 8;
  for (let gx = 0; gx <= 8; gx++) {
    ctx.beginPath();
    ctx.moveTo(x0 + gx * cell, y0);
    ctx.lineTo(x0 + gx * cell, y0 + th);
    ctx.stroke();
  }
  for (let gy = 0; gy <= 8; gy++) {
    ctx.beginPath();
    ctx.moveTo(x0, y0 + gy * cell);
    ctx.lineTo(x0 + tw, y0 + gy * cell);
    ctx.stroke();
  }

  /* Rooftops */
  ctx.globalAlpha = alpha * 0.45;
  ctx.fillStyle = accent;
  const roofs: Array<[number, number, number, number]> = [
    [1, 1, 2, 1], [4, 0, 2, 2], [6, 3, 1, 2],
    [0, 4, 2, 2], [3, 5, 3, 1], [6, 6, 2, 2],
  ];
  for (const [bx, by, bw, bh] of roofs) {
    ctx.fillRect(x0 + bx * cell, y0 + by * cell, bw * cell, bh * cell);
  }

  /* Frame */
  ctx.globalAlpha = alpha * 0.35;
  ctx.strokeStyle = ink;
  ctx.strokeRect(x0, y0, tw, th);

  /* Scanline + trailing glow */
  if (sweep > 0 && sweep < 1) {
    const sy = y0 + sweep * th;
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x0 - 6, sy);
    ctx.lineTo(x0 + tw + 6, sy);
    ctx.stroke();
    const grad = ctx.createLinearGradient(0, sy - 44, 0, sy);
    grad.addColorStop(0, "rgba(214,116,86,0)");
    grad.addColorStop(1, "rgba(214,116,86,0.16)");
    ctx.fillStyle = grad;
    ctx.fillRect(x0, sy - 44, tw, 44);
  }
  ctx.restore();
}

type SurfaceTheme = { accent: string; accentSoft: string; ink: string };

/** Extruded height surface — flat cells that tilt up into a 3D-ish flythrough. */
function drawSurface(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  alpha: number,
  flyT: number,
  spin: number,
  heights: Float32Array,
  theme: SurfaceTheme
) {
  if (alpha <= 0.001) return;
  const pad = Math.min(w, h) * 0.16;
  const sw = w - pad * 2;
  const sh = h - pad * 2;

  /* Perspective projection of the cell grid:
     - flyT tilts the plane back (top rows shrink and rise)
     - spin orbits it slightly around the center */
  const tilt = flyT * 0.62; // max tilt (perspective shear factor)
  const cx = w / 2;
  const baseY = pad + sh * (1 - flyT * 0.28);
  const cellW = sw / COLS;
  const rowH = sh / ROWS;
  const lift = sh * 0.45; // max height lift in px

  const cosS = Math.cos(spin * 0.4);
  const sinS = Math.sin(spin * 0.4);

  /* Height-color ramp: dark base → accent for tall */
  const ramp = (t: number): string => {
    const r = Math.round(38 + (214 - 38) * t);
    const g = Math.round(35 + (116 - 35) * t);
    const b = Math.round(30 + (86 - 30) * t);
    return `rgba(${r},${g},${b},${0.9 * alpha})`;
  };

  /* Back-to-front so nearer cells overdraw farther ones */
  for (let row = ROWS - 1; row >= 0; row--) {
    /* depth 0 = far, 1 = near */
    const depth = 1 - row / (ROWS - 1);
    const persp = 1 - tilt * (1 - depth); // scale factor by depth
    for (let col = 0; col < COLS; col++) {
      const i = row * COLS + col;
      const hgt = heights[i];

      /* unscaled cell position on the ground plane */
      const ux = (col + 0.5) * cellW - sw / 2;
      const uy = -(row + 0.5) * rowH + sh / 2;

      /* tilt: farther rows compress toward horizon and rise */
      const px0 = ux * persp;
      const py0 = uy * persp + (1 - persp) * -sh * 0.28;

      /* orbit */
      const px = cx + px0 * cosS - py0 * sinS;
      const py = baseY + px0 * sinS + py0 * cosS - hgt * lift * flyT;

      const cellSize = cellW * persp;

      /* top face */
      ctx.fillStyle = ramp(hgt);
      ctx.fillRect(px - cellSize / 2, py - cellSize * 0.5, cellSize, cellSize * Math.max(0.35, persp));

      /* extrusion wall (only when tilted, taller cells get taller walls) */
      if (flyT > 0.05) {
        const wallH = hgt * lift * flyT;
        ctx.fillStyle = `rgba(20,18,15,${0.5 * alpha})`;
        ctx.fillRect(px - cellSize / 2, py, cellSize, Math.max(1, wallH * 0.35 * persp));
        /* accent edge on top of tall cells */
        if (hgt > 0.7) {
          ctx.fillStyle = theme.accentSoft;
          ctx.globalAlpha = alpha * 0.7 * flyT;
          ctx.fillRect(px - cellSize / 2, py - cellSize * 0.5, cellSize, 1.4);
          ctx.globalAlpha = 1;
        }
      }
    }
  }
}

/** Reduced-motion fallback: a single composed final frame. */
function drawStatic(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  heights: Float32Array,
  accent: string,
  faint: string,
  muted: string,
  ink: string
) {
  ctx.clearRect(0, 0, w, h);
  drawTile(ctx, w, h, 0.35, accent, faint, ink, 1, 0.3);
  drawSurface(
    ctx, w, h, 1, 1, 0,
    heights,
    { accent, accentSoft: accent, ink }
  );
  ctx.font = "500 11px 'JetBrains Mono', ui-monospace, monospace";
  ctx.fillStyle = muted;
  ctx.fillText("// explore", 14, h - 26);
  ctx.fillStyle = faint;
  ctx.fillText("orbit · pan · zoom", 14, h - 12);
}
