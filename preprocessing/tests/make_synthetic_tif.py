"""
make_synthetic_tif.py — writes a synthetic scene to REAL GeoTIFF files on
disk, so the ingest.py path (rasterio.open -> array) gets exercised
exactly like it will be for an actual uploaded .tif — not just handed a
NumPy array directly, which is what test_pipeline_synthetic.py did.

Writes two files, matching Vaihingen's real orthophoto + DSM pair
structure:
  - synthetic_imagery.tif : 3-band uint16, band order IR, R, G
  - synthetic_dsm.tif     : 1-band float32 elevation

Both share a fake-but-valid projected CRS (EPSG:32633, UTM zone 33N —
Vaihingen's actual zone) and the same GSD/transform, so ingest.load_scene's
GSD/shape validation passes the way it should for a well-formed upload.
"""
from __future__ import annotations
import sys
from pathlib import Path
import numpy as np
import rasterio
from rasterio.transform import from_origin
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from preprocessing.tests.test_pipeline_synthetic import make_synthetic_scene


def write_synthetic_tifs(
    out_dir: str,
    gsd_m: float = 0.09,
    h: int = 1024,
    w: int = 1024,
    origin_x: float = 500000.0,
    origin_y: float = 5400000.0,
    crs: str = "EPSG:32633",
    seed: int = 0,
) -> tuple[str, str]:
    """
    Builds the synthetic scene (reusing the exact same generator the
    in-memory test uses, so results are comparable) and writes it to
    two real GeoTIFFs. Returns (imagery_path, dsm_path).
    """
    imagery, dsm, _valid_gt = make_synthetic_scene(h=h, w=w, seed=seed)

    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    imagery_path = str(out / "synthetic_imagery.tif")
    dsm_path = str(out / "synthetic_dsm.tif")

    transform = from_origin(origin_x, origin_y, gsd_m, gsd_m)

    # imagery: 3-band uint16, band order IR, R, G (matches Vaihingen's
    # actual layout, container tag notwithstanding)
    with rasterio.open(
        imagery_path, "w", driver="GTiff",
        height=h, width=w, count=3, dtype=imagery.dtype,
        crs=crs, transform=transform, nodata=0,
    ) as dst:
        for i in range(3):
            dst.write(imagery[..., i], i + 1)
        dst.descriptions = ("IR", "R", "G")

    # DSM: single-band float32 elevation, LiDAR-style (independent of
    # the imagery's own internal noise/shadow patterns, by construction
    # of make_synthetic_scene)
    with rasterio.open(
        dsm_path, "w", driver="GTiff",
        height=h, width=w, count=1, dtype=dsm.dtype,
        crs=crs, transform=transform, nodata=-9999.0,
    ) as dst:
        dst.write(dsm, 1)

    return imagery_path, dsm_path


if __name__ == "__main__":
    imagery_path, dsm_path = write_synthetic_tifs(out_dir="../data/synthetic")
    print(f"wrote {imagery_path}")
    print(f"wrote {dsm_path}")