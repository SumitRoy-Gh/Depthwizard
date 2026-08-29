"""
tiling.py — Stage 5 of the DepthWizard preprocessing chain (dataset build time).

This is the TRAINING-PATCH cropper: it assumes the full scene (imagery,
DSM, valid_mask) already fits in memory as one array, and its only job
is to cut it into fixed-size patches (default 512x512) to build the
dataset the correction U-Net trains on.

This is NOT the same problem large_image_tiling.py solves. That module
does memory-safe windowed reading of rasters too big to load whole, and
seam-free stitching of per-tile model outputs back into one mosaic —
that's a DEPLOYMENT/INFERENCE-time concern over a full scene. This
module is a TRAINING-DATASET-BUILD-time concern over data already in
RAM. Keep them separate; conflating them was flagged early in this
project as a mistake to avoid.

Patches below a minimum valid-pixel fraction are dropped — a patch
that's mostly cloud/shadow/nodata contributes more noise than signal
to a training batch.
"""
from __future__ import annotations
import numpy as np
from dataclasses import dataclass


@dataclass
class Patch:
    imagery: np.ndarray      # (tile_size, tile_size, C)
    dsm: np.ndarray          # (tile_size, tile_size)
    valid_mask: np.ndarray   # (tile_size, tile_size) bool
    row_off: int
    col_off: int


def crop_patches(
    imagery: np.ndarray,
    dsm: np.ndarray,
    valid_mask: np.ndarray,
    tile_size: int = 512,
    stride: int | None = None,
    min_valid_fraction: float = 0.6,
) -> list[Patch]:
    """
    Crop non-overlapping (or overlapping, if stride < tile_size) fixed-size
    patches from an in-memory scene already at a common GSD.

    stride defaults to tile_size (no overlap) — overlap for training-set
    augmentation is a deliberate separate choice, not the default, since
    overlapping training patches inflate apparent dataset size without
    adding independent information and can leak train/val split.
    """
    h, w = dsm.shape
    stride = stride or tile_size
    assert imagery.shape[:2] == (h, w), "imagery/DSM shape mismatch — run resolution_handling first"

    patches: list[Patch] = []
    for r in range(0, max(h - tile_size, 0) + 1, stride):
        for c in range(0, max(w - tile_size, 0) + 1, stride):
            img_patch = imagery[r:r + tile_size, c:c + tile_size]
            dsm_patch = dsm[r:r + tile_size, c:c + tile_size]
            mask_patch = valid_mask[r:r + tile_size, c:c + tile_size]

            if img_patch.shape[0] != tile_size or img_patch.shape[1] != tile_size:
                continue  # partial edge patch — drop rather than pad, to avoid fake data

            valid_fraction = mask_patch.mean() if mask_patch.size else 0.0
            if valid_fraction < min_valid_fraction:
                continue

            patches.append(Patch(img_patch, dsm_patch, mask_patch, r, c))

    return patches


def split_by_area(
    patches: list[Patch], test_area_row_ranges: list[tuple[int, int]]
) -> tuple[list[Patch], list[Patch]]:
    """
    Split patches into train/test by SPATIAL AREA (row-range bands),
    never by acquisition strip — Vaihingen's overlapping strips mean a
    strip-based split leaks the same ground into both train and test.
    A patch belongs to "test" if its row_off falls inside any of the
    given (start, end) row ranges.
    """
    train, test = [], []
    for p in patches:
        in_test_area = any(start <= p.row_off < end for start, end in test_area_row_ranges)
        (test if in_test_area else train).append(p)
    return train, test