"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";

// MapLibre only loads client-side and only when needed (georeferenced results)
const MapView = dynamic(() => import("./MapViewImpl").then((m) => m.MapViewImpl), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted" />
    </div>
  ),
});

export function MapPanel({ georeferenced, heightmapDataUrl }: { georeferenced: boolean; heightmapDataUrl?: string }) {
  if (!georeferenced) {
    return <CanvasFallback heightmapDataUrl={heightmapDataUrl} />;
  }
  return <MapView />;
}

function CanvasFallback({ heightmapDataUrl }: { heightmapDataUrl?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const w = (c.width = c.clientWidth);
    const h = (c.height = c.clientHeight);

    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, "#0a1019");
    grad.addColorStop(1, "#050608");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Heightmap-like visualization: noise + ridges
    const id = ctx.getImageData(0, 0, w, h);
    const data = id.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const nx = x / w;
        const ny = y / h;
        let v =
          Math.sin(nx * 6 + 1) * 0.15 +
          Math.cos(ny * 5 + 2) * 0.18 +
          Math.sin((nx + ny) * 8) * 0.1;
        v = Math.max(0, 0.5 + v);
        // Viridis-like gradient
        const r = Math.floor(v * 253);
        const g = Math.floor((1 - Math.abs(v - 0.6) * 1.8) * 200);
        const b = Math.floor((1 - v) * 100);
        const i = (y * w + x) * 4;
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = 255;
      }
    }
    ctx.putImageData(id, 0, 0);

    // Grid overlay
    ctx.strokeStyle = "rgba(34,211,238,0.18)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 10; i++) {
      const x = (w / 10) * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
      const y = (h / 10) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-white/8">
      <canvas ref={canvasRef} className="h-full w-full" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-void/40 via-transparent to-transparent" />
    </div>
  );
}