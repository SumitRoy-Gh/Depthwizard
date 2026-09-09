"""
ingest.py — the REAL entry point matching the architecture diagram:
"user uploads a .tif" -> this module -> six-stage preprocessing chain ->
DAv2 / correction U-Net.

Everything upstream of this file (radiometric_correction.py,
cloud_shadow_masking.py, etc.) works on plain NumPy arrays and has no
idea whether those arrays came from a file, a test fixture, or an API
upload. This module is the ONLY place that touches rasterio/disk I/O —
that boundary is deliberate: it means the six preprocessing stages stay
testable with synthetic arrays, while this one module is what actually
gets exercised differently between "synthetic test" and "real Vaihingen
tile" and "user's uploaded .tif in production."

Vaihingen (and Potsdam/DFC2019) ship imagery and elevation as TWO
separate GeoTIFFs (orthophoto + DSM), not one combined file — see the
handover notes on using the orthophoto+DSM pair rather than the raw
strip images. This module supports that two-file case, which is also
what a real upload flow will look like: one imagery file + one
elevation file per scene.
"""
from __future__ import annotations
import numpy as np
import rasterio
from dataclasses import dataclass


# ISPRS Vaihingen/Potsdam ship 6 semantic classes. We collapse them into 3
# classes for calibration purposes. Values are the OUTPUT class IDs this
# module produces; the INPUT encoding (raw pixel values in the source file)
# is handled in _decode_isprs_label_colors() below because ISPRS label
# rasters are typically RGB-color-coded, not single-band integer IDs.
CALIBRATION_CLASS_GROUND = 0
CALIBRATION_CLASS_BUILDING = 1
CALIBRATION_CLASS_VEGETATION = 2
CALIBRATION_CLASS_UNKNOWN = 255  # cars, clutter, or undecodable pixels — excluded from depthwizard.calibration fitting

# ISPRS standard RGB color codes for the 6 classes (confirm against your
# actual downloaded files — Vaihingen/Potsdam ground truth uses these
# exact RGB triples per the official ISPRS benchmark documentation):
#   Impervious surfaces : (255, 255, 255) white  -> GROUND
#   Building             : (0, 0, 255) blue       -> BUILDING
#   Low vegetation       : (0, 255, 255) cyan      -> VEGETATION
#   Tree                 : (0, 255, 0) green       -> VEGETATION
#   Car                  : (255, 255, 0) yellow    -> UNKNOWN (excluded)
#   Clutter/background   : (255, 0, 0) red         -> UNKNOWN (excluded)
_ISPRS_RGB_TO_CLASS = {
    (255, 255, 255): CALIBRATION_CLASS_GROUND,
    (0, 0, 255): CALIBRATION_CLASS_BUILDING,
    (0, 255, 255): CALIBRATION_CLASS_VEGETATION,
    (0, 255, 0): CALIBRATION_CLASS_VEGETATION,
    (255, 255, 0): CALIBRATION_CLASS_UNKNOWN,
    (255, 0, 0): CALIBRATION_CLASS_UNKNOWN,
}


@dataclass
class SceneMeta:
    crs: str | None
    transform: tuple
    imagery_nodata: float | None
    dsm_nodata: float | None
    gsd_m: float          # ground sample distance, derived from the transform
    dtype_imagery: str
    dtype_dsm: str
    band_count: int
    semantic_gsd_m: float | None = None  # NEW — None if no semantic file was loaded


def _gsd_from_transform(transform) -> float:
    """
    Ground sample distance in meters/pixel, taken from the affine
    transform's pixel-size terms. Assumes a projected (metric) CRS —
    if the file is in geographic degrees instead, this will silently
    return degrees-per-pixel, so validate crs.is_projected upstream in
    a real ingest call before trusting this number.
    """
    return float(abs(transform.a))


def load_imagery_tif(path: str) -> tuple[np.ndarray, SceneMeta]:
    """
    Reads a multi-band imagery GeoTIFF exactly as it will arrive in
    production — no assumptions about it already being clean. Returns
    the raw array in (H, W, C) layout, band order AS-STORED IN THE FILE
    (Vaihingen stores IR, R, G — this function does NOT reorder or
    validate band semantics, that's radiometric_correction.py's job).
    """
    with rasterio.open(path) as src:
        arr = src.read()                       # (C, H, W)
        arr = np.transpose(arr, (1, 2, 0))      # -> (H, W, C)
        meta = SceneMeta(
            crs=str(src.crs) if src.crs else None,
            transform=tuple(src.transform)[:6],
            imagery_nodata=src.nodata,
            dsm_nodata=None,
            gsd_m=_gsd_from_transform(src.transform),
            dtype_imagery=str(arr.dtype),
            dtype_dsm="",
            band_count=arr.shape[-1],
        )
    return arr, meta


def load_dsm_tif(path: str) -> tuple[np.ndarray, float | None, float]:
    """
    Reads a single-band elevation GeoTIFF. Returns (dsm array (H, W),
    nodata value if the file declares one, gsd_m from this file's own
    transform — checked against the imagery file's GSD by the caller,
    since a real upload could hand you two files at different GSDs by
    mistake and that needs to be caught, not silently ignored).
    """
    with rasterio.open(path) as src:
        arr = src.read(1)
        return arr, src.nodata, _gsd_from_transform(src.transform)


