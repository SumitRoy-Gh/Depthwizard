"""
export.py — Stage 6: DSM & Derived Products

Converts the calibrated absolute height map (numpy array) into standardized
geospatial deliverables:
  - DSM (Digital Surface Model) GeoTIFF
  - nDSM (Normalized DSM / Above-Ground-Level)
  - Slope map (degrees)
  - Hillshade (shaded relief)
  - Confidence map

These products satisfy the SIH 26175 evaluation criteria (50% DSM accuracy)
and provide the foundation for Stage 7 (3D flythrough).
"""
from __future__ import annotations
import numpy as np
import os

try:
    import rasterio
    from rasterio.transform import from_bounds, Affine
    HAS_RASTERIO = True
except ImportError:
    HAS_RASTERIO = False


# ---------------------------------------------------------------------------
# GeoTIFF Writer
# ---------------------------------------------------------------------------

def write_geotiff(
    array: np.ndarray,
    output_path: str,
    crs: str | None = None,
    transform: tuple | None = None,
    nodata: float | None = None,
    dtype: str = "float32",
) -> str:
    """
    Write a 2D numpy array as a single-band GeoTIFF.

    Args:
        array: (H, W) elevation/product array.
        crs: Coordinate Reference System string (e.g. 'EPSG:32633').
        transform: 6-element affine transform tuple (a, b, c, d, e, f).
        nodata: NoData sentinel value.
        dtype: Output data type.

    Returns:
        The output_path written to.
    """
    if not HAS_RASTERIO:
        raise ImportError("rasterio is required for GeoTIFF export")

    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)

    h, w = array.shape
    affine = Affine(*transform) if transform else Affine(1, 0, 0, 0, -1, h)

    with rasterio.open(
        output_path,
        "w",
        driver="GTiff",
        height=h,
        width=w,
        count=1,
        dtype=dtype,
        crs=crs,
        transform=affine,
        nodata=nodata,
        compress="deflate",
    ) as dst:
        dst.write(array.astype(dtype), 1)

    return output_path


# ---------------------------------------------------------------------------
# nDSM (Normalized DSM / Above-Ground-Level)
# ---------------------------------------------------------------------------

