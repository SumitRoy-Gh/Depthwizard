"""
data_normalization.py — Stage 6 (final) of the DepthWizard preprocessing chain.

This is DIFFERENT from the percentile stretch in radiometric_correction.py.
That stretch is a display/compatibility step for one specific consumer
(DAv2's preprocessor, which expects roughly natural-image-like uint8
input). THIS stage is the general-purpose tensor normalization the
correction U-Net needs for stable training — zero-mean, unit-variance
float tensors, computed from statistics you control and reuse
consistently between training and inference.

Two things get normalized differently, on purpose:
  - Native imagery bands -> normalized with DATASET-level statistics
    (computed once over the training set, reused everywhere) so the model
    sees a consistent input distribution across every patch.
  - The raw depth channel (DAv2 output) -> normalized PER-PATCH, because
    "relative depth" from a monocular model has no fixed absolute scale
    even between two patches of the same scene — there's no dataset-level
    depth statistic that means anything to normalize against. This is also
    why the correction U-Net's own scale/shift head (a, b) exists: to
    relearn the scale that per-patch depth normalization necessarily
    throws away.
"""
from __future__ import annotations
import numpy as np
from dataclasses import dataclass


@dataclass
class ChannelStats:
    mean: list[float]
    std: list[float]


def compute_dataset_stats(patch_arrays: list[np.ndarray], valid_masks: list[np.ndarray] | None = None) -> ChannelStats:
    """
    Compute per-channel mean/std across many patches (e.g. the whole
    training split), using only valid pixels if masks are given. Run this
    ONCE after the dataset is built, save the result, and reuse the exact
    same numbers at inference — recomputing stats per-image would make
    outputs inconsistent between training and deployment.
    """
    n_channels = patch_arrays[0].shape[-1]
    sums = np.zeros(n_channels, dtype=np.float64)
    sq_sums = np.zeros(n_channels, dtype=np.float64)
    counts = np.zeros(n_channels, dtype=np.float64)

    for i, arr in enumerate(patch_arrays):
        mask = valid_masks[i] if valid_masks is not None else np.ones(arr.shape[:2], dtype=bool)
        for c in range(n_channels):
            vals = arr[..., c][mask].astype(np.float64)
            sums[c] += vals.sum()
            sq_sums[c] += (vals ** 2).sum()
            counts[c] += vals.size

    means = sums / np.maximum(counts, 1)
    variances = sq_sums / np.maximum(counts, 1) - means ** 2
    stds = np.sqrt(np.maximum(variances, 1e-12))
    return ChannelStats(mean=means.tolist(), std=stds.tolist())


def normalize_image(image: np.ndarray, stats: ChannelStats) -> np.ndarray:
    """Z-score normalize each channel using DATASET-level stats: (x - mean) / std."""
    out = np.zeros(image.shape, dtype=np.float32)
    for c in range(image.shape[-1]):
        out[..., c] = (image[..., c].astype(np.float32) - stats.mean[c]) / max(stats.std[c], 1e-6)
    return out


def denormalize_image(normalized: np.ndarray, stats: ChannelStats) -> np.ndarray:
    """Inverse of normalize_image — mainly useful for visualization/debugging."""
    out = np.zeros(normalized.shape, dtype=np.float32)
    for c in range(normalized.shape[-1]):
        out[..., c] = normalized[..., c] * stats.std[c] + stats.mean[c]
    return out


def normalize_depth_per_patch(raw_depth: np.ndarray, valid_mask: np.ndarray | None = None,
                               method: str = "minmax") -> tuple[np.ndarray, dict]:
    """
    Normalize ONE patch's raw relative depth independently — deliberately
    NOT using dataset-level stats (see module docstring). Returns
    (D_norm, params) where params lets you exactly invert this later, and
    is also useful to log/inspect (e.g. to catch a degenerate all-flat
    depth patch where min==max, which would otherwise divide by zero).
    """
    sample = raw_depth[valid_mask] if valid_mask is not None else raw_depth.ravel()
    if sample.size == 0:
        return np.zeros_like(raw_depth, dtype=np.float32), {"method": method, "degenerate": True}

    if method == "minmax":
        d_min, d_max = float(sample.min()), float(sample.max())
        if d_max - d_min < 1e-6:
            return np.zeros_like(raw_depth, dtype=np.float32), {"method": method, "min": d_min, "max": d_max, "degenerate": True}
        d_norm = (raw_depth - d_min) / (d_max - d_min)
        if valid_mask is not None:
            d_norm = np.where(valid_mask, d_norm, 0.0)
        return d_norm.astype(np.float32), {"method": method, "min": d_min, "max": d_max, "degenerate": False}

    elif method == "zscore":
        mean, std = float(sample.mean()), float(sample.std())
        if std < 1e-6:
            return np.zeros_like(raw_depth, dtype=np.float32), {"method": method, "mean": mean, "std": std, "degenerate": True}
        d_norm = (raw_depth - mean) / std
        if valid_mask is not None:
            d_norm = np.where(valid_mask, d_norm, 0.0)
        return d_norm.astype(np.float32), {"method": method, "mean": mean, "std": std, "degenerate": False}

    else:
        raise ValueError(f"unknown method: {method}")


def denormalize_depth_per_patch(d_norm: np.ndarray, params: dict) -> np.ndarray:
    """Inverse of normalize_depth_per_patch, using the params it returned."""
    if params.get("degenerate"):
        return np.full_like(d_norm, params.get("min", params.get("mean", 0.0)))
    if params["method"] == "minmax":
        return d_norm * (params["max"] - params["min"]) + params["min"]
    elif params["method"] == "zscore":
        return d_norm * params["std"] + params["mean"]
    raise ValueError(f"unknown method: {params['method']}")