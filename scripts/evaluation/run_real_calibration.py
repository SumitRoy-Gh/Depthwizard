"""
run_real_calibration.py -- Real-data region-aware calibration evaluation.

Wires the fine-tuned DA2 model output into fit_region_calibration() /
apply_region_calibration() on a REAL Vaihingen scene with REAL ISPRS
ground-truth semantic labels.  Produces per-patch and pooled MAE numbers
(global-fit vs region-aware), 9 diagnostic PNGs, and a calibration report.

Usage:
    uv run python run_real_calibration.py
    uv run python run_real_calibration.py --scene area1

Outputs written to data/real_calibration_output/:
    01_imagery_rgb.png          -- input imagery (IR,R,G mapped to R,G,B)
    02_dsm.png                  -- reference DSM, color-mapped
    03_semantic_labels.png      -- semantic class map (color-coded)
    04_relative_depth.png       -- DA2 model output (relative depth)
    05_global_calibrated.png    -- height from ONE global linear fit
    06_region_calibrated.png    -- height from PER-CLASS calibration
    07_error_global.png         -- absolute error of global fit
    08_error_region.png         -- absolute error of region fit
    09_improvement_map.png      -- where region beats global (green) vs worse (red)
    calibration_report.txt      -- per-class fit statistics
"""
from __future__ import annotations
import sys
import os
import argparse
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pathlib import Path


def find_checkpoint(explicit_path: str | None) -> Path:
    """Locate best.pt -- check explicit arg, then common locations."""
    candidates = ["models/checkpoints/dav2/best.pt", 
        explicit_path,
        "best.pt",
        "checkpoints/best.pt",
        "checkpoints/dav2_finetune/best.pt",
    ]
    for c in candidates:
        if c is not None and Path(c).is_file():
            return Path(c)
    raise FileNotFoundError(
        "Could not find best.pt. Searched:\n"
        + "\n".join(f"  {c}" for c in candidates if c is not None)
        + "\nPass --checkpoint <path> explicitly."
    )


# Vaihingen ISPRS ground-truth label file naming convention
SEMANTIC_GT_DIR = Path("data/raw/Vaihingen/Vaihingen/ground_truth_COMPLETE")


def find_semantic_path(scene_stem: str) -> Path:
    """Find the ISPRS ground-truth label TIF for a given scene."""
    # ISPRS naming: top_mosaic_09cm_area1.tif
    candidate = SEMANTIC_GT_DIR / f"top_mosaic_09cm_{scene_stem}.tif"
    if candidate.is_file():
        return candidate
    raise FileNotFoundError(
        f"Semantic label file not found: {candidate}\n"
        f"Extract ISPRS_semantic_labeling_Vaihingen_ground_truth_COMPLETE.zip first."
    )


