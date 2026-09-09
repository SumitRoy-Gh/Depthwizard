"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getJobStatus, uploadImage } from "@/lib/mock-api";
import type { UploadResult } from "@/types/api";

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
    queryFn: () => getJobStatus(jobId!),
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