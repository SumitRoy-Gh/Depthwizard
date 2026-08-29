"""
build_dataset.py — wires the seven preprocessing stages into one ordered
pipeline and runs it on a SINGLE scene at a time.

Order (fixed — each stage's docstring explains why it can't be reordered):

  1. radiometric_correction  — 16-bit -> 8-bit stretch, DAv2 RGB proxy
  2. cloud_shadow_masking    — compute valid_mask from the corrected imagery
  3. noise_reduction         — denoise imagery (bilateral) and DSM (median),
                                 using valid_mask so masked pixels don't
                                 pollute neighbors during filtering
  4. contrast_enhancement    — CLAHE for local contrast recovery
  5. resolution_handling     — resample imagery/DSM/mask to one common GSD
  6. tiling                  — crop into fixed-size training patches
  7. data_normalization      — dataset-level stats for imagery,
                                 per-patch stats for depth

WHY THIS ORDER SPECIFICALLY:
  - Correction must run before masking, because shadow/cloud detection
    needs stretched, comparably-scaled brightness values, not raw 11-bit
    counts sitting in mixed dynamic ranges.
  - Masking must run before denoising, because the median/bilateral
    filters use valid_mask to avoid smearing garbage nodata values into
    real neighboring pixels.
  - Denoising must run before resolution resampling, because resampling
    (zoom/interpolation) will happily blend noise into new pixel
    positions if it's not cleaned up first — you'd be baking noise into
    the resampled grid instead of removing it.
  - Resolution handling must run before tiling, because tile pixel
    coordinates only mean a fixed real-world footprint (needed for the
    train/test area-based split) once every source scene is on the same
    GSD.
  - Tiling must run before normalization, because dataset-level imagery
    stats are computed ACROSS patches (compute_dataset_stats takes a
    list of patches) — you need the patches to exist first.

This script processes ONE scene end-to-end and returns/saves the
resulting patches + fitted normalization stats. Running it over many
scenes means calling process_scene() once per scene, pooling ALL
patches from ALL scenes, then calling compute_dataset_stats ONCE on the
pooled set (not per scene) so imagery stats are truly dataset-level.
"""
from __future__ import annotations
import json
import numpy as np
from pathlib import Path
from dataclasses import asdict

from preprocessing.stages.radiometric_correction import radiometric_correction_pipeline
from preprocessing.stages.cloud_shadow_masking import compute_valid_mask
from preprocessing.stages.noise_reduction import denoise_imagery, denoise_dsm
from preprocessing.stages.contrast_enhancement import enhance_contrast
from preprocessing.stages.resolution_handling import align_dataset_to_common_gsd
from preprocessing.stages.tiling import crop_patches, split_by_area, Patch
from preprocessing.stages.data_normalisation import (
    compute_dataset_stats, normalize_image, normalize_depth_per_patch, ChannelStats,
)


