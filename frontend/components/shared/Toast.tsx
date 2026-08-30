"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import { cn } from "@/lib/cn";

type ToastTone = "cyan" | "amber" | "emerald" | "rose";

interface ToastEntry {
  id: number;
  message: string;
  tone: ToastTone;
}

let counter = 0;
const listeners = new Set<(t: ToastEntry) => void>();

export function toast(message: string, tone: ToastTone = "cyan") {
  const entry: ToastEntry = { id: ++counter, message, tone };
  listeners.forEach((l) => l(entry));
}

const toneStyles: Record<ToastTone, string> = {
  cyan: "border-cyan/30 bg-cyan/10 text-cyan",
  amber: "border-amber/30 bg-amber/10 text-amber",
  emerald: "border-emerald/30 bg-emerald/10 text-emerald",
  rose: "border-rose/30 bg-rose/10 text-rose",
};

const toneIcon = {
  cyan: Info,
  amber: AlertTriangle,
  emerald: CheckCircle2,
  rose: AlertTriangle,
};

export function ToastViewport() {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  useEffect(() => {
    const onAdd = (t: ToastEntry) => {
      setToasts((prev) => [...prev, t]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== t.id));
      }, 4000);
    };
    listeners.add(onAdd);
    return () => {
      listeners.delete(onAdd);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex flex-col gap-2">
      <AnimatePresence>
        {toasts.map((t) => {
          const Icon = toneIcon[t.tone];
          return (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 40, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 320, damping: 26 }}
              className={cn(
                "pointer-events-auto flex items-center gap-3 rounded-xl border px-4 py-2.5 backdrop-blur-md shadow-lg",
                toneStyles[t.tone]
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="text-sm font-medium text-primary">{t.message}</span>
              <button
                onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
                className="text-muted hover:text-primary"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}