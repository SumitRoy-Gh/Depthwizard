import numpy as np
import rasterio
import os
import subprocess

def check_scene(scene_name, is_before=False):
    dsm_path = f"data/products/real/{scene_name}_DSM.tif"
    dtm_path = f"data/products/real/{scene_name}_DTM.tif"
    semantic_path = f"data/raw/Vaihingen/Vaihingen/ground_truth_COMPLETE/top_mosaic_09cm_{scene_name}.tif"
    
    if not os.path.exists(dsm_path):
        return f"Products for {scene_name} not found."
    
    with rasterio.open(dsm_path) as f:
        dsm = f.read(1)
    with rasterio.open(dtm_path) as f:
        dtm = f.read(1)
    with rasterio.open(semantic_path) as f:
        semantic = f.read()[:3]
        
    tolerance = 0.05
    mask = dsm < (dtm - tolerance)
    violations = np.sum(mask)
    total_pixels = dsm.size
    pct = (violations / total_pixels) * 100
    
    # nDSM sanity
    ndsm = np.clip(dsm - dtm, 0.0, None)
    
    building_mask = (semantic[0] == 0) & (semantic[1] == 0) & (semantic[2] == 255)
    ground_mask = ((semantic[0] == 255) & (semantic[1] == 255) & (semantic[2] == 255)) | \
                  ((semantic[0] == 0) & (semantic[1] == 255) & (semantic[2] == 255))
                  
    b_ndsm = ndsm[building_mask]
    g_ndsm = ndsm[ground_mask]
    
    report = [
        f"--- Scene: {scene_name} ---",
        f"Total pixels: {total_pixels}",
        f"Violations (DSM < DTM - 0.05): {violations}",
        f"Violation Percentage: {violations} / {total_pixels} = {pct:.6f}%"
    ]
    
    if len(b_ndsm) > 0:
        report.append(f"Buildings (count={len(b_ndsm)}): mean={np.mean(b_ndsm):.4f}m, min={np.min(b_ndsm):.4f}m, max={np.max(b_ndsm):.4f}m, std={np.std(b_ndsm):.4f}m")
    if len(g_ndsm) > 0:
        report.append(f"Ground (count={len(g_ndsm)}): mean={np.mean(g_ndsm):.4f}m, min={np.min(g_ndsm):.4f}m, max={np.max(g_ndsm):.4f}m, std={np.std(g_ndsm):.4f}m")
        
    return "\n".join(report)

print("=== STEP 1 & 3: AREA 1 AFTER FIX ===")
print(check_scene("area1"))

print("\n=== STEP 4: CROSS-SCENE (AREA 17 & AREA 4) ===")
print(check_scene("area4"))
print("\n")
print(check_scene("area17"))
