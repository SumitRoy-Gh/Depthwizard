"""
main.py -- FastAPI server for the DepthWizard pipeline.

This server exposes the EXACT SAME pipeline as
scripts/inference/run_pipeline_real_image.py via a REST API.

Every function call here mirrors the script — no reimplementation of
pipeline logic. If the script calls `radiometric_correction_pipeline()`,
this file calls the same function with the same arguments.
"""
import os
import shutil
import uuid
import numpy as np
import torch
from pathlib import Path
from fastapi import FastAPI, File, UploadFile
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse

# ---------------------------------------------------------------------------
# Imports — same modules the working script uses
# ---------------------------------------------------------------------------
from depthwizard.ingestion.training import (
    load_imagery_tif,
    load_dsm_tif,
    load_scene_with_semantics,
)
from depthwizard.preprocessing.radiometric_correction import (
    radiometric_correction_pipeline,
    build_dav2_rgb_proxy,
)
from depthwizard.preprocessing.cloud_shadow_masking import compute_valid_mask
from depthwizard.preprocessing.noise_reduction import denoise_imagery, denoise_dsm
from depthwizard.models.dav2_backbone import DAv2Backbone
from depthwizard.calibration.region_calibration import (
    fit_region_calibration,
    apply_region_calibration,
    ClassCalibrationFit,
    CLASS_UNKNOWN,
    KNOWN_CLASSES,
)
from depthwizard.calibration.htc_refinement import apply_bias_refinement
from depthwizard.products.export import generate_all_products
from depthwizard.products.mesh_generator import export_tiled_scene

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------
app = FastAPI(
    title="DepthWizard API",
    description="End-to-End single-view height estimation and 3D generation.",
    version="2.0.0",
)

UPLOAD_DIR = Path("data/uploads")
PRODUCTS_DIR = Path("data/products")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
PRODUCTS_DIR.mkdir(parents=True, exist_ok=True)

app.mount("/static", StaticFiles(directory="data/products"), name="static")
app.mount("/viewer", StaticFiles(directory="viewer"), name="viewer")

# ---------------------------------------------------------------------------
# Load fine-tuned DAv2 model ONCE at startup (expensive; must not reload per
# request). This is the SAME checkpoint the script uses at line 57.
# ---------------------------------------------------------------------------
CHECKPOINT_DAV2 = "models/checkpoints/dav2/best.pt"
CHECKPOINT_BIAS = "models/checkpoints/bias/htc_best.pt"
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

print(f"[startup] Loading fine-tuned DAv2 from {CHECKPOINT_DAV2} on {DEVICE}...")
dav2_model = DAv2Backbone("small", weights_path=CHECKPOINT_DAV2, device=DEVICE)
print("[startup] DAv2 model loaded.")


# ---------------------------------------------------------------------------
# Helper: locate ground-truth files for a known benchmark scene
# ---------------------------------------------------------------------------
# Base path where the Vaihingen semantic ground truth lives once extracted
SEMANTIC_BASE = Path("data/raw/Vaihingen/Vaihingen/ground_truth_COMPLETE")


def _find_gt_files(stem: str) -> tuple[Path | None, Path | None]:
    """
    Given a scene stem like 'area1', check if the paired DSM and semantic
    ground-truth map exist on disk. Returns (dsm_path, semantic_path) or
    (None, None) if either is missing.
    """
    dsm = Path(f"dataset/dsm/{stem}_dsm.tif")
    sem = SEMANTIC_BASE / f"top_mosaic_09cm_{stem}.tif"
    if dsm.exists() and sem.exists():
        return dsm, sem
    return None, None


