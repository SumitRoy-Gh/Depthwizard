"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import {
  Image as ImageIcon,
  UploadCloud,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  X,
} from "lucide-react";
import { useUpload } from "@/lib/jobs";
import { useHistory } from "@/store/history-store";
import { cn } from "@/lib/cn";
import { Pill } from "@/components/shared/Pill";

const SUPPORTED = [".tif", ".tiff", ".png", ".jpg", ".jpeg"];
const MAX_SIZE_MB = 200;

export function DropZone() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOver, setIsOver] = useState(false);
  const [picked, setPicked] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const upload = useUpload();
  const addHistory = useHistory((s) => s.add);

  const handleFile = useCallback((file: File | undefined | null) => {
    setError(null);
    if (!file) return;

    const ext = "." + (file.name.split(".").pop() || "").toLowerCase();
    if (!SUPPORTED.includes(ext)) {
      setError(`Unsupported format. Use ${SUPPORTED.join(" / ")}.`);
      return;
    }
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > MAX_SIZE_MB) {
      setError(`File is ${sizeMB.toFixed(0)} MB — uploads > ${MAX_SIZE_MB} MB may take longer.`);
    }
    setPicked(file);
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target?.result as string);
    if (file.type.startsWith("image/")) reader.readAsDataURL(file);
    else setPreview(null);
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsOver(false);
    handleFile(e.dataTransfer.files?.[0]);
  };

  const onSubmit = async () => {
    if (!picked) return;
    try {
      const result = await upload.mutateAsync(picked);
      const isGeo = picked.name.toLowerCase().endsWith(".tif") || picked.name.toLowerCase().endsWith(".tiff");
      addHistory({
        jobId: result.jobId,
        filename: picked.name,
        thumbnailDataUrl: preview ?? undefined,
        isGeoreferenced: isGeo,
        metric: isGeo,
        timestamp: Date.now(),
      });
      router.push(`/processing/${result.jobId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    }
  };

  if (picked && preview) {
    return <PreviewCard file={picked} preview={preview} error={error} onClear={() => { setPicked(null); setPreview(null); setError(null); }} onSubmit={onSubmit} submitting={upload.isPending} />;
  }

  if (picked && !preview) {
    return (
      <div className="glass rounded-2xl p-8 text-center">
        <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-cyan/10 text-cyan">
          <ImageIcon className="h-6 w-6" />
        </div>
        <p className="font-medium text-primary">{picked.name}</p>
        <p className="mt-1 font-mono text-2xs uppercase tracking-[0.16em] text-faint">
          {(picked.size / 1024 / 1024).toFixed(2)} MB · ready
        </p>
        {error && (
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-amber/30 bg-amber/10 px-3 py-1 text-xs text-amber">
            <AlertTriangle className="h-3.5 w-3.5" /> {error}
          </p>
        )}
        <div className="mt-6 flex items-center justify-center gap-2">
          <button onClick={() => { setPicked(null); setError(null); }} className="rounded-full border border-white/10 px-4 py-2 text-sm text-muted hover:text-primary">
            Choose another
          </button>
          <button onClick={onSubmit} disabled={upload.isPending} className="btn-aurora rounded-full border border-cyan/40 bg-cyan/15 px-6 py-2 text-sm font-medium text-cyan shadow-glow hover:bg-cyan/25">
            {upload.isPending ? "Uploading…" : "Generate Height Model"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setIsOver(true); }}
      onDragLeave={() => setIsOver(false)}
      onDrop={onDrop}
      className={cn(
        "group relative isolate overflow-hidden rounded-3xl border transition-all duration-500",
        isOver
          ? "border-cyan/60 shadow-glow"
          : "border-white/8 hover:border-cyan/30 hover:shadow-glow"
      )}
    >
      {/* Animated gradient border highlight */}
      <div className={cn(
        "absolute -inset-px -z-10 rounded-3xl bg-gradient-to-r from-cyan/20 via-emerald/20 to-amber/20 opacity-0 transition-opacity duration-500",
        isOver ? "opacity-100" : "group-hover:opacity-60"
      )} />

      {/* Scan line */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-3xl opacity-50">
        <div className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan to-transparent animate-scan" />
      </div>

      {/* Grid texture */}
      <div className="absolute inset-0 -z-10 bg-grid opacity-30" />

      <div className="relative flex flex-col items-center px-8 py-16 text-center">
        <motion.div
          animate={{ y: isOver ? -6 : 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          className="relative mb-6"
        >
          <div className="absolute inset-0 animate-pulse-glow rounded-full bg-cyan/30 blur-xl" />
          <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl border border-cyan/30 bg-cyan/10 text-cyan shadow-glow">
            <UploadCloud className="h-9 w-9" strokeWidth={1.5} />
            <Sparkles className="absolute -right-2 -top-2 h-5 w-5 text-amber" strokeWidth={1.5} />
          </div>
        </motion.div>

        <h3 className="text-2xl font-semibold tracking-tight text-primary">
          {isOver ? "Release to analyze" : "Drop an overhead image"}
        </h3>
        <p className="mt-2 max-w-md text-sm text-muted">
          One frame becomes a 3D height model in under two minutes.
          Tiles are processed entirely on your local GPU cluster — no signup.
        </p>

        <input
          ref={inputRef}
          type="file"
          accept={SUPPORTED.join(",")}
          className="sr-only"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => inputRef.current?.click()}
            className="btn-aurora rounded-full border border-cyan/40 bg-cyan/15 px-6 py-2.5 text-sm font-medium text-cyan shadow-glow transition-all hover:bg-cyan/25"
          >
            Browse files
          </button>
          <kbd className="hidden items-center gap-1 rounded-md border border-white/10 bg-elevated/60 px-2 py-1 font-mono text-2xs uppercase tracking-[0.16em] text-muted md:inline-flex">
            <span>⌘ V</span>
            <span className="text-faint">paste</span>
          </kbd>
          <span className="font-mono text-2xs uppercase tracking-[0.16em] text-faint">
            or drop
          </span>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
          {SUPPORTED.map((ext) => (
            <span
              key={ext}
              className="rounded-md border border-white/8 bg-elevated/40 px-2 py-1 font-mono text-2xs uppercase tracking-[0.14em] text-muted"
            >
              {ext}
            </span>
          ))}
        </div>

        {error && (
          <p className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-rose/30 bg-rose/10 px-3 py-1 text-xs text-rose">
            <AlertTriangle className="h-3.5 w-3.5" /> {error}
          </p>
        )}
      </div>
    </div>
  );
}

function PreviewCard({
  file,
  preview,
  error,
  onClear,
  onSubmit,
  submitting,
}: {
  file: File;
  preview: string;
  error: string | null;
  onClear: () => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  const isGeo = file.name.toLowerCase().endsWith(".tif") || file.name.toLowerCase().endsWith(".tiff");
  const sizeMB = (file.size / 1024 / 1024).toFixed(2);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 280, damping: 24 }}
      className="glass-strong overflow-hidden rounded-2xl"
    >
      <div className="grid gap-0 md:grid-cols-[260px_1fr]">
        {/* Thumbnail */}
        <div className="relative aspect-square overflow-hidden border-r border-white/5 bg-elevated">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt={file.name}
            className="h-full w-full object-cover"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-void/40 via-transparent to-transparent" />
          <button
            onClick={onClear}
            className="absolute right-2 top-2 rounded-full bg-void/80 p-1.5 text-muted backdrop-blur transition-colors hover:text-primary"
            aria-label="Remove"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Details */}
        <div className="flex flex-col gap-4 p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-primary">{file.name}</p>
              <p className="mt-1 font-mono text-2xs uppercase tracking-[0.16em] text-faint">
                {sizeMB} MB · {SUPPORTED.includes("." + (file.name.split(".").pop() || "").toLowerCase()) ? "format OK" : "—"}
              </p>
            </div>
            <Pill tone={isGeo ? "emerald" : "amber"} pulse>
              {isGeo ? "Georeferenced" : "Not georeferenced"}
            </Pill>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Stat label="Format" value={(file.name.split(".").pop() || "").toUpperCase()} />
            <Stat label="Size" value={`${sizeMB} MB`} />
            <Stat label="Scale" value={isGeo ? "Metric" : "Relative"} />
          </div>

          <div className="rounded-xl border border-white/5 bg-void/40 p-3">
            <p className="text-xs leading-relaxed text-muted">
              {isGeo
                ? "Heights will be reported in metric units (meters) using the source GSD. GeoTIFF export will be available."
                : "Heights will be reported as relative values — no ground-truth GSD. GeoTIFF export will be disabled."}
            </p>
          </div>

          {error && (
            <p className="inline-flex items-center gap-1.5 rounded-full border border-amber/30 bg-amber/10 px-3 py-1 text-xs text-amber self-start">
              <AlertTriangle className="h-3.5 w-3.5" /> {error}
            </p>
          )}

          <div className="mt-auto flex items-center gap-2">
            <button
              onClick={onClear}
              className="rounded-full border border-white/10 px-4 py-2 text-sm text-muted hover:text-primary"
            >
              Replace
            </button>
            <button
              onClick={onSubmit}
              disabled={submitting}
              className="btn-aurora group/cta flex flex-1 items-center justify-center gap-2 rounded-full border border-cyan/40 bg-cyan/15 px-6 py-2.5 text-sm font-medium text-cyan shadow-glow transition-all hover:bg-cyan/25 hover:shadow-[0_0_32px_-4px_rgba(34,211,238,0.6)] disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-cyan border-t-transparent" />
                  Uploading…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Generate Height Model
                  <span className="font-mono text-2xs uppercase tracking-[0.16em] text-cyan/70">⏎</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/5 bg-elevated/40 px-2.5 py-1.5">
      <p className="font-mono text-2xs uppercase tracking-[0.14em] text-faint">{label}</p>
      <p className="mt-0.5 truncate font-mono text-xs text-primary">{value}</p>
    </div>
  );
}