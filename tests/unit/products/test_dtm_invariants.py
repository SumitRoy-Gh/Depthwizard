import pytest
import numpy as np
import os
import rasterio

# Check if rasterio is available
try:
    import rasterio
    HAS_RASTERIO = True
except ImportError:
    HAS_RASTERIO = False

@pytest.fixture
def area1_products():
    """Load area1 Stage 6 products generated from the real dataset."""
    base_dir = "d:/SIH175/data/products/real"
    if not os.path.exists(base_dir):
        pytest.skip(f"Data directory {base_dir} not found. Ensure pipeline has been run.")
        
    dsm_path = os.path.join(base_dir, "area1_DSM.tif")
    dtm_path = os.path.join(base_dir, "area1_DTM.tif")
    ndsm_path = os.path.join(base_dir, "area1_nDSM.tif")
    conf_path = os.path.join(base_dir, "area1_confidence.tif")
    
    if not all(os.path.exists(p) for p in [dsm_path, dtm_path, ndsm_path, conf_path]):
        pytest.skip("Required area1 products not found. Ensure pipeline has been run.")
        
    with rasterio.open(dsm_path) as f: dsm = f.read(1)
    with rasterio.open(dtm_path) as f: dtm = f.read(1)
    with rasterio.open(ndsm_path) as f: ndsm = f.read(1)
    with rasterio.open(conf_path) as f: conf = f.read(1)
    
    return {
        'dsm': dsm,
        'dtm': dtm,
        'ndsm': ndsm,
        'conf': conf
    }

@pytest.fixture
def area1_semantics():
    """Load the semantic labels for area1."""
    semantic_path = "d:/SIH175/data/raw/Vaihingen/Vaihingen/ground_truth_COMPLETE/top_mosaic_09cm_area1.tif"
    if not os.path.exists(semantic_path):
        pytest.skip(f"Semantic mask for area1 not found at {semantic_path}.")
    with rasterio.open(semantic_path) as f:
        # Read RGB bands
        semantic = f.read()[:3]
    return semantic

def test_dsm_gte_dtm_everywhere(area1_products):
    """
    Test that DSM >= DTM - tolerance mathematically holds everywhere.
    Tolerance is 0.05m to account for negligible numerical noise.
    """
    dsm = area1_products['dsm']
    dtm = area1_products['dtm']
    tolerance = 0.05
    
    diff = dsm - dtm
    mask = dsm < (dtm - tolerance)
    violations = np.sum(mask)
    
    if violations > 0:
        max_violation = np.abs(np.min(diff[mask]))
        pytest.fail(f"DTM > DSM in {violations} pixels by up to {max_violation:.4f}m")

def test_ndsm_matches_clamped_difference(area1_products):
    """
    Test that nDSM equals max(0, DSM - DTM) within numerical tolerance 
    over the full scene.
    """
    dsm = area1_products['dsm']
    dtm = area1_products['dtm']
    ndsm = area1_products['ndsm']
    
    expected_ndsm = np.clip(dsm - dtm, 0.0, None)
    
    diff = np.abs(ndsm - expected_ndsm)
    max_diff = np.max(diff)
    
    assert max_diff < 1e-4, f"nDSM mismatch! Max diff: {max_diff}"

def test_low_confidence_covers_all_inversions(area1_products):
    """
    Test the contract: Any pixel where DSM < DTM - tolerance MUST be 
    flagged low-confidence (0 or 1).
    """
    dsm = area1_products['dsm']
    dtm = area1_products['dtm']
    conf = area1_products['conf']
    tolerance = 0.05
    
    inversion_mask = dsm < (dtm - tolerance)
    
    # Where inversion occurs, confidence must be < 2
    high_conf_inversions = (inversion_mask) & (conf == 2)
    violations = np.sum(high_conf_inversions)
    
    assert violations == 0, f"Found {violations} pixels with DSM < DTM that were NOT flagged low-confidence!"

def test_dtm_is_not_just_smoothed_dsm(area1_products, area1_semantics):
    """
    Sanity check to ensure DTM meaningfully diverges from DSM in building regions.
    Buildings should have a much larger nDSM than ground.
    This proves DTM is bare-earth, not just a smoothed DSM.
    """
    ndsm = area1_products['ndsm']
    semantic = area1_semantics
    
    # ISPRS Vaihingen RGB semantics:
    # Impervious surfaces (white): 255, 255, 255
    # Building (blue): 0, 0, 255
    # Low vegetation (cyan): 0, 255, 255
    
    # building_mask: R=0, G=0, B=255
    building_mask = (semantic[0] == 0) & (semantic[1] == 0) & (semantic[2] == 255)
    
    # ground_mask: Impervious (255,255,255) or Low veg (0,255,255)
    ground_mask = ((semantic[0] == 255) & (semantic[1] == 255) & (semantic[2] == 255)) | \
                  ((semantic[0] == 0) & (semantic[1] == 255) & (semantic[2] == 255))
    
    mean_building_ndsm = np.mean(ndsm[building_mask]) if np.sum(building_mask) > 0 else 0
    mean_ground_ndsm = np.mean(ndsm[ground_mask]) if np.sum(ground_mask) > 0 else 0
    
    print(f"Mean nDSM on buildings: {mean_building_ndsm:.4f}m")
    print(f"Mean nDSM on ground: {mean_ground_ndsm:.4f}m")
    
    assert mean_building_ndsm > mean_ground_ndsm + 1.0, (
        f"DTM extraction failed sanity check! Buildings: {mean_building_ndsm:.4f}m, "
        f"Ground: {mean_ground_ndsm:.4f}m. Difference should be > 1.0m."
    )
