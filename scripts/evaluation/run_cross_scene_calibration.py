"""
run_cross_scene_calibration.py -- Cross-scene generalization test.

Measures whether a region-aware calibration FIT ON AREA1 generalises to
scenes it has never seen (area17: vegetation-heavy, area4: building-heavy).

Scene selection (locked in before any calibration numbers existed):
  - area1:  Ground 35.6% / Building 37.6% / Vegetation 25.3%  (source)
  - area17: Ground 12.9% / Building 16.7% / Vegetation 70.1%  (vegetation-heavy)
  - area4:  Ground 30.4% / Building 58.5% / Vegetation  9.6%  (building-heavy)

Three methods are compared per target scene:
  1. Global, frozen from area1   -- area1's global fit scale/shift applied uniformly
  2. Region, frozen from area1   -- area1's per-class fits applied without re-fitting
  3. Region, fit fresh on target -- fit_region_calibration() called on target's own pixels

Method 3 is an upper bound ("what if we had GT labels for the deployment scene"),
not something available in real deployment.

Outputs:
  data/cross_scene_output/<scene>/   -- same-style diagnostic PNGs
  data/cross_scene_output/area1_frozen_fit.pkl   -- serialized frozen fit
  data/cross_scene_output/cross_scene_report.txt -- full comparison table
"""
from __future__ import annotations
import sys
import os
import pickle
import argparse
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pathlib import Path

# Target scenes selected BEFORE running calibration based on class distribution
SOURCE_SCENE = "area1"
TARGET_SCENES = ["area17", "area4"]

SEMANTIC_GT_DIR = Path("data/raw/Vaihingen/Vaihingen/ground_truth_COMPLETE")
IMAGERY_DIR = Path("dataset/imagery")
DSM_DIR = Path("dataset/dsm")

CHECKPOINT_CANDIDATES = ["models/checkpoints/dav2/best.pt", "best.pt", "checkpoints/best.pt",
                          "checkpoints/dav2_finetune/best.pt"]


def find_checkpoint(explicit: str | None) -> Path:
    candidates = [explicit] + CHECKPOINT_CANDIDATES
    for c in candidates:
        if c is not None and Path(c).is_file():
            return Path(c)
    raise FileNotFoundError(
        "Could not find best.pt. Searched:\n"
        + "\n".join(f"  {c}" for c in candidates if c is not None)
    )


def find_semantic(scene: str) -> Path:
    p = SEMANTIC_GT_DIR / f"top_mosaic_09cm_{scene}.tif"
    if p.is_file():
        return p
    raise FileNotFoundError(f"Semantic label not found: {p}")


def preprocess_scene(scene: str, backbone_size: str, tile_size: int,
                     val_split_ratio: float):
    """
    Run the full preprocessing pipeline for one scene and return
    (all_imagery, all_dsm, all_semantic, all_valid_mask, val_patches, scene_dsm_raw).

    Returns the SCENE-LEVEL arrays (for fitting on ALL valid pixels) plus
    the val-split patches (for evaluation).
    """
    from depthwizard.ingestion.training import load_scene_with_semantics
    from depthwizard.preprocessing.radiometric_correction import (
        radiometric_correction_pipeline, build_dav2_rgb_proxy,
    )
    from depthwizard.preprocessing.cloud_shadow_masking import compute_valid_mask
    from depthwizard.preprocessing.noise_reduction import denoise_imagery, denoise_dsm
    from depthwizard.preprocessing.contrast_enhancement import enhance_contrast
    from depthwizard.preprocessing.resolution_handling import (
        align_dataset_to_common_gsd_with_semantics,
    )
    from depthwizard.preprocessing.tiling import (
        crop_patches_with_semantics, split_by_area,
    )

    img_path = IMAGERY_DIR / f"{scene}_imagery.tif"
    dsm_path = DSM_DIR / f"{scene}_dsm.tif"
    sem_path = find_semantic(scene)

    imagery, dsm_raw, semantic, meta = load_scene_with_semantics(
        str(img_path), str(dsm_path), str(sem_path)
    )
    if meta.gsd_m is None or meta.gsd_m > 0.5:
        meta.gsd_m = 0.09
    GSD = meta.gsd_m

    # Stage 1
    corrected = radiometric_correction_pipeline(imagery)
    unet_input = corrected["unet_input"]

    # Stage 2: imagery mask + DSM floor (same pattern as run_real_calibration.py)
    img_valid_mask = compute_valid_mask(unet_input)
    dsm_valid_mask = dsm_raw > 1.0
    valid_mask = img_valid_mask & dsm_valid_mask

    # Stage 3
    img_denoised = denoise_imagery(unet_input)
    dsm_denoised = denoise_dsm(dsm_raw, valid_mask=valid_mask)
    dsm_denoised = np.nan_to_num(dsm_denoised, nan=0.0)

    # Stage 4
    img_enhanced = enhance_contrast(img_denoised, valid_mask=valid_mask)

    # Fill NaN
    fill_value = float(np.nanmedian(dsm_denoised)) if not np.all(dsm_denoised == 0) else 0.0
    dsm_filled = np.where(np.isnan(dsm_denoised), fill_value, dsm_denoised)

    # Stage 5
    aligned = align_dataset_to_common_gsd_with_semantics(
        img_enhanced, dsm_filled, valid_mask, semantic,
        source_gsd_m=GSD, target_gsd_m=GSD,
    )

    # Stage 6
    patches = crop_patches_with_semantics(
        aligned["imagery"], aligned["dsm"], aligned["valid_mask"], aligned["semantic"],
        tile_size=tile_size, stride=tile_size, min_valid_fraction=0.6,
    )

    # Train/val split
    max_row_off = max(p.row_off for p in patches)
    split_point = int(max_row_off * (1.0 - val_split_ratio))
    _, val_patches = split_by_area(patches, [(split_point, max_row_off + tile_size)])

    return (
        aligned["imagery"],
        aligned["dsm"],
        aligned["semantic"],
        aligned["valid_mask"],
        val_patches,
        dsm_raw,
    )


