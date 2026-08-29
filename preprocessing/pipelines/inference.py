"""
inference_pipeline.py — the inference-time equivalent of build_dataset.py.

Orchestrates preprocessing for a SINGLE uploaded image (no DSM).
This is the production path: user uploads one .tif/.png/.jpg → this
module preprocesses it → hands it to DAv2 + Correction U-Net for
depth prediction.

The preprocessing stages are the same as training, minus DSM-specific
steps (no DSM denoising, no DSM normalization — the DSM is the OUTPUT):

  1. Radiometric Correction — percentile stretch to uint8 + DAv2 RGB proxy
  2. Cloud/Shadow Masking — compute valid_mask
  3. Noise Reduction — bilateral denoise (imagery only)
  4. Contrast Enhancement — CLAHE
  5. Resolution Handling — resample to target GSD (if GSD is known)
  6. Data Normalization — Z-score normalize using SAVED training stats

For large images, this module integrates with large_image_tiling.py
for memory-safe windowed processing + feathered stitching.
"""
from __future__ import annotations
import numpy as np
from pathlib import Path

from preprocessing.ingest.inference import load_inference_image, get_effective_gsd, InferenceImageMeta
from preprocessing.stages.radiometric_correction import radiometric_correction_pipeline, stretch_multiband
from preprocessing.stages.cloud_shadow_masking import compute_valid_mask
from preprocessing.stages.noise_reduction import denoise_imagery
from preprocessing.stages.contrast_enhancement import enhance_contrast
from preprocessing.stages.resolution_handling import resample_to_gsd
from preprocessing.stages.data_normalisation import normalize_image, ChannelStats


def preprocess_for_inference(
    image: np.ndarray,
    meta: InferenceImageMeta,
    target_gsd_m: float | None = None,
    imagery_stats: ChannelStats | None = None,
    verbose: bool = True,
) -> dict[str, np.ndarray | InferenceImageMeta]:
    """
    Full inference preprocessing pipeline for a single image.

    Parameters
    ----------
    image : (H, W, C) array — raw pixel values from ingest_inference
    meta : InferenceImageMeta from the ingest step
    target_gsd_m : target GSD to resample to. If None, no resampling.
    imagery_stats : pre-computed training dataset stats for Z-score
        normalization. If None, normalization is skipped (useful for
        quick previews or when feeding directly to DAv2 which has its
        own preprocessor).

    Returns
    -------
    dict with keys:
        "preprocessed" — the fully preprocessed (H, W, C) float32 array
        "dav2_input"   — the RGB-proxy uint8 array for the frozen DAv2 branch
        "valid_mask"   — boolean (H, W) mask
        "meta"         — updated InferenceImageMeta
    """
    def log(msg):
        if verbose:
            print(f"  [inference] {msg}")

    log(f"input: {image.shape} {image.dtype}, "
        f"geo={meta.is_georeferenced}, gsd={get_effective_gsd(meta)}")

    # Determine if we need the IR-R-G → R-G-G proxy path, or if the
    # input is already standard RGB (PNG/JPG uploads are always RGB)
    is_standard_rgb = not meta.is_georeferenced or image.dtype == np.uint8

    # Stage 1 — Radiometric Correction
    if is_standard_rgb and image.dtype == np.uint8:
        # Already uint8 RGB (PNG/JPG) — no stretch needed, just build proxy
        unet_input = image
        dav2_input = image.copy()  # Already RGB, no proxy conversion needed
        log("stage 1 (radiometric): input already uint8 RGB, skipping stretch")
    else:
        # Raw multi-band raster (GeoTIFF) — needs stretch + proxy
        corrected = radiometric_correction_pipeline(image)
        unet_input = corrected["unet_input"]
        dav2_input = corrected["dav2_input"]
        log(f"stage 1 (radiometric): stretched to uint8, "
            f"unet_input {unet_input.shape}, dav2_input {dav2_input.shape}")

    # Stage 2 — Cloud/Shadow Masking
    valid_mask = compute_valid_mask(unet_input)
    log(f"stage 2 (masking): valid fraction = {valid_mask.mean():.3f}")

    # Stage 3 — Noise Reduction (imagery only — no DSM at inference time)
    denoised = denoise_imagery(unet_input)
    log("stage 3 (noise reduction): bilateral denoise done")

    # Stage 4 — Contrast Enhancement (CLAHE)
    enhanced = enhance_contrast(denoised, valid_mask=valid_mask)
    log("stage 4 (contrast enhancement): CLAHE done")

    # Stage 5 — Resolution Handling (only if GSD is known and target differs)
    effective_gsd = get_effective_gsd(meta)
    if target_gsd_m is not None and effective_gsd is not None:
        if abs(effective_gsd - target_gsd_m) > 1e-6:
            enhanced = resample_to_gsd(
                enhanced, effective_gsd, target_gsd_m, categorical=False
            )
            valid_mask = resample_to_gsd(
                valid_mask.astype(np.uint8), effective_gsd, target_gsd_m,
                categorical=True
            ).astype(bool)
            log(f"stage 5 (resolution): resampled {effective_gsd:.4f}m → {target_gsd_m:.4f}m, "
                f"new shape {enhanced.shape[:2]}")
        else:
            log("stage 5 (resolution): GSD already at target, skipping")
    else:
        log("stage 5 (resolution): GSD unknown or no target, skipping resample")

    # Stage 6 — Data Normalization (only if training stats are provided)
    if imagery_stats is not None:
        preprocessed = normalize_image(enhanced, imagery_stats)
        log("stage 6 (normalization): Z-score normalized with training stats")
    else:
        preprocessed = enhanced.astype(np.float32)
        log("stage 6 (normalization): skipped (no training stats provided)")

    return {
        "preprocessed": preprocessed,
        "dav2_input": dav2_input,
        "valid_mask": valid_mask,
        "meta": meta,
    }


def load_and_preprocess(
    image_path: str,
    user_gsd_m: float | None = None,
    target_gsd_m: float | None = None,
    imagery_stats: ChannelStats | None = None,
    verbose: bool = True,
) -> dict:
    """
    Convenience function: load a single image from disk and run the
    full inference preprocessing pipeline.

    This is the top-level call matching the architecture diagram's
    "User uploads a .tif/.png/.jpg" → preprocessing → ready for model.
    """
    image, meta = load_inference_image(image_path, user_gsd_m=user_gsd_m)
    return preprocess_for_inference(
        image, meta,
        target_gsd_m=target_gsd_m,
        imagery_stats=imagery_stats,
        verbose=verbose,
    )
