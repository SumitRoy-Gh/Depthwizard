"""
test_region_calibration.py — Tests for the region-aware calibration module.

Uses the same check()/PASS/FAIL/RESULTS pattern as
preprocessing/tests/test_all.py.

Run:
    python calibration/tests/test_region_calibration.py
"""
from __future__ import annotations
import sys
import os
import traceback
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from depthwizard.calibration.region_calibration import (
    fit_region_calibration,
    apply_region_calibration,
    ClassCalibrationFit,
    CLASS_GROUND,
    CLASS_BUILDING,
    CLASS_VEGETATION,
    CLASS_UNKNOWN,
    KNOWN_CLASSES,
)


# ── Helpers ─────────────────────────────────────────────────────────

PASS_COUNT = 0
FAIL_COUNT = 0
TESTS_RUN = []


def check(name: str, condition: bool, detail: str = ""):
    global PASS_COUNT, FAIL_COUNT
    TESTS_RUN.append(name)
    if condition:
        PASS_COUNT += 1
        print(f"  [PASS] {name}")
    else:
        FAIL_COUNT += 1
        msg = f"  [FAIL] {name}"
        if detail:
            msg += f" — {detail}"
        print(msg)


# ── Test Groups ─────────────────────────────────────────────────────

def test_synthetic_fit_and_apply():
    """
    Builds a synthetic 100x100 test case with known per-class linear
    relationships, fits calibration, and checks the recovered
    scale/shift values and output heights.
    """
    print("\n-- Synthetic Per-Class Calibration --")
    rng = np.random.default_rng(42)
    H, W = 100, 100

    # Ground truth linear params: z = a*d + b
    TRUE_PARAMS = {
        CLASS_GROUND: (2.0, 5.0),
        CLASS_BUILDING: (5.0, 1.0),
        CLASS_VEGETATION: (3.0, 2.0),
    }

    # Assign class labels in rectangular regions
    semantic = np.full((H, W), CLASS_UNKNOWN, dtype=np.uint8)
    semantic[0:40, :] = CLASS_GROUND
    semantic[40:70, :] = CLASS_BUILDING
    semantic[70:100, :] = CLASS_VEGETATION

    # Build relative depth (random uniform)
    relative_depth = rng.uniform(0, 10, size=(H, W)).astype(np.float32)

    # Build reference elevation from the true linear model + small noise
    reference_elevation = np.zeros((H, W), dtype=np.float32)
    for class_id, (a, b) in TRUE_PARAMS.items():
        mask = semantic == class_id
        reference_elevation[mask] = a * relative_depth[mask] + b + rng.normal(0, 0.2, size=mask.sum()).astype(np.float32)

    # Fit
    fits = fit_region_calibration(relative_depth, semantic, reference_elevation)

    check("fit returns dict with 4 entries", len(fits) == 4)
    check("fit has global key -1", -1 in fits)
    check("fit has ground key", CLASS_GROUND in fits)
    check("fit has building key", CLASS_BUILDING in fits)
    check("fit has vegetation key", CLASS_VEGETATION in fits)

    # Check per-class fit accuracy (within 15% of true values)
    for class_id, (true_a, true_b) in TRUE_PARAMS.items():
        fit = fits[class_id]
        a_err = abs(fit.scale - true_a) / abs(true_a)
        b_err = abs(fit.shift - true_b) / max(abs(true_b), 1e-6)
        check(
            f"class {class_id} scale within 15%",
            a_err < 0.15,
            f"fitted={fit.scale:.4f} true={true_a:.4f} err={a_err:.2%}",
        )
        check(
            f"class {class_id} shift within 15%",
            b_err < 0.15,
            f"fitted={fit.shift:.4f} true={true_b:.4f} err={b_err:.2%}",
        )
        check(f"class {class_id} inlier_fraction > 0.5", fit.inlier_fraction > 0.5)
        check(f"class {class_id} r2 > 0.9", fit.r2_score > 0.9)

    # Apply and check output
    absolute_height = apply_region_calibration(relative_depth, semantic, fits)
    check("output shape matches input", absolute_height.shape == (H, W))
    check("output dtype is float32", absolute_height.dtype == np.float32)

    # Mean absolute error should be small (noise was 0.2 std)
    mae = np.mean(np.abs(absolute_height[semantic != CLASS_UNKNOWN] - reference_elevation[semantic != CLASS_UNKNOWN]))
    check(
        "MAE of calibrated output < 1.0",
        mae < 1.0,
        f"MAE={mae:.4f}",
    )


