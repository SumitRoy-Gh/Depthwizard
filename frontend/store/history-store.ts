"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { HistoryEntry } from "@/types/api";

interface HistoryState {
  entries: HistoryEntry[];
  add: (e: HistoryEntry) => void;
  remove: (jobId: string) => void;
  clear: () => void;
}

export const useHistory = create<HistoryState>()(
  persist(
    (set) => ({
      entries: [],
      add: (e) =>
        set((s) => ({ entries: [e, ...s.entries.filter((x) => x.jobId !== e.jobId)].slice(0, 10) })),
      remove: (jobId) =>
        set((s) => ({ entries: s.entries.filter((x) => x.jobId !== jobId) })),
      clear: () => set({ entries: [] }),
    }),
    { name: "depthwizard-history", version: 1 }
  )
);