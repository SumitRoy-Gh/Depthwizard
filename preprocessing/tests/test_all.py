"""
test_all.py — comprehensive automated test suite for the ENTIRE
DepthWizard preprocessing pipeline.

Tests both the TRAINING path (imagery + DSM → patches → normalized)
and the INFERENCE path (single image, no DSM → preprocessed output).

Run from the preprocessing/ directory:
    python test_all.py

Every test prints PASS/FAIL and the script exits with code 0 only if
ALL tests pass.
"""
from __future__ import annotations
import sys
import os
import json
import tempfile
import traceback
import numpy as np
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

# ── Imports (every module in the pipeline) ──────────────────────────
from preprocessing.stages.radiometric_correction import (
    percentile_stretch, stretch_multiband, build_dav2_rgb_proxy,
    radiometric_correction_pipeline,
)
from preprocessing.stages.cloud_shadow_masking import (
    detect_nodata, detect_shadow, detect_cloud, compute_valid_mask,
)
from preprocessing.stages.noise_reduction import denoise_imagery, denoise_dsm
from preprocessing.stages.contrast_enhancement import enhance_contrast
from preprocessing.stages.resolution_handling import resample_to_gsd, align_dataset_to_common_gsd
from preprocessing.stages.tiling import crop_patches, Patch
from preprocessing.stages.data_normalisation import (
    compute_dataset_stats, normalize_image, denormalize_image,
    normalize_depth_per_patch, denormalize_depth_per_patch, ChannelStats,
)
from preprocessing.pipelines.training import process_scene, normalize_pooled_patches, save_stats
from preprocessing.ingest.inference import load_inference_image, get_effective_gsd
from preprocessing.pipelines.inference import preprocess_for_inference


# ── Helpers ─────────────────────────────────────────────────────────

PASS_COUNT = 0
FAIL_COUNT = 0
TESTS_RUN = []


def check(name: str, condition: bool, detail: str = ""):
    global PASS_COUNT, FAIL_COUNT
    TESTS_RUN.append(name)
    if condition:
        PASS_COUNT += 1
        print(f"  [PASS] {name}")
    else:
        FAIL_COUNT += 1
        msg = f"  [FAIL] {name}"
        if detail:
            msg += f" — {detail}"
        print(msg)


def make_synthetic_scene(h=512, w=512, seed=42):
    """Small synthetic scene for fast testing."""
    rng = np.random.default_rng(seed)
    yy, xx = np.meshgrid(np.linspace(0, 4, h), np.linspace(0, 4, w), indexing="ij")
    ground = 50.0 + 3.0 * np.sin(xx) * np.cos(yy) + 0.3 * rng.normal(size=(h, w))
    dsm = ground.copy()

    base = 400 + 200 * np.sin(0.5 * xx) * np.cos(0.4 * yy)
    ir = base + 150 + 20 * rng.normal(size=(h, w))
    r = base + 30 * rng.normal(size=(h, w))
    g = base + 60 + 25 * rng.normal(size=(h, w))

    # Add a building
    dsm[100:180, 100:180] += 20
    ir[100:180, 100:180] += 250
    r[100:180, 100:180] += 250
    g[100:180, 100:180] += 250

    # Shadow strip
    ir[180:220, 100:180] *= 0.25
    r[180:220, 100:180] *= 0.25
    g[180:220, 100:180] *= 0.25

    # Nodata border
    ir[:10, :] = r[:10, :] = g[:10, :] = 0.0

    imagery = np.stack([ir, r, g], axis=-1)
    imagery = np.clip(imagery, 0, 2047).astype(np.uint16)
    return imagery, dsm.astype(np.float32)


# ── Test Groups ─────────────────────────────────────────────────────

