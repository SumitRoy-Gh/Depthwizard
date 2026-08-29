"""
contrast_enhancement.py — Contrast Limited Adaptive Histogram Equalization
(CLAHE) for the DepthWizard preprocessing chain.

This step sits AFTER noise reduction and BEFORE resolution handling,
matching Diagram 2's explicit preprocessing order:
  Radiometric Correction → Cloud/Shadow Mask → Noise Reduction
  → **Contrast Enhancement** → Tiling (with overlap)

WHY CLAHE and not a simple histogram equalization:
  - Standard histogram equalization amplifies noise in flat regions
    (sky, uniform rooftops) because it tries to flatten the GLOBAL
    histogram — quiet bins get stretched aggressively.
  - CLAHE operates on LOCAL tiles of the image independently, with a
    clip limit that caps how much any single histogram bin can grow.
    This prevents noise amplification while still improving local
    contrast in shadows and low-dynamic-range areas.

WHY this matters for depth estimation specifically:
  - DAv2's geometric prior was pretrained on well-exposed natural photos.
    Under-exposed shadows or washed-out highlights in aerial imagery
    lose the texture gradients DAv2 relies on for monocular depth cues.
    CLAHE recovers those gradients locally without introducing the
    artifacts that global stretching would.
  - The correction U-Net benefits too: better local contrast means
    sharper feature edges in both imagery and the resulting depth map.
"""
from __future__ import annotations
import numpy as np
import cv2


def clahe_single_channel(
    band: np.ndarray,
    clip_limit: float = 2.0,
    tile_grid_size: tuple[int, int] = (8, 8),
) -> np.ndarray:
    """
    Apply CLAHE to a single uint8 band. Returns uint8.

    clip_limit: controls how much contrast enhancement is allowed
        per local tile. Higher = more enhancement but more noise risk.
        2.0 is a safe default for aerial imagery.
    tile_grid_size: the image is divided into this many tiles for
        local histogram computation. (8, 8) is a good balance between
        locality and having enough pixels per tile for stable statistics.
    """
    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=tile_grid_size)
    return clahe.apply(band)


def enhance_contrast(
    image: np.ndarray,
    clip_limit: float = 2.0,
    tile_grid_size: tuple[int, int] = (8, 8),
    valid_mask: np.ndarray | None = None,
) -> np.ndarray:
    """
    Apply CLAHE independently to each channel of a (H, W, C) uint8 image.

    If a valid_mask is provided, invalid pixels are temporarily set to
    the band median before CLAHE (so they don't skew the local histogram),
    then restored to their original values afterward.
    """
    if image.dtype != np.uint8:
        raise ValueError(
            f"CLAHE expects uint8 input, got {image.dtype}. "
            f"Run radiometric correction (percentile stretch) first."
        )

    out = np.zeros_like(image)
    for c in range(image.shape[-1]):
        band = image[..., c].copy()

        if valid_mask is not None:
            invalid = ~valid_mask
            if invalid.any():
                median_val = int(np.median(band[valid_mask])) if valid_mask.any() else 128
                band[invalid] = median_val

        enhanced = clahe_single_channel(band, clip_limit, tile_grid_size)

        if valid_mask is not None:
            # Restore original values in invalid regions — don't let
            # CLAHE fabricate contrast in nodata/masked areas
            enhanced = np.where(valid_mask, enhanced, image[..., c])

        out[..., c] = enhanced

    return out