def test_not_enough_data_fallback():
    """
    Tests that a class with very few pixels (< 20) falls back to the
    global fit instead of crashing or producing identity a=1, b=0.
    """
    print("\n-- Not-Enough-Data Fallback --")
    rng = np.random.default_rng(99)
    H, W = 100, 100

    semantic = np.full((H, W), CLASS_GROUND, dtype=np.uint8)
    # Only 5 pixels for building (< MIN_POINTS=20)
    semantic[0, 0:5] = CLASS_BUILDING
    # Some vegetation
    semantic[50:100, :] = CLASS_VEGETATION

    relative_depth = rng.uniform(0, 10, size=(H, W)).astype(np.float32)
    reference_elevation = 2.0 * relative_depth + 5.0 + rng.normal(0, 0.1, size=(H, W)).astype(np.float32)

    fits = fit_region_calibration(relative_depth, semantic, reference_elevation)

    check("building fit has inlier_fraction == 0.0", fits[CLASS_BUILDING].inlier_fraction == 0.0)
    check("building fit has r2 == -inf", fits[CLASS_BUILDING].r2_score == float("-inf"))

    # Apply — building pixels should use global fit, not degenerate identity
    absolute_height = apply_region_calibration(relative_depth, semantic, fits)
    building_mask = semantic == CLASS_BUILDING
    building_output = absolute_height[building_mask]
    building_ref = reference_elevation[building_mask]
    building_mae = np.mean(np.abs(building_output - building_ref))

    check(
        "building fallback MAE < 1.0 (uses global fit)",
        building_mae < 1.0,
        f"MAE={building_mae:.4f}",
    )

    # Verify it did NOT use identity (a=1, b=0) — the depths are 0-10
    # and the true elevations are ~5-25, so identity would give MAE >> 1.0
    identity_output = 1.0 * relative_depth[building_mask] + 0.0
    identity_mae = np.mean(np.abs(identity_output - building_ref))
    check(
        "building output differs from identity fit",
        building_mae < identity_mae * 0.5,
        f"global_mae={building_mae:.4f} vs identity_mae={identity_mae:.4f}",
    )


def test_unknown_pixels_calibrated():
    """
    Tests that CLASS_UNKNOWN pixels are calibrated via the global fit,
    not left as zero.
    """
    print("\n-- Unknown Pixels Calibration --")
    rng = np.random.default_rng(77)
    H, W = 100, 100

    semantic = np.full((H, W), CLASS_GROUND, dtype=np.uint8)
    semantic[80:100, :] = CLASS_UNKNOWN

    relative_depth = rng.uniform(1, 10, size=(H, W)).astype(np.float32)
    reference_elevation = 3.0 * relative_depth + 2.0 + rng.normal(0, 0.1, size=(H, W)).astype(np.float32)

    fits = fit_region_calibration(relative_depth, semantic, reference_elevation)
    absolute_height = apply_region_calibration(relative_depth, semantic, fits)

    unknown_mask = semantic == CLASS_UNKNOWN
    unknown_output = absolute_height[unknown_mask]

    check("unknown pixels are not zero", np.abs(unknown_output).mean() > 1.0)

    # Unknown pixels should be close to reference (since the global fit
    # is z ≈ 3*d + 2, same as ground)
    unknown_ref = reference_elevation[unknown_mask]
    unknown_mae = np.mean(np.abs(unknown_output - unknown_ref))
    check(
        "unknown pixels MAE < 1.0 (global fit applied)",
        unknown_mae < 1.0,
        f"MAE={unknown_mae:.4f}",
    )


# ── Main Runner ─────────────────────────────────────────────────────

def main():
    print("=" * 70)
    print("DEPTHWIZARD CALIBRATION — REGION CALIBRATION TEST SUITE")
    print("=" * 70)

    test_functions = [
        test_synthetic_fit_and_apply,
        test_not_enough_data_fallback,
        test_unknown_pixels_calibrated,
    ]

    for test_fn in test_functions:
        try:
            test_fn()
        except Exception as e:
            print(f"\n  [CRASH] in {test_fn.__name__}: {e}")
            traceback.print_exc()
            global FAIL_COUNT
            FAIL_COUNT += 1

    print("\n" + "=" * 70)
    print(f"RESULTS: {PASS_COUNT} passed, {FAIL_COUNT} failed, {PASS_COUNT + FAIL_COUNT} total")
    print("=" * 70)

    if FAIL_COUNT > 0:
        print("\nFAILED TESTS — fix these before proceeding:")
        sys.exit(1)
    else:
        print("\n[OK] ALL TESTS PASSED - region calibration is fully verified.")
        sys.exit(0)


if __name__ == "__main__":
    main()
