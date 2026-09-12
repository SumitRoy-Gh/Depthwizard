"""
diagnose_divergence.py — Side-by-side numeric comparison of the SCRIPT path
vs the SERVER path on the SAME input image.

This version tests the NEW main.py logic (Path A) against the SCRIPT logic (Path B).
"""
import sys, os, numpy as np, torch
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))

IMAGE_PATH = "dataset/imagery/area1_imagery.tif"
DSM_PATH   = "dataset/dsm/area1_dsm.tif"

print("=" * 80)
print("DIAGNOSTIC: side-by-side pipeline comparison (POST-FIX)")
print("=" * 80)

# =========================================================================
# PATH A: Replicate what the NEW main.py ACTUALLY does (the SERVER path)
# =========================================================================
print("\n>>> PATH A: SERVER path (NEW main.py logic)")
print("-" * 60)

# Mocking the new main.py imports and logic
from depthwizard.ingestion.training import load_imagery_tif
from depthwizard.preprocessing.radiometric_correction import radiometric_correction_pipeline, build_dav2_rgb_proxy
from depthwizard.preprocessing.cloud_shadow_masking import compute_valid_mask
from depthwizard.preprocessing.noise_reduction import denoise_imagery
from depthwizard.models.dav2_backbone import DAv2Backbone

# 1. Load fine-tuned model (like main.py does at startup)
CHECKPOINT_DAV2 = "models/checkpoints/dav2/best.pt"
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
print(f"  A.startup: Loading fine-tuned DAv2 from {CHECKPOINT_DAV2}...")
dav2_model = DAv2Backbone("small", weights_path=CHECKPOINT_DAV2, device=DEVICE)

# 2. Ingest (Imagery only, since GT is missing for area1)
imagery_raw_a, meta_a = load_imagery_tif(IMAGE_PATH)

# 3. Preprocess
imagery_rad_a = radiometric_correction_pipeline(imagery_raw_a)
valid_mask_a = compute_valid_mask(imagery_rad_a["unet_input"])
imagery_clean_a = denoise_imagery(imagery_rad_a["unet_input"])
dav2_rgb_a = build_dav2_rgb_proxy(imagery_clean_a)

print(f"  A.prep: dav2_rgb shape={dav2_rgb_a.shape} dtype={dav2_rgb_a.dtype}")
print(f"  A.prep: valid_mask fraction={valid_mask_a.mean():.4f}")

# 4. Predict
rel_depth_a = dav2_model.predict(dav2_rgb_a)
print(f"  A.dav2: rel_depth range=[{rel_depth_a.min():.4f}, {rel_depth_a.max():.4f}]")
print(f"  A.dav2: rel_depth mean={rel_depth_a.mean():.4f} std={rel_depth_a.std():.4f}")

# =========================================================================
# PATH B: Replicate what run_pipeline_real_image.py ACTUALLY does (SCRIPT path)
# =========================================================================
print("\n>>> PATH B: SCRIPT path (run_pipeline_real_image.py logic)")
print("-" * 60)

# Step B1: Ingestion via training loader
from depthwizard.ingestion.training import load_dsm_tif
imagery_raw_b, meta_b = load_imagery_tif(IMAGE_PATH)

# Step B2: Preprocessing
imagery_rad_b = radiometric_correction_pipeline(imagery_raw_b)
valid_mask_b = compute_valid_mask(imagery_rad_b["unet_input"])
imagery_clean_b = denoise_imagery(imagery_rad_b["unet_input"])
dav2_rgb_b = build_dav2_rgb_proxy(imagery_clean_b)

print(f"  B.prep: dav2_rgb shape={dav2_rgb_b.shape} dtype={dav2_rgb_b.dtype}")
print(f"  B.prep: valid_mask fraction={valid_mask_b.mean():.4f}")

# Step B3: Predict
dav2_ft = DAv2Backbone("small", weights_path=CHECKPOINT_DAV2, device=DEVICE)
rel_depth_b = dav2_ft.predict(dav2_rgb_b)
print(f"  B.dav2: rel_depth range=[{rel_depth_b.min():.4f}, {rel_depth_b.max():.4f}]")
print(f"  B.dav2: rel_depth mean={rel_depth_b.mean():.4f} std={rel_depth_b.std():.4f}")

# Compare relative depths
print(f"\n  COMPARISON: rel_depth_a == rel_depth_b? {np.allclose(rel_depth_a, rel_depth_b, atol=0.01)}")
if not np.allclose(rel_depth_a, rel_depth_b, atol=0.01):
    diff_rd = np.abs(rel_depth_a - rel_depth_b)
    print(f"  COMPARISON: max depth diff = {diff_rd.max():.4f}, mean = {diff_rd.mean():.4f}")
    print(f"  DIVERGENCE REMAINS!")
else:
    print(f"  SUCCESS! Output matches perfectly.")

# =========================================================================
# SUMMARY TABLE
# =========================================================================
print("\n" + "=" * 80)
print("SUMMARY: NEW Server (main.py) vs Script (run_pipeline_real_image.py)")
print("=" * 80)

checks = [
    ("Checkpoint/Weights",
     f"DAv2Backbone(weights_path='{CHECKPOINT_DAV2}')",
     f"DAv2Backbone(weights_path='{CHECKPOINT_DAV2}')"),
    ("DAv2 input preprocessing",
     f"radiometric_correction_pipeline + build_dav2_rgb_proxy + denoise -> {dav2_rgb_a.shape}",
     f"radiometric_correction_pipeline + build_dav2_rgb_proxy + denoise -> {dav2_rgb_b.shape}"),
    ("DAv2 input identical?",
     f"dav2_rgb_a mean={dav2_rgb_a.mean():.2f}",
     f"dav2_rgb_b mean={dav2_rgb_b.mean():.2f}"),
    ("Relative depth range",
     f"[{rel_depth_a.min():.4f}, {rel_depth_a.max():.4f}]",
     f"[{rel_depth_b.min():.4f}, {rel_depth_b.max():.4f}]"),
    ("Relative depth mean",
     f"{rel_depth_a.mean():.4f}",
     f"{rel_depth_b.mean():.4f}"),
]

for label, server_val, script_val in checks:
    print(f"\n  [{label}]")
    print(f"    SERVER: {server_val}")
    print(f"    SCRIPT: {script_val}")

print("\n" + "=" * 80)
print("DIAGNOSIS COMPLETE")
print("=" * 80)
