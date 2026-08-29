"""
noise_reduction.py — Stage 3 of preprocessing.

Runs on radiometrically-corrected imagery (float32, DN-like units), BEFORE
cloud/shadow masking and normalization. Ordering reasoning:
  - AFTER radiometric correction: dark-object percentile estimation in DOS
    needs the real (noisy) histogram spread; smoothing first would bias it.
  - BEFORE cloud/shadow masking: less noise means fewer false-positive
    "spectrally flat" or brightness-spike detections in that stage.

Uses EDGE-PRESERVING smoothing (bilateral filter), not a plain Gaussian
blur. This matters specifically for this project: a Gaussian blur would
soften exactly the roof edges / building-to-ground transitions that the
correction U-Net's gradient loss and the final 3D mesh quality depend on.
Bilateral filtering smooths within flat regions while leaving strong edges
mostly intact, because it down-weights neighboring pixels that differ a lot
in intensity even if they're spatially close.
"""
from __future__ import annotations
import numpy as np
import cv2
from scipy import ndimage


def estimate_noise_sigma(band: np.ndarray) -> float:
    """
    Fast noise-level estimator (Immerkaer, 1996): convolve with a Laplacian-
    like kernel that cancels out smooth structure, leaving mostly noise, then
    take a robust estimate of its spread. Use this BEFORE and AFTER denoising
    to prove the filter actually reduced noise, not just changed the image.
    """
    H, W = band.shape
    kernel = np.array([[1, -2, 1], [-2, 4, -2], [1, -2, 1]], dtype=np.float64)
    conv = ndimage.convolve(band.astype(np.float64), kernel, mode="reflect")
    sigma = np.sqrt(np.pi / 2) * np.sum(np.abs(conv)) / (6 * (W - 2) * (H - 2))
    return float(sigma)


def bilateral_denoise(corrected: np.ndarray, d: int = 5,
                       sigma_color: float = 25.0, sigma_space: float = 5.0) -> np.ndarray:
    """
    Joint edge-preserving denoise across all channels at once (so a strong
    edge in any one band helps protect that location in the others too).

    d: neighborhood diameter in pixels.
    sigma_color: how different two pixel VALUES need to be before the filter
        treats them as "different surfaces" and stops blending them across
        that boundary — this is what makes it edge-preserving. Lower =
        edges preserved more aggressively (but less smoothing overall).
    sigma_space: how far in PIXELS the filter looks for neighbors to blend.

    corrected: (H, W, 3) float32. cv2.bilateralFilter supports 3-channel
    float32 directly, so no need to split channels or convert dtype.
    """
    return cv2.bilateralFilter(corrected.astype(np.float32), d=d,
                                sigmaColor=sigma_color, sigmaSpace=sigma_space)


def median_despike(corrected: np.ndarray, size: int = 3) -> np.ndarray:
    """
    Per-channel median filter — specifically for salt-and-pepper style
    outliers (hot/dead pixels, quantization spikes from the 11-bit ADC),
    which a bilateral filter handles poorly (a single extreme outlier pixel
    can still leak through if sigma_color is generous enough to include it).
    Run this BEFORE bilateral_denoise, not instead of it — they catch
    different noise types.
    """
    out = np.zeros_like(corrected)
    for c in range(corrected.shape[-1]):
        out[..., c] = ndimage.median_filter(corrected[..., c], size=size)
    return out


def denoise_pipeline(corrected: np.ndarray, valid_mask: np.ndarray | None = None,
                      despike_size: int = 3, bilateral_d: int = 5,
                      bilateral_sigma_color: float = 25.0,
                      bilateral_sigma_space: float = 5.0) -> tuple[np.ndarray, dict]:
    """
    Full chain: median despike (remove hard outliers) -> bilateral filter
    (smooth remaining noise while preserving edges).

    Returns (denoised array, debug_info) where debug_info reports per-channel
    noise sigma before/after so you can confirm the filter actually helped —
    same "prove it, don't just run it" pattern as the radiometric stage.
    """
    despiked = median_despike(corrected, size=despike_size)
    denoised = bilateral_denoise(despiked, d=bilateral_d,
                                  sigma_color=bilateral_sigma_color,
                                  sigma_space=bilateral_sigma_space)

    debug_info = {"noise_sigma_before": [], "noise_sigma_after": []}
    for c in range(corrected.shape[-1]):
        debug_info["noise_sigma_before"].append(round(estimate_noise_sigma(corrected[..., c]), 4))
        debug_info["noise_sigma_after"].append(round(estimate_noise_sigma(denoised[..., c]), 4))

    if valid_mask is not None:
        # Never let smoothing pull invalid/NoData-adjacent values into real
        # pixels — restore untouched original values wherever mask is False,
        # and blend nothing across that boundary.
        for c in range(corrected.shape[-1]):
            denoised[..., c] = np.where(valid_mask, denoised[..., c], corrected[..., c])

    return denoised, debug_info