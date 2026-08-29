"""
cloud_shadow_mask.py — Stage 2 of preprocessing (runs on radiometrically-
corrected imagery, BEFORE normalization/stretch).

Produces a boolean "unreliable" mask flagging cloud and shadow pixels. This
gets combined with the existing DSM-NoData valid mask — cloud/shadow pixels
are optically unreliable input even where the DSM has real height data
underneath, since a monocular depth model gets a degraded/false signal there.

Detection strategy given only IR,R,G bands (no dedicated cloud/cirrus band,
no thermal): this uses simple, defensible spectral heuristics rather than a
full physically-based algorithm like Fmask, which needs bands this dataset
doesn't have. Treat this as a first-pass heuristic mask you should visually
QC, not a validated cloud product.
"""
from __future__ import annotations
import numpy as np
from scipy import ndimage


def compute_brightness(corrected: np.ndarray) -> np.ndarray:
    """Mean across IR,R,G channels — simple brightness proxy."""
    return corrected.mean(axis=-1)


def compute_spectral_flatness(corrected: np.ndarray) -> np.ndarray:
    """
    Std across channels at each pixel. Clouds tend to be spectrally flat
    (near-neutral/white across IR,R,G) compared to vegetation/ground, which
    show more contrast between NIR and visible bands.
    """
    return corrected.std(axis=-1)


def detect_cloud_mask(corrected: np.ndarray, valid_mask: np.ndarray,
                       brightness_percentile: float = 97,
                       flatness_percentile: float = 40) -> np.ndarray:
    """
    Cloud candidate: pixel brightness in the top (100-brightness_percentile)%
    of the scene AND spectrally flat (channel std below flatness_percentile
    of the scene's own flatness distribution).

    Both thresholds are adaptive percentiles of THIS scene, not fixed
    absolute DN values — consistent with how DOS/stretch work elsewhere in
    this pipeline, since absolute brightness varies a lot scene to scene
    even after radiometric correction.
    """
    brightness = compute_brightness(corrected)
    flatness = compute_spectral_flatness(corrected)

    valid_brightness = brightness[valid_mask]
    valid_flatness = flatness[valid_mask]
    if valid_brightness.size == 0:
        return np.zeros(corrected.shape[:2], dtype=bool)

    bright_thresh = np.percentile(valid_brightness, brightness_percentile)
    flat_thresh = np.percentile(valid_flatness, flatness_percentile)

    return (brightness >= bright_thresh) & (flatness <= flat_thresh)


def detect_shadow_mask(corrected: np.ndarray, valid_mask: np.ndarray,
                        brightness_percentile: float = 3) -> np.ndarray:
    """
    Shadow candidate: pixel brightness in the bottom brightness_percentile%
    of the scene.

    LIMITATION: with only IR,R,G, this cannot cleanly distinguish cast
    shadow from other genuinely dark surfaces (deep water, asphalt, dark
    roofing) — you don't have the extra spectral bands that would separate
    them. It's deliberately permissive: better to flag some real dark
    surfaces as "unreliable" than miss actual shadows that corrupt the
    depth signal. Visually QC this before trusting it on a new scene type.
    """
    brightness = compute_brightness(corrected)
    valid_brightness = brightness[valid_mask]
    if valid_brightness.size == 0:
        return np.zeros(corrected.shape[:2], dtype=bool)

    dark_thresh = np.percentile(valid_brightness, brightness_percentile)
    return brightness <= dark_thresh


def clean_mask(mask: np.ndarray, min_region_size: int = 25, dilation_iters: int = 1) -> np.ndarray:
    """
    Morphological cleanup:
    1. Remove tiny isolated detections (single noisy pixels, not real
       cloud/shadow) via connected-component size filtering. Tune
       min_region_size relative to your GSD — e.g. at 9cm GSD a 3x3m real
       patch is roughly 33x33px = ~1000px^2; the default here (25) is
       deliberately small/permissive, raise it once you've seen real data.
    2. Slightly dilate surviving regions to catch soft penumbra edges around
       cloud/shadow boundaries, which are partially contaminated too.
    """
    labeled, n_features = ndimage.label(mask)
    if n_features == 0:
        return mask
    sizes = ndimage.sum(mask, labeled, range(1, n_features + 1))
    small_labels = np.where(sizes < min_region_size)[0] + 1
    cleaned = mask.copy()
    for lbl in small_labels:
        cleaned[labeled == lbl] = False

    if dilation_iters > 0:
        cleaned = ndimage.binary_dilation(cleaned, iterations=dilation_iters)
    return cleaned


def build_cloud_shadow_mask(corrected: np.ndarray, valid_mask: np.ndarray,
                             cloud_brightness_pct: float = 97,
                             cloud_flatness_pct: float = 40,
                             shadow_brightness_pct: float = 3,
                             min_region_size: int = 25,
                             dilation_iters: int = 1) -> dict:
    """
    Returns cloud_mask, shadow_mask, and combined unreliable_mask (bool
    arrays, same H,W as `corrected`'s spatial dims) plus their area
    fractions. Kept separate (not just one combined mask) so you can inspect
    and tune each independently, and so a later confidence map can weight
    cloud vs shadow contamination differently if you want.
    """
    cloud_raw = detect_cloud_mask(corrected, valid_mask, cloud_brightness_pct, cloud_flatness_pct)
    shadow_raw = detect_shadow_mask(corrected, valid_mask, shadow_brightness_pct)

    cloud_mask = clean_mask(cloud_raw, min_region_size, dilation_iters)
    shadow_mask = clean_mask(shadow_raw, min_region_size, dilation_iters)
    unreliable_mask = cloud_mask | shadow_mask

    return {
        "cloud_mask": cloud_mask,
        "shadow_mask": shadow_mask,
        "unreliable_mask": unreliable_mask,
        "cloud_fraction": float(cloud_mask[valid_mask].mean()) if valid_mask.any() else 0.0,
        "shadow_fraction": float(shadow_mask[valid_mask].mean()) if valid_mask.any() else 0.0,
    }