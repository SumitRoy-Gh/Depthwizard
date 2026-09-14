"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Download, Map } from "lucide-react";

interface MapTile {
  key: string;
  label: string;
  sublabel: string;
  url?: string;
  accent: string;
}

function LightboxModal({ tile, onClose }: { tile: MapTile; onClose: () => void }) {
  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="relative max-w-4xl w-full rounded-2xl overflow-hidden border border-white/10 bg-elevated shadow-2xl"
          initial={{ scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.92, opacity: 0 }}
          transition={{ type: "spring", stiffness: 280, damping: 24 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-3 border-b border-white/8">
            <div>
              <p className={`font-mono text-2xs uppercase tracking-[0.18em] ${tile.accent}`}>
                {tile.sublabel}
              </p>
              <p className="mt-0.5 text-sm font-semibold text-primary">{tile.label}</p>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={tile.url}
                download
                className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-muted transition-colors hover:text-primary"
              >
                <Download className="h-3 w-3" />
                Download
              </a>
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-muted transition-colors hover:text-primary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={tile.url} alt={tile.label} className="w-full object-contain max-h-[75vh]" />
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export interface ProductMapsProps {
  dsmPreviewUrl?: string;
  hillshadePreviewUrl?: string;
  slopePreviewUrl?: string;
  dtmPreviewUrl?: string;
  ndsmPreviewUrl?: string;
  confidencePreviewUrl?: string;
}

export function ProductMaps({
  dsmPreviewUrl,
  hillshadePreviewUrl,
  slopePreviewUrl,
  dtmPreviewUrl,
  ndsmPreviewUrl,
  confidencePreviewUrl,
}: ProductMapsProps) {
  const [active, setActive] = useState<MapTile | null>(null);

  const tiles: MapTile[] = [
    { key: "dsm",        label: "DSM",        sublabel: "Elevation (terrain colormap)",   url: dsmPreviewUrl,        accent: "text-cyan"    },
    { key: "hillshade",  label: "Hillshade",  sublabel: "Relief shading",                url: hillshadePreviewUrl,  accent: "text-purple"  },
    { key: "slope",      label: "Slope",      sublabel: "Steepness (plasma)",            url: slopePreviewUrl,      accent: "text-amber"   },
    { key: "dtm",        label: "DTM",        sublabel: "Bare-earth (terrain colormap)", url: dtmPreviewUrl,        accent: "text-emerald" },
    { key: "ndsm",       label: "nDSM",       sublabel: "Building heights (yellow→red)", url: ndsmPreviewUrl,       accent: "text-rose"    },
    { key: "confidence", label: "Confidence", sublabel: "Red=low → Green=high",          url: confidencePreviewUrl, accent: "text-faint"   },
  ].filter((t) => !!t.url);

  if (tiles.length === 0) return null;

  return (
    <>
      <div className="glass rounded-2xl p-4">
        <div className="mb-3 flex items-center gap-2">
          <Map className="h-3.5 w-3.5 text-cyan" />
          <p className="font-mono text-2xs uppercase tracking-[0.18em] text-cyan">Pipeline outputs</p>
        </div>
        <h3 className="text-base font-semibold text-primary">Product maps</h3>
        <p className="mt-1 text-xs text-muted">Click any map to expand · all layers from your TIFF</p>

        <div className="mt-3 flex gap-2.5 overflow-x-auto pb-1 scrollbar-thin">
          {tiles.map((tile, i) => (
            <motion.button
              key={tile.key}
              onClick={() => setActive(tile)}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="group relative shrink-0 w-[120px] overflow-hidden rounded-xl border border-white/8 bg-elevated/60 transition-all hover:border-white/20 hover:shadow-lg cursor-pointer"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={tile.url}
                alt={tile.label}
                className="h-[80px] w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-black/0 transition-all group-hover:bg-black/30 flex items-center justify-center">
                <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white/90 text-xs font-medium">
                  Expand
                </span>
              </div>
              <div className="px-2 py-1.5">
                <p className={`font-mono text-xs font-bold truncate ${tile.accent}`}>{tile.label}</p>
                <p className="text-2xs text-faint truncate leading-tight">{tile.sublabel}</p>
              </div>
            </motion.button>
          ))}
        </div>
      </div>

      {active && <LightboxModal tile={active} onClose={() => setActive(null)} />}
    </>
  );
}
