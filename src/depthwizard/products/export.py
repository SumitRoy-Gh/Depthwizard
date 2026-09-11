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
    gsd_m: float = 0.09,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Compute the Normalized DSM (nDSM / AGL) by estimating a bare-earth DTM
    via a Progressive Morphological Filter (PMF).

    The nDSM isolates the height of structures above the local ground level:
        nDSM = max(0, DSM - DTM)

    Args:
        dsm: (H, W) absolute elevation array.
        kernel_size: Max window size of the morphological structuring element.
        valid_mask: Optional boolean mask of valid pixels.
        gsd_m: Ground sample distance in meters.

    Returns:
        (ndsm, dtm) — both (H, W) float32 arrays.
    """
    from scipy.ndimage import minimum_filter, maximum_filter

    dsm_work = dsm.astype(np.float32).copy()

    if valid_mask is not None:
        dsm_work[~valid_mask] = np.nanmax(dsm_work[valid_mask]) if valid_mask.any() else 0.0

    # Progressive Morphological Filter (PMF)
    # Parameters for urban PMF
    slope_threshold = 0.15
    initial_dh = 0.2
    max_dh = 4.0
    
    dtm = dsm_work.copy()

    # 2. Iterative Morphological Filtering (Progressive Window Sizes)
    last_surface = dtm.copy()
    
    # We want a maximum window size that covers ~45 meters.
    # At 9cm GSD, 45 meters / 0.09 = 500 pixels.
    max_window_size = 501    
    dtm = dsm_work.copy()
    
    # Sequence of window sizes.
    # Legacy kernel_size of 51 (~4.6m) is too small to remove real buildings.
    actual_max_kernel = max(kernel_size, max_window_size)
    
    window_sizes = [3, 5, 7]
    k = 11
    while k <= actual_max_kernel:
        window_sizes.append(k)
        if k < 51:
            k += 10
        elif k < 101:
            k += 20
        elif k < 501:
            k += 50
        else:
            k += 250
            
    if window_sizes[-1] != actual_max_kernel:
        window_sizes.append(actual_max_kernel)

    last_surface = dsm_work.copy()
    
    for i, w in enumerate(window_sizes):
        # Opening with mode='nearest' to preserve boundary invariants
        opened = minimum_filter(last_surface, size=w, mode='nearest')
        opened = maximum_filter(opened, size=w, mode='nearest')
        
        if i == 0:
            dh_T = initial_dh
        else:
            w_prev = window_sizes[i-1]
            dh_T = slope_threshold * (w - w_prev) * gsd_m + initial_dh
            
        dh_T = min(dh_T, max_dh)
        
        diff = last_surface - opened
        non_ground_mask = diff > dh_T
        
        dtm = np.where(non_ground_mask, opened, dtm)
        last_surface = opened

    ndsm = dsm_work - dtm

    # Clamp negative values (small artifacts). Since mode='nearest' is used,
    # DTM <= DSM holds mathematically everywhere except possibly tiny numeric noise
    # or edges. The clamping here is negligible-noise correction.
    ndsm = np.clip(ndsm, 0.0, None)

    # Restore invalid regions to original values to avoid invariant violations
    if valid_mask is not None:
        dtm[~valid_mask] = dsm[~valid_mask]
        ndsm[~valid_mask] = 0.0

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
    dsm: np.ndarray | None = None,
    dtm: np.ndarray | None = None,
    inversion_tolerance: float = 0.05,
) -> np.ndarray:
    """
    Combine validity and RANSAC inlier information into a single confidence
    map with values:
        0 = invalid (cloud/nodata) or physical invariant violation
        1 = valid but RANSAC outlier (low confidence)
        2 = valid and RANSAC inlier (high confidence)

    Explicit contract: Any pixel where DSM < DTM - tolerance MUST be flagged
    as low confidence (0 or 1), because this violates the physical bare-earth
    invariant (DTM <= DSM).

    Args:
        valid_mask: (H, W) boolean mask of valid pixels.
        ransac_inlier_mask: (H, W) boolean mask of RANSAC inliers (optional).
        dsm: (H, W) absolute elevation array.
        dtm: (H, W) bare-earth model array.
        inversion_tolerance: Numeric tolerance for DTM > DSM (in meters).

    Returns:
        (H, W) uint8 confidence map.
    """
    confidence = np.zeros(valid_mask.shape, dtype=np.uint8)
    confidence[valid_mask] = 2  # high confidence by default

    if ransac_inlier_mask is not None:
        # Valid but outlier -> low confidence
        outlier = valid_mask & ~ransac_inlier_mask
        confidence[outlier] = 1

    # Contract: DTM must be <= DSM. Flag inversions as low confidence.
    if dsm is not None and dtm is not None:
        inversion = dsm < (dtm - inversion_tolerance)
        confidence[inversion] = 0

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
    ndsm, dtm = compute_ndsm(dsm, kernel_size=ndsm_kernel, valid_mask=valid_mask, gsd_m=gsd_m)
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
        conf = compute_confidence_map(
            valid_mask, 
            ransac_inlier_mask, 
            dsm=dsm, 
            dtm=dtm
        )
        conf_path = os.path.join(output_dir, f"{scene_name}_confidence.tif")
        write_geotiff(conf, conf_path, crs=crs, transform=transform, dtype="uint8")
        products["confidence"] = conf_path
        print(f"  [OK] Confidence -> {conf_path}")

    return products