def test_radiometric_correction():
    print("\n-- Stage 1: Radiometric Correction --")
    rng = np.random.default_rng(0)
    raw = rng.integers(0, 2048, size=(64, 64, 3), dtype=np.uint16)

    # percentile_stretch
    band = raw[..., 0]
    stretched = percentile_stretch(band)
    check("percentile_stretch returns uint8", stretched.dtype == np.uint8)
    check("percentile_stretch range [0, 255]", stretched.min() >= 0 and stretched.max() <= 255)

    # stretch_multiband
    multi = stretch_multiband(raw)
    check("stretch_multiband returns uint8", multi.dtype == np.uint8)
    check("stretch_multiband preserves shape", multi.shape == raw.shape)

    # build_dav2_rgb_proxy
    proxy = build_dav2_rgb_proxy(multi)
    check("dav2_proxy shape matches input", proxy.shape == multi.shape)
    check("dav2_proxy band 0 == input band 1 (R slot)", np.array_equal(proxy[..., 0], multi[..., 1]))
    check("dav2_proxy band 1 == input band 2 (G slot)", np.array_equal(proxy[..., 1], multi[..., 2]))
    check("dav2_proxy band 2 == input band 2 (G dup)", np.array_equal(proxy[..., 2], multi[..., 2]))

    # full pipeline
    result = radiometric_correction_pipeline(raw)
    check("pipeline returns unet_input", "unet_input" in result)
    check("pipeline returns dav2_input", "dav2_input" in result)
    check("pipeline unet_input dtype uint8", result["unet_input"].dtype == np.uint8)
    check("pipeline dav2_input dtype uint8", result["dav2_input"].dtype == np.uint8)


def test_cloud_shadow_masking():
    print("\n-- Stage 2: Cloud/Shadow Masking --")
    img = np.full((64, 64, 3), 128, dtype=np.uint8)

    # Nodata detection
    img_with_nodata = img.copy()
    img_with_nodata[:5, :, :] = 0
    nodata = detect_nodata(img_with_nodata, nodata_value=0)
    check("detect_nodata finds zero rows", nodata[:5, :].all())
    check("detect_nodata spares valid rows", not nodata[5:, :].any())

    # Shadow detection
    img_with_shadow = img.copy()
    img_with_shadow[30:40, 30:40, :] = 10  # very dark patch
    shadow = detect_shadow(img_with_shadow, shadow_pct=10.0)
    check("detect_shadow flags dark patch", shadow[35, 35])

    # Cloud detection
    img_with_cloud = img.copy()
    img_with_cloud[50:60, 50:60, :] = 255  # saturated bright patch
    cloud = detect_cloud(img_with_cloud, cloud_pct=95.0, min_bright_bands=2)
    check("detect_cloud flags bright patch", cloud[55, 55])

    # Full mask
    combo_img = img.copy()
    combo_img[:5, :, :] = 0  # nodata
    mask = compute_valid_mask(combo_img, shadow_pct=5.0, cloud_pct=99.5)
    check("compute_valid_mask returns bool", mask.dtype == bool)
    check("compute_valid_mask shape correct", mask.shape == (64, 64))
    check("nodata rows are invalid", not mask[:5, :].any())


def test_noise_reduction():
    print("\n-- Stage 3: Noise Reduction --")
    rng = np.random.default_rng(1)

    # Imagery denoising
    noisy_img = np.clip(128 + 30 * rng.normal(size=(64, 64, 3)), 0, 255).astype(np.uint8)
    denoised = denoise_imagery(noisy_img)
    check("denoise_imagery preserves shape", denoised.shape == noisy_img.shape)
    check("denoise_imagery preserves dtype", denoised.dtype == np.uint8)

    # DSM denoising
    dsm = 50.0 + rng.normal(size=(64, 64)).astype(np.float32)
    dsm[10, 10] = 999.0  # spike
    mask = np.ones((64, 64), dtype=bool)
    mask[0:3, :] = False
    filtered = denoise_dsm(dsm, kernel_size=3, valid_mask=mask)
    check("denoise_dsm preserves shape", filtered.shape == dsm.shape)
    check("denoise_dsm reduces spike", abs(filtered[10, 10]) < abs(dsm[10, 10]))
    check("denoise_dsm invalid -> NaN", np.isnan(filtered[1, 1]))


