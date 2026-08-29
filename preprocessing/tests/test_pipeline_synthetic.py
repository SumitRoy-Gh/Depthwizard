"""
test_pipeline_synthetic.py — proves the wired pipeline runs end-to-end
BEFORE pointing it at real Vaihingen files.

Why synthetic, and why not just load a real Vaihingen tile immediately:
this isolates "is my wiring correct" from "is my real data well-formed".
If the synthetic run has a bug, it's in build_dataset.py/the stage
modules. If it passes here but real Vaihingen fails, the bug is
localized to that specific file's format (band order, nodata value,
CRS, etc.) instead of the pipeline logic itself.

The synthetic scene is built to resemble Vaihingen's actual structure,
not random noise (random noise as a base drowns out real filter/seam
behavior — this was caught and fixed earlier for the large-tiling test):
  - smooth rolling ground elevation (Perlin-ish via summed sine waves)
  - a handful of rectangular "buildings": elevated DSM blocks +
    correspondingly brighter roof reflectance + a darker "shadow" band
    cast to one side of each building
  - realistic 11-bit-in-16-bit imagery counts (0-2047 range, not 0-65535)
  - band order IR, R, G on axis -1, matching Vaihingen's actual layout
  - a nodata border strip to exercise the nodata-detection path
"""
from __future__ import annotations
import sys
import numpy as np
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from preprocessing.pipelines.training import process_scene, normalize_pooled_patches, save_stats


def make_synthetic_scene(h: int = 1024, w: int = 1024, seed: int = 0):
    rng = np.random.default_rng(seed)

    # --- smooth rolling ground elevation, realistic terrain-scale (meters) ---
    yy, xx = np.meshgrid(np.linspace(0, 6, h), np.linspace(0, 6, w), indexing="ij")
    ground = (
        50.0
        + 3.0 * np.sin(xx) * np.cos(yy)
        + 1.5 * np.sin(2.3 * xx + 0.7)
        + 0.5 * rng.normal(size=(h, w))  # mild sensor-scale elevation noise
    )
    dsm = ground.copy()

    # --- base reflectance: smooth, spatially correlated (not white noise) ---
    base = 400 + 200 * np.sin(0.5 * xx) * np.cos(0.4 * yy)
    ir = base + 150 + 20 * rng.normal(size=(h, w))
    r = base + 30 * rng.normal(size=(h, w))
    g = base + 60 + 25 * rng.normal(size=(h, w))

    valid_gt = np.ones((h, w), dtype=bool)

    # --- rectangular buildings: elevated DSM + brighter roof + cast shadow ---
    n_buildings = 12
    for _ in range(n_buildings):
        bh, bw = rng.integers(30, 90), rng.integers(30, 90)
        r0, c0 = rng.integers(0, h - bh), rng.integers(0, w - bw)
        height_m = rng.uniform(6, 35)

        dsm[r0:r0 + bh, c0:c0 + bw] += height_m
        roof_boost = rng.uniform(150, 400)
        ir[r0:r0 + bh, c0:c0 + bw] += roof_boost
        r[r0:r0 + bh, c0:c0 + bw] += roof_boost
        g[r0:r0 + bh, c0:c0 + bw] += roof_boost

        # cast shadow strip to the "south-east" of the building, darker in all bands
        sh_len = int(height_m * 2.5)
        sr0, sr1 = min(r0 + bh, h), min(r0 + bh + sh_len, h)
        sc0, sc1 = c0, min(c0 + bw, w)
        if sr1 > sr0:
            ir[sr0:sr1, sc0:sc1] *= 0.25
            r[sr0:sr1, sc0:sc1] *= 0.25
            g[sr0:sr1, sc0:sc1] *= 0.25

    # --- nodata border strip (sensor gap simulation) ---
    ir[:20, :] = r[:20, :] = g[:20, :] = 0.0
    valid_gt[:20, :] = False

    imagery = np.stack([ir, r, g], axis=-1)
    imagery = np.clip(imagery, 0, 2047).astype(np.uint16)  # 11-bit-in-16-bit, band order IR,R,G

    return imagery, dsm.astype(np.float32), valid_gt


