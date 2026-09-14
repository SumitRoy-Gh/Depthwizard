// Real backend client — talks to the FastAPI service at NEXT_PUBLIC_API_BASE_URL.
// Activated by setting NEXT_PUBLIC_DEMO_MODE=false (see lib/jobs.ts for the swap).
// The backend runs synchronously, so this client caches a completed JobStatus
// to preserve the async shape consumed by the processing UI.

import type { JobStatus, UploadResult } from "@/types/api";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

function baseUrl(): string {
  return API_BASE.replace(/\/$/, "");
}

const completedJobs = new Map<string, JobStatus>();

interface ProcessResponse {
  status: string;
  job_id: string;
  products: {
    dsm?: string;
    ndsm?: string;
    dtm?: string;
    slope?: string;
    hillshade?: string;
    confidence?: string;
    // Disaster risk overlays (Part B)
    flood_risk_png?: string;
    quake_risk_png?: string;
    risk_zones_json?: string;
  };
  scene_manifest?: string;
  viewer_url?: string;
  meta?: {
    width?: number;
    height?: number;
    crs?: string | null;
    gsd_m?: number;
    is_georeferenced?: boolean;
  };
}

const SESSION_KEY = "depthwizard-jobs";

function saveJob(job: JobStatus): void {
  completedJobs.set(job.jobId, job);
  try {
    const stored = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "{}") as Record<string, JobStatus>;
    stored[job.jobId] = job;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(stored));
  } catch {
    // The in-memory cache still supports the current navigation flow.
  }
}

function loadJob(jobId: string): JobStatus | undefined {
  const cached = completedJobs.get(jobId);
  if (cached) return cached;
  try {
    const stored = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "{}") as Record<string, JobStatus>;
    const job = stored[jobId];
    if (job) completedJobs.set(jobId, job);
    return job;
  } catch {
    return undefined;
  }
}

export async function uploadImage(file: File): Promise<UploadResult> {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(`${baseUrl()}/process`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Processing failed (${res.status})${detail ? `: ${detail}` : ""}`
    );
  }

  const data = (await res.json()) as ProcessResponse;
  const nowIso = new Date().toISOString();
  const isGeoreferenced = data.meta?.is_georeferenced ?? Boolean(data.meta?.crs);
  saveJob({
    jobId: data.job_id,
    meta: {
      jobId: data.job_id,
      filename: file.name,
      width: data.meta?.width ?? 0,
      height: data.meta?.height ?? 0,
      isGeoreferenced,
      crs: data.meta?.crs,
      gsdM: data.meta?.gsd_m,
      metric: isGeoreferenced,
      createdAt: nowIso,
      completedAt: nowIso,
    },
    stages: [
      ["ingest", "Input & auto-route"],
      ["radiometric", "Radiometric correction"],
      ["masking", "Cloud & shadow masking"],
      ["noise", "Noise reduction"],
      ["dav2", "Depth estimation"],
      ["unet", "Calibration & refinement"],
      ["stitch", "Products & 3D scene"],
    ].map(([id, label], index) => ({
      id: id as JobStatus["stages"][number]["id"],
      index: index + 1,
      label,
      description: "Completed by the synchronous backend pipeline.",
      status: "complete" as const,
    })),
    overall: "complete",
    artifacts: {
      heightmapUrl: data.products?.dsm ? `${baseUrl()}${data.products.dsm}` : undefined,
      geotiffUrl: isGeoreferenced && data.products?.dsm ? `${baseUrl()}${data.products.dsm}` : undefined,
      ndsmUrl: data.products?.ndsm ? `${baseUrl()}${data.products.ndsm}` : undefined,
      dtmUrl: data.products?.dtm ? `${baseUrl()}${data.products.dtm}` : undefined,
      slopeUrl: data.products?.slope ? `${baseUrl()}${data.products.slope}` : undefined,
      hillshadeUrl: data.products?.hillshade ? `${baseUrl()}${data.products.hillshade}` : undefined,
      confidenceUrl: data.products?.confidence ? `${baseUrl()}${data.products.confidence}` : undefined,
      meshUrl: data.viewer_url ? `${baseUrl()}${data.viewer_url}` : undefined,
      metadataUrl: data.scene_manifest ? `${baseUrl()}${data.scene_manifest}` : undefined,
      // Disaster risk overlays (Part B)
      floodRiskUrl: data.products?.flood_risk_png ? `${baseUrl()}${data.products.flood_risk_png}` : undefined,
      quakeRiskUrl: data.products?.quake_risk_png ? `${baseUrl()}${data.products.quake_risk_png}` : undefined,
      riskZonesUrl: data.products?.risk_zones_json ? `${baseUrl()}${data.products.risk_zones_json}` : undefined,
    },
  });

  return { jobId: data.job_id };
}

export async function getJobStatus(jobId: string): Promise<JobStatus> {
  const job = loadJob(jobId);
  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }
  return job;
}

/** Health probe used by the header "models online" badge in real mode. */
export async function isBackendUp(): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl()}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    return res.ok;
  } catch {
    return false;
  }
}
