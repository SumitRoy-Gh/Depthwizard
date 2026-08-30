"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Activity, Cpu, Globe2, Layers3 } from "lucide-react";
import { Pill } from "@/components/shared/Pill";

export function LiveTelemetryStrip() {
  const [latency, setLatency] = useState(127);
  const [throughput, setThroughput] = useState(48);
  const [activeJobs, setActiveJobs] = useState(3);

  useEffect(() => {
    const id = setInterval(() => {
      setLatency((v) => Math.max(85, Math.min(180, v + (Math.random() - 0.5) * 12)));
      setThroughput((v) => Math.max(20, Math.min(96, v + (Math.random() - 0.5) * 6)));
      setActiveJobs((v) => Math.max(1, Math.min(8, v + (Math.random() > 0.7 ? (Math.random() > 0.5 ? 1 : -1) : 0))));
    }, 1400);
    return () => clearInterval(id);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.1 }}
      className="mx-auto flex w-fit items-center gap-1 rounded-full border border-white/8 bg-elevated/60 px-2 py-1 backdrop-blur"
    >
      <Pill tone="emerald" pulse className="border-0 bg-transparent">
        <span className="text-emerald">Live</span>
      </Pill>
      <Tel icon={<Cpu className="h-3 w-3" />} label="p50" value={`${Math.round(latency)}ms`} />
      <Sep />
      <Tel icon={<Activity className="h-3 w-3" />} label="tok/s" value={`${throughput.toFixed(1)}`} />
      <Sep />
      <Tel icon={<Globe2 className="h-3 w-3" />} label="regions" value="12" />
      <Sep />
      <Tel icon={<Layers3 className="h-3 w-3" />} label="active" value={`${activeJobs}`} />
    </motion.div>
  );
}

function Tel({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-0.5">
      <span className="text-muted">{icon}</span>
      <span className="font-mono text-2xs uppercase tracking-[0.14em] text-faint">{label}</span>
      <motion.span
        key={value}
        initial={{ opacity: 0, y: -3 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="font-mono text-2xs tabular-nums text-primary"
      >
        {value}
      </motion.span>
    </div>
  );
}

function Sep() {
  return <span className="h-3 w-px bg-white/10" />;
}