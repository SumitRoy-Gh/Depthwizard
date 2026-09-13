"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import type { StageInfo } from "@/types/api";

function StageThumbnailCanvas({ stageIndex, seed }: { stageIndex: number; seed: number }) {
  const colors = ["#F59E0B", "#22D3EE", "#10B981", "#67E8F9", "#FCD34D", "#F59E0B", "#10B981", "#F59E0B"];
  const color = colors[stageIndex] ?? colors[0];
  return (
    <div
      className="h-full w-full bg-grid"
      style={{
        backgroundColor: `${color}18`,
        backgroundImage: `linear-gradient(${110 + (seed % 35)}deg, ${color}aa, transparent 65%), linear-gradient(145deg, transparent 45%, ${color}44 46%, transparent 48%)`,
      }}
    />
  );
}

export function StageThumbnail({
  stage,
  index,
}: {
  stage: StageInfo;
  index: number;
}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (stage.status === "complete") {
      const t = setTimeout(() => setShow(true), 200);
      return () => clearTimeout(t);
    }
  }, [stage.status]);

  const placeholderSeed = index * 7919 + 31;

  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-white/8 bg-elevated/60">
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, scale: 1.05 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="absolute inset-0"
          >
            <StageThumbnailCanvas stageIndex={index} seed={placeholderSeed} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Placeholder state */}
      {!show && (
        <div className="absolute inset-0 flex items-center justify-center">
          {stage.status === "running" ? (
            <div className="shimmer h-full w-full" />
          ) : stage.status === "pending" ? (
            <span className="font-mono text-2xs uppercase tracking-[0.16em] text-faint">
              waiting
            </span>
          ) : stage.status === "skipped" ? (
            <span className="font-mono text-2xs uppercase tracking-[0.16em] text-faint">
              skipped
            </span>
          ) : null}
        </div>
      )}

      {/* Overlay label */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-void via-void/80 to-transparent p-2">
        <p className="font-mono text-2xs uppercase tracking-[0.14em] text-muted">
          {stage.label}
        </p>
      </div>

      {/* Glow ring on complete */}
      {stage.status === "complete" && (
        <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-emerald/30" />
      )}
    </div>
  );
}