def main():
    parser = argparse.ArgumentParser(
        description="Real-data region-aware calibration evaluation"
    )
    parser.add_argument("--checkpoint", type=str, default=None)
    parser.add_argument("--imagery-dir", type=str, default="dataset/imagery")
    parser.add_argument("--dsm-dir", type=str, default="dataset/dsm")
    parser.add_argument("--scene", type=str, default="area1",
                        help="Scene stem, e.g. 'area1' (default)")
    parser.add_argument("--backbone-size", type=str, default="small")
    parser.add_argument("--tile-size", type=int, default=256)
    parser.add_argument("--val-split-ratio", type=float, default=0.2)
    parser.add_argument("--output-dir", type=str, default="data/real_calibration_output")
    args = parser.parse_args()

    # -- Lazy imports --
    import torch

    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        from matplotlib.patches import Patch as MplPatch
    except ImportError:
        print("ERROR: matplotlib is required. Install with: uv pip install matplotlib")
        sys.exit(1)

    from depthwizard.ingestion.training import load_scene_with_semantics
    from depthwizard.preprocessing.radiometric_correction import (
        radiometric_correction_pipeline, build_dav2_rgb_proxy,
    )
    from depthwizard.preprocessing.cloud_shadow_masking import compute_valid_mask
    from depthwizard.preprocessing.noise_reduction import denoise_imagery, denoise_dsm
    from depthwizard.preprocessing.contrast_enhancement import enhance_contrast
    from depthwizard.preprocessing.resolution_handling import align_dataset_to_common_gsd_with_semantics
    from depthwizard.preprocessing.tiling import crop_patches_with_semantics, split_by_area, Patch
    from depth_estimation.pseudo_depth import dsm_to_pseudo_depth
    from depthwizard.models.dav2_backbone import DAv2Backbone
    from depthwizard.calibration.region_calibration import (
        fit_region_calibration, apply_region_calibration,
        CLASS_GROUND, CLASS_BUILDING, CLASS_VEGETATION, CLASS_UNKNOWN,
    )

    OUT_DIR = Path(args.output_dir)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # ===================================================================
    # STEP 1: Locate files
    # ===================================================================
    print("=" * 70)
    print("REAL-DATA REGION-AWARE CALIBRATION EVALUATION")
    print("=" * 70)

    ckpt_path = find_checkpoint(args.checkpoint)
    print(f"\n[1/7] Checkpoint: {ckpt_path.resolve()}")

    img_path = Path(args.imagery_dir) / f"{args.scene}_imagery.tif"
    dsm_path = Path(args.dsm_dir) / f"{args.scene}_dsm.tif"
    sem_path = find_semantic_path(args.scene)

    if not img_path.is_file():
        print(f"ERROR: imagery not found: {img_path}")
        sys.exit(1)
    if not dsm_path.is_file():
        print(f"ERROR: DSM not found: {dsm_path}")
        sys.exit(1)

    print(f"    Imagery:  {img_path}")
    print(f"    DSM:      {dsm_path}")
    print(f"    Semantic: {sem_path}")

    # ===================================================================
    # STEP 2: Load scene with semantics
    # ===================================================================
    print(f"\n[2/7] Loading scene '{args.scene}' with semantics...")

    imagery, dsm_raw, semantic, meta = load_scene_with_semantics(
        str(img_path), str(dsm_path), str(sem_path)
    )
    print(f"    Imagery:  {imagery.shape} {imagery.dtype}")
    print(f"    DSM:      {dsm_raw.shape} {dsm_raw.dtype}")
    print(f"    Semantic: {semantic.shape} {semantic.dtype}")
    print(f"    GSD:      {meta.gsd_m}")

    unique_classes, class_counts = np.unique(semantic, return_counts=True)
    for cls_id, cnt in zip(unique_classes, class_counts):
        names = {0: "ground", 1: "building", 2: "vegetation", 255: "unknown"}
        print(f"      class {cls_id} ({names.get(cls_id, '?')}): {cnt} pixels ({cnt / semantic.size * 100:.1f}%)")

    if meta.gsd_m is None or meta.gsd_m > 0.5:
        print(f"    [Warning] Suspicious GSD ({meta.gsd_m}) -- assuming 0.09m (Vaihingen)")
        meta.gsd_m = 0.09
    GSD = meta.gsd_m

    # ===================================================================
    # STEP 3: Run preprocessing stages 1-6 with semantics
    # ===================================================================
    print(f"\n[3/7] Running preprocessing stages...")

    # Stage 1: Radiometric correction
    corrected = radiometric_correction_pipeline(imagery)
    unet_input = corrected["unet_input"]
    print(f"    Stage 1 (radiometric): {unet_input.shape} {unet_input.dtype}")

    # Stage 2: Cloud/shadow masking + DSM valid mask
    img_valid_mask = compute_valid_mask(unet_input)
    
    # DSM-specific nodata detection (Vaihingen scene sits at ~250m+, so > 1.0 is a safe floor)
    dsm_valid_mask = dsm_raw > 1.0
    valid_mask = img_valid_mask & dsm_valid_mask
    
    print(f"    Stage 2 (masking): img_valid = {img_valid_mask.mean():.3f}, combined = {valid_mask.mean():.3f}")

    # Stage 3: Noise reduction
    img_denoised = denoise_imagery(unet_input)
    dsm_denoised = denoise_dsm(dsm_raw, valid_mask=valid_mask)
    dsm_denoised = np.nan_to_num(dsm_denoised, nan=0.0)
    print(f"    Stage 3 (noise reduction): done")

    # Stage 4: Contrast enhancement
    img_enhanced = enhance_contrast(img_denoised, valid_mask=valid_mask)
    print(f"    Stage 4 (CLAHE): done")

    # Fill NaN DSM pixels with valid median (same as process_scene)
    fill_value = float(np.nanmedian(dsm_denoised)) if not np.all(np.isnan(dsm_denoised)) else 0.0
    dsm_filled = np.where(np.isnan(dsm_denoised), fill_value, dsm_denoised)

    # Stage 5: Resolution alignment (with semantics)
    aligned = align_dataset_to_common_gsd_with_semantics(
        img_enhanced, dsm_filled, valid_mask, semantic,
        source_gsd_m=GSD, target_gsd_m=GSD,
    )
    print(f"    Stage 5 (resolution): {GSD}m -> {GSD}m, shape {aligned['imagery'].shape[:2]}")

    # Stage 6: Tiling (with semantics)
    patches = crop_patches_with_semantics(
        aligned["imagery"], aligned["dsm"], aligned["valid_mask"], aligned["semantic"],
        tile_size=args.tile_size, stride=args.tile_size, min_valid_fraction=0.6,
    )
    print(f"    Stage 6 (tiling): {len(patches)} patches")

    if not patches:
        print("ERROR: No patches extracted. Aborting.")
        sys.exit(1)

    # ===================================================================
    # STEP 4: Spatial train/val split (same logic as train_finetune.py)
    # ===================================================================
    print(f"\n[4/7] Splitting train/val patches...")

    # PatchWithSemantics has the same row_off/col_off attributes as Patch,
    # and split_by_area only reads .row_off, so it works on both types.
    max_row_off = max(p.row_off for p in patches)
    split_point = int(max_row_off * (1.0 - args.val_split_ratio))
    test_area_row_ranges = [(split_point, max_row_off + args.tile_size)]
    train_patches, val_patches = split_by_area(patches, test_area_row_ranges)

    print(f"    Train patches: {len(train_patches)}, Val patches: {len(val_patches)}")

    if not val_patches:
        print("ERROR: No val patches in split. Aborting.")
        sys.exit(1)

    # ===================================================================
    # STEP 5: Load model and run inference + calibration on ALL val patches
    # ===================================================================
    print(f"\n[5/7] Loading DA2 (size={args.backbone_size}) and running inference + calibration...")

    dav2 = DAv2Backbone(size=args.backbone_size, frozen=True, weights_path=str(ckpt_path))

    per_patch_results = []

    for i, patch in enumerate(val_patches):
        # Build DA2 input
        rgb_proxy = build_dav2_rgb_proxy(patch.imagery)

        # Run inference
        relative_depth = dav2.predict(rgb_proxy)

        # Run region calibration
        fits = fit_region_calibration(
            relative_depth, patch.semantic, patch.dsm,
            valid_mask=patch.valid_mask,
        )

        # Apply calibrations
        height_region = apply_region_calibration(relative_depth, patch.semantic, fits)
        global_fit = fits[-1]
        height_global = global_fit.scale * relative_depth + global_fit.shift

        # Compute MAE over valid pixels
        v = patch.valid_mask
        mae_global = float(np.mean(np.abs(height_global[v] - patch.dsm[v]))) if v.any() else float("nan")
        mae_region = float(np.mean(np.abs(height_region[v] - patch.dsm[v]))) if v.any() else float("nan")

        per_patch_results.append({
            "index": i,
            "row_off": patch.row_off,
            "col_off": patch.col_off,
            "n_valid": int(v.sum()),
            "mae_global": mae_global,
            "mae_region": mae_region,
            "fits": fits,
            "relative_depth": relative_depth,
            "height_global": height_global,
            "height_region": height_region,
            "patch": patch,
        })

        status = f"G={mae_global:.3f} R={mae_region:.3f}"
        if np.isfinite(mae_global) and mae_global > 0:
            pct = (1 - mae_region / mae_global) * 100
            status += f" ({pct:+.1f}%)"
        print(f"    patch [{i:2d}] row={patch.row_off:4d} col={patch.col_off:4d}  MAE: {status}")

    # ===================================================================
    # STEP 6: Compute pooled results and print table
    # ===================================================================
    print(f"\n[6/7] Computing pooled results...")

    # Pooled MAE: weighted average by valid pixel count (not simple average
    # of per-patch MAEs, which would weight all patches equally regardless
    # of how many valid pixels each has).
    total_valid = sum(r["n_valid"] for r in per_patch_results)
    pooled_mae_global = sum(r["mae_global"] * r["n_valid"] for r in per_patch_results) / total_valid
    pooled_mae_region = sum(r["mae_region"] * r["n_valid"] for r in per_patch_results) / total_valid
    pooled_improvement = (1 - pooled_mae_region / pooled_mae_global) * 100 if pooled_mae_global > 0 else 0

    print(f"\n{'='*70}")
    print(f"PER-PATCH AND POOLED MAE RESULTS")
    print(f"{'='*70}")
    print(f"{'Patch':>6} {'Row':>5} {'Col':>5} {'Valid':>7} {'MAE Global':>11} {'MAE Region':>11} {'Improv%':>8}")
    print(f"{'-'*6:>6} {'-'*5:>5} {'-'*5:>5} {'-'*7:>7} {'-'*11:>11} {'-'*11:>11} {'-'*8:>8}")

    for r in per_patch_results:
        imp = (1 - r["mae_region"] / r["mae_global"]) * 100 if r["mae_global"] > 0 else 0
        print(f"{r['index']:>6} {r['row_off']:>5} {r['col_off']:>5} {r['n_valid']:>7} "
              f"{r['mae_global']:>11.4f} {r['mae_region']:>11.4f} {imp:>+7.1f}%")

    print(f"{'-'*6:>6} {'-'*5:>5} {'-'*5:>5} {'-'*7:>7} {'-'*11:>11} {'-'*11:>11} {'-'*8:>8}")
    print(f"{'POOLED':>6} {'':>5} {'':>5} {total_valid:>7} "
          f"{pooled_mae_global:>11.4f} {pooled_mae_region:>11.4f} {pooled_improvement:>+7.1f}%")
    print(f"{'='*70}\n")

    # ===================================================================
    # STEP 7: Save visual outputs + calibration report
    # ===================================================================
    print(f"[7/7] Saving output images and report to {OUT_DIR.resolve()}...")

    # Use the val patch with the median MAE for full-scene visualization
    sorted_by_mae = sorted(per_patch_results, key=lambda r: r["mae_region"])
    representative = sorted_by_mae[len(sorted_by_mae) // 2]
    rp = representative["patch"]
    rp_rel = representative["relative_depth"]
    rp_hglobal = representative["height_global"]
    rp_hregion = representative["height_region"]
    rp_fits = representative["fits"]

    ref_dsm = rp.dsm.astype(np.float32)
    sem_full = rp.semantic
    vm = rp.valid_mask

    def save_img(data, filename, title, cmap="viridis", vmin=None, vmax=None):
        """Same pattern as demo_calibration.py's save_img."""
        fig, ax = plt.subplots(1, 1, figsize=(8, 8), dpi=100)
        im = ax.imshow(data, cmap=cmap, vmin=vmin, vmax=vmax)
        ax.set_title(title, fontsize=14, fontweight="bold")
        ax.axis("off")
        plt.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
        fig.tight_layout()
        fig.savefig(str(OUT_DIR / filename), bbox_inches="tight")
        plt.close(fig)
        print(f"    [OK] {filename}")

    # 01 -- Input imagery (IR,R,G -> display as R,G,B)
    disp_img = rp.imagery[:, :, :3].astype(np.float32)
    disp_img = (disp_img - disp_img.min()) / (disp_img.max() - disp_img.min() + 1e-8)
    fig, ax = plt.subplots(1, 1, figsize=(8, 8), dpi=100)
    ax.imshow(disp_img)
    ax.set_title("Input Imagery (stretched to RGB)", fontsize=14, fontweight="bold")
    ax.axis("off")
    fig.tight_layout()
    fig.savefig(str(OUT_DIR / "01_imagery_rgb.png"), bbox_inches="tight")
    plt.close(fig)
    print(f"    [OK] 01_imagery_rgb.png")

    # 02 -- Reference DSM
    save_img(ref_dsm, "02_dsm.png", "Reference DSM (meters)", cmap="terrain")

    # 03 -- Semantic labels (color-coded)
    sem_display = np.zeros((sem_full.shape[0], sem_full.shape[1], 3), dtype=np.float32)
    sem_display[sem_full == CLASS_GROUND] = [0.85, 0.85, 0.85]
    sem_display[sem_full == CLASS_BUILDING] = [0.2, 0.2, 0.9]
    sem_display[sem_full == CLASS_VEGETATION] = [0.1, 0.7, 0.1]
    sem_display[sem_full == CLASS_UNKNOWN] = [1.0, 0.8, 0.0]
    fig, ax = plt.subplots(1, 1, figsize=(8, 8), dpi=100)
    ax.imshow(sem_display)
    ax.set_title("Semantic Labels (ISPRS ground truth)", fontsize=14, fontweight="bold")
    ax.axis("off")
    legend_elements = [
        MplPatch(facecolor=(0.85, 0.85, 0.85), label="Ground"),
        MplPatch(facecolor=(0.2, 0.2, 0.9), label="Building"),
        MplPatch(facecolor=(0.1, 0.7, 0.1), label="Vegetation"),
        MplPatch(facecolor=(1.0, 0.8, 0.0), label="Unknown"),
    ]
    ax.legend(handles=legend_elements, loc="lower right", fontsize=11)
    fig.tight_layout()
    fig.savefig(str(OUT_DIR / "03_semantic_labels.png"), bbox_inches="tight")
    plt.close(fig)
    print(f"    [OK] 03_semantic_labels.png")

    # 04 -- Relative depth (DA2 output)
    save_img(rp_rel, "04_relative_depth.png",
             "DA2 Relative Depth (fine-tuned model output)", cmap="magma")

    # 05 -- Global calibrated height
    error_global = np.abs(rp_hglobal - ref_dsm)
    error_region = np.abs(rp_hregion - ref_dsm)
    mae_g = float(error_global[vm].mean()) if vm.any() else 0
    mae_r = float(error_region[vm].mean()) if vm.any() else 0

    save_img(rp_hglobal, "05_global_calibrated.png",
             f"Global Calibration (MAE={mae_g:.2f} m)", cmap="terrain",
             vmin=ref_dsm.min(), vmax=ref_dsm.max())

    # 06 -- Region calibrated height
    save_img(rp_hregion, "06_region_calibrated.png",
             f"Region-Aware Calibration (MAE={mae_r:.2f} m)", cmap="terrain",
             vmin=ref_dsm.min(), vmax=ref_dsm.max())

    # 07 -- Error map: global
    max_err = max(error_global.max(), error_region.max())
    save_img(error_global, "07_error_global.png",
             f"Absolute Error - Global (MAE={mae_g:.2f} m)", cmap="hot",
             vmin=0, vmax=max_err)

    # 08 -- Error map: region
    save_img(error_region, "08_error_region.png",
             f"Absolute Error - Region (MAE={mae_r:.2f} m)", cmap="hot",
             vmin=0, vmax=max_err)

    # 09 -- Improvement map
    improvement = error_global - error_region  # positive = region is better
    fig, ax = plt.subplots(1, 1, figsize=(8, 8), dpi=100)
    lim = max(abs(improvement.min()), abs(improvement.max()), 0.1)
    im = ax.imshow(improvement, cmap="RdYlGn", vmin=-lim, vmax=lim)
    ax.set_title("Improvement Map (green = region better)", fontsize=14, fontweight="bold")
    ax.axis("off")
    plt.colorbar(im, ax=ax, fraction=0.046, pad=0.04, label="Error reduction (m)")
    fig.tight_layout()
    fig.savefig(str(OUT_DIR / "09_improvement_map.png"), bbox_inches="tight")
    plt.close(fig)
    print(f"    [OK] 09_improvement_map.png")

    # -- Calibration report --
    class_names = {CLASS_GROUND: "Ground", CLASS_BUILDING: "Building",
                   CLASS_VEGETATION: "Vegetation", -1: "Global (fallback)"}

    report_lines = [
        "REAL-DATA REGION-AWARE CALIBRATION REPORT",
        f"Scene: {args.scene}",
        f"Representative val patch index: {representative['index']}",
        "=" * 50,
        "",
    ]

    for cid in [-1, CLASS_GROUND, CLASS_BUILDING, CLASS_VEGETATION]:
        f = rp_fits[cid]
        report_lines.append(f"{class_names[cid]}:")
        report_lines.append(f"  z = {f.scale:.4f} * d + {f.shift:.4f}")
        report_lines.append(f"  Pixels used:     {f.n_pixels_used}")
        report_lines.append(f"  Inlier fraction: {f.inlier_fraction:.4f}")
        report_lines.append(f"  R2 score:        {f.r2_score:.6f}")
        report_lines.append("")

    report_lines.append("=" * 50)
    report_lines.append(f"Pooled MAE (global):  {pooled_mae_global:.4f} m")
    report_lines.append(f"Pooled MAE (region):  {pooled_mae_region:.4f} m")
    report_lines.append(f"Improvement:          {pooled_improvement:+.1f}%")
    report_lines.append(f"Total val patches:    {len(val_patches)}")
    report_lines.append(f"Total valid pixels:   {total_valid}")

    report_path = OUT_DIR / "calibration_report.txt"
    report_path.write_text("\n".join(report_lines))
    print(f"    [OK] calibration_report.txt")

    # -- Summary --
    print(f"\n{'='*70}")
    print(f"DONE! Output files saved to: {OUT_DIR.resolve()}")
    print(f"\nKey result:")
    print(f"  Global calibration MAE:       {pooled_mae_global:.4f} m")
    print(f"  Region-aware calibration MAE: {pooled_mae_region:.4f} m")
    print(f"  Improvement:                  {pooled_improvement:+.1f}%")
    print(f"  (pooled across {len(val_patches)} val patches, {total_valid} valid pixels)")
    print(f"{'='*70}")


if __name__ == "__main__":
    main()
