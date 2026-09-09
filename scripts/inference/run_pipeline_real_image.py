"""
run_pipeline_real_image.py -- Full End-to-End Pipeline on Real Satellite Image

Loads area1 imagery, runs depth estimation, applies per-region scale calibration 
to get absolute metric height, and finally uses Stage 6 to export DSM products 
(nDSM, slope, hillshade). Plots them to scratch space for artifact viewing.
"""
import os
import sys
import numpy as np
import rasterio
import matplotlib.pyplot as plt
import torch
from pathlib import Path

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from depthwizard.ingestion.training import load_scene_with_semantics
from depthwizard.preprocessing.radiometric_correction import radiometric_correction_pipeline, build_dav2_rgb_proxy
from depthwizard.preprocessing.cloud_shadow_masking import compute_valid_mask
from depthwizard.preprocessing.noise_reduction import denoise_imagery, denoise_dsm
from depthwizard.preprocessing.noise_reduction import denoise_dsm
from depthwizard.models.dav2_backbone import DAv2Backbone
from depthwizard.calibration.region_calibration import fit_region_calibration, apply_region_calibration
from depthwizard.products.export import generate_all_products

def main():
    scene_stem = "area1"
    imagery_path = f"dataset/imagery/{scene_stem}_imagery.tif"
    dsm_path = f"dataset/dsm/{scene_stem}_dsm.tif"
    semantic_path = f"data/raw/Vaihingen/Vaihingen/ground_truth_COMPLETE/top_mosaic_09cm_{scene_stem}.tif"
    
    print(f"Loading real scene: {scene_stem}")
    # 1. Ingest (Stage 1)
    imagery_raw, dsm_raw, semantic_raw, meta = load_scene_with_semantics(
        imagery_path, dsm_path, semantic_path
    )
    
    # 2. Preprocessing (Stage 2)
    print("Preprocessing...")
    imagery_rad = radiometric_correction_pipeline(imagery_raw)
    valid_mask = compute_valid_mask(imagery_rad["unet_input"])
    imagery_clean = denoise_imagery(imagery_rad["unet_input"])
    dsm_clean = denoise_dsm(dsm_raw)
    dav2_rgb = build_dav2_rgb_proxy(imagery_clean)
    
    # 3. Depth Estimation (Stage 3)
    checkpoint = "models/checkpoints/dav2/best.pt"
    print(f"Loading checkpoint {checkpoint} for depth estimation...")
    device = "cuda" if torch.cuda.is_available() else "cpu"
    
    dav2 = DAv2Backbone("small", weights_path=checkpoint, device=device)
    rel_depth = dav2.predict(dav2_rgb)
    
    # 4. Region Calibration (Stage 4)
    print("Running region-aware calibration against reference DEM...")
    models = fit_region_calibration(
        relative_depth=rel_depth,
        semantic_labels=semantic_raw,
        reference_elevation=dsm_clean,
        valid_mask=valid_mask
    )
    
    abs_height = apply_region_calibration(rel_depth, semantic_raw, models)
    
    # Generate random inlier mask for the sake of confidence map demo
    ransac_inlier_mask = valid_mask.copy()
    
    # 5. Export Products (Stage 6)
    out_dir = "data/products/real"
    print(f"Exporting products to {out_dir}...")
    
    products = generate_all_products(
        dsm=abs_height,
        output_dir=out_dir,
        scene_name=scene_stem,
        crs=meta.crs,
        transform=meta.transform,
        gsd_m=meta.gsd_m,
        valid_mask=valid_mask,
        ransac_inlier_mask=ransac_inlier_mask,
        ndsm_kernel=51
    )
    
    # 6. Plotting to scratch directory
    scratch_dir = r"C:\Users\Sumit\.gemini\antigravity-ide\brain\dafccd76-f703-4fd7-8be1-8bf7cf4c77f1\scratch"
    os.makedirs(scratch_dir, exist_ok=True)
    
    print("Generating PNG visualizations for showcase...")
    
    for name, path in products.items():
        with rasterio.open(path) as src:
            arr = src.read(1)
            
        plt.figure(figsize=(8,8))
        if name == 'hillshade':
            plt.imshow(arr, cmap='gray')
        elif name == 'confidence':
            plt.imshow(arr, cmap='viridis', vmin=0, vmax=2)
        else:
            plt.imshow(arr, cmap='terrain')
            plt.colorbar(label='Meters' if name != 'slope' else 'Degrees')
            
        plt.title(f"{scene_stem.upper()} - {name.upper()}")
        plt.axis('off')
        
        plt.savefig(os.path.join(scratch_dir, f"{scene_stem}_{name}.png"), bbox_inches='tight', dpi=150)
        plt.close()
        
    print("ALL DONE. PNGs written to scratch space.")

if __name__ == "__main__":
    main()
