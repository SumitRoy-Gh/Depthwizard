"""
dem_fetcher.py

Fetches coarse global DEMs (Copernicus GLO-30 or SRTM) for a given geographic
bounding box using the OpenTopography API. This provides a robust "base elevation"
anchor for cross-scene calibration, resolving the systematic shift error.
"""
from __future__ import annotations
import os
import urllib.request
import tempfile
import numpy as np
import rasterio
from rasterio.warp import transform_bounds


def get_wgs84_bounds(image_path: str) -> tuple[float, float, float, float]:
    """
    Extracts the bounding box of a GeoTIFF and converts it to WGS84 (EPSG:4326).
    Returns (west, south, east, north) aka (min_lon, min_lat, max_lon, max_lat).
    """
    with rasterio.open(image_path) as src:
        crs = src.crs
        if crs is None:
            # Fallback for ISPRS Vaihingen dataset which lacks embedded CRS tags sometimes
            print(f"    [WARN] No CRS found in {image_path}, assuming EPSG:32633 (Vaihingen).")
            crs = "EPSG:32633"
        
        bounds = src.bounds
        # transform_bounds(source_crs, target_crs, left, bottom, right, top)
        # returns (west, south, east, north)
        return transform_bounds(crs, "EPSG:4326", *bounds)


def fetch_base_elevation(
    image_path: str,
    dem_type: str = "COP30",
    api_key: str | None = None
) -> float:
    """
    Fetches the coarse DEM for the area covered by `image_path` and computes
    its median elevation. 

    Args:
        image_path: Path to the georeferenced imagery/GeoTIFF.
        dem_type: "COP30", "SRTMGL3", or "SRTMGL1".
        api_key: OpenTopography API key. If None, reads from OPENTOPOGRAPHY_API_KEY env var.

    Returns:
        The median elevation (meters) of the coarse DEM for this region.
    """
    env_path = os.path.join(os.path.dirname(__file__), "..", "..", ".env")
    if os.path.isfile(env_path):
        with open(env_path, "r") as f:
            for line in f:
                if line.startswith("OPENTOPOGRAPHY_API_KEY="):
                    val = line.split("=", 1)[1].strip().strip('"').strip("'")
                    os.environ["OPENTOPOGRAPHY_API_KEY"] = val

    key = api_key or os.environ.get("OPENTOPOGRAPHY_API_KEY")
    if not key:
        raise ValueError(
            "OpenTopography API key is required to fetch coarse DEMs.\n"
            "Please register for free at https://portal.opentopography.org/myopentopo\n"
            "and set the OPENTOPOGRAPHY_API_KEY environment variable."
        )

    west, south, east, north = get_wgs84_bounds(image_path)
    
    # OpenTopography REST API URL
    url = (
        f"https://portal.opentopography.org/API/globaldem"
        f"?demtype={dem_type}"
        f"&south={south}&north={north}&west={west}&east={east}"
        f"&outputFormat=GTiff"
        f"&API_Key={key}"
    )

    with tempfile.NamedTemporaryFile(suffix=".tif", delete=False) as tmp:
        out_path = tmp.name

    try:
        urllib.request.urlretrieve(url, out_path)
        
        # Read the downloaded DEM and calculate the median elevation
        with rasterio.open(out_path) as src:
            dem = src.read(1)
            nodata = src.nodata
            
            if nodata is not None:
                valid_mask = (dem != nodata)
            else:
                valid_mask = np.ones_like(dem, dtype=bool)
                
            if not valid_mask.any():
                raise RuntimeError("Fetched DEM contains only nodata values.")
                
            median_elev = float(np.median(dem[valid_mask]))
            return median_elev

    except urllib.error.HTTPError as e:
        error_msg = e.read().decode('utf-8', errors='ignore')
        raise RuntimeError(f"OpenTopography API failed: {e.code} - {error_msg}")
    finally:
        if os.path.exists(out_path):
            os.remove(out_path)
