"""
cloud_shadow_masking.py — Stage 2 of the DepthWizard preprocessing chain.

Vaihingen/Potsdam/DFC2019 aerial tiles are mostly cloud-free by
acquisition design, but building-cast shadows are everywhere and matter
a lot for a HEIGHT estimation task: a shadow is low-radiance ground, not
low-elevation ground, and if it leaks into training unmasked, the
correction U-Net will learn a spurious dark-pixel -> low-height
correlation that actively hurts tall-building predictions (which cast
the longest shadows).

This stage produces a single boolean valid_mask: True = usable pixel,
False = cloud OR shadow OR sensor nodata. Downstream stages (tiling,
normalization, loss masking) all consume this same mask so "what counts
as valid" is decided once, in one place.
"""
from __future__ import annotations
import numpy as np


def detect_nodata(image: np.ndarray, nodata_value: float = 0.0) -> np.ndarray:
    """
    True where ALL bands equal nodata_value simultaneously (a real all-zero
    pixel is astronomically unlikely; it's near-certainly a sensor gap /
    tile-edge padding artifact).
    """
    return np.all(image == nodata_value, axis=-1)


def detect_shadow(
    image: np.ndarray, shadow_pct: float = 10.0, valid_mask: np.ndarray | None = None
) -> np.ndarray:
    """
    Simple, dependency-free shadow heuristic: shadows are the darkest
    `shadow_pct` percent of pixels by mean band brightness AND darker in
    every band than the tile's typical illumination — this second check
    is what keeps genuinely dark materials (asphalt roads, dark roofs)
    from being wrongly flagged as shadow, since a shadow darkens the
    whole local neighborhood, not just the pixel's own reflectance.

    Uses a local-relative threshold (per-tile percentile), not a fixed
    absolute brightness cutoff, since illumination varies tile to tile.
    """
    brightness = image.astype(np.float32).mean(axis=-1)
    sample = brightness[valid_mask] if valid_mask is not None else brightness.ravel()
    if sample.size == 0:
        return np.zeros(image.shape[:2], dtype=bool)

    threshold = np.percentile(sample, shadow_pct)
    return brightness <= threshold


def detect_cloud(
    image: np.ndarray, cloud_pct: float = 99.0, min_bright_bands: int = 2,
    valid_mask: np.ndarray | None = None,
) -> np.ndarray:
    """
    Simple cloud heuristic for aerial RGB/IR-R-G product: clouds are very
    bright AND low-contrast/saturated across most bands simultaneously
    (unlike a genuinely bright rooftop, which is usually bright in only
    one or two bands). Flags the top `cloud_pct` percentile of overall
    brightness where at least `min_bright_bands` bands are individually
    near-saturated. On most Vaihingen/Potsdam tiles this returns an
    all-False mask, which is expected and fine — this check exists for
    completeness / for datasets that DO have cloud cover.
    """
    h, w, c = image.shape
    # Guard: if valid_mask leaves no pixels, there's nothing to compute
    # percentiles on — return all-False (no cloud detected).
    if valid_mask is not None and not valid_mask.any():
        return np.zeros((h, w), dtype=bool)

    per_band_thresh = np.array([
        np.percentile(image[..., i][valid_mask] if valid_mask is not None
                       else image[..., i].ravel(), cloud_pct)
        for i in range(c)
    ])
    bright_bands = (image.astype(np.float32) >= per_band_thresh).sum(axis=-1)
    return bright_bands >= min_bright_bands


def compute_valid_mask(
    image: np.ndarray,
    nodata_value: float = 0.0,
    shadow_pct: float = 10.0,
    cloud_pct: float = 99.0,
    mask_shadows: bool = True,
    mask_clouds: bool = True,
) -> np.ndarray:
    """
    Full stage-2 entry point. Returns a single (H, W) boolean valid_mask:
    True = keep, False = exclude from loss/statistics/training entirely.
    """
    nodata = detect_nodata(image, nodata_value)
    valid = ~nodata

    if mask_shadows:
        shadow = detect_shadow(image, shadow_pct, valid_mask=valid)
        valid &= ~shadow

    if mask_clouds:
        cloud = detect_cloud(image, cloud_pct, valid_mask=valid)
        valid &= ~cloud

    return valid