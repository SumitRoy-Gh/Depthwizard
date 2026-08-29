"""
resolution_handling.py — Stage 4 of the DepthWizard preprocessing chain.

Different datasets ship at different Ground Sample Distances (GSD):
Vaihingen is 9cm, Potsdam is 5cm, DFC2019 varies by sub-tile. Feeding
the correction U-Net a mix of native GSDs means the same real-world
building silhouette occupies a different pixel footprint depending on
source dataset — the network would have to relearn scale invariance
from scratch, which wastes capacity and hurts cross-dataset
generalization (exactly the generalization story the handover doc
flags as still-open after Vaihingen alone).

Fix: resample every source to one COMMON target GSD before tiling.
Imagery uses bilinear resampling (smooth interpolation is appropriate
for continuous reflectance values). The DSM uses bilinear as well by
default, NOT nearest-neighbor — nearest-neighbor on elevation
introduces stair-stepping artifacts at the exact points where the
correction U-Net most needs a clean gradient (roof edges). Use
nearest-neighbor only when resampling a categorical mask (valid_mask,
land-cover labels), where averaging classes doesn't make sense.
"""
from __future__ import annotations
import numpy as np
from scipy.ndimage import zoom  # type: ignore[import-untyped]


def resample_to_gsd(
    array: np.ndarray, source_gsd_m: float, target_gsd_m: float, categorical: bool = False
) -> np.ndarray:
    """
    Resample a (H, W) or (H, W, C) array from source_gsd_m to
    target_gsd_m. order=1 (bilinear) for continuous data, order=0
    (nearest) for categorical/mask data.

    scale_factor > 1 means upsampling (source pixels are coarser than
    target, e.g. going from 9cm Vaihingen down to a 5cm common grid);
    scale_factor < 1 means downsampling.
    """
    scale_factor = source_gsd_m / target_gsd_m
    if abs(scale_factor - 1.0) < 1e-6:
        return array.copy()

    order = 0 if categorical else 1
    original_dtype = array.dtype

    if array.ndim == 2:
        result = zoom(array, scale_factor, order=order, mode="nearest")
    else:
        zoom_factors = (scale_factor, scale_factor, 1.0)
        result = zoom(array, zoom_factors, order=order, mode="nearest")

    return np.asarray(result, dtype=original_dtype)


def align_dataset_to_common_gsd(
    imagery: np.ndarray, dsm: np.ndarray, valid_mask: np.ndarray,
    source_gsd_m: float, target_gsd_m: float,
) -> dict[str, np.ndarray]:
    """
    Full stage-4 entry point: resamples imagery, DSM, and valid_mask
    together to one common GSD, using the correct interpolation order
    for each. Returns all three at matching (new_H, new_W) shape.
    """
    imagery_r = resample_to_gsd(imagery, source_gsd_m, target_gsd_m, categorical=False)
    dsm_r = resample_to_gsd(dsm, source_gsd_m, target_gsd_m, categorical=False)
    mask_r = resample_to_gsd(valid_mask.astype(np.uint8), source_gsd_m, target_gsd_m,
                              categorical=True).astype(bool)

    # Guard against off-by-one shape drift between zoom() calls on
    # different arrays with the same nominal scale factor.
    h = min(imagery_r.shape[0], dsm_r.shape[0], mask_r.shape[0])
    w = min(imagery_r.shape[1], dsm_r.shape[1], mask_r.shape[1])

    return {
        "imagery": imagery_r[:h, :w],
        "dsm": dsm_r[:h, :w],
        "valid_mask": mask_r[:h, :w],
    }