def process_scene(
    raw_ir_r_g: np.ndarray,
    raw_dsm: np.ndarray,
    source_gsd_m: float,
    target_gsd_m: float = 0.09,
    tile_size: int = 512,
    stride: int | None = None,
    min_valid_fraction: float = 0.6,
    verbose: bool = True,
) -> list[Patch]:
    """
    Runs stages 1-5 on one full scene and returns the resulting list of
    Patch objects (imagery still band-native, DSM still in real units —
    stage 6 normalization is applied separately once patches are pooled
    across all scenes; see module docstring).
    """
    def log(msg):
        if verbose:
            print(f"  [build_dataset] {msg}")

    log(f"input scene: imagery {raw_ir_r_g.shape} {raw_ir_r_g.dtype}, "
        f"dsm {raw_dsm.shape} {raw_dsm.dtype}")

    # Stage 1 — radiometric correction
    corrected = radiometric_correction_pipeline(raw_ir_r_g)
    unet_imagery = corrected["unet_input"]          # native IR,R,G -> U-Net
    dav2_imagery = corrected["dav2_input"]           # R,G,G proxy   -> DAv2 (used later, not here)
    log(f"stage 1 (radiometric correction): unet_input {unet_imagery.shape} "
        f"{unet_imagery.dtype}, dav2_input {dav2_imagery.shape} {dav2_imagery.dtype}")

    # Stage 2 — cloud/shadow masking (computed on corrected imagery)
    valid_mask = compute_valid_mask(unet_imagery)
    log(f"stage 2 (cloud/shadow masking): valid fraction = {valid_mask.mean():.3f}")

    # Stage 3 — noise reduction (imagery + DSM separately, mask-aware)
    denoised_imagery = denoise_imagery(unet_imagery)
    denoised_dsm = denoise_dsm(raw_dsm, valid_mask=valid_mask)
    log(f"stage 3 (noise reduction): imagery denoised, dsm NaN fraction = "
        f"{np.isnan(denoised_dsm).mean():.3f}")

    # Stage 4 — contrast enhancement (CLAHE)
    enhanced_imagery = enhance_contrast(denoised_imagery, valid_mask=valid_mask)
    log("stage 4 (contrast enhancement): CLAHE applied")

    # Fill remaining NaN (invalid) DSM pixels with the scene's VALID median
    # elevation, never a fixed literal like 0.0. A literal 0 is a wild
    # outlier against real elevations (tens of meters here) and, unlike
    # imagery, the DSM has no fixed zero-point that means "no data" the
    # way black usually does for a photo. Any interpolation/resampling
    # step downstream needs a finite number to work with, so this fills
    # the gap with a value that at least sits inside the scene's real
    # elevation range instead of poisoning it with a false outlier.
    fill_value = float(np.nanmedian(denoised_dsm)) if not np.all(np.isnan(denoised_dsm)) else 0.0
    dsm_filled = np.where(np.isnan(denoised_dsm), fill_value, denoised_dsm)

    # Stage 5 — resolution handling (align to common GSD)
    aligned = align_dataset_to_common_gsd(
        enhanced_imagery, dsm_filled, valid_mask,
        source_gsd_m=source_gsd_m, target_gsd_m=target_gsd_m,
    )
    log(f"stage 5 (resolution handling): {source_gsd_m}m -> {target_gsd_m}m, "
        f"new shape {aligned['imagery'].shape[:2]}")

    # Stage 6 — tiling into training patches
    patches = crop_patches(
        aligned["imagery"], aligned["dsm"], aligned["valid_mask"],
        tile_size=tile_size, stride=stride, min_valid_fraction=min_valid_fraction,
    )
    log(f"stage 6 (tiling): {len(patches)} patches kept "
        f"(tile_size={tile_size}, min_valid_fraction={min_valid_fraction})")

    return patches


def normalize_pooled_patches(
    patches: list[Patch], depth_method: str = "minmax"
) -> tuple[list[dict], ChannelStats]:
    """
    Stage 6, run ONCE on the pooled patch set (across all scenes).
    Returns (normalized_records, imagery_stats) where each record is a
    dict ready to hand to a Dataset __getitem__: normalized imagery,
    normalized depth, the per-patch depth denorm params, and the mask.
    """
    imagery_stats = compute_dataset_stats(
        [p.imagery for p in patches], [p.valid_mask for p in patches]
    )

    records = []
    for p in patches:
        img_norm = normalize_image(p.imagery, imagery_stats)
        depth_norm, depth_params = normalize_depth_per_patch(
            p.dsm, valid_mask=p.valid_mask, method=depth_method
        )
        records.append({
            "imagery": img_norm,
            "depth": depth_norm,
            "depth_denorm_params": depth_params,
            "valid_mask": p.valid_mask,
            "row_off": p.row_off,
            "col_off": p.col_off,
        })

    return records, imagery_stats


def save_stats(stats: ChannelStats, path: str) -> None:
    Path(path).write_text(json.dumps(asdict(stats), indent=2))