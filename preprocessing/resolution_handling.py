"""
resolution_handling.py — Stage: harmonize mismatched pixel grids/resolutions.

Two genuinely different situations this needs to handle, and they need
different resampling methods:

  1. CONTINUOUS data (RGB/IR imagery, DSM elevation) — use bilinear or cubic
     interpolation. Blending neighboring values is physically meaningful
     (elevation between two known points is plausibly in between).

  2. CATEGORICAL data (semantic class labels, e.g. DFC2019's CLS layer) —
     use nearest-neighbor or majority/mode resampling. Interpolating class
     IDs numerically would invent nonexistent classes (e.g. averaging
     "building"=2 and "road"=4 does NOT mean "vegetation"=3).

This module also replaces a silent trap in the earlier assert_aligned check:
that function only ever THROWS when grids don't match. This module actually
FIXES the mismatch by resampling the secondary raster onto the reference
raster's exact grid, when that's what you want (e.g. coarse DEM -> ortho
grid for calibration).
"""
from __future__ import annotations
import numpy as np
import rasterio
from rasterio.warp import reproject, Resampling
from rasterio.transform import Affine
from dataclasses import dataclass


RESAMPLING_FOR = {
    "continuous": Resampling.bilinear,   # imagery, elevation
    "continuous_smooth": Resampling.cubic,  # higher-quality option, costs more compute
    "categorical": Resampling.nearest,   # class labels, discrete IDs
    "categorical_majority": Resampling.mode,  # better than nearest when downsampling categorical data
}


@dataclass
class GridInfo:
    transform: Affine
    crs: object
    shape: tuple[int, int]     # (height, width)
    gsd: tuple[float, float]   # (x_resolution, y_resolution), same units as CRS


def get_grid_info(transform: Affine, crs, shape: tuple[int, int]) -> GridInfo:
    gsd = (abs(transform.a), abs(transform.e))
    return GridInfo(transform=transform, crs=crs, shape=shape, gsd=gsd)


def grids_match(a: GridInfo, b: GridInfo, gsd_tol: float = 1e-3, origin_tol_px: float = 0.5) -> bool:
    """
    True only if both rasters share resolution, shape, and pixel-grid origin
    within tolerance. This is the check that should replace a hard assert —
    call this first, and only resample if it comes back False.
    """
    if a.shape != b.shape:
        return False
    if abs(a.gsd[0] - b.gsd[0]) > gsd_tol or abs(a.gsd[1] - b.gsd[1]) > gsd_tol:
        return False
    origin_offset_px = max(
        abs(a.transform.c - b.transform.c) / max(a.gsd[0], 1e-9),
        abs(a.transform.f - b.transform.f) / max(a.gsd[1], 1e-9),
    )
    return origin_offset_px <= origin_tol_px


def resample_to_reference(
    src_array: np.ndarray,
    src_transform: Affine,
    src_crs,
    ref_transform: Affine,
    ref_crs,
    ref_shape: tuple[int, int],
    data_kind: str = "continuous",
    src_nodata: float | None = None,
) -> np.ndarray:
    """
    Resample src_array onto the EXACT grid described by (ref_transform,
    ref_crs, ref_shape) — same origin, resolution, and pixel count as your
    reference raster (typically the ortho/RGB image).

    src_array: (H, W) or (H, W, C).
    Returns an array of shape ref_shape (+ channel dim if input had one),
    dtype float32, with src_nodata preserved as np.nan where it existed.
    """
    resampling_method = RESAMPLING_FOR[data_kind]
    is_multiband = src_array.ndim == 3
    bands_in = np.transpose(src_array, (2, 0, 1)) if is_multiband else src_array[np.newaxis, ...]
    bands_in = bands_in.astype(np.float32)

    if src_nodata is not None:
        bands_in = np.where(bands_in == src_nodata, np.nan, bands_in)

    n_bands = bands_in.shape[0]
    out = np.full((n_bands, ref_shape[0], ref_shape[1]), np.nan, dtype=np.float32)

    for b in range(n_bands):
        reproject(
            source=bands_in[b],
            destination=out[b],
            src_transform=src_transform,
            src_crs=src_crs,
            dst_transform=ref_transform,
            dst_crs=ref_crs,
            resampling=resampling_method,
            src_nodata=np.nan,
            dst_nodata=np.nan,
        )

    return np.transpose(out, (1, 2, 0)) if is_multiband else out[0]


def downsample_to_target_gsd(
    array: np.ndarray,
    src_transform: Affine,
    src_crs,
    target_gsd: float,
    data_kind: str = "continuous",
) -> tuple[np.ndarray, Affine]:
    """
    Downsample a raster to a target ground-sample-distance, e.g. to bring a
    5cm Potsdam tile and a 9cm Vaihingen tile onto the SAME working
    resolution before both feed the same training pipeline (mixing datasets
    at different native GSDs without normalizing this is a quiet source of
    scale-inconsistent training signal — a "512x512 patch" means a very
    different real-world footprint at 5cm vs 9cm).

    Returns (resampled array, new transform). Shape shrinks proportionally
    to (native_gsd / target_gsd).
    """
    native_gsd = abs(src_transform.a)
    scale = native_gsd / target_gsd   # <1 when downsampling to a coarser GSD

    h, w = array.shape[:2]
    new_h, new_w = max(1, int(round(h * scale))), max(1, int(round(w * scale)))
    new_transform = src_transform * Affine.scale(1 / scale, 1 / scale)

    resampling_method = RESAMPLING_FOR[data_kind]
    is_multiband = array.ndim == 3
    bands_in = np.transpose(array, (2, 0, 1)) if is_multiband else array[np.newaxis, ...]
    bands_in = bands_in.astype(np.float32)

    out = np.zeros((bands_in.shape[0], new_h, new_w), dtype=np.float32)
    for b in range(bands_in.shape[0]):
        reproject(
            source=bands_in[b],
            destination=out[b],
            src_transform=src_transform,
            src_crs=src_crs,
            dst_transform=new_transform,
            dst_crs=src_crs,
            resampling=resampling_method,
        )

    result = np.transpose(out, (1, 2, 0)) if is_multiband else out[0]
    return result, new_transform


def align_ortho_and_dsm(ortho_array, ortho_transform, ortho_crs,
                         dsm_array, dsm_transform, dsm_crs,
                         dsm_nodata: float | None = None) -> tuple[np.ndarray, np.ndarray, Affine]:
    """
    Drop-in replacement for the old "assert_aligned or crash" behavior:
    checks whether ortho/DSM already share a grid, and if not, resamples the
    DSM onto the ortho's exact grid (ortho treated as reference since it
    usually carries the finer/target resolution). Returns
    (ortho_array_unchanged, dsm_array_aligned, shared_transform).
    """
    ortho_grid = get_grid_info(ortho_transform, ortho_crs, ortho_array.shape[:2])
    dsm_grid = get_grid_info(dsm_transform, dsm_crs, dsm_array.shape[:2])

    if grids_match(ortho_grid, dsm_grid):
        return ortho_array, dsm_array, ortho_transform

    dsm_aligned = resample_to_reference(
        dsm_array, dsm_transform, dsm_crs,
        ortho_transform, ortho_crs, ortho_array.shape[:2],
        data_kind="continuous", src_nodata=dsm_nodata,
    )
    return ortho_array, dsm_aligned, ortho_transform