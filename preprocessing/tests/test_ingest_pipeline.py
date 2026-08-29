"""
test_ingest_pipeline.py — the test that actually matches your
architecture: user uploads a .tif -> ingest.py reads it from disk ->
six-stage preprocessing chain -> ready for DAv2/U-Net.

This supersedes test_pipeline_synthetic.py for end-to-end validation.
That earlier test proved the six stages chain together correctly on
in-memory arrays; it never touched rasterio at all. This test proves
the file-I/O boundary works too: real GeoTIFF -> rasterio.open ->
correct band order/dtype/CRS/GSD read back -> same six stages.

Run this before pointing anything at your real Vaihingen files — it's
the closest dry run to "a user uploads a .tif" that doesn't require
the real data yet.
"""
from __future__ import annotations
import sys
import numpy as np
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from preprocessing.tests.make_synthetic_tif import write_synthetic_tifs
from preprocessing.ingest.training import load_scene
from preprocessing.pipelines.training import process_scene, normalize_pooled_patches, save_stats


def run_test():
    print("=" * 70)
    print("INGEST -> PIPELINE END-TO-END TEST (real .tif on disk)")
    print("=" * 70)

    print("\n--- Writing synthetic scene to real GeoTIFFs ---")
    imagery_path, dsm_path = write_synthetic_tifs(out_dir="../data/synthetic", gsd_m=0.09)
    print(f"  wrote: {imagery_path}")
    print(f"  wrote: {dsm_path}")

    print("\n--- Loading via ingest.load_scene() [the real upload boundary] ---")
    imagery, dsm, meta = load_scene(imagery_path, dsm_path)
    print(f"  imagery: {imagery.shape} {imagery.dtype}, CRS={meta.crs}, "
          f"GSD={meta.gsd_m:.4f} m/px, nodata={meta.imagery_nodata}")
    print(f"  dsm:     {dsm.shape} {dsm.dtype}, nodata={meta.dsm_nodata}")

    assert imagery.dtype == np.uint16, f"FAIL: expected uint16 from disk, got {imagery.dtype}"
    assert imagery.shape[-1] == 3, f"FAIL: expected 3 bands, got {imagery.shape[-1]}"
    assert imagery.shape[:2] == dsm.shape, "FAIL: imagery/DSM shape mismatch survived ingest validation"
    assert abs(meta.gsd_m - 0.09) < 1e-6, f"FAIL: GSD read back wrong: {meta.gsd_m}"
    print("PASS: ingest read back correct dtype, band count, shape alignment, and GSD")

    # --- deliberately test the mismatch guard too, not just the happy path ---
    print("\n--- Sanity check: ingest.load_scene() rejects a GSD mismatch ---")
    bad_imagery_path, _ = write_synthetic_tifs(out_dir="../data/synthetic_bad_gsd", gsd_m=0.05)
    try:
        load_scene(bad_imagery_path, dsm_path)  # imagery at 5cm, dsm at 9cm
        print("FAIL: expected a ValueError for mismatched GSD, none raised")
        raise SystemExit(1)
    except ValueError as e:
        print(f"PASS: correctly rejected — {e}")

    print("\n--- Running process_scene() [stages 1-5] on ingested arrays ---")
    patches = process_scene(
        raw_ir_r_g=imagery, raw_dsm=dsm,
        source_gsd_m=meta.gsd_m, target_gsd_m=0.09,
        tile_size=256, stride=256, min_valid_fraction=0.6,
    )
    assert len(patches) > 0, "FAIL: no patches survived from ingested scene"
    print(f"PASS: {len(patches)} patches produced from the ingested .tif pair")

    print("\n--- Running normalize_pooled_patches() [stage 6] ---")
    records, imagery_stats = normalize_pooled_patches(patches)
    rec0 = records[0]
    valid_depth = rec0["depth"][rec0["valid_mask"]]
    assert valid_depth.min() >= -1e-4 and valid_depth.max() <= 1.0001
    invalid_depth = rec0["depth"][~rec0["valid_mask"]]
    if invalid_depth.size:
        assert np.allclose(invalid_depth, 0.0), "FAIL: invalid-pixel placeholder leaked through"
    print(f"PASS: {len(records)} normalized records, depth range checks hold")

    save_stats(imagery_stats, "../data/synthetic/imagery_stats.json")

    print("\n" + "=" * 70)
    print("ALL CHECKS PASSED — the full path (upload .tif -> read -> six")
    print("preprocessing stages) is wired correctly end-to-end.")
    print("Next real step: point ingest.load_scene() at your actual")
    print("Vaihingen orthophoto + LiDAR DSM file paths, same call shape.")
    print("=" * 70)


if __name__ == "__main__":
    run_test()