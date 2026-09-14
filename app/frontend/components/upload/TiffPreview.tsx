"use client";

import { useEffect, useRef, useState } from 'react';
import * as GeoTIFF from 'geotiff';

type TypedArray = Uint8Array | Uint16Array | Float32Array | Float64Array;

export function TiffPreview({ file, fallbackUrl, className }: { file: File; fallbackUrl: string; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    
    async function load() {
      try {
        const tiff = await GeoTIFF.fromBlob(file);
        const image = await tiff.getImage();
        const width = image.getWidth();
        const height = image.getHeight();
        
        const rasters = await image.readRasters();
        
        if (!active || !canvasRef.current) return;
        
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        
        // Cap preview size for performance
        const MAX = 600;
        let scale = 1;
        if (width > MAX || height > MAX) {
          scale = MAX / Math.max(width, height);
        }
        
        const cw = Math.round(width * scale);
        const ch = Math.round(height * scale);
        canvas.width = cw;
        canvas.height = ch;
        
        // Read 1st band
        const band = rasters[0] as unknown as TypedArray;
        
        // Approximate min/max using a sample for performance
        let min = Infinity;
        let max = -Infinity;
        const step = Math.max(1, Math.floor(band.length / 10000));
        for (let i = 0; i < band.length; i += step) {
          const val = band[i];
          if (val < min) min = val;
          if (val > max) max = val;
        }
        
        const offscreen = document.createElement("canvas");
        offscreen.width = width;
        offscreen.height = height;
        const oCtx = offscreen.getContext("2d");
        if (!oCtx) return;
        
        const imgData = oCtx.createImageData(width, height);
        const data = imgData.data;
        
        const range = max - min || 1;
        
        for (let i = 0; i < width * height; i++) {
          const val = band[i];
          const norm = Math.max(0, Math.min(255, Math.round(((val - min) / range) * 255)));
          const idx = i * 4;
          data[idx] = norm;     // R
          data[idx + 1] = norm; // G
          data[idx + 2] = norm; // B
          data[idx + 3] = 255;  // A
        }
        
        oCtx.putImageData(imgData, 0, 0);
        ctx.drawImage(offscreen, 0, 0, width, height, 0, 0, cw, ch);
        
      } catch (err) {
        console.warn("Failed to generate TIFF preview:", err);
        if (active) setError(true);
      }
    }
    
    load();
    return () => { active = false; };
  }, [file]);

  if (error) {
    // Fall back to native img tag (which might just show a broken icon or nothing if it's a TIF)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={fallbackUrl} alt={file.name} className={className} />;
  }

  return <canvas ref={canvasRef} className={className} />;
}