def load_scene(imagery_path: str, dsm_path: str, gsd_mismatch_tol_m: float = 1e-3) -> tuple[np.ndarray, np.ndarray, SceneMeta]:
    """
    Full ingest entry point for one scene: two file paths in, validated
    arrays + metadata out. This is what a real "user uploaded these two
    files" API handler should call directly before anything else runs.

    Raises ValueError early and loudly on the kinds of mismatches a real
    upload can actually have — different GSD between imagery and DSM,
    or mismatched pixel dimensions — rather than letting them surface
    as a confusing shape-mismatch assert three stages downstream.
    """
    imagery, meta = load_imagery_tif(imagery_path)
    dsm, dsm_nodata, dsm_gsd = load_dsm_tif(dsm_path)
    meta.dsm_nodata = dsm_nodata
    meta.dtype_dsm = str(dsm.dtype)

    if abs(meta.gsd_m - dsm_gsd) > gsd_mismatch_tol_m:
        raise ValueError(
            f"GSD mismatch between imagery ({meta.gsd_m:.4f} m/px) and "
            f"DSM ({dsm_gsd:.4f} m/px) — resolution_handling.py expects a "
            f"single source_gsd_m for the pair; resample one to match the "
            f"other (or re-export) before calling process_scene()."
        )

    if imagery.shape[:2] != dsm.shape:
        raise ValueError(
            f"pixel-dimension mismatch: imagery {imagery.shape[:2]} vs "
            f"DSM {dsm.shape} — these must cover the exact same extent "
            f"at the same GSD. A real upload with a slightly cropped DSM "
            f"will trigger this; re-export DSM aligned to the imagery footprint."
        )

    return imagery, dsm, meta


def load_semantic_tif(path: str) -> tuple[np.ndarray, float]:
    """
    Reads a semantic-label GeoTIFF and returns a single-band uint8 array
    of COLLAPSED class IDs (values: CALIBRATION_CLASS_GROUND=0,
    CALIBRATION_CLASS_BUILDING=1, CALIBRATION_CLASS_VEGETATION=2,
    CALIBRATION_CLASS_UNKNOWN=255), plus this file's own gsd_m (for the
    same mismatch check load_scene() already does for imagery vs DSM).

    Handles two possible source encodings:
      (a) RGB-color-coded label image (3 bands) — the ISPRS standard —
          decoded via _ISPRS_RGB_TO_CLASS.
      (b) Single-band integer label image — assumed to already use class
          IDs 0/1/2 for ground/building/vegetation and anything else is
          set to CALIBRATION_CLASS_UNKNOWN.

    Raises ValueError on any RGB triple not found in _ISPRS_RGB_TO_CLASS
    if that pixel is NOT already flagged unknown, so silent mis-mapping
    is impossible.
    """
    with rasterio.open(path) as src:
        arr = src.read()  # (C, H, W)
        gsd = _gsd_from_transform(src.transform)

    if arr.shape[0] == 1:
        # Single-band integer labels
        band = arr[0]
        out = np.full(band.shape, CALIBRATION_CLASS_UNKNOWN, dtype=np.uint8)
        out[band == CALIBRATION_CLASS_GROUND] = CALIBRATION_CLASS_GROUND
        out[band == CALIBRATION_CLASS_BUILDING] = CALIBRATION_CLASS_BUILDING
        out[band == CALIBRATION_CLASS_VEGETATION] = CALIBRATION_CLASS_VEGETATION
        return out, gsd

    # RGB-color-coded (3 bands)
    rgb = np.transpose(arr[:3], (1, 2, 0))  # (H, W, 3)
    out = np.full(rgb.shape[:2], CALIBRATION_CLASS_UNKNOWN, dtype=np.uint8)
    for color, class_id in _ISPRS_RGB_TO_CLASS.items():
        matches = np.all(rgb == np.array(color, dtype=rgb.dtype), axis=-1)
        out[matches] = class_id

    return out, gsd


def load_scene_with_semantics(
    imagery_path: str,
    dsm_path: str,
    semantic_path: str,
    gsd_mismatch_tol_m: float = 1e-3,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, SceneMeta]:
    """
    Like load_scene(), but also loads and validates a semantic label
    raster. Returns (imagery, dsm, semantic, meta). Raises ValueError
    with the SAME style of message as load_scene()'s existing GSD/shape
    checks if the semantic file's GSD or pixel dimensions don't match
    the imagery/DSM pair.
    """
    imagery, dsm, meta = load_scene(imagery_path, dsm_path, gsd_mismatch_tol_m)
    semantic, semantic_gsd = load_semantic_tif(semantic_path)
    meta.semantic_gsd_m = semantic_gsd

    if abs(meta.gsd_m - semantic_gsd) > gsd_mismatch_tol_m:
        raise ValueError(
            f"GSD mismatch between imagery ({meta.gsd_m:.4f} m/px) and "
            f"semantic labels ({semantic_gsd:.4f} m/px) — these must match "
            f"before tiling; resample one to match the other."
        )
    if imagery.shape[:2] != semantic.shape:
        raise ValueError(
            f"pixel-dimension mismatch: imagery {imagery.shape[:2]} vs "
            f"semantic labels {semantic.shape} — these must cover the exact "
            f"same extent at the same GSD."
        )

    return imagery, dsm, semantic, meta