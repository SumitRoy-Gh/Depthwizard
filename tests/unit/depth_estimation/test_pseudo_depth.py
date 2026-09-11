import numpy as np
from depthwizard.inference.pseudo_depth import dsm_to_pseudo_depth

def test_shape_and_dtype():
    dsm = np.random.rand(10, 10).astype(np.float32) * 10
    pseudo_depth, params = dsm_to_pseudo_depth(dsm)
    assert pseudo_depth.shape == (10, 10)
    assert pseudo_depth.dtype == np.float32
    print("PASS: test_shape_and_dtype")

def test_sign_convention():
    # CRITICAL SIGN-CONVENTION TEST
    dsm = np.zeros((10, 10), dtype=np.float32)
    dsm[0:5, 0:5] = 10.0  # low region
    dsm[5:10, 5:10] = 50.0  # tall building
    pseudo_depth, params = dsm_to_pseudo_depth(dsm)
    
    val_low = pseudo_depth[0, 0]
    val_high = pseudo_depth[5, 5]
    
    if val_high <= val_low:
        raise AssertionError("FAIL: Sign convention backward! Tall building should have strictly greater pseudo_depth.")
    assert val_high > val_low
    print("PASS: test_sign_convention")

def test_output_minimum():
    dsm = np.random.rand(10, 10).astype(np.float32) * 10 + 5.0
    pseudo_depth, params = dsm_to_pseudo_depth(dsm)
    assert np.isclose(np.min(pseudo_depth), 0.0)
    print("PASS: test_output_minimum")

def test_valid_mask_exclusion():
    dsm = np.full((10, 10), 10.0, dtype=np.float32)
    dsm[0, 0] = -100.0  # true global min, but masked out

    valid_mask = np.ones((10, 10), dtype=bool)
    valid_mask[0, 0] = False

    pseudo_depth, params = dsm_to_pseudo_depth(dsm, valid_mask=valid_mask)
    assert params["min_elevation_m"] != -100.0
    assert params["min_elevation_m"] == 10.0
    print("PASS: test_valid_mask_exclusion")

def test_degenerate_case():
    dsm = np.ones((10, 10), dtype=np.float32) * 5.0
    pseudo_depth, params = dsm_to_pseudo_depth(dsm)
    assert np.allclose(pseudo_depth, 0.0)
    print("PASS: test_degenerate_case")
