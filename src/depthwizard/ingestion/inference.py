"""
ingest_inference.py — inference-time entry point for the DepthWizard pipeline.

This is DIFFERENT from ingest.py (training-time), which loads imagery + DSM
pairs. At inference time the user uploads ONE image — no DSM, because the
DSM is what the system predicts.

Auto-detection logic:
  1. Try rasterio.open(). If it succeeds AND the file has a valid projected
     CRS → georeferenced path. Extract GSD, CRS, bounds from metadata.
  2. If rasterio fails (not a raster format) OR CRS is missing/geographic
     → fall back to PIL/OpenCV for PNG/JPG → non-georeferenced path.
     The user can optionally supply a GSD; if not, it stays None and
     downstream Scale Calibration (Stage 4 in the architecture) is skipped
     (Diagram 2: "Non-Georeferenced Mode → Skip calibration → Use relative
     depth directly as rDSM").

Supported formats: GeoTIFF (.tif/.tiff), PNG (.png), JPEG (.jpg/.jpeg)
"""
from __future__ import annotations
import numpy as np
from pathlib import Path
from dataclasses import dataclass, field


@dataclass
class InferenceImageMeta:
    """Metadata extracted from a single uploaded image."""
    is_georeferenced: bool
    source_path: str
    height: int
    width: int
    n_bands: int
    dtype: str
    # Georeferenced-only fields (None when non-georeferenced)
    crs: str | None = None
    gsd_m: float | None = None
    bounds: tuple[float, float, float, float] | None = None  # (left, bottom, right, top)
    nodata: float | None = None
    transform_coeffs: tuple | None = None
    # User-supplied override (for non-georeferenced images where
    # the user happens to know the ground resolution)
    user_gsd_m: float | None = None


def _try_rasterio(path: str) -> tuple[np.ndarray, InferenceImageMeta] | None:
    """
    Attempt to load via rasterio. Returns None if the file isn't a
    recognized raster format or rasterio isn't available.
    """
    try:
        import rasterio  # type: ignore[import-untyped]
    except ImportError:
        return None

    try:
        with rasterio.open(path) as src:
            arr = src.read()  # (C, H, W)
            arr = np.transpose(arr, (1, 2, 0))  # → (H, W, C)
            if arr.shape[-1] == 1:
                # Single-band grayscale → squeeze but keep 3D for consistency
                arr = np.repeat(arr, 3, axis=-1)

            crs_str = str(src.crs) if src.crs else None
            gsd = float(abs(src.transform.a)) if src.transform else None

            # Determine if truly georeferenced: must have a real projected CRS
            # (not just EPSG:4326 geographic degrees, where GSD in "degrees"
            # is meaningless for metric scale calibration)
            is_geo = False
            if src.crs is not None:
                try:
                    is_geo = src.crs.is_projected
                except Exception:
                    is_geo = crs_str is not None and crs_str != "EPSG:4326"

            meta = InferenceImageMeta(
                is_georeferenced=is_geo,
                source_path=path,
                height=arr.shape[0],
                width=arr.shape[1],
                n_bands=arr.shape[2],
                dtype=str(arr.dtype),
                crs=crs_str if is_geo else None,
                gsd_m=gsd if is_geo else None,
                bounds=src.bounds if is_geo else None,
                nodata=src.nodata,
                transform_coeffs=tuple(src.transform)[:6] if src.transform else None,
            )
            return arr, meta
    except Exception:
        return None


def _load_with_pil(path: str) -> tuple[np.ndarray, InferenceImageMeta]:
    """
    Fallback loader for PNG/JPG using PIL. Always non-georeferenced.
    """
    from PIL import Image  # type: ignore[import-untyped]

    img = Image.open(path)
    if img.mode == "RGBA":
        img = img.convert("RGB")
    elif img.mode == "L":
        img = img.convert("RGB")
    elif img.mode != "RGB":
        img = img.convert("RGB")

    arr = np.array(img)  # (H, W, 3) uint8

    meta = InferenceImageMeta(
        is_georeferenced=False,
        source_path=path,
        height=arr.shape[0],
        width=arr.shape[1],
        n_bands=arr.shape[2],
        dtype=str(arr.dtype),
    )
    return arr, meta


def load_inference_image(
    path: str, user_gsd_m: float | None = None
) -> tuple[np.ndarray, InferenceImageMeta]:
    """
    Main entry point for inference-time image loading.

    Auto-detects georeferenced (GeoTIFF with projected CRS) vs
    non-georeferenced (PNG/JPG, or GeoTIFF without CRS) inputs.

    Returns (image array (H, W, C), metadata).

    user_gsd_m: optional ground sample distance override — useful when
    a user uploads a non-georeferenced crop but knows the resolution
    (e.g. "this is a 30cm/px satellite image"). If provided AND the
    file isn't georeferenced, this value is stored in metadata for
    downstream scale calibration.
    """
    path_obj = Path(path)
    if not path_obj.exists():
        raise FileNotFoundError(f"Image file not found: {path}")

    suffix = path_obj.suffix.lower()
    supported = {".tif", ".tiff", ".png", ".jpg", ".jpeg"}
    if suffix not in supported:
        raise ValueError(
            f"Unsupported file format '{suffix}'. "
            f"Supported: {', '.join(sorted(supported))}"
        )

    # Try rasterio first (handles GeoTIFF and some other raster formats)
    result = _try_rasterio(path)

    if result is not None:
        arr, meta = result
    else:
        # Fall back to PIL for PNG/JPG
        if suffix in {".png", ".jpg", ".jpeg"}:
            arr, meta = _load_with_pil(path)
        else:
            raise ValueError(
                f"Could not open '{path}' as a raster (rasterio failed) "
                f"or as a regular image. Check the file format."
            )

    # Apply user GSD override for non-georeferenced images
    if user_gsd_m is not None:
        meta.user_gsd_m = user_gsd_m
        if not meta.is_georeferenced:
            meta.gsd_m = user_gsd_m

    return arr, meta


def get_effective_gsd(meta: InferenceImageMeta) -> float | None:
    """
    Returns the best available GSD: file metadata if georeferenced,
    user-supplied override if provided, None if neither.
    """
    if meta.gsd_m is not None:
        return meta.gsd_m
    if meta.user_gsd_m is not None:
        return meta.user_gsd_m
    return None