def test_contrast_enhancement():
    print("\n-- Stage 4: Contrast Enhancement (CLAHE) --")
    img = np.full((64, 64, 3), 100, dtype=np.uint8)
    # Add some gradient to make CLAHE do something
    img[:, :32, :] = 60
    img[:, 32:, :] = 180

    enhanced = enhance_contrast(img)
    check("CLAHE returns uint8", enhanced.dtype == np.uint8)
    check("CLAHE preserves shape", enhanced.shape == img.shape)
    check("CLAHE changes pixel values", not np.array_equal(enhanced, img))

    # With valid mask
    mask = np.ones((64, 64), dtype=bool)
    mask[:5, :] = False
    enhanced_masked = enhance_contrast(img, valid_mask=mask)
    check("CLAHE with mask returns uint8", enhanced_masked.dtype == np.uint8)
    check("CLAHE with mask preserves shape", enhanced_masked.shape == img.shape)

    # Rejects non-uint8
    try:
        enhance_contrast(img.astype(np.float32))
        check("CLAHE rejects float32 input", False, "should have raised ValueError")
    except ValueError:
        check("CLAHE rejects float32 input", True)


def test_resolution_handling():
    print("\n-- Stage 5: Resolution Handling --")
    arr = np.random.rand(64, 64, 3).astype(np.float32)

    # Identity resample (scale_factor ≈ 1.0)
    result = resample_to_gsd(arr, 0.09, 0.09)
    check("identity resample preserves shape", result.shape == arr.shape)
    check("identity resample preserves values", np.allclose(result, arr))

    # Downsample (2x coarser)
    down = resample_to_gsd(arr, 0.05, 0.10)
    check("downsample reduces spatial dims", down.shape[0] < arr.shape[0])
    check("downsample preserves channel dim", down.shape[2] == 3)

    # dtype preservation
    uint8_arr = (arr * 255).astype(np.uint8)
    result_u8 = resample_to_gsd(uint8_arr, 0.05, 0.10)
    check("resample preserves uint8 dtype", result_u8.dtype == np.uint8)

    # 2D array
    dsm = np.random.rand(64, 64).astype(np.float32)
    dsm_down = resample_to_gsd(dsm, 0.05, 0.10)
    check("resample 2D array works", dsm_down.ndim == 2 and dsm_down.shape[0] < 64)

    # align_dataset_to_common_gsd
    imagery = np.random.rand(64, 64, 3).astype(np.float32)
    dsm_arr = np.random.rand(64, 64).astype(np.float32)
    mask_arr = np.ones((64, 64), dtype=bool)
    aligned = align_dataset_to_common_gsd(imagery, dsm_arr, mask_arr, 0.09, 0.09)
    check("align returns imagery key", "imagery" in aligned)
    check("align returns dsm key", "dsm" in aligned)
    check("align returns valid_mask key", "valid_mask" in aligned)


def test_tiling():
    print("\n-- Stage 6: Tiling --")
    imagery = np.random.rand(256, 256, 3).astype(np.float32)
    dsm = np.random.rand(256, 256).astype(np.float32)
    mask = np.ones((256, 256), dtype=bool)

    patches = crop_patches(imagery, dsm, mask, tile_size=128, stride=128)
    check("tiling produces patches", len(patches) > 0)
    check("tiling produces 4 non-overlapping patches", len(patches) == 4)

    p = patches[0]
    check("patch imagery shape correct", p.imagery.shape == (128, 128, 3))
    check("patch dsm shape correct", p.dsm.shape == (128, 128))
    check("patch valid_mask shape correct", p.valid_mask.shape == (128, 128))

    # Patches with low valid fraction should be dropped
    bad_mask = np.zeros((256, 256), dtype=bool)
    bad_mask[0:30, 0:30] = True  # only a tiny corner is valid
    patches_filtered = crop_patches(imagery, dsm, bad_mask, tile_size=128, min_valid_fraction=0.6)
    check("patches with low validity are dropped", len(patches_filtered) == 0)