def compute_ndsm(
    dsm: np.ndarray,
    kernel_size: int = 51,
    valid_mask: np.ndarray | None = None,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Compute the Normalized DSM (nDSM / AGL) by estimating a bare-earth DTM
    via morphological opening (minimum filter followed by maximum filter).

    The nDSM isolates the height of structures above the local ground level:
        nDSM = DSM - DTM

    Args:
        dsm: (H, W) absolute elevation array.
        kernel_size: Size of the morphological structuring element.
                     Should be large enough to span buildings but small
                     enough to preserve terrain variation. 51 pixels at
                     ~9cm GSD ≈ 4.6m footprint — appropriate for Vaihingen.
        valid_mask: Optional boolean mask of valid pixels.

    Returns:
        (ndsm, dtm) — both (H, W) float32 arrays.
    """
    from scipy.ndimage import minimum_filter, maximum_filter

    dsm_work = dsm.astype(np.float32).copy()

    # Fill invalid pixels with local max to prevent them from corrupting
    # the morphological filters
    if valid_mask is not None:
        dsm_work[~valid_mask] = np.nanmax(dsm_work[valid_mask]) if valid_mask.any() else 0.0

    # Morphological opening: erode then dilate
    # This removes objects narrower than the kernel (buildings, trees)
    # while preserving the broad terrain surface.
    dtm = minimum_filter(dsm_work, size=kernel_size)
    dtm = maximum_filter(dtm, size=kernel_size)

    ndsm = dsm_work - dtm

    # Clamp negative values (small artifacts from the morphological filter)
    ndsm = np.clip(ndsm, 0.0, None)

    return ndsm.astype(np.float32), dtm.astype(np.float32)


# ---------------------------------------------------------------------------
# Slope Map
# ---------------------------------------------------------------------------

def compute_slope(
    dsm: np.ndarray,
    gsd_m: float = 0.09,
) -> np.ndarray:
    """
    Compute terrain slope in degrees from a DSM.

    Uses numpy gradients (central differences) scaled by the ground
    sample distance to compute the rise/run in both X and Y directions.

    Args:
        dsm: (H, W) elevation array.
        gsd_m: Ground sample distance in meters/pixel.

    Returns:
        (H, W) slope array in degrees (0° = flat, 90° = vertical).
    """
    # Compute gradients (rise per pixel) in Y and X directions
    dy, dx = np.gradient(dsm.astype(np.float64), gsd_m)

    # Slope = arctan(sqrt(dz/dx² + dz/dy²))
    slope_rad = np.arctan(np.sqrt(dx**2 + dy**2))
    slope_deg = np.degrees(slope_rad)

    return slope_deg.astype(np.float32)


# ---------------------------------------------------------------------------
# Hillshade
# ---------------------------------------------------------------------------

def compute_hillshade(
    dsm: np.ndarray,
    gsd_m: float = 0.09,
    azimuth_deg: float = 315.0,
    altitude_deg: float = 45.0,
) -> np.ndarray:
    """
    Compute a hillshade (shaded relief) map simulating directional sunlight.

    This is the standard Esri/GDAL hillshade algorithm:
        shade = cos(zenith) * cos(slope) + sin(zenith) * sin(slope) * cos(azimuth - aspect)

    Args:
        dsm: (H, W) elevation array.
        gsd_m: Ground sample distance in meters/pixel.
        azimuth_deg: Sun azimuth in degrees clockwise from north (315 = NW).
        altitude_deg: Sun altitude in degrees above horizon (45 = typical).

    Returns:
        (H, W) hillshade array in [0, 255] uint8.
    """
    # Convert to radians
    azimuth_rad = np.radians(360.0 - azimuth_deg + 90.0)  # Esri convention
    zenith_rad = np.radians(90.0 - altitude_deg)

    # Surface gradients
    dy, dx = np.gradient(dsm.astype(np.float64), gsd_m)

    slope_rad = np.arctan(np.sqrt(dx**2 + dy**2))
    aspect_rad = np.arctan2(-dy, dx)

    # Hillshade formula
    shade = (
        np.cos(zenith_rad) * np.cos(slope_rad)
        + np.sin(zenith_rad) * np.sin(slope_rad) * np.cos(azimuth_rad - aspect_rad)
    )

    # Clamp and scale to 0-255
    shade = np.clip(shade, 0, 1)
    shade = (shade * 255).astype(np.uint8)

    return shade


# ---------------------------------------------------------------------------
# Confidence Map
# ---------------------------------------------------------------------------

def compute_confidence_map(
    valid_mask: np.ndarray,
    ransac_inlier_mask: np.ndarray | None = None,
) -> np.ndarray:
    """
    Combine validity and RANSAC inlier information into a single confidence
    map with values:
        0 = invalid (cloud/nodata)
        1 = valid but RANSAC outlier (low confidence)
        2 = valid and RANSAC inlier (high confidence)

    If no RANSAC mask is provided, all valid pixels get confidence 2.

    Args:
        valid_mask: (H, W) boolean mask of valid pixels.
        ransac_inlier_mask: (H, W) boolean mask of RANSAC inliers (optional).

    Returns:
        (H, W) uint8 confidence map.
    """
    confidence = np.zeros(valid_mask.shape, dtype=np.uint8)
    confidence[valid_mask] = 2  # high confidence by default

    if ransac_inlier_mask is not None:
        # Valid but outlier -> low confidence
        outlier = valid_mask & ~ransac_inlier_mask
        confidence[outlier] = 1

    return confidence


# ---------------------------------------------------------------------------
# Full Stage 6 Pipeline
# ---------------------------------------------------------------------------

def generate_all_products(
    dsm: np.ndarray,
    output_dir: str,
    scene_name: str = "scene",
    crs: str | None = None,
    transform: tuple | None = None,
    gsd_m: float = 0.09,
    valid_mask: np.ndarray | None = None,
    ransac_inlier_mask: np.ndarray | None = None,
    ndsm_kernel: int = 51,
) -> dict[str, str]:
    """
    Generate ALL Stage 6 products from a calibrated DSM array.

    Args:
        dsm: (H, W) calibrated absolute elevation array.
        output_dir: Directory to write the product GeoTIFFs into.
        scene_name: Name prefix for the output files.
        crs: CRS string.
        transform: Affine transform tuple.
        gsd_m: Ground sample distance in meters.
        valid_mask: Boolean valid-pixel mask.
        ransac_inlier_mask: Boolean RANSAC inlier mask.
        ndsm_kernel: Morphological kernel size for nDSM computation.

    Returns:
        dict mapping product name to output file path.
    """
    os.makedirs(output_dir, exist_ok=True)
    products = {}

    # 1. DSM
    dsm_path = os.path.join(output_dir, f"{scene_name}_DSM.tif")
    write_geotiff(dsm, dsm_path, crs=crs, transform=transform)
    products["dsm"] = dsm_path
    print(f"  [OK] DSM -> {dsm_path}")

    # 2. nDSM (Above-Ground-Level)
    ndsm, dtm = compute_ndsm(dsm, kernel_size=ndsm_kernel, valid_mask=valid_mask)
    ndsm_path = os.path.join(output_dir, f"{scene_name}_nDSM.tif")
    write_geotiff(ndsm, ndsm_path, crs=crs, transform=transform)
    products["ndsm"] = ndsm_path
    print(f"  [OK] nDSM -> {ndsm_path}")

    # Also export DTM
    dtm_path = os.path.join(output_dir, f"{scene_name}_DTM.tif")
    write_geotiff(dtm, dtm_path, crs=crs, transform=transform)
    products["dtm"] = dtm_path
    print(f"  [OK] DTM -> {dtm_path}")

    # 3. Slope Map
    slope = compute_slope(dsm, gsd_m=gsd_m)
    slope_path = os.path.join(output_dir, f"{scene_name}_slope.tif")
    write_geotiff(slope, slope_path, crs=crs, transform=transform)
    products["slope"] = slope_path
    print(f"  [OK] Slope -> {slope_path}")

    # 4. Hillshade
    hillshade = compute_hillshade(dsm, gsd_m=gsd_m)
    hillshade_path = os.path.join(output_dir, f"{scene_name}_hillshade.tif")
    write_geotiff(hillshade, hillshade_path, crs=crs, transform=transform, dtype="uint8")
    products["hillshade"] = hillshade_path
    print(f"  [OK] Hillshade -> {hillshade_path}")

    # 5. Confidence Map
    if valid_mask is not None:
        conf = compute_confidence_map(valid_mask, ransac_inlier_mask)
        conf_path = os.path.join(output_dir, f"{scene_name}_confidence.tif")
        write_geotiff(conf, conf_path, crs=crs, transform=transform, dtype="uint8")
        products["confidence"] = conf_path
        print(f"  [OK] Confidence -> {conf_path}")

    return products
