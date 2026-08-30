// API types mirroring the DepthWizard backend.

export type StageId =
  | "ingest"
  | "radiometric"
  | "masking"
  | "noise"
  | "contrast"
  | "resolution"
  | "tiling"
  | "dav2"
  | "unet"
  | "stitch";

export type StageStatus = "pending" | "running" | "complete" | "skipped" | "failed";

export interface StageInfo {
  id: StageId;
  index: number; // 1..7 for the visible stepper
  label: string;
  description: string;
  status: StageStatus;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  reason?: string; // plain-language failure reason
  artifactUrl?: string; // thumbnail URL
}

export interface JobMeta {
  jobId: string;
  filename: string;
  width: number;
  height: number;
  isGeoreferenced: boolean;
  crs?: string | null;
  gsdM?: number | null;
  metric: boolean; // = isGeoreferenced && we can produce metric output
  createdAt: string;
  completedAt?: string;
  totalDurationMs?: number;
  modelVariant?: string;
}

export interface JobStatus {
  jobId: string;
  meta: JobMeta;
  stages: StageInfo[];
  overall: "queued" | "running" | "complete" | "failed";
  etaSeconds?: number;
  artifacts?: {
    meshUrl?: string;
    heightmapUrl?: string;
    geotiffUrl?: string;
    pdfUrl?: string;
    rawDepthUrl?: string;
    correctedDepthUrl?: string;
    metadataUrl?: string;
  };
}

export interface UploadResult {
  jobId: string;
}

export interface HistoryEntry {
  jobId: string;
  filename: string;
  thumbnailDataUrl?: string;
  isGeoreferenced: boolean;
  metric: boolean;
  timestamp: number;
}