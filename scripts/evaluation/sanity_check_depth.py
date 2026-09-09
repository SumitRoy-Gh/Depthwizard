"""
sanity_check_depth.py — Visual sanity check for the fine-tuned DA2 model.

Loads checkpoints/best.pt (or best.pt at project root), runs a no-grad
forward pass on one held-out val patch from a real Vaihingen scene, and
plots predicted pseudo-depth next to the true pseudo-depth.

This catches bugs that scalar metrics alone hide:
  - Flat/constant predictions (model collapsed)
  - Inverted depth map (sign-convention error)
  - Noisy garbage (catastrophic forgetting or data bug)
  - Wrong spatial structure (misaligned channels, etc.)

Usage:
    uv run python sanity_check_depth.py
    uv run python sanity_check_depth.py --checkpoint path/to/best.pt
    uv run python sanity_check_depth.py --scene-index 5

Outputs are written to data/sanity_check/:
    01_rgb_proxy_input.png      — the RGB-proxy image fed to DA2
    02_true_pseudo_depth.png    — ground-truth pseudo-depth (from DSM)
    03_predicted_depth.png      — model's predicted depth map
    04_side_by_side.png         — true vs predicted, same colorbar
    05_difference_map.png       — signed error (pred - true)
    06_scatter_correlation.png  — pixel-level scatter plot (true vs pred)
"""
from __future__ import annotations
import sys
import os
import argparse
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pathlib import Path


def find_checkpoint(explicit_path: str | None) -> Path:
    """Locate best.pt — check explicit arg, then common locations."""
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


