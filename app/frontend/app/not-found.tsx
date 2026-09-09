"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";

export default function NotFound() {
  return (
    <div className="relative mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="font-mono text-7xl font-semibold tabular-nums text-cyan"
      >
        404
      </motion.div>
      <motion.h1
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="mt-4 text-2xl font-semibold text-primary"
      >
        Off the grid
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mt-2 text-sm text-muted"
      >
        That page doesn’t exist or the job has expired.
      </motion.p>
      <Link
        href="/"
        className="btn-aurora mt-6 inline-flex items-center gap-2 rounded-full border border-cyan/40 bg-cyan/15 px-5 py-2.5 text-sm font-medium text-cyan shadow-glow"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to studio
      </Link>
    </div>
  );
}