"use client";

import { ExternalLink } from "lucide-react";
import { Pill } from "@/components/shared/Pill";

export interface FlythroughViewerProps {
  seed: number;
  exaggeration: number;
  colormap: "viridis" | "terrain";
  meshUrl?: string;
}

export function FlythroughViewer({ meshUrl }: FlythroughViewerProps) {
  if (!meshUrl) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-grid bg-elevated/40">
        <div className="text-center">
          <Pill tone="muted">3D terrain unavailable</Pill>
          <p className="mt-3 text-sm text-muted">
            Generate a backend result to open the terrain workspace.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full bg-[#87ceeb]">
      <iframe
        src={meshUrl}
        title="Generated 3D terrain viewer"
        className="h-full w-full border-0"
        allow="fullscreen; pointer-lock"
      />
      <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2">
        <Pill tone="cyan">Generated terrain</Pill>
        <span className="rounded-md bg-black/55 px-2 py-1 font-mono text-2xs uppercase tracking-[0.14em] text-white/80 backdrop-blur">
          orbit · fly · walk
        </span>
      </div>
      <a
        href={meshUrl}
        target="_blank"
        rel="noreferrer"
        aria-label="Open terrain viewer in a new tab"
        className="absolute bottom-4 right-4 rounded-md bg-black/55 p-2 text-white/80 backdrop-blur transition-colors hover:text-white"
      >
        <ExternalLink className="h-4 w-4" />
      </a>
    </div>
  );
}