def make_save_img(out_dir: Path, plt):
    def save_img(data, filename, title, cmap="viridis", vmin=None, vmax=None):
        fig, ax = plt.subplots(1, 1, figsize=(8, 8), dpi=100)
        im = ax.imshow(data, cmap=cmap, vmin=vmin, vmax=vmax)
        ax.set_title(title, fontsize=14, fontweight="bold")
        ax.axis("off")
        plt.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
        fig.tight_layout()
        fig.savefig(str(out_dir / filename), bbox_inches="tight")
        plt.close(fig)
        print(f"      [PNG] {filename}")
    return save_img


def main():
    parser = argparse.ArgumentParser(
        description="Cross-scene generalization test for region-aware calibration"
    )
    parser.add_argument("--checkpoint", type=str, default=None)
    parser.add_argument("--backbone-size", type=str, default="small")
    parser.add_argument("--tile-size", type=int, default=256)
    parser.add_argument("--val-split-ratio", type=float, default=0.2)
    parser.add_argument(
        "--output-dir", type=str, default="data/cross_scene_output"
    )
    args = parser.parse_args()

    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.patches import Patch as MplPatch

    from depthwizard.preprocessing.radiometric_correction import build_dav2_rgb_proxy
    from depthwizard.ingestion.dem_fetcher import fetch_base_elevation
    from depthwizard.models.dav2_backbone import DAv2Backbone
    from depthwizard.calibration.region_calibration import (
        fit_region_calibration, apply_region_calibration,
        CLASS_GROUND, CLASS_BUILDING, CLASS_VEGETATION, CLASS_UNKNOWN,
    )

    ckpt_path = find_checkpoint(args.checkpoint)
    OUT_ROOT = Path(args.output_dir)
    OUT_ROOT.mkdir(parents=True, exist_ok=True)

    print("=" * 70)
    print("CROSS-SCENE CALIBRATION GENERALIZATION TEST")
    print("=" * 70)
    print(f"\nSource scene (calibration fit): {SOURCE_SCENE}")
    print(f"Target scenes (transfer test):  {TARGET_SCENES}")
    print(f"Checkpoint: {ckpt_path.resolve()}")

    # =========================================================================
    # PHASE 1: Load area1 and fit calibration on ALL its valid pixels (pooled)
    # =========================================================================
    print(f"\n{'='*70}")
    print(f"PHASE 1 — FIT CALIBRATION ON {SOURCE_SCENE} (pooled, not per-patch)")
    print(f"{'='*70}")

    print(f"\n[1a] Preprocessing {SOURCE_SCENE}...")
    (src_img, src_dsm, src_sem, src_valid,
     src_val_patches, _) = preprocess_scene(
        SOURCE_SCENE, args.backbone_size, args.tile_size, args.val_split_ratio
    )
    print(f"    Scene shape: {src_img.shape[:2]}, valid pixels: {src_valid.sum():,}")

    img_path_src = str(IMAGERY_DIR / f"{SOURCE_SCENE}_imagery.tif")
    try:
        source_base_elev = fetch_base_elevation(img_path_src)
        print(f"    Fetched source coarse base elevation: {source_base_elev:.2f} m")
    except Exception as e:
        print(f"\n    [ERROR] Failed to fetch DEM: {e}\n")
        sys.exit(1)

    # DA2 inference over the entire scene (stitch from all val patches)
    print(f"\n[1b] Loading DA2 and running inference on {SOURCE_SCENE} val patches...")
    dav2 = DAv2Backbone(size=args.backbone_size, frozen=True, weights_path=str(ckpt_path))

    # Build a full-scene relative depth map by stitching val patches
    # We do this by accumulating patch predictions into a scene-sized array
    scene_h, scene_w = src_img.shape[:2]
    rel_depth_scene = np.zeros((scene_h, scene_w), dtype=np.float32)
    covered_mask = np.zeros((scene_h, scene_w), dtype=bool)
    ts = args.tile_size

    for patch in src_val_patches:
        rgb_proxy = build_dav2_rgb_proxy(patch.imagery)
        rel_patch = dav2.predict(rgb_proxy)
        r, c = patch.row_off, patch.col_off
        rel_depth_scene[r:r+ts, c:c+ts] = rel_patch
        covered_mask[r:r+ts, c:c+ts] = True

    # Fit mask: valid imagery pixels that are also covered by val patches
    fit_mask = src_valid & covered_mask
    print(f"    Fit mask (valid & val-covered): {fit_mask.sum():,} pixels")

    print(f"\n[1c] Fitting region calibration on pooled {SOURCE_SCENE} pixels (zero-mean)...")
    frozen_fits = fit_region_calibration(
        rel_depth_scene, src_sem, src_dsm, valid_mask=fit_mask, base_elevation=source_base_elev
    )
    print(f"    Fitted {len(frozen_fits)} class fits (keys: {list(frozen_fits.keys())})")
    print(f"    Global fit: scale={frozen_fits[-1].scale:.4f}, shift={frozen_fits[-1].shift:.4f}")
    for cls_id, cls_name in [(CLASS_GROUND, "Ground"), (CLASS_BUILDING, "Building"),
                              (CLASS_VEGETATION, "Vegetation")]:
        if cls_id in frozen_fits:
            f = frozen_fits[cls_id]
            print(f"    {cls_name} fit: scale={f.scale:.4f}, shift={f.shift:.4f} "
                  f"(n={f.n_pixels_used:,}, inlier={f.inlier_fraction:.2f})")

    # Pickle the frozen fit for test verification
    frozen_fit_path = OUT_ROOT / "area1_frozen_fit.pkl"
    with open(frozen_fit_path, "wb") as fh:
        pickle.dump(frozen_fits, fh)
    print(f"\n    [OK] Frozen fit saved to {frozen_fit_path}")

    # =========================================================================
    # PHASE 2: Apply frozen fit to each target scene
    # =========================================================================
    all_scene_results = {}

    for target_scene in TARGET_SCENES:
        print(f"\n{'='*70}")
        print(f"PHASE 2 — TARGET SCENE: {target_scene}")
        print(f"{'='*70}")

        scene_out = OUT_ROOT / target_scene
        scene_out.mkdir(parents=True, exist_ok=True)
        save_img = make_save_img(scene_out, plt)

        print(f"\n[2a] Preprocessing {target_scene}...")
        (tgt_img, tgt_dsm, tgt_sem, tgt_valid,
         tgt_val_patches, _) = preprocess_scene(
            target_scene, args.backbone_size, args.tile_size, args.val_split_ratio
        )
        print(f"    Scene shape: {tgt_img.shape[:2]}, "
              f"val patches: {len(tgt_val_patches)}, "
              f"valid pixels across val patches: "
              f"{sum(p.valid_mask.sum() for p in tgt_val_patches):,}")

        if not tgt_val_patches:
            print(f"    WARNING: no val patches for {target_scene}, skipping.")
            continue
            
        img_path_tgt = str(IMAGERY_DIR / f"{target_scene}_imagery.tif")
        try:
            target_base_elev = fetch_base_elevation(img_path_tgt)
            print(f"    Fetched target coarse base elevation: {target_base_elev:.2f} m")
        except Exception as e:
            print(f"\n    [ERROR] Failed to fetch DEM: {e}\n")
            sys.exit(1)

        # -- Per-patch results for all 3 methods --
        patch_results = []

        print(f"\n[2b] Running inference + calibration on {target_scene} val patches...")
        for i, patch in enumerate(tgt_val_patches):
            rgb_proxy = build_dav2_rgb_proxy(patch.imagery)
            rel_depth = dav2.predict(rgb_proxy)
            v = patch.valid_mask

            # Method 1: Global frozen from area1
            gf = frozen_fits[-1]
            h_global_frozen = (gf.scale * rel_depth + gf.shift) + target_base_elev
            mae_global_frozen = float(np.mean(np.abs(h_global_frozen[v] - patch.dsm[v]))) if v.any() else np.nan

            # Method 2: Region frozen from area1 (apply only, NO re-fitting)
            h_region_frozen = apply_region_calibration(
                rel_depth, patch.semantic, frozen_fits, base_elevation=target_base_elev
            )
            mae_region_frozen = float(np.mean(np.abs(h_region_frozen[v] - patch.dsm[v]))) if v.any() else np.nan

            # Method 3: Region fit fresh on this target patch (reference upper bound)
            fresh_fits = fit_region_calibration(
                rel_depth, patch.semantic, patch.dsm, valid_mask=v, base_elevation=target_base_elev
            )
            h_region_fresh = apply_region_calibration(
                rel_depth, patch.semantic, fresh_fits, base_elevation=target_base_elev
            )
            mae_region_fresh = float(np.mean(np.abs(h_region_fresh[v] - patch.dsm[v]))) if v.any() else np.nan

            patch_results.append({
                "index": i,
                "row_off": patch.row_off,
                "col_off": patch.col_off,
                "n_valid": int(v.sum()),
                "mae_global_frozen": mae_global_frozen,
                "mae_region_frozen": mae_region_frozen,
                "mae_region_fresh": mae_region_fresh,
                "rel_depth": rel_depth,
                "h_global_frozen": h_global_frozen,
                "h_region_frozen": h_region_frozen,
                "patch": patch,
            })

            print(f"    patch[{i:2d}] row={patch.row_off:4d} col={patch.col_off:4d}  "
                  f"G_frozen={mae_global_frozen:.3f}  "
                  f"R_frozen={mae_region_frozen:.3f}  "
                  f"R_fresh={mae_region_fresh:.3f}")

        # Pooled MAEs (pixel-weighted)
        total_valid = sum(r["n_valid"] for r in patch_results)
        pooled_gf  = sum(r["mae_global_frozen"] * r["n_valid"] for r in patch_results) / total_valid
        pooled_rf  = sum(r["mae_region_frozen"] * r["n_valid"] for r in patch_results) / total_valid
        pooled_rfs = sum(r["mae_region_fresh"]  * r["n_valid"] for r in patch_results) / total_valid

        transfer_gap = pooled_rf - pooled_rfs   # +ve means frozen is worse than fresh
        region_vs_global = pooled_gf - pooled_rf  # +ve means region frozen beats global frozen

        print(f"\n  ---- {target_scene} POOLED RESULTS ({total_valid:,} valid pixels) ----")
        print(f"  {'Method':<40} {'MAE':>8}")
        print(f"  {'-'*50}")
        print(f"  {'Global, frozen from area1':<40} {pooled_gf:>8.4f} m")
        print(f"  {'Region, frozen from area1':<40} {pooled_rf:>8.4f} m")
        print(f"  {'Region, fit fresh on target scene':<40} {pooled_rfs:>8.4f} m")
        print(f"  {'-'*50}")
        print(f"  Region-frozen vs Global-frozen:  {-region_vs_global:+.4f} m "
              f"({'region better' if region_vs_global > 0 else 'global better'})")
        print(f"  Transfer gap (frozen vs fresh):  {transfer_gap:+.4f} m "
              f"({'frozen worse' if transfer_gap > 0 else 'frozen better than fresh'})")

        all_scene_results[target_scene] = {
            "patch_results": patch_results,
            "pooled_gf": pooled_gf,
            "pooled_rf": pooled_rf,
            "pooled_rfs": pooled_rfs,
            "transfer_gap": transfer_gap,
            "region_vs_global": region_vs_global,
            "total_valid": total_valid,
            "n_patches": len(patch_results),
        }

        # -- Save visual outputs for representative patch (median region-frozen MAE) --
        sorted_patches = sorted(patch_results, key=lambda r: r["mae_region_frozen"])
        rep = sorted_patches[len(sorted_patches) // 2]
        rp = rep["patch"]
        rp_rel = rep["rel_depth"]
        rp_hgf = rep["h_global_frozen"]
        rp_hrf = rep["h_region_frozen"]
        ref_dsm = rp.dsm.astype(np.float32)
        vm = rp.valid_mask

        print(f"\n[2c] Saving visuals to {scene_out}...")

        # Imagery
        disp = rp.imagery[:, :, :3].astype(np.float32)
        disp = (disp - disp.min()) / (disp.max() - disp.min() + 1e-8)
        fig, ax = plt.subplots(figsize=(8, 8), dpi=100)
        ax.imshow(disp); ax.set_title(f"{target_scene} — Input Imagery", fontsize=14, fontweight="bold")
        ax.axis("off"); fig.tight_layout()
        fig.savefig(str(scene_out / "01_imagery_rgb.png"), bbox_inches="tight")
        plt.close(fig); print("      [PNG] 01_imagery_rgb.png")

        save_img(ref_dsm, "02_dsm.png", f"{target_scene} — Reference DSM (m)", cmap="terrain")

        # Semantic labels
        sem_display = np.zeros((*rp.semantic.shape, 3), dtype=np.float32)
        sem_display[rp.semantic == CLASS_GROUND]      = [0.85, 0.85, 0.85]
        sem_display[rp.semantic == CLASS_BUILDING]    = [0.2, 0.2, 0.9]
        sem_display[rp.semantic == CLASS_VEGETATION]  = [0.1, 0.7, 0.1]
        sem_display[rp.semantic == CLASS_UNKNOWN]     = [1.0, 0.8, 0.0]
        fig, ax = plt.subplots(figsize=(8, 8), dpi=100)
        ax.imshow(sem_display)
        ax.set_title(f"{target_scene} — Semantic Labels (ISPRS GT)", fontsize=14, fontweight="bold")
        ax.axis("off")
        legend_elements = [
            MplPatch(facecolor=(0.85, 0.85, 0.85), label="Ground"),
            MplPatch(facecolor=(0.2, 0.2, 0.9),    label="Building"),
            MplPatch(facecolor=(0.1, 0.7, 0.1),    label="Vegetation"),
            MplPatch(facecolor=(1.0, 0.8, 0.0),    label="Unknown"),
        ]
        ax.legend(handles=legend_elements, loc="lower right", fontsize=11)
        fig.tight_layout()
        fig.savefig(str(scene_out / "03_semantic_labels.png"), bbox_inches="tight")
        plt.close(fig); print("      [PNG] 03_semantic_labels.png")

        save_img(rp_rel, "04_relative_depth.png",
                 f"{target_scene} — DA2 Relative Depth", cmap="magma")

        err_gf = np.abs(rp_hgf - ref_dsm)
        err_rf = np.abs(rp_hrf - ref_dsm)
        mae_gf_rep = float(err_gf[vm].mean()) if vm.any() else 0
        mae_rf_rep = float(err_rf[vm].mean()) if vm.any() else 0
        max_err = max(err_gf.max(), err_rf.max())

        save_img(rp_hgf, "05_global_frozen_calibrated.png",
                 f"{target_scene} — Global Frozen (MAE={mae_gf_rep:.2f}m)", cmap="terrain",
                 vmin=ref_dsm.min(), vmax=ref_dsm.max())
        save_img(rp_hrf, "06_region_frozen_calibrated.png",
                 f"{target_scene} — Region Frozen (MAE={mae_rf_rep:.2f}m)", cmap="terrain",
                 vmin=ref_dsm.min(), vmax=ref_dsm.max())
        save_img(err_gf, "07_error_global_frozen.png",
                 f"{target_scene} — Abs Error Global Frozen (MAE={mae_gf_rep:.2f}m)",
                 cmap="hot", vmin=0, vmax=max_err)
        save_img(err_rf, "08_error_region_frozen.png",
                 f"{target_scene} — Abs Error Region Frozen (MAE={mae_rf_rep:.2f}m)",
                 cmap="hot", vmin=0, vmax=max_err)

        improvement = err_gf - err_rf
        lim = max(abs(improvement.min()), abs(improvement.max()), 0.1)
        fig, ax = plt.subplots(figsize=(8, 8), dpi=100)
        im = ax.imshow(improvement, cmap="RdYlGn", vmin=-lim, vmax=lim)
        ax.set_title(f"{target_scene} — Improvement: Region vs Global Frozen", fontsize=14, fontweight="bold")
        ax.axis("off")
        plt.colorbar(im, ax=ax, fraction=0.046, pad=0.04, label="Error reduction (m)")
        fig.tight_layout()
        fig.savefig(str(scene_out / "09_improvement_map.png"), bbox_inches="tight")
        plt.close(fig); print("      [PNG] 09_improvement_map.png")

    # =========================================================================
    # PHASE 3: Full comparison table + report
    # =========================================================================
    print(f"\n{'='*70}")
    print(f"FULL CROSS-SCENE COMPARISON TABLE")
    print(f"{'='*70}")
    print(f"\n{'Scene':<10} {'Method':<40} {'MAE':>8}  {'Patches':>8}  {'Pixels':>10}")
    print(f"{'-'*80}")
    for scene, res in all_scene_results.items():
        n = res["n_patches"]
        px = res["total_valid"]
        print(f"{scene:<10} {'Global, frozen from area1':<40} {res['pooled_gf']:>8.4f}m  {n:>8}  {px:>10,}")
        print(f"{scene:<10} {'Region, frozen from area1':<40} {res['pooled_rf']:>8.4f}m  {n:>8}  {px:>10,}")
        print(f"{scene:<10} {'Region, fit fresh on target':<40} {res['pooled_rfs']:>8.4f}m  {n:>8}  {px:>10,}")
        print(f"{'':<10} {'Transfer gap (frozen - fresh):':<40} {res['transfer_gap']:>+8.4f}m")
        winner = "Region-frozen" if res["region_vs_global"] > 0 else "Global-frozen"
        print(f"{'':<10} {'Winner (region vs global frozen):':<40} {winner} by {abs(res['region_vs_global']):.4f}m")
        print(f"{'-'*80}")

    # Write report file
    report_lines = [
        "CROSS-SCENE CALIBRATION GENERALIZATION REPORT",
        "=" * 60,
        "",
        f"Source scene (fit origin): {SOURCE_SCENE}",
        f"  Global fit: scale={frozen_fits[-1].scale:.4f}, shift={frozen_fits[-1].shift:.4f}",
    ]
    for cls_id, cls_name in [(CLASS_GROUND, "Ground"), (CLASS_BUILDING, "Building"),
                              (CLASS_VEGETATION, "Vegetation")]:
        if cls_id in frozen_fits:
            f = frozen_fits[cls_id]
            report_lines.append(
                f"  {cls_name} fit: scale={f.scale:.4f}, shift={f.shift:.4f}, "
                f"n={f.n_pixels_used:,}, inlier_frac={f.inlier_fraction:.3f}, R2={f.r2_score:.4f}"
            )
    report_lines += ["", "=" * 60, "RESULTS BY TARGET SCENE", "=" * 60, ""]

    for scene, res in all_scene_results.items():
        report_lines += [
            f"Target scene: {scene}",
            f"  Val patches: {res['n_patches']}, Valid pixels: {res['total_valid']:,}",
            f"  {'Method':<40} {'MAE':>10}",
            f"  {'-'*52}",
            f"  {'Global, frozen from area1':<40} {res['pooled_gf']:>10.4f} m",
            f"  {'Region, frozen from area1':<40} {res['pooled_rf']:>10.4f} m",
            f"  {'Region, fit fresh on target scene':<40} {res['pooled_rfs']:>10.4f} m",
            f"  {'-'*52}",
            f"  Transfer gap (frozen_region - fresh_region): {res['transfer_gap']:+.4f} m",
            f"  Region-frozen vs Global-frozen:              {res['region_vs_global']:+.4f} m",
            "",
        ]

    report_path = OUT_ROOT / "cross_scene_report.txt"
    report_path.write_text("\n".join(report_lines))
    print(f"\n[OK] Report saved to {report_path.resolve()}")

    print(f"\n{'='*70}")
    print("DONE.")
    print(f"{'='*70}\n")


if __name__ == "__main__":
    main()
