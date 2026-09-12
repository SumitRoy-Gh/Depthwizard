"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getJobStatus as getMockJobStatus, uploadImage as mockUpload } from "@/lib/mock-api";
import { getJobStatus as getRealJobStatus, uploadImage as realUpload } from "@/lib/real-api";
import type { UploadResult } from "@/types/api";

/* Swap point between the deterministic mock backend and the real FastAPI
   service. Demo mode is the default; set NEXT_PUBLIC_DEMO_MODE=false plus
   NEXT_PUBLIC_API_BASE_URL to talk to the actual backend. */
const DEMO = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";

const uploadImage = DEMO ? mockUpload : realUpload;
const getJobStatusImpl = DEMO ? getMockJobStatus : getRealJobStatus;

export function useUpload() {
  const qc = useQueryClient();
  return useMutation<UploadResult, Error, File>({
    mutationFn: (file) => uploadImage(file),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["job", result.jobId] });
    },
  });
}

export function useJobStatus(jobId: string | null) {
  return useQuery({
    queryKey: ["job", jobId],
    queryFn: () => getJobStatusImpl(jobId!),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 1500;
      if (data.overall === "complete" || data.overall === "failed") return false;
      return 1200;
    },
    refetchIntervalInBackground: false,
    staleTime: 0,
  });
}