def main():
    parser = argparse.ArgumentParser(description="Visual sanity check for fine-tuned DA2 depth model")
    parser.add_argument("--checkpoint", type=str, default=None,
                        help="Path to best.pt checkpoint (auto-detected if omitted)")
    parser.add_argument("--imagery-dir", type=str, default="dataset/imagery",
                        help="Directory containing *_imagery.tif files")
    parser.add_argument("--dsm-dir", type=str, default="dataset/dsm",
                        help="Directory containing *_dsm.tif files")
    parser.add_argument("--scene-index", type=int, default=0,
                        help="Which scene (by sorted filename order) to use (default: 0)")
    parser.add_argument("--patch-index", type=int, default=None,
                        help="Which val patch to visualize (default: middle patch)")
    parser.add_argument("--backbone-size", type=str, default="small",
                        help="DA2 backbone size: small/base/large (must match training)")
    parser.add_argument("--tile-size", type=int, default=256,
                        help="Tile size used during training (default: 256)")
    parser.add_argument("--val-split-ratio", type=float, default=0.2,
                        help="Val split ratio used during training (default: 0.2)")
    parser.add_argument("--output-dir", type=str, default="data/sanity_check",
                        help="Where to save output PNGs")
    args = parser.parse_args()

    # ── Lazy imports ─────────────────────────────────────────────────────
    import torch

    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        from matplotlib.colors import Normalize
    except ImportError:
        print("ERROR: matplotlib is required. Install with: uv pip install matplotlib")
        sys.exit(1)

    from depthwizard.ingestion.training import load_scene
    from depthwizard.pipeline.training import process_scene
    from depthwizard.preprocessing.tiling import split_by_area
    from depthwizard.preprocessing.radiometric_correction import build_dav2_rgb_proxy
    from depth_estimation.pseudo_depth import dsm_to_pseudo_depth
    from depthwizard.models.dav2_backbone import DAv2Backbone

    OUT_DIR = Path(args.output_dir)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # ═══════════════════════════════════════════════════════════════════
    # STEP 1: Locate checkpoint
    # ═══════════════════════════════════════════════════════════════════
    print("=" * 60)
    print("DEPTH MODEL - QUALITATIVE SANITY CHECK")
    print("=" * 60)

    ckpt_path = find_checkpoint(args.checkpoint)
    print(f"\n[1/5] Checkpoint: {ckpt_path.resolve()}")

    # ═══════════════════════════════════════════════════════════════════
    # STEP 2: Load & preprocess one real scene → extract val patches
    # ═══════════════════════════════════════════════════════════════════
    print(f"\n[2/5] Loading real Vaihingen scene (index={args.scene_index})...")

    imagery_dir = Path(args.imagery_dir)
    dsm_dir = Path(args.dsm_dir)

    # Match imagery/DSM pairs by stem (same logic as train_finetune.py)
    imagery_files = sorted(imagery_dir.glob("*_imagery.tif"))
    dsm_files = sorted(dsm_dir.glob("*_dsm.tif"))

    imagery_stems = {f.name.replace("_imagery.tif", ""): f for f in imagery_files}
    dsm_stems = {f.name.replace("_dsm.tif", ""): f for f in dsm_files}

    common_stems = sorted(set(imagery_stems) & set(dsm_stems))
    if not common_stems:
        print(f"ERROR: No matched imagery/DSM pairs in {imagery_dir} and {dsm_dir}")
        sys.exit(1)

    idx = min(args.scene_index, len(common_stems) - 1)
    stem = common_stems[idx]
    img_path = imagery_stems[stem]
    dsm_path = dsm_stems[stem]
    print(f"    Scene: {stem} ({img_path.name} + {dsm_path.name})")

    imagery, dsm, meta = load_scene(str(img_path), str(dsm_path))
    print(f"    Loaded: imagery {imagery.shape}, dsm {dsm.shape}, GSD={meta.gsd_m}")

    # Handle suspicious GSD (same guard as train_finetune.py)
    if meta.gsd_m is None or meta.gsd_m > 0.5:
        print(f"    [Warning] Suspicious GSD ({meta.gsd_m}) — assuming 0.09m (Vaihingen)")
        meta.gsd_m = 0.09

    patches = process_scene(
        raw_ir_r_g=imagery,
        raw_dsm=dsm,
        source_gsd_m=meta.gsd_m,
        target_gsd_m=0.09,
        tile_size=args.tile_size,
        verbose=True,
    )
    print(f"    Total patches from scene: {len(patches)}")

    if not patches:
        print("ERROR: No patches extracted from this scene. Try a different --scene-index.")
        sys.exit(1)

    # Spatial train/val split (same logic as train_finetune.py)
    max_row_off = max(p.row_off for p in patches)
    split_point = int(max_row_off * (1.0 - args.val_split_ratio))
    test_area_row_ranges = [(split_point, max_row_off + args.tile_size)]
    train_patches, val_patches = split_by_area(patches, test_area_row_ranges)

    print(f"    Train patches: {len(train_patches)}, Val patches: {len(val_patches)}")

    if not val_patches:
        print("    [Warning] No val patches — using last train patch instead for visual check.")
        val_patches = [train_patches[-1]]

    # Pick a patch (default: middle of val set for a "typical" sample)
    patch_idx = args.patch_index if args.patch_index is not None else len(val_patches) // 2
    patch_idx = min(patch_idx, len(val_patches) - 1)
    patch = val_patches[patch_idx]
    print(f"    Using val patch [{patch_idx}] at row_off={patch.row_off}, col_off={patch.col_off}")

    # ═══════════════════════════════════════════════════════════════════
    # STEP 3: Build inputs & ground-truth pseudo-depth
    # ═══════════════════════════════════════════════════════════════════
    print(f"\n[3/5] Preparing model input & ground-truth pseudo-depth...")

    rgb_proxy = build_dav2_rgb_proxy(patch.imagery)  # (H, W, 3) uint8
    pseudo_depth_true, pd_params = dsm_to_pseudo_depth(patch.dsm, valid_mask=patch.valid_mask)

    print(f"    RGB proxy: {rgb_proxy.shape} {rgb_proxy.dtype}")
    print(f"    True pseudo-depth: range=[{pseudo_depth_true.min():.3f}, {pseudo_depth_true.max():.3f}]")
    print(f"    Pseudo-depth params: {pd_params}")

    # ═══════════════════════════════════════════════════════════════════
    # STEP 4: Load model & run forward pass (no-grad)
    # ═══════════════════════════════════════════════════════════════════
    print(f"\n[4/5] Loading fine-tuned DA2 (size={args.backbone_size}) and running inference...")

    # Load with frozen=False so we can load fine-tuned weights, but we'll
    # run inference in eval mode with no_grad ourselves.
    dav2 = DAv2Backbone(size=args.backbone_size, frozen=False, weights_path=str(ckpt_path))
    dav2.model.eval()

    # Forward pass — use predict() which already wraps @torch.no_grad
    # and handles the single-image case cleanly.
    # But predict() requires frozen=True. So we use manual no_grad + forward_train
    # with a batch dimension of 1 instead.
    rgb_batch = rgb_proxy[np.newaxis, ...]  # (1, H, W, 3)

    with torch.no_grad():
        # Temporarily allow forward_train by patching frozen flag
        dav2.frozen = False
        pred_tensor = dav2.forward_train(rgb_batch)  # (1, H, W)
        pred_depth = pred_tensor.squeeze(0).cpu().numpy().astype(np.float32)

    print(f"    Predicted depth: {pred_depth.shape}, "
          f"range=[{pred_depth.min():.3f}, {pred_depth.max():.3f}]")

    # Quick scalar sanity checks
    valid = patch.valid_mask
    if valid.any():
        mae = float(np.mean(np.abs(pred_depth[valid] - pseudo_depth_true[valid])))
        corr = float(np.corrcoef(pred_depth[valid].ravel(), pseudo_depth_true[valid].ravel())[0, 1])
        pred_std = float(pred_depth[valid].std())
        true_std = float(pseudo_depth_true[valid].std())
        print(f"    MAE (valid pixels): {mae:.4f}")
        print(f"    Pearson correlation: {corr:.4f}")
        print(f"    Pred std: {pred_std:.4f}, True std: {true_std:.4f}")

        # Flag obvious problems
        if pred_std < 0.01:
            print("    [!!] WARNING: Prediction is nearly FLAT - model may have collapsed!")
        if corr < 0:
            print("    [!!] WARNING: Negative correlation - possible sign-convention inversion!")
        if corr < 0.3:
            print("    [!!] WARNING: Very low correlation - depth map may be nonsensical!")
    else:
        print("    [Warning] No valid pixels in this patch — try a different patch index.")

    # ═══════════════════════════════════════════════════════════════════
    # STEP 5: Save visual output PNGs
    # ═══════════════════════════════════════════════════════════════════
    print(f"\n[5/5] Saving output images to {OUT_DIR.resolve()}...")

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

    # 01 — RGB proxy input
    fig, ax = plt.subplots(1, 1, figsize=(8, 8), dpi=100)
    ax.imshow(rgb_proxy)
    ax.set_title("RGB Proxy Input (fed to DA2)", fontsize=14, fontweight="bold")
    ax.axis("off")
    fig.tight_layout()
    fig.savefig(str(OUT_DIR / "01_rgb_proxy_input.png"), bbox_inches="tight")
    plt.close(fig)
    print(f"    [OK] 01_rgb_proxy_input.png")

    # 02 — True pseudo-depth
    save_img(pseudo_depth_true, "02_true_pseudo_depth.png",
             "True Pseudo-Depth (from DSM)", cmap="magma")

    # 03 — Predicted depth
    save_img(pred_depth, "03_predicted_depth.png",
             "Predicted Depth (fine-tuned DA2)", cmap="magma")

    # 04 — Side-by-side comparison (shared colorbar range for fair visual comparison)
    vmin_shared = min(pseudo_depth_true[valid].min() if valid.any() else 0,
                      pred_depth[valid].min() if valid.any() else 0)
    vmax_shared = max(pseudo_depth_true[valid].max() if valid.any() else 1,
                      pred_depth[valid].max() if valid.any() else 1)

    fig, axes = plt.subplots(1, 3, figsize=(24, 8), dpi=100)

    axes[0].imshow(rgb_proxy)
    axes[0].set_title("RGB Proxy Input", fontsize=13, fontweight="bold")
    axes[0].axis("off")

    im1 = axes[1].imshow(pseudo_depth_true, cmap="magma", vmin=vmin_shared, vmax=vmax_shared)
    axes[1].set_title("True Pseudo-Depth", fontsize=13, fontweight="bold")
    axes[1].axis("off")

    im2 = axes[2].imshow(pred_depth, cmap="magma", vmin=vmin_shared, vmax=vmax_shared)
    axes[2].set_title("Predicted Depth (fine-tuned)", fontsize=13, fontweight="bold")
    axes[2].axis("off")

    # Shared colorbar
    fig.colorbar(im2, ax=axes.tolist(), fraction=0.02, pad=0.02)

    corr_str = f"r={corr:.3f}" if valid.any() else "N/A"
    mae_str = f"MAE={mae:.3f}" if valid.any() else "N/A"
    fig.suptitle(f"Side-by-Side Comparison  |  {corr_str}  |  {mae_str}",
                 fontsize=15, fontweight="bold", y=0.98)
    fig.tight_layout(rect=[0, 0, 0.95, 0.96])
    fig.savefig(str(OUT_DIR / "04_side_by_side.png"), bbox_inches="tight")
    plt.close(fig)
    print(f"    [OK] 04_side_by_side.png")

    # 05 — Signed difference map
    diff = pred_depth - pseudo_depth_true
    abs_max = max(abs(diff[valid].min()) if valid.any() else 1,
                  abs(diff[valid].max()) if valid.any() else 1,
                  0.1)  # Avoid zero range
    save_img(diff, "05_difference_map.png",
             "Difference (Pred − True)", cmap="RdBu_r", vmin=-abs_max, vmax=abs_max)

    # 06 — Scatter correlation plot
    if valid.any() and valid.sum() > 10:
        fig, ax = plt.subplots(1, 1, figsize=(8, 8), dpi=100)

        true_vals = pseudo_depth_true[valid].ravel()
        pred_vals = pred_depth[valid].ravel()

        # Subsample if too many pixels (for legible scatter)
        n_pts = len(true_vals)
        if n_pts > 5000:
            rng = np.random.default_rng(42)
            idx_sample = rng.choice(n_pts, 5000, replace=False)
            true_vals_plot = true_vals[idx_sample]
            pred_vals_plot = pred_vals[idx_sample]
        else:
            true_vals_plot = true_vals
            pred_vals_plot = pred_vals

        ax.scatter(true_vals_plot, pred_vals_plot, alpha=0.15, s=4, c="steelblue", edgecolors="none")

        # Perfect-agreement line
        combined = np.concatenate([true_vals, pred_vals])
        lo, hi = combined.min(), combined.max()
        ax.plot([lo, hi], [lo, hi], "r--", linewidth=2, label="Perfect agreement")

        # Linear fit
        coeffs = np.polyfit(true_vals, pred_vals, 1)
        fit_line = np.polyval(coeffs, np.array([lo, hi]))
        ax.plot([lo, hi], fit_line, "g-", linewidth=2,
                label=f"Linear fit: y={coeffs[0]:.3f}x+{coeffs[1]:.3f}")

        ax.set_xlabel("True Pseudo-Depth", fontsize=12)
        ax.set_ylabel("Predicted Depth", fontsize=12)
        ax.set_title(f"Correlation: r={corr:.4f}  |  MAE={mae:.4f}\n"
                     f"n={n_pts} valid pixels (showing {len(true_vals_plot)})",
                     fontsize=13, fontweight="bold")
        ax.legend(fontsize=11)
        ax.set_aspect("equal", adjustable="box")
        ax.grid(True, alpha=0.3)
        fig.tight_layout()
        fig.savefig(str(OUT_DIR / "06_scatter_correlation.png"), bbox_inches="tight")
        plt.close(fig)
        print(f"    [OK] 06_scatter_correlation.png")
    else:
        print(f"    [SKIP] 06_scatter_correlation.png — not enough valid pixels")

    # ═══════════════════════════════════════════════════════════════════
    # Summary
    # ═══════════════════════════════════════════════════════════════════
    print("\n" + "=" * 60)
    print("SANITY CHECK COMPLETE")
    print(f"Output saved to: {OUT_DIR.resolve()}")
    print("\nFiles:")
    for f in sorted(OUT_DIR.iterdir()):
        print(f"  {f.name}")
    print("\n-- What to look for --")
    print("  [*] 04_side_by_side.png: Do buildings/terrain features appear")
    print("      in roughly the same locations in both maps?")
    print("  [*] 05_difference_map.png: Is the error spatially structured")
    print("      (systematic bias) or random noise?")
    print("  [*] 06_scatter_correlation.png: Points near the red diagonal = good.")
    print("      Flat horizontal cloud = model collapsed to constant.")
    print("      Negative slope = sign-convention error.")
    print("=" * 60)


if __name__ == "__main__":
    main()
