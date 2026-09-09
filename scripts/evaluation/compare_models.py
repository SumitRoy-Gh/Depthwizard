"""
compare_models.py - Zero-shot DAv2 vs Fine-tuned DAv2 (best.pt) Comparison
"""
import os
import sys
import numpy as np
import torch
import matplotlib.pyplot as plt

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from depthwizard.ingestion.training import load_scene_with_semantics
from depthwizard.preprocessing.radiometric_correction import radiometric_correction_pipeline, build_dav2_rgb_proxy
from depthwizard.preprocessing.cloud_shadow_masking import compute_valid_mask
from depthwizard.preprocessing.noise_reduction import denoise_imagery, denoise_dsm
from depthwizard.models.dav2_backbone import DAv2Backbone
from depthwizard.calibration.region_calibration import fit_region_calibration, apply_region_calibration

def main():
    scene_stem = "area1"
    imagery_path = f"dataset/imagery/{scene_stem}_imagery.tif"
    dsm_path = f"dataset/dsm/{scene_stem}_dsm.tif"
    semantic_path = f"data/raw/Vaihingen/Vaihingen/ground_truth_COMPLETE/top_mosaic_09cm_{scene_stem}.tif"
    
    print(f"Loading {scene_stem}...")
    imagery_raw, dsm_raw, semantic_raw, meta = load_scene_with_semantics(
        imagery_path, dsm_path, semantic_path
    )
    
    print("Preprocessing...")
    imagery_rad = radiometric_correction_pipeline(imagery_raw)
    valid_mask = compute_valid_mask(imagery_rad["unet_input"])
    imagery_clean = denoise_imagery(imagery_rad["unet_input"])
    dsm_clean = denoise_dsm(dsm_raw)
    dav2_rgb = build_dav2_rgb_proxy(imagery_clean)
    
    device = "cuda" if torch.cuda.is_available() else "cpu"
    
    # ---------------------------------------------------------
    # 1. Zero-shot DAv2 (No weights loaded, standard pretrained)
    # ---------------------------------------------------------
    print("\nRunning Zero-Shot DAv2...")
    dav2_zero = DAv2Backbone("small", weights_path=None, device=device)
    rel_depth_zero = dav2_zero.predict(dav2_rgb)
    
    fits_zero = fit_region_calibration(
        relative_depth=rel_depth_zero,
        semantic_labels=semantic_raw,
        reference_elevation=dsm_clean,
        valid_mask=valid_mask
    )
    abs_height_zero = apply_region_calibration(rel_depth_zero, semantic_raw, fits_zero)
    mae_zero = np.mean(np.abs(abs_height_zero[valid_mask] - dsm_clean[valid_mask]))
    print(f"Zero-Shot MAE: {mae_zero:.3f} meters")

    # ---------------------------------------------------------
    # 2. Fine-tuned DAv2 (best.pt)
    # ---------------------------------------------------------
    print("\nRunning Fine-Tuned DAv2 (best.pt)...")
    dav2_fine = DAv2Backbone("small", weights_path="models/checkpoints/dav2/best.pt", device=device)
    rel_depth_fine = dav2_fine.predict(dav2_rgb)
    
    fits_fine = fit_region_calibration(
        relative_depth=rel_depth_fine,
        semantic_labels=semantic_raw,
        reference_elevation=dsm_clean,
        valid_mask=valid_mask
    )
    abs_height_fine = apply_region_calibration(rel_depth_fine, semantic_raw, fits_fine)
    mae_fine = np.mean(np.abs(abs_height_fine[valid_mask] - dsm_clean[valid_mask]))
    print(f"Fine-Tuned MAE: {mae_fine:.3f} meters")
    
    # ---------------------------------------------------------
    # 3. Results
    # ---------------------------------------------------------
    improvement = (mae_zero - mae_fine) / mae_zero * 100
    print("\n" + "="*50)
    print("COMPARISON RESULTS:")
    print(f"Zero-Shot DAv2 Error: {mae_zero:.3f}m")
    print(f"Fine-Tuned DAv2 Error: {mae_fine:.3f}m")
    if improvement > 0:
        print(f"Improvement: +{improvement:.1f}% error reduction!")
    else:
        print(f"Difference: {improvement:.1f}%")
    print("="*50)
    
    # Plotting comparison map
    scratch_dir = r"C:\Users\Sumit\.gemini\antigravity-ide\brain\dafccd76-f703-4fd7-8be1-8bf7cf4c77f1\scratch"
    os.makedirs(scratch_dir, exist_ok=True)
    
    error_zero = np.abs(abs_height_zero - dsm_clean)
    error_fine = np.abs(abs_height_fine - dsm_clean)
    
    fig, axes = plt.subplots(1, 3, figsize=(18, 6))
    
    im0 = axes[0].imshow(dav2_rgb)
    axes[0].set_title("Input RGB")
    axes[0].axis('off')
    
    im1 = axes[1].imshow(error_zero, cmap='inferno', vmin=0, vmax=10)
    axes[1].set_title(f"Zero-Shot Error Map (MAE: {mae_zero:.2f}m)")
    axes[1].axis('off')
    plt.colorbar(im1, ax=axes[1], fraction=0.046, pad=0.04)
    
    im2 = axes[2].imshow(error_fine, cmap='inferno', vmin=0, vmax=10)
    axes[2].set_title(f"Fine-Tuned Error Map (MAE: {mae_fine:.2f}m)")
    axes[2].axis('off')
    plt.colorbar(im2, ax=axes[2], fraction=0.046, pad=0.04)
    
    plt.tight_layout()
    plt.savefig(os.path.join(scratch_dir, "model_comparison.png"), dpi=150)
    print("Saved visual comparison to scratch/model_comparison.png")

if __name__ == "__main__":
    main()
