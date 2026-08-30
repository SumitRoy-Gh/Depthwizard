"use client";

import { useHistory } from "@/store/history-store";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, MapPin, Hash } from "lucide-react";
import { useState } from "react";
import { Pill } from "@/components/shared/Pill";

export function RecentUploads() {
  const entries = useHistory((s) => s.entries);
  const [open, setOpen] = useState(true);

  if (entries.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-medium text-muted">
          <Clock className="h-4 w-4" />
          Recent runs
          <span className="font-mono text-2xs uppercase tracking-[0.16em] text-faint">
            this device
          </span>
        </h3>
        <button
          onClick={() => setOpen((v) => !v)}
          className="font-mono text-2xs uppercase tracking-[0.16em] text-faint hover:text-primary"
        >
          {open ? "Hide" : "Show"}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {entries.map((e) => (
                <Link
                  key={e.jobId}
                  href={`/results/${e.jobId}`}
                  className="group flex items-center gap-3 rounded-xl border border-white/8 bg-elevated/30 p-3 transition-all hover:border-cyan/30 hover:bg-elevated/60"
                >
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-white/5 bg-void">
                    {e.thumbnailDataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={e.thumbnailDataUrl}
                        alt={e.filename}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted">
                        <Hash className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-primary">{e.filename}</p>
                    <p className="font-mono text-2xs uppercase tracking-[0.14em] text-faint">
                      {new Date(e.timestamp).toLocaleString()}
                    </p>
                  </div>
                  <Pill tone={e.metric ? "emerald" : "amber"}>
                    {e.metric ? "Metric" : "Relative"}
                  </Pill>
                </Link>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}