"""
region_calibration.py — Stage 3b of the DepthWizard V2 architecture.

Converts a model's RELATIVE depth prediction into ABSOLUTE height (meters)
using a SEPARATE linear scale+shift per semantic class (ground / building /
vegetation), instead of one single global linear fit for the whole image.

WHY per-class instead of one global fit: off-nadir satellite/aerial viewing
geometry causes relief displacement that affects buildings (vertical
structures) very differently from flat ground — a single global
z = a*d + b equation systematically misjudges tall buildings. Fitting the
scale+shift separately per semantic class is this project's own adaptation
of that photogrammetric principle (this is NOT copied from a specific
published paper's exact formula — the underlying geometric problem is
well-established literature, the per-class-RANSAC response is ours).

This module has NO dependency on the depth model itself — it is pure
post-processing given (relative_depth, semantic_labels, reference_elevation).
"""
from __future__ import annotations
import numpy as np
from dataclasses import dataclass
from sklearn.linear_model import RANSACRegressor  # pip install scikit-learn if missing

CLASS_GROUND = 0
CLASS_BUILDING = 1
CLASS_VEGETATION = 2
CLASS_UNKNOWN = 255
KNOWN_CLASSES = (CLASS_GROUND, CLASS_BUILDING, CLASS_VEGETATION)


@dataclass
class ClassCalibrationFit:
    class_id: int
    scale: float           # 'a' in z = a*d + b
    shift: float            # 'b' in z = a*d + b
    n_pixels_used: int
    inlier_fraction: float  # fraction of this class's pixels RANSAC kept as inliers
    r2_score: float          # goodness of fit on inliers, -inf if fit failed


def _fit_one_class(rel_depth_1d: np.ndarray, ref_elev_1d: np.ndarray) -> tuple[float, float, float, float]:
    """
    Fits z = a*d + b via RANSAC on 1D arrays (already flattened + masked to
    one class's pixels). Returns (a, b, inlier_fraction, r2_score).
    If fewer than 20 points are given, returns a degenerate identity fit
    (a=1.0, b=0.0) with inlier_fraction=0.0 and r2_score=-inf, flagging
    "not enough data" rather than crashing or silently producing garbage.
    """
    MIN_POINTS = 20
    if rel_depth_1d.size < MIN_POINTS:
        return 1.0, 0.0, 0.0, float("-inf")

    X = rel_depth_1d.reshape(-1, 1).astype(np.float64)
    y = ref_elev_1d.astype(np.float64)

    model = RANSACRegressor(residual_threshold=None, random_state=0)
    model.fit(X, y)

    a = float(model.estimator_.coef_[0])
    b = float(model.estimator_.intercept_)
    inlier_mask = model.inlier_mask_
    inlier_fraction = float(inlier_mask.mean())

    y_pred = model.predict(X[inlier_mask])
    y_true = y[inlier_mask]
    ss_res = np.sum((y_true - y_pred) ** 2)
    ss_tot = np.sum((y_true - y_true.mean()) ** 2)
    r2 = float(1 - ss_res / ss_tot) if ss_tot > 1e-9 else float("-inf")

    return a, b, inlier_fraction, r2


def fit_region_calibration(
    relative_depth: np.ndarray,
    semantic_labels: np.ndarray,
    reference_elevation: np.ndarray,
    valid_mask: np.ndarray | None = None,
) -> dict[int, ClassCalibrationFit]:
    """
    Fits one (scale, shift) pair per known semantic class, plus a 'global'
    fallback fit (stored under key -1) across ALL known-class pixels
    combined, for calibrating CLASS_UNKNOWN pixels later.

    All three input arrays must be the same (H, W) shape.
    valid_mask: optional boolean (H, W) — pixels where this is False are
    excluded entirely (e.g. cloud-masked regions), same convention as the
    rest of this codebase's valid_mask usage.

    Returns: dict mapping class_id -> ClassCalibrationFit, PLUS an entry
    at key -1 for the global fallback fit.
    """
    assert relative_depth.shape == semantic_labels.shape == reference_elevation.shape

    if valid_mask is None:
        valid_mask = np.ones(relative_depth.shape, dtype=bool)

    fits: dict[int, ClassCalibrationFit] = {}

    known_pixel_mask = valid_mask & np.isin(semantic_labels, KNOWN_CLASSES)
    a, b, inlier_frac, r2 = _fit_one_class(
        relative_depth[known_pixel_mask], reference_elevation[known_pixel_mask]
    )
    fits[-1] = ClassCalibrationFit(-1, a, b, int(known_pixel_mask.sum()), inlier_frac, r2)

    for class_id in KNOWN_CLASSES:
        class_mask = valid_mask & (semantic_labels == class_id)
        a, b, inlier_frac, r2 = _fit_one_class(
            relative_depth[class_mask], reference_elevation[class_mask]
        )
        fits[class_id] = ClassCalibrationFit(class_id, a, b, int(class_mask.sum()), inlier_frac, r2)

    return fits


def apply_region_calibration(
    relative_depth: np.ndarray,
    semantic_labels: np.ndarray,
    fits: dict[int, ClassCalibrationFit],
) -> np.ndarray:
    """
    Applies the per-class fits from fit_region_calibration() to produce
    one combined absolute-height array. Pixels whose class fit had
    inlier_fraction == 0.0 (not enough data — see _fit_one_class) fall
    back to the global (-1) fit instead of using a degenerate identity fit.
    """
    absolute_height = np.zeros_like(relative_depth, dtype=np.float32)
    global_fit = fits[-1]

    for class_id in KNOWN_CLASSES:
        fit = fits[class_id]
        class_mask = semantic_labels == class_id
        if fit.inlier_fraction == 0.0:
            use_fit = global_fit
        else:
            use_fit = fit
        absolute_height[class_mask] = use_fit.scale * relative_depth[class_mask] + use_fit.shift

    unknown_mask = semantic_labels == CLASS_UNKNOWN
    absolute_height[unknown_mask] = (
        global_fit.scale * relative_depth[unknown_mask] + global_fit.shift
    )

    return absolute_height
