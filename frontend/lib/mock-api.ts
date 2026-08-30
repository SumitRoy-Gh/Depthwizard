// Mock backend — used until the real API is wired.
// Returns deterministic but realistic-looking job statuses.

import type {
  JobMeta,
  JobStatus,
  StageInfo,
  StageId,
  UploadResult,
} from "@/types/api";

const STAGE_SEQUENCE: { id: StageId; index: number; label: string; description: string; durationMs: number }[] = [
  { id: "ingest", index: 1, label: "Ingest & Validate", description: "Reading metadata, CRS, GSD, and channel layout.", durationMs: 600 },
  { id: "radiometric", index: 2, label: "Radiometric Correction", description: "Percentile stretch to uint8, DAv2 RGB proxy.", durationMs: 900 },
  { id: "masking", index: 3, label: "Cloud & Shadow Masking", description: "Synthesizing the boolean valid_mask.", durationMs: 800 },
  { id: "noise", index: 4, label: "Noise Reduction", description: "Bilateral filter on imagery.", durationMs: 1200 },
  { id: "contrast", index: 5, label: "CLAHE Contrast", description: "Local histogram equalization, 8×8 tiles.", durationMs: 1100 },
  { id: "resolution", index: 6, label: "Resolution Handling", description: "Aligning to target GSD if known.", durationMs: 800 },
  { id: "dav2", index: 7, label: "Depth Estimation (DAv2)", description: "Frozen foundation model producing D_prior.", durationMs: 2400 },
];

const STAGE_UNET: (typeof STAGE_SEQUENCE)[number] = {
  id: "unet",
  index: 8,
  label: "Height Correction (U-Net)",
  description: "Calibrating relative depth → metric DSM.",
  durationMs: 1800,
};

const jobs = new Map<string, JobStatus>();
let jobCounter = 1;

function nowIso() {
  return new Date().toISOString();
}

export async function uploadImage(file: File): Promise<UploadResult> {
  await sleep(450);
  const jobId = `job_${(jobCounter++).toString().padStart(4, "0")}_${Math.random().toString(36).slice(2, 7)}`;
  const meta: JobMeta = {
    jobId,
    filename: file.name,
    width: 0,
    height: 0,
    isGeoreferenced: file.name.toLowerCase().endsWith(".tif") || file.name.toLowerCase().endsWith(".tiff"),
    metric: file.name.toLowerCase().endsWith(".tif") || file.name.toLowerCase().endsWith(".tiff"),
    createdAt: nowIso(),
    modelVariant: "vaihingen-multi-v1",
  };

  jobs.set(jobId, {
    jobId,
    meta,
    stages: STAGE_SEQUENCE.map((s) => ({
      ...s,
      status: "pending",
    })),
    overall: "queued",
  });

  return { jobId };
}

export async function getJobStatus(jobId: string): Promise<JobStatus> {
  await sleep(80);
  const job = jobs.get(jobId);
  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }

  const now = Date.now();
  const elapsedSinceStart =
    now - new Date(job.meta.createdAt).getTime();

  // Simulate progression
  let accumulated = 0;
  let prevStatus = job.overall;
  job.overall = "running";

  for (const stage of job.stages) {
    if (stage.status === "complete" || stage.status === "skipped") continue;
    accumulated += (stage as any).durationMs ?? 1000;
    if (elapsedSinceStart >= accumulated) {
      stage.status = "complete";
      stage.startedAt ??= nowIso();
      stage.completedAt = nowIso();
    } else {
      stage.status = "running";
      stage.startedAt ??= nowIso();
      break;
    }
  }

  // After all 7 stages, run U-Net
  const allBaseDone = job.stages.every((s) => s.status === "complete" || s.status === "skipped");
  if (allBaseDone) {
    const unet = job.stages.find((s) => s.id === "unet");
    if (!unet) {
      job.stages.push({ ...STAGE_UNET, status: "pending" });
    } else if (unet.status !== "complete") {
      accumulated += STAGE_UNET.durationMs;
      if (elapsedSinceStart >= accumulated) {
        unet.status = "complete";
        unet.startedAt = unet.startedAt ?? nowIso();
        unet.completedAt = nowIso();
      } else {
        unet.status = "running";
        unet.startedAt ??= nowIso();
      }
    }
  }

  const allComplete = job.stages.every((s) => s.status === "complete" || s.status === "skipped");
  if (allComplete) {
    job.overall = "complete";
    job.meta.completedAt = nowIso();
    job.meta.totalDurationMs = elapsedSinceStart;
    job.artifacts = {
      meshUrl: "/api/mock/mesh.glb",
      heightmapUrl: "/api/mock/heightmap.png",
      geotiffUrl: job.meta.metric ? "/api/mock/result.tif" : undefined,
      pdfUrl: "/api/mock/report.pdf",
      rawDepthUrl: "/api/mock/raw-depth.png",
      correctedDepthUrl: "/api/mock/corrected-depth.png",
      metadataUrl: "/api/mock/metadata.json",
    };
  }

  if (prevStatus === "running" && job.overall === "complete") {
    // Just finished
  }

  // Compute ETA after stage 2
  const completedCount = job.stages.filter((s) => s.status === "complete").length;
  if (completedCount >= 2 && job.overall === "running") {
    const totalDuration = STAGE_SEQUENCE.reduce((sum, s) => sum + s.durationMs, 0) + STAGE_UNET.durationMs;
    const remaining = Math.max(0, totalDuration - elapsedSinceStart);
    job.etaSeconds = Math.round(remaining / 1000);
  }

  return job;
}

export function listStages(): StageInfo[] {
  return STAGE_SEQUENCE.map((s) => ({ ...s, status: "pending" }));
}

function sleep(ms: number) {
  return new Promise<void>((res) => setTimeout(res, ms));
}