def test_data_normalization():
    print("\n-- Stage 7: Data Normalization --")
    rng = np.random.default_rng(2)

    # Create some fake patches
    patches = [rng.normal(50, 10, size=(32, 32, 3)).astype(np.float32) for _ in range(5)]
    masks = [np.ones((32, 32), dtype=bool) for _ in range(5)]

    stats = compute_dataset_stats(patches, masks)
    check("stats has 3-channel mean", len(stats.mean) == 3)
    check("stats has 3-channel std", len(stats.std) == 3)
    check("stats mean is reasonable", all(40 < m < 60 for m in stats.mean))
    check("stats std is reasonable", all(5 < s < 20 for s in stats.std))

    # Normalize and check
    normed = normalize_image(patches[0], stats)
    valid_mean = abs(normed[masks[0]].mean())
    check("normalized imagery mean near 0", valid_mean < 2.0)

    # Round-trip: normalize → denormalize
    recovered = denormalize_image(normed, stats)
    check("denormalize round-trip", np.allclose(recovered, patches[0], atol=0.1))

    # Depth normalization (minmax)
    depth = rng.uniform(40, 80, size=(32, 32)).astype(np.float32)
    d_norm, params = normalize_depth_per_patch(depth, method="minmax")
    check("depth minmax in [0,1]", d_norm.min() >= -1e-4 and d_norm.max() <= 1.0001)
    check("depth params has method", params["method"] == "minmax")
    d_back = denormalize_depth_per_patch(d_norm, params)
    check("depth denorm round-trip", np.allclose(d_back, depth, atol=0.01))

    # Depth normalization (zscore)
    d_norm_z, params_z = normalize_depth_per_patch(depth, method="zscore")
    check("depth zscore params", params_z["method"] == "zscore")
    d_back_z = denormalize_depth_per_patch(d_norm_z, params_z)
    check("depth zscore round-trip", np.allclose(d_back_z, depth, atol=0.01))

    # Degenerate patch (all same value)
    flat_depth = np.full((32, 32), 55.0, dtype=np.float32)
    d_norm_flat, params_flat = normalize_depth_per_patch(flat_depth, method="minmax")
    check("degenerate depth -> zeros", np.allclose(d_norm_flat, 0.0))
    check("degenerate depth flagged", params_flat["degenerate"] is True)


def test_training_pipeline_e2e():
    print("\n-- Training Pipeline End-to-End --")
    imagery, dsm = make_synthetic_scene(h=512, w=512)

    patches = process_scene(
        raw_ir_r_g=imagery, raw_dsm=dsm,
        source_gsd_m=0.09, target_gsd_m=0.09,
        tile_size=256, stride=256, min_valid_fraction=0.5,
        verbose=False,
    )
    check("training pipeline produces patches", len(patches) > 0)

    p0 = patches[0]
    check("patch imagery is uint8", p0.imagery.dtype == np.uint8)
    check("patch imagery shape (256,256,3)", p0.imagery.shape == (256, 256, 3))
    check("patch DSM has no NaN", not np.isnan(p0.dsm).any())

    # Stage 7: normalization
    records, stats = normalize_pooled_patches(patches, depth_method="minmax")
    check("normalization produces records", len(records) == len(patches))
    check("stats has 3 channels", len(stats.mean) == 3)

    rec0 = records[0]
    valid_depth = rec0["depth"][rec0["valid_mask"]]
    check("valid depth in [0,1]", valid_depth.min() >= -1e-4 and valid_depth.max() <= 1.0001)

    invalid_depth = rec0["depth"][~rec0["valid_mask"]]
    if invalid_depth.size > 0:
        check("invalid depth forced to 0", np.allclose(invalid_depth, 0.0))

    # save_stats round-trip
    tmp_path = os.path.join(tempfile.gettempdir(), "test_stats.json")
    save_stats(stats, tmp_path)
    with open(tmp_path) as f:
        loaded = json.load(f)
    check("saved stats has mean key", "mean" in loaded)
    check("saved stats has std key", "std" in loaded)
    os.remove(tmp_path)


