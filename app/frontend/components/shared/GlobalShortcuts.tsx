"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUpload } from "@/lib/jobs";
import { useHistory } from "@/store/history-store";
import { toast } from "@/components/shared/Toast";

export function GlobalShortcuts() {
  const router = useRouter();
  const upload = useUpload();
  const addHistory = useHistory((s) => s.add);

  useEffect(() => {
    const onPaste = async (e: ClipboardEvent) => {
      // Skip if focused in an input
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (!file) continue;
          e.preventDefault();
          try {
            const reader = new FileReader();
            const dataUrl = await new Promise<string>((res) => {
              reader.onload = () => res(reader.result as string);
              reader.readAsDataURL(file);
            });
            const result = await upload.mutateAsync(file);
            const isGeo = file.name.toLowerCase().endsWith(".tif") || file.name.toLowerCase().endsWith(".tiff");
            addHistory({
              jobId: result.jobId,
              filename: file.name || "pasted-image.png",
              thumbnailDataUrl: dataUrl,
              isGeoreferenced: isGeo,
              metric: isGeo,
              timestamp: Date.now(),
            });
            router.push(`/processing/${result.jobId}`);
            toast(`Pasted image → ${file.name || "image"}`, "cyan");
          } catch (err) {
            toast("Paste failed", "rose");
          }
          return;
        }
      }
    };

    const onKey = (e: KeyboardEvent) => {
      // "/" focuses the upload (only on home)
      if (e.key === "/" && window.location.pathname === "/") {
        const input = document.querySelector<HTMLInputElement>('input[type="file"]');
        if (input) {
          e.preventDefault();
          input.click();
        }
      }
    };

    window.addEventListener("paste", onPaste);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("keydown", onKey);
    };
  }, [router, upload, addHistory]);

  return null;
}