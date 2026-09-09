"use client";

import { useUi } from "@/store/ui-store";
import { Slider } from "@/components/shared/Slider";
import { ArrowUpDown, Eye, Palette } from "lucide-react";

export function ResultControls() {
  const exaggeration = useUi((s) => s.exaggeration);
  const setExaggeration = useUi((s) => s.setExaggeration);
  const colormap = useUi((s) => s.colormap);
  const setColormap = useUi((s) => s.setColormap);
  const overlayOpacity = useUi((s) => s.overlayOpacity);
  const setOverlayOpacity = useUi((s) => s.setOverlayOpacity);

  return (
    <div className="glass rounded-2xl p-4">
      <h3 className="font-mono text-2xs uppercase tracking-[0.18em] text-cyan">View controls</h3>

      <div className="mt-4 space-y-4">
        <Control label="Vertical exaggeration" icon={<ArrowUpDown className="h-3.5 w-3.5" />}>
          <Slider
            value={exaggeration}
            min={1}
            max={5}
            step={0.1}
            onChange={setExaggeration}
            display={`${exaggeration.toFixed(1)}×`}
          />
        </Control>

        <Control label="Overlay opacity" icon={<Eye className="h-3.5 w-3.5" />}>
          <Slider
            value={overlayOpacity}
            min={0}
            max={1}
            step={0.05}
            onChange={setOverlayOpacity}
            display={`${Math.round(overlayOpacity * 100)}%`}
          />
        </Control>

        <Control label="Colormap" icon={<Palette className="h-3.5 w-3.5" />}>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => setColormap("viridis")}
              className={`relative flex h-9 items-center justify-center overflow-hidden rounded-lg border text-xs font-medium transition-all ${
                colormap === "viridis"
                  ? "border-cyan/50 text-cyan shadow-glow"
                  : "border-white/10 text-muted hover:border-white/20"
              }`}
            >
              <span
                aria-hidden
                className="absolute inset-0 opacity-30"
                style={{ background: "linear-gradient(to right, #440154, #3b528b, #21918c, #5ec962, #fde725)" }}
              />
              <span className="relative">Viridis</span>
            </button>
            <button
              onClick={() => setColormap("terrain")}
              className={`relative flex h-9 items-center justify-center overflow-hidden rounded-lg border text-xs font-medium transition-all ${
                colormap === "terrain"
                  ? "border-cyan/50 text-cyan shadow-glow"
                  : "border-white/10 text-muted hover:border-white/20"
              }`}
            >
              <span
                aria-hidden
                className="absolute inset-0 opacity-30"
                style={{ background: "linear-gradient(to right, #0a1f3a, #2d5a4a, #c2a850, #ffffff)" }}
              />
              <span className="relative">Terrain</span>
            </button>
          </div>
        </Control>
      </div>
    </div>
  );
}

function Control({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-xs text-muted">
        <span className="text-faint">{icon}</span>
        <span>{label}</span>
      </div>
      {children}
    </div>
  );
}