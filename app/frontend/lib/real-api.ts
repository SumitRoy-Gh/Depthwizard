// Real backend client — talks to the FastAPI service at NEXT_PUBLIC_API_BASE_URL.
// Activated by setting NEXT_PUBLIC_DEMO_MODE=false (see lib/jobs.ts for the swap).
// Contracts mirror types/api.ts (POST /ingest, GET /jobs/:id/status).

import type {
  JobStatus,
  UploadResult,
} from "@/types/api";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

function baseUrl(): string {
  return API_BASE.replace(/\/$/, "");
}

export async function uploadImage(file: File): Promise<UploadResult> {
  const form = new FormData();
  form.append("image", file);

  const res = await fetch(`${baseUrl()}/ingest`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Ingest failed (${res.status})${detail ? `: ${detail}` : ""}`
    );
  }
  return (await res.json()) as UploadResult;
}

export async function getJobStatus(jobId: string): Promise<JobStatus> {
  const res = await fetch(`${baseUrl()}/jobs/${encodeURIComponent(jobId)}/status`, {
    cache: "no-store",
  });

  if (res.status === 404) {
    throw new Error(`Job not found: ${jobId}`);
  }
  if (!res.ok) {
    throw new Error(`Status fetch failed (${res.status})`);
  }
  return (await res.json()) as JobStatus;
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
