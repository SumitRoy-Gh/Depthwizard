"""
noise_reduction.py — Stage 3 of the DepthWizard preprocessing chain.

Two separate noise problems get two separate treatments, because using
the same filter for both destroys information you need:

  1. Imagery sensor noise (shot/read noise in the optical bands): a mild
     edge-preserving smoother is fine here — small high-frequency
     brightness jitter carries no useful signal for either DAv2 or the
     correction U-Net, and blurring building EDGES even slightly hurts
     both. Bilateral filtering is used deliberately, not a plain Gaussian
     blur, specifically because it smooths flat regions while preserving
     strong edges (roof boundaries, building outlines) — exactly the
     structure a height-estimation task depends on most.

  2. DSM/depth noise (LiDAR point-cloud interpolation artifacts,
     speckle in matching-based DSMs): a median filter is preferred over
     bilateral here, because DSM noise is often impulsive (isolated
     spike/dropout pixels from bad returns), and median filtering
     removes impulsive outliers without the ringing a smoothing kernel
     can introduce near sharp height discontinuities (building edges,
     again).
"""
from __future__ import annotations
import numpy as np
from scipy.ndimage import median_filter
from skimage.restoration import denoise_bilateral


def denoise_imagery(
    image: np.ndarray, sigma_color: float = 0.05, sigma_spatial: float = 2.0
) -> np.ndarray:
    """
    Edge-preserving denoise for optical bands. Expects float image in
    [0, 1] or uint8 [0, 255]; returns the same dtype/range it was given.
    Applied per-band (channel_axis handles multi-band automatically).
    """
    is_uint8 = image.dtype == np.uint8
    work = image.astype(np.float32) / 255.0 if is_uint8 else image.astype(np.float32)

    denoised = denoise_bilateral(
        work, sigma_color=sigma_color, sigma_spatial=sigma_spatial,
        channel_axis=-1 if work.ndim == 3 else None,
    )

    if is_uint8:
        return np.clip(denoised * 255.0, 0, 255).astype(np.uint8)
    return denoised.astype(np.float32)


def denoise_dsm(dsm: np.ndarray, kernel_size: int = 3, valid_mask: np.ndarray | None = None) -> np.ndarray:
    """
    Impulse-noise-robust median filter for DSM/depth rasters. Only
    valid pixels contribute to each window's median; invalid pixels are
    filled with the local valid median first so a single nodata pixel
    doesn't corrupt its neighbors' filtered values, then re-masked back
    to NaN afterward so no fabricated elevation leaks into training.
    """
    work = dsm.astype(np.float32).copy()

    if valid_mask is not None:
        invalid = ~valid_mask
        if invalid.any() and valid_mask.any():
            fallback = float(np.median(work[valid_mask]))
            work[invalid] = fallback

    filtered = median_filter(work, size=kernel_size)

    if valid_mask is not None:
        filtered = np.where(valid_mask, filtered, np.nan)

    return filtered