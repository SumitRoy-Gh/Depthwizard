"""
demo_calibration.py — End-to-end visual demo of the region-aware calibration pipeline.

Generates a synthetic scene (imagery + DSM + semantic labels), runs it through
the full preprocessing → tiling → calibration flow, and saves output PNGs so
you can visually inspect every stage.

Usage:
    uv run python demo_calibration.py

Outputs are written to data/demo_output/:
    01_imagery_rgb.png         — the input imagery (IR,R,G mapped to R,G,B)
    02_dsm.png                 — the reference DSM, color-mapped
    03_semantic_labels.png     — the semantic class map (color-coded)
    04_relative_depth.png      — simulated model output (relative depth)
    05_global_calibrated.png   — height from ONE global linear fit
    06_region_calibrated.png   — height from PER-CLASS calibration (our method)
    07_error_global.png        — absolute error of global fit
    08_error_region.png        — absolute error of region fit
    09_improvement_map.png     — where region beats global (green) vs. worse (red)
    calibration_report.txt     — per-class fit statistics
"""
from __future__ import annotations
import sys
import os
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pathlib import Path
import tempfile
import rasterio
from rasterio.transform import from_origin


def main():
    # ── Lazy imports (keeps startup fast if something is missing) ────
    from depthwizard.ingestion.training import (
        load_scene_with_semantics, load_semantic_tif,
        CALIBRATION_CLASS_GROUND, CALIBRATION_CLASS_BUILDING,
        CALIBRATION_CLASS_VEGETATION, CALIBRATION_CLASS_UNKNOWN,
    )
    from depthwizard.preprocessing.radiometric_correction import radiometric_correction_pipeline
    from depthwizard.preprocessing.cloud_shadow_masking import compute_valid_mask
    from depthwizard.preprocessing.noise_reduction import denoise_imagery, denoise_dsm
    from depthwizard.preprocessing.contrast_enhancement import enhance_contrast
    from depthwizard.preprocessing.resolution_handling import align_dataset_to_common_gsd_with_semantics
    from depthwizard.preprocessing.tiling import crop_patches_with_semantics
    from depthwizard.calibration.region_calibration import (
        fit_region_calibration, apply_region_calibration,
        CLASS_GROUND, CLASS_BUILDING, CLASS_VEGETATION, CLASS_UNKNOWN,
    )

    try:
        import matplotlib
        matplotlib.use("Agg")  # non-interactive backend for saving PNGs
        import matplotlib.pyplot as plt
        from matplotlib.colors import ListedColormap
    except ImportError:
        print("ERROR: matplotlib is required for visual output.")
        print("  Install it with:  uv pip install matplotlib")
        sys.exit(1)

    OUT_DIR = Path("data/demo_output")
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # ═══════════════════════════════════════════════════════════════════
    # STEP 1: Generate a realistic synthetic scene
    # ═══════════════════════════════════════════════════════════════════
    print("=" * 60)
    print("REGION-AWARE CALIBRATION — VISUAL DEMO")
    print("=" * 60)
    print("\n[1/6] Generating synthetic scene...")

    rng = np.random.default_rng(42)
    H, W = 512, 512
    GSD = 0.09  # 9 cm, like Vaihingen

    # Build ground-truth elevation (flat ground + buildings + vegetation)
    ground_elev = 50.0 + 2.0 * np.sin(np.linspace(0, 2 * np.pi, W))[None, :]
    dsm = np.broadcast_to(ground_elev, (H, W)).copy().astype(np.float32)

    # Semantic labels: distinct zones
    semantic = np.full((H, W), CALIBRATION_CLASS_GROUND, dtype=np.uint8)

    # Building block 1 (tall)
    dsm[100:200, 100:200] += 25.0
    semantic[100:200, 100:200] = CALIBRATION_CLASS_BUILDING

    # Building block 2 (shorter)
    dsm[300:380, 50:150] += 12.0
    semantic[300:380, 50:150] = CALIBRATION_CLASS_BUILDING

    # Building block 3
    dsm[80:160, 350:430] += 18.0
    semantic[80:160, 350:430] = CALIBRATION_CLASS_BUILDING

    # Vegetation patches (trees, moderate height)
    dsm[250:350, 250:400] += 8.0
    semantic[250:350, 250:400] = CALIBRATION_CLASS_VEGETATION

    dsm[400:480, 300:450] += 6.0
    semantic[400:480, 300:450] = CALIBRATION_CLASS_VEGETATION

    # Some cars (UNKNOWN) — small patches
    semantic[220:230, 120:140] = CALIBRATION_CLASS_UNKNOWN
    semantic[420:430, 200:220] = CALIBRATION_CLASS_UNKNOWN

    # Add realistic noise to DSM
    dsm += rng.normal(0, 0.3, size=(H, W)).astype(np.float32)

    # Build imagery (IR, R, G channels)
    base = 400 + 200 * np.sin(np.linspace(0, 4, W))[None, :] * np.cos(np.linspace(0, 4, H))[:, None]
    ir = base + 150 + 20 * rng.normal(size=(H, W))
    r = base + 30 * rng.normal(size=(H, W))
    g = base + 60 + 25 * rng.normal(size=(H, W))

    # Buildings are bright in all bands
    for ch in [ir, r, g]:
        ch[semantic == CALIBRATION_CLASS_BUILDING] += 200

    # Vegetation is bright in IR, darker in R
    ir[semantic == CALIBRATION_CLASS_VEGETATION] += 300
    g[semantic == CALIBRATION_CLASS_VEGETATION] += 50

    imagery = np.stack([ir, r, g], axis=-1)
    imagery = np.clip(imagery, 0, 2047).astype(np.uint16)

    # ── Write to temp GeoTIFFs (so we exercise the real ingest path) ──
    print("    Writing temporary GeoTIFFs...")
    tmpdir = tempfile.mkdtemp(prefix="depthwizard_demo_")
    transform = from_origin(500000.0, 5400000.0, GSD, GSD)

    img_path = os.path.join(tmpdir, "imagery.tif")
    dsm_path = os.path.join(tmpdir, "dsm.tif")
    sem_path = os.path.join(tmpdir, "semantic.tif")

    with rasterio.open(img_path, "w", driver="GTiff",
                       height=H, width=W, count=3, dtype="uint16",
                       crs="EPSG:32633", transform=transform) as dst:
        for i in range(3):
            dst.write(imagery[..., i], i + 1)

    with rasterio.open(dsm_path, "w", driver="GTiff",
                       height=H, width=W, count=1, dtype="float32",
                       crs="EPSG:32633", transform=transform) as dst:
        dst.write(dsm, 1)

    # Write semantic as RGB-color-coded (the ISPRS format)
    sem_rgb = np.zeros((3, H, W), dtype=np.uint8)
    ground_mask = semantic == CALIBRATION_CLASS_GROUND
    building_mask = semantic == CALIBRATION_CLASS_BUILDING
    veg_mask = semantic == CALIBRATION_CLASS_VEGETATION
    unknown_mask = semantic == CALIBRATION_CLASS_UNKNOWN

    # White for ground
    sem_rgb[0, ground_mask] = 255; sem_rgb[1, ground_mask] = 255; sem_rgb[2, ground_mask] = 255
    # Blue for building
    sem_rgb[2, building_mask] = 255
    # Cyan for vegetation
    sem_rgb[1, veg_mask] = 255; sem_rgb[2, veg_mask] = 255
    # Yellow for cars/unknown
    sem_rgb[0, unknown_mask] = 255; sem_rgb[1, unknown_mask] = 255

    with rasterio.open(sem_path, "w", driver="GTiff",
                       height=H, width=W, count=3, dtype="uint8",
                       crs="EPSG:32633", transform=transform) as dst:
        for i in range(3):
            dst.write(sem_rgb[i], i + 1)

    # ═══════════════════════════════════════════════════════════════════
    # STEP 2: Load through the real ingest pipeline
    # ═══════════════════════════════════════════════════════════════════
    print("\n[2/6] Loading scene through ingest pipeline...")
    img_loaded, dsm_loaded, sem_loaded, meta = load_scene_with_semantics(
        img_path, dsm_path, sem_path
    )
    print(f"    Imagery: {img_loaded.shape}, dtype={img_loaded.dtype}")
    print(f"    DSM:     {dsm_loaded.shape}, dtype={dsm_loaded.dtype}")
    print(f"    Semantic: {sem_loaded.shape}, unique classes={np.unique(sem_loaded).tolist()}")
    print(f"    GSD:     {meta.gsd_m} m/px")

    # ═══════════════════════════════════════════════════════════════════
    # STEP 3: Run preprocessing stages
    # ═══════════════════════════════════════════════════════════════════
    print("\n[3/6] Running preprocessing stages...")

    # Stage 1: Radiometric correction
    rad = radiometric_correction_pipeline(img_loaded)
    img_uint8 = rad["unet_input"]
    print(f"    Stage 1 (radiometric): {img_uint8.shape} {img_uint8.dtype}")

    # Stage 2: Cloud/shadow masking
    valid_mask = compute_valid_mask(img_uint8)
    print(f"    Stage 2 (masking): valid fraction = {valid_mask.mean():.3f}")

    # Stage 3: Noise reduction
    img_denoised = denoise_imagery(img_uint8)
    dsm_denoised = denoise_dsm(dsm_loaded.astype(np.float32), valid_mask=valid_mask)
    dsm_denoised = np.nan_to_num(dsm_denoised, nan=0.0)
    print(f"    Stage 3 (noise reduction): done")

    # Stage 4: Contrast enhancement
    img_enhanced = enhance_contrast(img_denoised, valid_mask=valid_mask)
    print(f"    Stage 4 (CLAHE): done")

    # Stage 5: Resolution alignment (with semantics!)
    aligned = align_dataset_to_common_gsd_with_semantics(
        img_enhanced, dsm_denoised, valid_mask, sem_loaded,
        source_gsd_m=GSD, target_gsd_m=GSD,
    )
    print(f"    Stage 5 (resolution): imagery={aligned['imagery'].shape}")

    # Stage 6: Tiling (with semantics!)
    patches = crop_patches_with_semantics(
        aligned["imagery"], aligned["dsm"], aligned["valid_mask"], aligned["semantic"],
        tile_size=256, stride=256, min_valid_fraction=0.5,
    )
    print(f"    Stage 6 (tiling): {len(patches)} patches")

    # ═══════════════════════════════════════════════════════════════════
    # STEP 4: Simulate a relative depth prediction
    # ═══════════════════════════════════════════════════════════════════
    print("\n[4/6] Simulating relative depth prediction...")

    # In a real pipeline, this comes from DAv2. Here we simulate it as a
    # NONLINEAR monotonic transform of the true DSM with DIFFERENT
    # per-class characteristics — exactly the scenario region calibration
    # is designed to handle.
    ref_dsm = aligned["dsm"].astype(np.float32)
    sem_full = aligned["semantic"]

    relative_depth = np.zeros_like(ref_dsm)
    # Ground: z = 2.0*d + 5.0  →  d = (z - 5) / 2
    gnd = sem_full == CLASS_GROUND
    relative_depth[gnd] = (ref_dsm[gnd] - 5.0) / 2.0

    # Building: z = 5.0*d + 1.0  →  d = (z - 1) / 5
    bld = sem_full == CLASS_BUILDING
    relative_depth[bld] = (ref_dsm[bld] - 1.0) / 5.0

    # Vegetation: z = 3.0*d + 2.0  →  d = (z - 2) / 3
    veg = sem_full == CLASS_VEGETATION
    relative_depth[veg] = (ref_dsm[veg] - 2.0) / 3.0

    # Unknown: use ground's transform
    unk = sem_full == CLASS_UNKNOWN
    relative_depth[unk] = (ref_dsm[unk] - 5.0) / 2.0

    # Add realistic noise to simulate model imperfection
    relative_depth += rng.normal(0, 0.3, size=relative_depth.shape).astype(np.float32)

    print(f"    Relative depth range: [{relative_depth.min():.2f}, {relative_depth.max():.2f}]")

    # ═══════════════════════════════════════════════════════════════════
    # STEP 5: Run calibration — GLOBAL vs. REGION-AWARE
    # ═══════════════════════════════════════════════════════════════════
    print("\n[5/6] Running calibration...")

    # Region-aware calibration (our method)
    fits = fit_region_calibration(
        relative_depth, sem_full, ref_dsm, valid_mask=aligned["valid_mask"]
    )
    height_region = apply_region_calibration(relative_depth, sem_full, fits)

    # Global calibration (baseline — what a naive single-fit approach does)
    global_fit = fits[-1]
    height_global = global_fit.scale * relative_depth + global_fit.shift

    # Errors
    error_global = np.abs(height_global - ref_dsm)
    error_region = np.abs(height_region - ref_dsm)

    mae_global = float(error_global[aligned["valid_mask"]].mean())
    mae_region = float(error_region[aligned["valid_mask"]].mean())

    print(f"    Global fit:  MAE = {mae_global:.4f} m")
    print(f"    Region fit:  MAE = {mae_region:.4f} m")
    print(f"    Improvement: {(1 - mae_region / mae_global) * 100:.1f}% lower MAE")

    # Per-class stats
    report_lines = ["REGION-AWARE CALIBRATION REPORT", "=" * 50, ""]
    class_names = {CLASS_GROUND: "Ground", CLASS_BUILDING: "Building",
                   CLASS_VEGETATION: "Vegetation", -1: "Global (fallback)"}
    for cid in [-1, CLASS_GROUND, CLASS_BUILDING, CLASS_VEGETATION]:
        f = fits[cid]
        report_lines.append(f"{class_names[cid]}:")
        report_lines.append(f"  z = {f.scale:.4f} * d + {f.shift:.4f}")
        report_lines.append(f"  Pixels used:     {f.n_pixels_used}")
        report_lines.append(f"  Inlier fraction: {f.inlier_fraction:.4f}")
        report_lines.append(f"  R² score:        {f.r2_score:.6f}")
        report_lines.append("")

    report_lines.append(f"Global MAE: {mae_global:.4f} m")
    report_lines.append(f"Region MAE: {mae_region:.4f} m")
    report_lines.append(f"Improvement: {(1 - mae_region / mae_global) * 100:.1f}%")

    report_path = OUT_DIR / "calibration_report.txt"
    report_path.write_text("\n".join(report_lines))
    print(f"    Report saved to {report_path}")

    # ═══════════════════════════════════════════════════════════════════
    # STEP 6: Save visual output PNGs
    # ═══════════════════════════════════════════════════════════════════
    print("\n[6/6] Saving output images...")

    def save_img(data, filename, title, cmap="viridis", vmin=None, vmax=None):
        fig, ax = plt.subplots(1, 1, figsize=(8, 8), dpi=100)
        im = ax.imshow(data, cmap=cmap, vmin=vmin, vmax=vmax)
        ax.set_title(title, fontsize=14, fontweight="bold")
        ax.axis("off")
        plt.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
        fig.tight_layout()
        fig.savefig(str(OUT_DIR / filename), bbox_inches="tight")
        plt.close(fig)
        print(f"    [OK] {filename}")

    # 01 — Input imagery (IR,R,G → display as R,G,B)
    disp_img = aligned["imagery"][:, :, :3].astype(np.float32)
    disp_img = (disp_img - disp_img.min()) / (disp_img.max() - disp_img.min() + 1e-8)
    fig, ax = plt.subplots(1, 1, figsize=(8, 8), dpi=100)
    ax.imshow(disp_img)
    ax.set_title("Input Imagery (stretched to RGB)", fontsize=14, fontweight="bold")
    ax.axis("off")
    fig.tight_layout()
    fig.savefig(str(OUT_DIR / "01_imagery_rgb.png"), bbox_inches="tight")
    plt.close(fig)
    print(f"    [OK] 01_imagery_rgb.png")

    # 02 — Reference DSM
    save_img(ref_dsm, "02_dsm.png", "Reference DSM (meters)", cmap="terrain")

    # 03 — Semantic labels (color-coded)
    sem_display = np.zeros((sem_full.shape[0], sem_full.shape[1], 3), dtype=np.float32)
    sem_display[sem_full == CLASS_GROUND] = [0.85, 0.85, 0.85]     # light gray
    sem_display[sem_full == CLASS_BUILDING] = [0.2, 0.2, 0.9]      # blue
    sem_display[sem_full == CLASS_VEGETATION] = [0.1, 0.7, 0.1]    # green
    sem_display[sem_full == CLASS_UNKNOWN] = [1.0, 0.8, 0.0]       # yellow
    fig, ax = plt.subplots(1, 1, figsize=(8, 8), dpi=100)
    ax.imshow(sem_display)
    ax.set_title("Semantic Labels", fontsize=14, fontweight="bold")
    ax.axis("off")
    # Legend
    from matplotlib.patches import Patch
    legend_elements = [
        Patch(facecolor=(0.85, 0.85, 0.85), label="Ground"),
        Patch(facecolor=(0.2, 0.2, 0.9), label="Building"),
        Patch(facecolor=(0.1, 0.7, 0.1), label="Vegetation"),
        Patch(facecolor=(1.0, 0.8, 0.0), label="Unknown"),
    ]
    ax.legend(handles=legend_elements, loc="lower right", fontsize=11)
    fig.tight_layout()
    fig.savefig(str(OUT_DIR / "03_semantic_labels.png"), bbox_inches="tight")
    plt.close(fig)
    print(f"    [OK] 03_semantic_labels.png")

    # 04 — Simulated relative depth
    save_img(relative_depth, "04_relative_depth.png",
             "Simulated Relative Depth (model output)", cmap="magma")

    # 05 — Global calibrated height
    save_img(height_global, "05_global_calibrated.png",
             f"Global Calibration (MAE={mae_global:.2f} m)", cmap="terrain",
             vmin=ref_dsm.min(), vmax=ref_dsm.max())

    # 06 — Region-aware calibrated height
    save_img(height_region, "06_region_calibrated.png",
             f"Region-Aware Calibration (MAE={mae_region:.2f} m)", cmap="terrain",
             vmin=ref_dsm.min(), vmax=ref_dsm.max())

    # 07 — Error map: global
    save_img(error_global, "07_error_global.png",
             f"Absolute Error — Global (MAE={mae_global:.2f} m)", cmap="hot",
             vmin=0, vmax=max(error_global.max(), error_region.max()))

    # 08 — Error map: region
    save_img(error_region, "08_error_region.png",
             f"Absolute Error — Region (MAE={mae_region:.2f} m)", cmap="hot",
             vmin=0, vmax=max(error_global.max(), error_region.max()))

    # 09 — Improvement map (green = region is better, red = worse)
    improvement = error_global - error_region  # positive = region is better
    fig, ax = plt.subplots(1, 1, figsize=(8, 8), dpi=100)
    lim = max(abs(improvement.min()), abs(improvement.max()), 1.0)
    im = ax.imshow(improvement, cmap="RdYlGn", vmin=-lim, vmax=lim)
    ax.set_title("Improvement Map (green = region better)", fontsize=14, fontweight="bold")
    ax.axis("off")
    plt.colorbar(im, ax=ax, fraction=0.046, pad=0.04, label="Error reduction (m)")
    fig.tight_layout()
    fig.savefig(str(OUT_DIR / "09_improvement_map.png"), bbox_inches="tight")
    plt.close(fig)
    print(f"    [OK] 09_improvement_map.png")

    # ═══════════════════════════════════════════════════════════════════
    # Summary
    # ═══════════════════════════════════════════════════════════════════
    print("\n" + "=" * 60)
    print("DONE! Output files saved to:")
    print(f"  {OUT_DIR.resolve()}")
    print("\nFiles:")
    for f in sorted(OUT_DIR.iterdir()):
        print(f"  {f.name}")
    print(f"\nKey result: Region-aware calibration reduced MAE by "
          f"{(1 - mae_region / mae_global) * 100:.1f}% over global fit.")
    print("=" * 60)

    # Cleanup temp files
    for f in [img_path, dsm_path, sem_path]:
        os.remove(f)
    os.rmdir(tmpdir)


if __name__ == "__main__":
    main()
