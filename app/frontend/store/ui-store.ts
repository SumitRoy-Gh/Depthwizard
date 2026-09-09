"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UiState {
  // Display
  exaggeration: number; // 1..5
  setExaggeration: (v: number) => void;

  colormap: "viridis" | "terrain";
  setColormap: (c: "viridis" | "terrain") => void;

  overlayOpacity: number; // 0..1
  setOverlayOpacity: (v: number) => void;

  // Pipeline view
  showAdvancedDetail: boolean;
  setShowAdvancedDetail: (v: boolean) => void;

  // Default export formats
  defaultExports: { mesh: boolean; heightmap: boolean; geotiff: boolean; pdf: boolean };
  setDefaultExports: (e: Partial<UiState["defaultExports"]>) => void;
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      exaggeration: 2.5,
      setExaggeration: (v) => set({ exaggeration: v }),

      colormap: "viridis",
      setColormap: (c) => set({ colormap: c }),

      overlayOpacity: 0.65,
      setOverlayOpacity: (v) => set({ overlayOpacity: v }),

      showAdvancedDetail: false,
      setShowAdvancedDetail: (v) => set({ showAdvancedDetail: v }),

      defaultExports: { mesh: true, heightmap: true, geotiff: true, pdf: false },
      setDefaultExports: (e) =>
        set((s) => ({ defaultExports: { ...s.defaultExports, ...e } })),
    }),
    {
      name: "depthwizard-ui",
      version: 1,
    }
  )
);