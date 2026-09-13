"use client";

import { useEffect, useRef, useState } from "react";
import { fromUrl } from "geotiff";
import { Loader2, TriangleAlert } from "lucide-react";
import { viridisHex } from "@/lib/colormap";

export function MapPanel({ heightmapDataUrl }: { heightmapDataUrl?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">(
    heightmapDataUrl ? "loading" : "error"
  );

  useEffect(() => {
    let cancelled = false;

    async function renderRaster() {
      if (!heightmapDataUrl || !canvasRef.current) {
        setState("error");
        return;
      }

      try {
        const tiff = await fromUrl(heightmapDataUrl);
        const image = await tiff.getImage();
        const width = image.getWidth();
        const height = image.getHeight();
        const raster = (await image.readRasters({
          samples: [0],
          interleave: true,
        })) as Float32Array | number[];

        let min = Infinity;
        let max = -Infinity;
        for (const value of raster) {
          if (Number.isFinite(value)) {
            min = Math.min(min, value);
            max = Math.max(max, value);
          }
        }
        if (!Number.isFinite(min) || !Number.isFinite(max)) throw new Error("Raster has no finite values");

        const canvas = canvasRef.current;
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas is unavailable");

        const pixels = context.createImageData(width, height);
        const range = max - min || 1;
        for (let index = 0; index < raster.length; index += 1) {
          const value = raster[index];
          const normalized = Number.isFinite(value) ? (value - min) / range : 0;
          const color = viridisHex(normalized);
          const red = Number.parseInt(color.slice(1, 3), 16);
          const green = Number.parseInt(color.slice(3, 5), 16);
          const blue = Number.parseInt(color.slice(5, 7), 16);
          const pixel = index * 4;
          pixels.data[pixel] = red;
          pixels.data[pixel + 1] = green;
          pixels.data[pixel + 2] = blue;
          pixels.data[pixel + 3] = 255;
        }
        context.putImageData(pixels, 0, 0);
        if (!cancelled) setState("ready");
      } catch {
        if (!cancelled) setState("error");
      }
    }

    renderRaster();
    return () => {
      cancelled = true;
    };
  }, [heightmapDataUrl]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-white/8 bg-[#050810]">
      <canvas ref={canvasRef} className="h-full w-full object-contain" />
      {state === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#050810]/90">
          <div className="flex items-center gap-2 font-mono text-2xs uppercase tracking-[0.16em] text-faint">
            <Loader2 className="h-4 w-4 animate-spin text-cyan" /> Loading DSM raster
          </div>
        </div>
      )}
      {state === "error" && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#050810]">
          <div className="flex items-center gap-2 font-mono text-2xs uppercase tracking-[0.16em] text-amber">
            <TriangleAlert className="h-4 w-4" /> DSM raster unavailable
          </div>
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/75 to-transparent px-4 pb-3 pt-8">
        <span className="font-mono text-2xs uppercase tracking-[0.16em] text-white/80">
          DSM · Viridis elevation
        </span>
        <span className="font-mono text-2xs uppercase tracking-[0.16em] text-white/60">
          low → high
        </span>
      </div>
    </div>
  );
}