# ---------------------------------------------------------------------------
# Main endpoint
# ---------------------------------------------------------------------------
@app.post("/process")
async def process_image(file: UploadFile = File(...)):
    """
    End-to-End Pipeline — mirrors run_pipeline_real_image.py exactly:
      Stage 1-2: Ingest + Preprocess (radiometric, mask, denoise)
      Stage 3:   Depth Estimation (fine-tuned DAv2)
      Stage 4:   Region Calibration (RANSAC per-class if GT available)
      Stage 5:   Bias-Aware Height Refinement
      Stage 6:   Product Export (DSM, nDSM, DTM, slope, hillshade, confidence)
      Stage 7:   3D Mesh Generation (tiled GLB + scene.json)
    """
    job_id = str(uuid.uuid4())
    temp_path = UPLOAD_DIR / f"{job_id}_{file.filename}"
    job_out_dir = PRODUCTS_DIR / job_id
    scene_out_dir = PRODUCTS_DIR / f"{job_id}_3d"

    # Save uploaded file to disk (rasterio needs a file path)
    with open(temp_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        # Derive the scene stem from the filename for GT lookup
        stem = file.filename.replace("_imagery.tif", "").replace(".tif", "").replace(".jpg", "").replace(".png", "")
        dsm_gt_path, semantic_gt_path = _find_gt_files(stem)
        has_gt = dsm_gt_path is not None

        # =================================================================
        # Stage 1-2: Ingest + Preprocess
        #   Script lines 40-50 — exact same calls
        # =================================================================
        print(f"[{job_id}] Stage 1-2: Ingesting and preprocessing...")

        if has_gt:
            # Full training loader with GT DSM + semantic map
            print(f"[{job_id}]   GT found: DSM={dsm_gt_path}, Semantic={semantic_gt_path}")
            imagery_raw, dsm_raw, semantic_raw, meta = load_scene_with_semantics(
                str(temp_path), str(dsm_gt_path), str(semantic_gt_path)
            )
            dsm_clean = denoise_dsm(dsm_raw)
        else:
            # Imagery-only (no GT available)
            print(f"[{job_id}]   No GT found for '{stem}'. Imagery-only mode.")
            imagery_raw, meta = load_imagery_tif(str(temp_path))
            dsm_raw = None
            dsm_clean = None
            semantic_raw = None

        # Preprocessing — same as script lines 46-50
        imagery_rad = radiometric_correction_pipeline(imagery_raw)
        valid_mask = compute_valid_mask(imagery_rad["unet_input"])
        imagery_clean = denoise_imagery(imagery_rad["unet_input"])
        dav2_rgb = build_dav2_rgb_proxy(imagery_clean)

        print(f"[{job_id}]   Preprocessed: shape={dav2_rgb.shape}, valid={valid_mask.mean():.3f}")

        # =================================================================
        # Stage 3: Depth Estimation (fine-tuned DAv2)
        #   Script line 58 — same model, same .predict() call
        # =================================================================
        print(f"[{job_id}] Stage 3: Running fine-tuned Depth Anything V2...")
        rel_depth = dav2_model.predict(dav2_rgb)
        print(f"[{job_id}]   rel_depth range=[{rel_depth.min():.4f}, {rel_depth.max():.4f}]")

        # =================================================================
        # Stage 4: Region Calibration
        #   Script lines 62-69 — same functions
        # =================================================================
        print(f"[{job_id}] Stage 4: Geometry-Aware Calibration...")

        if has_gt and semantic_raw is not None:
            # RANSAC per-class calibration against reference DSM
            # Same as script lines 62-69
            models = fit_region_calibration(
                relative_depth=rel_depth,
                semantic_labels=semantic_raw,
                reference_elevation=dsm_clean,
                valid_mask=valid_mask,
            )
            absolute_dsm = apply_region_calibration(rel_depth, semantic_raw, models)
            # Use valid_mask as ransac_inlier_mask (same as script line 78)
            ransac_inlier_mask = valid_mask.copy()
            print(f"[{job_id}]   RANSAC calibration applied (GT mode).")
        else:
            # No GT: heuristic linear scaling
            # Map rel_depth min->0m, max->50m (approximate urban height range)
            semantic_labels = np.full_like(rel_depth, CLASS_UNKNOWN, dtype=np.uint8)
            d_min, d_max = rel_depth.min(), rel_depth.max()
            scale = 50.0 / (d_max - d_min + 1e-6)
            shift = -(scale * d_min)

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
            absolute_dsm = apply_region_calibration(rel_depth, semantic_labels, dummy_fits)
            ransac_inlier_mask = valid_mask.copy()
            print(f"[{job_id}]   Heuristic 50m scaling applied (no GT).")

        print(f"[{job_id}]   abs_dsm range=[{absolute_dsm.min():.2f}, {absolute_dsm.max():.2f}]")

        # =================================================================
        # Stage 5: Bias-Aware Height Refinement
        #   Script line 75 — same call
        # =================================================================
        print(f"[{job_id}] Stage 5: Bias-Aware Height Refinement...")
        refined_dsm = apply_bias_refinement(
            absolute_dsm, weights_path=CHECKPOINT_BIAS, device=DEVICE
        )

        # =================================================================
        # Stage 6: Product Export
        #   Script lines 84-94 — same function, same arguments
        # =================================================================
        print(f"[{job_id}] Stage 6: Generating products...")
        products = generate_all_products(
            dsm=refined_dsm,
            output_dir=str(job_out_dir),
            scene_name="scene",
            crs=meta.crs,
            transform=meta.transform,
            gsd_m=meta.gsd_m,
            valid_mask=valid_mask,
            ransac_inlier_mask=ransac_inlier_mask,
            ndsm_kernel=51,
        )

        # =================================================================
        # Stage 7: 3D Mesh Generation
        #   Script lines 101-108 — same function, same z_scale
        # =================================================================
        print(f"[{job_id}] Stage 7: Generating 3D scene chunks...")
        manifest_path = export_tiled_scene(
            dsm_path=products["dsm"],
            imagery_path=str(temp_path),
            output_dir=str(scene_out_dir),
            scene_name="scene",
            chunk_size=512,
            z_scale=1.5,
        )

        return JSONResponse(content={
            "status": "success",
            "job_id": job_id,
            "products": {k: f"/static/{job_id}/{Path(v).name}" for k, v in products.items()},
            "scene_manifest": f"/static/{job_id}_3d/scene.json",
            "viewer_url": f"/viewer/index.html?scene=/static/{job_id}_3d/scene.json",
        })

    except Exception as e:
        import traceback
        return JSONResponse(status_code=500, content={
            "status": "error",
            "message": str(e),
            "traceback": traceback.format_exc(),
        })
    finally:
        if temp_path.exists():
            temp_path.unlink()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