def test_inference_ingest():
    print("\n-- Inference Ingest (Auto-Detection) --")

    # Test PNG loading
    try:
        from PIL import Image  # type: ignore[import-untyped]
        tmp_png = os.path.join(tempfile.gettempdir(), "test_inference.png")
        img_arr = np.random.randint(0, 256, (100, 100, 3), dtype=np.uint8)
        Image.fromarray(img_arr).save(tmp_png)

        loaded, meta = load_inference_image(tmp_png)
        check("PNG load returns array", loaded.shape == (100, 100, 3))
        check("PNG is non-georeferenced", meta.is_georeferenced is False)
        check("PNG dtype is uint8", loaded.dtype == np.uint8)
        check("PNG meta has correct dims", meta.height == 100 and meta.width == 100)
        check("PNG meta GSD is None", meta.gsd_m is None)

        # User GSD override
        loaded2, meta2 = load_inference_image(tmp_png, user_gsd_m=0.3)
        check("user GSD override applied", meta2.gsd_m == 0.3)
        check("user_gsd_m stored", meta2.user_gsd_m == 0.3)

        os.remove(tmp_png)
    except ImportError:
        print("  (PIL not available, skipping PNG test)")

    # Test JPEG loading
    try:
        from PIL import Image  # type: ignore[import-untyped]
        tmp_jpg = os.path.join(tempfile.gettempdir(), "test_inference.jpg")
        img_arr = np.random.randint(0, 256, (80, 80, 3), dtype=np.uint8)
        Image.fromarray(img_arr).save(tmp_jpg)

        loaded, meta = load_inference_image(tmp_jpg)
        check("JPEG load returns array", loaded.shape == (80, 80, 3))
        check("JPEG is non-georeferenced", meta.is_georeferenced is False)

        os.remove(tmp_jpg)
    except ImportError:
        print("  (PIL not available, skipping JPEG test)")

    # Test GeoTIFF loading (using rasterio)
    try:
        import rasterio  # type: ignore[import-untyped]
        from rasterio.transform import from_origin

        tmp_tif = os.path.join(tempfile.gettempdir(), "test_geo.tif")
        arr = np.random.randint(0, 2048, (50, 50, 3), dtype=np.uint16)
        transform = from_origin(500000.0, 5400000.0, 0.09, 0.09)

        with rasterio.open(
            tmp_tif, "w", driver="GTiff",
            height=50, width=50, count=3, dtype="uint16",
            crs="EPSG:32633", transform=transform,
        ) as dst:
            for i in range(3):
                dst.write(arr[..., i], i + 1)

        loaded, meta = load_inference_image(tmp_tif)
        check("GeoTIFF load returns array", loaded.shape == (50, 50, 3))
        check("GeoTIFF is georeferenced", meta.is_georeferenced is True)
        check("GeoTIFF has CRS", meta.crs is not None)
        check("GeoTIFF GSD correct", abs(meta.gsd_m - 0.09) < 1e-6)

        # get_effective_gsd
        check("effective GSD from geo file", abs(get_effective_gsd(meta) - 0.09) < 1e-6)

        os.remove(tmp_tif)
    except ImportError:
        print("  (rasterio not available, skipping GeoTIFF test)")

    # Test unsupported format
    try:
        load_inference_image("nonexistent.bmp")
        check("unsupported format raises error", False)
    except (ValueError, FileNotFoundError):
        check("unsupported format raises error", True)

    # Test missing file
    try:
        load_inference_image("totally_missing.png")
        check("missing file raises FileNotFoundError", False)
    except FileNotFoundError:
        check("missing file raises FileNotFoundError", True)