def run_test():
    print("=" * 70)
    print("SYNTHETIC END-TO-END PIPELINE TEST")
    print("=" * 70)

    imagery, dsm, valid_gt = make_synthetic_scene()
    print(f"\nSynthetic scene: imagery {imagery.shape} {imagery.dtype} "
          f"(range {imagery.min()}-{imagery.max()}), dsm {dsm.shape} {dsm.dtype} "
          f"(range {dsm.min():.2f}-{dsm.max():.2f}m)")

    print("\n--- Running process_scene() [stages 1-5] ---")
    patches = process_scene(
        raw_ir_r_g=imagery,
        raw_dsm=dsm,
        source_gsd_m=0.09,       # native Vaihingen GSD
        target_gsd_m=0.09,       # identity resample for this test (isolate stage bugs first)
        tile_size=256,
        stride=256,
        min_valid_fraction=0.6,
    )

    assert len(patches) > 0, "FAIL: no patches survived — pipeline produced nothing usable"
    print(f"\nPASS: {len(patches)} patches produced")

    p0 = patches[0]
    assert p0.imagery.dtype == np.uint8, f"FAIL: expected uint8 imagery patches, got {p0.imagery.dtype}"
    assert p0.imagery.shape == (256, 256, 3), f"FAIL: unexpected patch shape {p0.imagery.shape}"
    assert not np.isnan(p0.dsm).any(), "FAIL: NaNs leaked into a 'kept' patch's DSM"
    print(f"PASS: patch[0] shapes/dtypes correct — imagery {p0.imagery.shape} {p0.imagery.dtype}, "
          f"dsm range {p0.dsm.min():.2f}-{p0.dsm.max():.2f}m, "
          f"valid_mask fraction {p0.valid_mask.mean():.3f}")

    # sanity: the nodata border should have caused the top-row patches to be
    # dropped or at least have reduced valid fraction
    top_row_patches = [p for p in patches if p.row_off == 0]
    if top_row_patches:
        avg_valid = np.mean([p.valid_mask.mean() for p in top_row_patches])
        print(f"CHECK: top-row patches avg valid fraction = {avg_valid:.3f} "
              f"(should be reduced by the synthetic nodata border)")

    print("\n--- Running normalize_pooled_patches() [stage 6] ---")
    records, imagery_stats = normalize_pooled_patches(patches, depth_method="minmax")
    print(f"PASS: {len(records)} normalized records, "
          f"imagery stats mean={[round(m,2) for m in imagery_stats.mean]}, "
          f"std={[round(s,2) for s in imagery_stats.std]}")

    rec0 = records[0]
    img_mean = rec0["imagery"][rec0["valid_mask"]].mean()
    valid_depth = rec0["depth"][rec0["valid_mask"]]
    full_depth_range = (rec0["depth"].min(), rec0["depth"].max())
    print(f"CHECK: record[0] normalized imagery mean over valid px ~ {img_mean:.3f} "
          f"(should be near 0)")
    print(f"CHECK: normalized depth range over VALID px only = "
          f"({valid_depth.min():.4f}, {valid_depth.max():.4f}) (should be ~[0,1])")
    print(f"CHECK: normalized depth range over FULL patch (incl. invalid px) = "
          f"{full_depth_range} (invalid px forced to exactly 0.0, may sit outside [0,1] "
          f"is NOT expected — they must equal 0.0 exactly)")

    assert -1.0 < img_mean < 1.0, "FAIL: normalized imagery mean is not near zero — stats bug"
    assert valid_depth.min() >= -1e-4 and valid_depth.max() <= 1.0001, \
        "FAIL: valid-pixel depth not in expected [0,1] range"
    invalid_depth = rec0["depth"][~rec0["valid_mask"]]
    if invalid_depth.size:
        assert np.allclose(invalid_depth, 0.0), \
            "FAIL: invalid-pixel depth is not forced to 0 — placeholder leaked through normalization"

    print("\n" + "=" * 70)
    print("ALL CHECKS PASSED — pipeline is wired correctly end-to-end.")
    print("Safe to point at a single real Vaihingen tile next, NOT the full dataset.")
    print("=" * 70)

    save_stats(imagery_stats, "synthetic_imagery_stats.json")
    print("\nSaved fitted stats to synthetic_imagery_stats.json (inspect it, "
          "then repeat this same stats-save step on real data once real "
          "patches are pooled).")


if __name__ == "__main__":
    run_test()