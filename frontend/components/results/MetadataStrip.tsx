"use client";

import type { JobMeta } from "@/types/api";

export function MetadataStrip({ meta }: { meta: JobMeta }) {
  const items = [
    { label: "CRS", value: meta.crs ?? "—", tone: meta.isGeoreferenced ? "emerald" : "amber" },
    { label: "GSD", value: meta.gsdM ? `${(meta.gsdM * 100).toFixed(1)} cm/px` : "—", tone: meta.gsdM ? "primary" : "amber" },
    { label: "Size", value: meta.width && meta.height ? `${meta.width} × ${meta.height}` : "—", tone: "primary" },
    { label: "Variant", value: meta.modelVariant ?? "—", tone: "primary" },
    { label: "Processed in", value: meta.totalDurationMs ? `${(meta.totalDurationMs / 1000).toFixed(1)}s` : "—", tone: "primary" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 rounded-2xl border border-white/8 bg-elevated/40 p-4 backdrop-blur md:grid-cols-5">
      {items.map((item) => (
        <div key={item.label}>
          <p className="font-mono text-2xs uppercase tracking-[0.16em] text-faint">{item.label}</p>
          <p
            className={`mt-1 font-mono text-sm tabular-nums ${
              item.tone === "emerald"
                ? "text-emerald"
                : item.tone === "amber"
                ? "text-amber"
                : "text-primary"
            }`}
          >
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}