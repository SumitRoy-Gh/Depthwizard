"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2, Clock, ArrowRight } from "lucide-react";
import { useHistory } from "@/store/history-store";
import { Pill } from "@/components/shared/Pill";

export default function HistoryPage() {
  const entries = useHistory((s) => s.entries);
  const clear = useHistory((s) => s.clear);
  const remove = useHistory((s) => s.remove);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="relative mx-auto max-w-6xl px-6 py-12">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 flex flex-wrap items-end justify-between gap-3"
      >
        <div>
          <p className="font-mono text-2xs uppercase tracking-[0.18em] text-cyan">History</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-primary md:text-4xl">
            Recent runs
          </h1>
          <p className="mt-2 text-sm text-muted">
            Session-scoped — stored in your browser. No account, no server.
          </p>
        </div>

        {entries.length > 0 && (
          <button
            onClick={() => setConfirming(true)}
            className="flex items-center gap-2 rounded-full border border-rose/30 bg-rose/5 px-4 py-2 text-sm text-rose transition-colors hover:bg-rose/10"
          >
            <Trash2 className="h-4 w-4" />
            Clear history
          </button>
        )}
      </motion.div>

      <AnimatePresence>
        {confirming && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-void/80 backdrop-blur"
            onClick={() => setConfirming(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="glass-strong max-w-md rounded-2xl p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-primary">Clear history?</h3>
              <p className="mt-2 text-sm text-muted">
                This removes all {entries.length} {entries.length === 1 ? "entry" : "entries"} from this device. This cannot be undone.
              </p>
              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  onClick={() => setConfirming(false)}
                  className="rounded-full border border-white/10 px-4 py-2 text-sm text-muted hover:text-primary"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    clear();
                    setConfirming(false);
                  }}
                  className="rounded-full border border-rose/40 bg-rose/15 px-4 py-2 text-sm text-rose hover:bg-rose/25"
                >
                  Clear all
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {entries.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((e, i) => (
            <motion.div
              key={e.jobId}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="group relative"
            >
              <Link
                href={`/results/${e.jobId}`}
                className="block overflow-hidden rounded-2xl border border-white/8 bg-elevated/30 transition-all hover:border-cyan/30 hover:shadow-glow"
              >
                <div className="relative aspect-[4/3] overflow-hidden bg-void">
                  {e.thumbnailDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={e.thumbnailDataUrl}
                      alt={e.filename}
                      className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-elevated to-void">
                      <Clock className="h-8 w-8 text-muted" />
                    </div>
                  )}
                  <div className="absolute right-2 top-2">
                    <Pill tone={e.metric ? "emerald" : "amber"}>
                      {e.metric ? "Metric" : "Relative"}
                    </Pill>
                  </div>
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-void via-void/40 to-transparent" />
                </div>
                <div className="flex items-center justify-between gap-2 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-primary">{e.filename}</p>
                    <p className="mt-0.5 font-mono text-2xs uppercase tracking-[0.14em] text-faint">
                      {new Date(e.timestamp).toLocaleString()}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-cyan" />
                </div>
              </Link>
              <button
                onClick={(ev) => {
                  ev.stopPropagation();
                  remove(e.jobId);
                }}
                className="absolute right-2 top-2 hidden rounded-full bg-void/70 p-1.5 text-muted backdrop-blur transition-colors hover:text-rose group-hover:block"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-strong mx-auto max-w-md rounded-2xl p-10 text-center"
    >
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-cyan/10 text-cyan">
        <Clock className="h-7 w-7" />
      </div>
      <h2 className="mt-4 text-lg font-semibold text-primary">No runs yet</h2>
      <p className="mt-2 text-sm text-muted">
        Once you upload an image, your recent runs will appear here. Sessions are stored in this browser only.
      </p>
      <Link
        href="/"
        className="btn-aurora mt-6 inline-flex items-center gap-2 rounded-full border border-cyan/40 bg-cyan/15 px-5 py-2 text-sm font-medium text-cyan shadow-glow"
      >
        Start a run
        <ArrowRight className="h-4 w-4" />
      </Link>
    </motion.div>
  );
}