def test_inference_pipeline_e2e():
    print("\n-- Inference Pipeline End-to-End --")

    # Test with a synthetic PNG image
    try:
        from PIL import Image  # type: ignore[import-untyped]
        tmp_png = os.path.join(tempfile.gettempdir(), "test_infer_e2e.png")

        # Make a reasonably realistic synthetic image
        rng = np.random.default_rng(99)
        h, w = 128, 128
        base = 128 + 40 * np.sin(np.linspace(0, 4, w))[None, :] * np.cos(np.linspace(0, 4, h))[:, None]
        img = np.stack([base + rng.normal(0, 10, (h, w)) for _ in range(3)], axis=-1)
        img = np.clip(img, 0, 255).astype(np.uint8)
        Image.fromarray(img).save(tmp_png)

        image, meta = load_inference_image(tmp_png)
        result = preprocess_for_inference(image, meta, verbose=False)

        check("inference result has preprocessed", "preprocessed" in result)
        check("inference result has dav2_input", "dav2_input" in result)
        check("inference result has valid_mask", "valid_mask" in result)
        check("inference result has meta", "meta" in result)
        check("preprocessed is float32", result["preprocessed"].dtype == np.float32)
        check("valid_mask is bool", result["valid_mask"].dtype == bool)
        check("dav2_input is uint8", result["dav2_input"].dtype == np.uint8)
        check("preprocessed shape matches input", result["preprocessed"].shape[:2] == (h, w))

        os.remove(tmp_png)
    except ImportError:
        print("  (PIL not available, skipping inference pipeline test)")

    # Test with GeoTIFF (16-bit, IR-R-G — simulating Vaihingen)
    try:
        import rasterio  # type: ignore[import-untyped]
        from rasterio.transform import from_origin

        tmp_tif = os.path.join(tempfile.gettempdir(), "test_infer_geo.tif")
        rng = np.random.default_rng(77)
        h, w = 128, 128
        arr = rng.integers(100, 1800, size=(h, w, 3), dtype=np.uint16)
        transform = from_origin(500000.0, 5400000.0, 0.09, 0.09)

        with rasterio.open(
            tmp_tif, "w", driver="GTiff",
            height=h, width=w, count=3, dtype="uint16",
            crs="EPSG:32633", transform=transform,
        ) as dst:
            for i in range(3):
                dst.write(arr[..., i], i + 1)

        image, meta = load_inference_image(tmp_tif)
        result = preprocess_for_inference(image, meta, verbose=False)
        check("geo inference preprocessed shape", result["preprocessed"].shape[:2] == (h, w))
        check("geo inference is georeferenced", result["meta"].is_georeferenced is True)

        os.remove(tmp_tif)
    except ImportError:
        print("  (rasterio not available, skipping GeoTIFF inference test)")


# ── Main Runner ─────────────────────────────────────────────────────

def main():
    print("=" * 70)
    print("DEPTHWIZARD PREPROCESSING — COMPREHENSIVE AUTOMATED TEST SUITE")
    print("=" * 70)

    test_functions = [
        test_radiometric_correction,
        test_cloud_shadow_masking,
        test_noise_reduction,
        test_contrast_enhancement,
        test_resolution_handling,
        test_tiling,
        test_data_normalization,
        test_training_pipeline_e2e,
        test_inference_ingest,
        test_inference_pipeline_e2e,
    ]

    for test_fn in test_functions:
        try:
            test_fn()
        except Exception as e:
            print(f"\n  [CRASH] in {test_fn.__name__}: {e}")
            traceback.print_exc()
            global FAIL_COUNT
            FAIL_COUNT += 1

    print("\n" + "=" * 70)
    print(f"RESULTS: {PASS_COUNT} passed, {FAIL_COUNT} failed, {PASS_COUNT + FAIL_COUNT} total")
    print("=" * 70)

    if FAIL_COUNT > 0:
        print("\nFAILED TESTS — fix these before proceeding:")
        # Re-scan would need tracking; the FAIL messages above are sufficient
        sys.exit(1)
    else:
        print("\n[OK] ALL TESTS PASSED - preprocessing pipeline is fully verified.")
        sys.exit(0)


if __name__ == "__main__":
    main()
