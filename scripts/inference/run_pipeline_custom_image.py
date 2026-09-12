"""
run_pipeline_custom_image.py -- End-to-End Pipeline for CUSTOM Images

This script is designed for real-world user inference. It takes ANY .tif image, 
runs the full DepthWizard pipeline (using the fine-tuned DAv2 model), and 
generates the 3D viewer tiles. 

CRITICALLY: It DOES NOT require any ground truth semantic maps. It safely 
bypasses the RANSAC calibration and uses a heuristic scale instead.
"""
import os
import sys
import numpy as np
import rasterio
import torch
from pathlib import Path

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from depthwizard.ingestion.training import load_imagery_tif
from depthwizard.preprocessing.radiometric_correction import radiometric_correction_pipeline, build_dav2_rgb_proxy
from depthwizard.preprocessing.cloud_shadow_masking import compute_valid_mask
from depthwizard.preprocessing.noise_reduction import denoise_imagery
from depthwizard.models.dav2_backbone import DAv2Backbone
from depthwizard.calibration.region_calibration import apply_region_calibration, ClassCalibrationFit, CLASS_UNKNOWN, KNOWN_CLASSES
from depthwizard.calibration.htc_refinement import apply_bias_refinement
from depthwizard.products.export import generate_all_products
from depthwizard.products.mesh_generator import export_tiled_scene

def main():
    if len(sys.argv) < 2:
        print("Usage: python run_pipeline_custom_image.py <path_to_image.tif>")
        print("Example: python run_pipeline_custom_image.py dataset/imagery/area5_imagery.tif")
        sys.exit(1)
        
    imagery_path = sys.argv[1]
    scene_stem = Path(imagery_path).stem.replace("_imagery", "")
    
    print(f"\n========================================================")
    print(f" PROCESSING CUSTOM IMAGE: {imagery_path}")
    print(f"========================================================")
    
    # 1. Ingest (Imagery only - NO Ground Truth needed!)
    print("[1/7] Ingesting Image...")
    imagery_raw, meta = load_imagery_tif(imagery_path)
    
    # Automatically drop the alpha channel if the user provided a 4-band image (like a PNG)
    if imagery_raw.shape[-1] > 3:
        print(f"  [INFO] Image has {imagery_raw.shape[-1]} bands. Cropping to first 3 bands to match expected IR-R-G format.")
        imagery_raw = imagery_raw[..., :3]
    elif imagery_raw.shape[-1] < 3:
        print(f"  [ERROR] Image only has {imagery_raw.shape[-1]} bands. Must have at least 3!")
        sys.exit(1)
    
    # 2. Preprocessing
    print("[2/7] Preprocessing (Radiometric stretch, Denoise, Proxy RGB)...")
    imagery_rad = radiometric_correction_pipeline(imagery_raw)
    valid_mask = compute_valid_mask(imagery_rad["unet_input"])
    imagery_clean = denoise_imagery(imagery_rad["unet_input"])
    dav2_rgb = build_dav2_rgb_proxy(imagery_clean)
    
    # 3. Depth Estimation (Fine-Tuned)
    checkpoint = "models/checkpoints/dav2/best.pt"
    print(f"[3/7] Running Fine-Tuned Depth Estimation ({checkpoint})...")
    device = "cuda" if torch.cuda.is_available() else "cpu"
    
    dav2 = DAv2Backbone("small", weights_path=checkpoint, device=device)
    rel_depth = dav2.predict(dav2_rgb)
    
    # 4. Calibration (Heuristic Fallback)
    print("[4/7] Applying Heuristic Calibration (No Ground Truth Required)...")
    # We map the relative depth output min->0m, max->50m roughly
    d_min, d_max = rel_depth.min(), rel_depth.max()
    scale = 50.0 / (d_max - d_min + 1e-6)
    shift = -(scale * d_min)

    semantic_labels = np.full_like(rel_depth, CLASS_UNKNOWN, dtype=np.uint8)
    global_fit = ClassCalibrationFit(
        class_id=-1, scale=float(scale), shift=float(shift),
        n_pixels_used=rel_depth.size, inlier_fraction=1.0, r2_score=1.0,
    )
    dummy_fits = {-1: global_fit}
    for cid in KNOWN_CLASSES:
        dummy_fits[cid] = ClassCalibrationFit(
            class_id=cid, scale=1.0, shift=0.0,
            n_pixels_used=0, inlier_fraction=0.0, r2_score=float("-inf"),
        )
        
    abs_height = apply_region_calibration(rel_depth, semantic_labels, dummy_fits)
    ransac_inlier_mask = valid_mask.copy()
    
    # 5. Bias-Aware Height Refinement
    print("[5/7] Running Bias-Aware Height Refinement...")
    # Will gracefully pass-through if weights aren't found
    abs_height = apply_bias_refinement(abs_height, weights_path="models/checkpoints/bias/htc_best.pt", device=device)
    
    # 6. Export 2D Products
    out_dir = f"data/products/custom/{scene_stem}"
    os.makedirs(out_dir, exist_ok=True)
    print(f"[6/7] Exporting 2D Products to {out_dir}...")
    
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
    
    # 7. Export 3D Mesh
    mesh_out_dir = os.path.join(out_dir, f"{scene_stem}_3d")
    print(f"[7/7] Generating 3D Viewer Chunks in {mesh_out_dir}...")
    
    export_tiled_scene(
        dsm_path=products["dsm"],
        imagery_path=imagery_path,
        output_dir=mesh_out_dir,
        scene_name=scene_stem,
        chunk_size=512,
        z_scale=1.5 
    )
    
    print("\n========================================================")
    print(f" SUCCESS! Custom image processed.")
    print(f" 3D Scene JSON saved to: {mesh_out_dir}\\scene.json")
    print(f" To view it, open your viewer with this URL parameter:")
    print(f" ?scene=../{mesh_out_dir}/scene.json")
    print(f"========================================================")

if __name__ == "__main__":
    main()
