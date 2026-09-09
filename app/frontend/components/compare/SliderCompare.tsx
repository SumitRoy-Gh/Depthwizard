"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

export function SliderCompare() {
  const [position, setPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    const onMove = (clientX: number) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * 100;
      setPosition(Math.max(0, Math.min(100, x)));
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (draggingRef.current) onMove(e.clientX);
    };
    const handleTouchMove = (e: TouchEvent) => {
      if (draggingRef.current && e.touches[0]) onMove(e.touches[0].clientX);
    };
    const stop = () => (draggingRef.current = false);

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("touchmove", handleTouchMove);
    window.addEventListener("mouseup", stop);
    window.addEventListener("touchend", stop);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("mouseup", stop);
      window.removeEventListener("touchend", stop);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative aspect-[16/9] cursor-ew-resize select-none overflow-hidden rounded-xl border border-white/8"
      onMouseDown={() => (draggingRef.current = true)}
      onTouchStart={() => (draggingRef.current = true)}
    >
      {/* Left: DAv2 raw */}
      <div className="absolute inset-0">
        <SyntheticPanel label="DAv2 raw" tone="cyan" seed="raw" />
        <div className="absolute inset-0 flex items-start justify-between p-4">
          <span className="rounded-md border border-cyan/30 bg-cyan/10 px-2 py-1 font-mono text-2xs uppercase tracking-[0.16em] text-cyan">
            DAv2 · raw
          </span>
        </div>
      </div>

      {/* Right: Corrected */}
      <div
        className="absolute inset-0"
        style={{ clipPath: `inset(0 0 0 ${position}%)` }}
      >
        <SyntheticPanel label="U-Net corrected" tone="emerald" seed="corr" />
        <div className="absolute inset-0 flex items-start justify-end p-4">
          <span className="rounded-md border border-emerald/30 bg-emerald/10 px-2 py-1 font-mono text-2xs uppercase tracking-[0.16em] text-emerald">
            U-Net · corrected
          </span>
        </div>
      </div>

      {/* Slider line */}
      <div
        className="absolute inset-y-0 z-10 w-px bg-white shadow-[0_0_24px_rgba(255,255,255,0.6)]"
        style={{ left: `${position}%` }}
      >
        <motion.div
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
          whileHover={{ scale: 1.15 }}
          whileTap={{ scale: 0.95 }}
        >
          <div className="relative flex h-10 w-10 items-center justify-center rounded-full border-2 border-white bg-void shadow-glow">
            <svg viewBox="0 0 12 12" className="h-4 w-4 text-white">
              <path d="M4 2 L2 6 L4 10 M8 2 L10 6 L8 10" stroke="currentColor" strokeWidth="1.5" fill="none" />
            </svg>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function SyntheticPanel({ label, tone, seed }: { label: string; tone: "cyan" | "emerald"; seed: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const w = (c.width = c.clientWidth);
    const h = (c.height = c.clientHeight);

    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#050810");
    grad.addColorStop(1, "#0a1020");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Generate height visualization
    const id = ctx.getImageData(0, 0, w, h);
    const data = id.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const nx = x / w;
        const ny = y / h;
        let v =
          Math.sin(nx * 6 + (seed === "raw" ? 1 : 2)) * 0.15 +
          Math.cos(ny * 5 + (seed === "raw" ? 2 : 3)) * 0.18 +
          Math.sin((nx + ny) * 8) * 0.1;
        if (seed === "corr") {
          // Sharper, more calibrated
          v = Math.max(0, Math.min(1, 0.5 + v * 1.4));
        } else {
          // Looser, noisier
          v = Math.max(0, Math.min(1, 0.45 + v * 0.9 + (Math.sin(nx * 30 + ny * 20) * 0.05)));
        }
        // Viridis-like
        let r: number, g: number, b: number;
        if (v < 0.25) {
          const t = v / 0.25;
          r = 68 + t * (59 - 68);
          g = 84 + t * (82 - 84);
          b = 154 + t * (139 - 154);
        } else if (v < 0.5) {
          const t = (v - 0.25) / 0.25;
          r = 59 + t * (33 - 59);
          g = 82 + t * (145 - 82);
          b = 139 + t * (140 - 139);
        } else if (v < 0.75) {
          const t = (v - 0.5) / 0.25;
          r = 33 + t * (94 - 33);
          g = 145 + t * (201 - 145);
          b = 140 + t * (98 - 140);
        } else {
          const t = (v - 0.75) / 0.25;
          r = 94 + t * (253 - 94);
          g = 201 + t * (231 - 201);
          b = 98 + t * (37 - 98);
        }
        const i = (y * w + x) * 4;
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = 255;
      }
    }
    ctx.putImageData(id, 0, 0);

    // Scan lines for retro feel
    ctx.strokeStyle = "rgba(0,0,0,0.15)";
    ctx.lineWidth = 1;
    for (let y = 0; y < h; y += 3) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Grid overlay
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    for (let i = 0; i <= 10; i++) {
      const x = (w / 10) * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
      const yy = (h / 10) * i;
      ctx.beginPath();
      ctx.moveTo(0, yy);
      ctx.lineTo(w, yy);
      ctx.stroke();
    }
  }, [seed]);

  return (
    <div className="relative h-full w-full">
      <canvas ref={canvasRef} className="h-full w-full" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-void/40 via-transparent to-transparent" />
    </div>
  );
}