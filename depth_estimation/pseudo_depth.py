"""
pseudo_depth.py — converts DSM elevation (meters) into DA2-compatible
pseudo-depth training targets.

DA2's native convention is INVERSE-DEPTH-LIKE: larger predicted values =
closer to camera = SMALLER real-world distance. To train DA2 to associate
"tall building" with "large predicted value" (matching this convention,
since a tall building is closer to a nadir-viewing camera than flat
ground), pseudo-depth is constructed as:

    pseudo_depth = reference_ceiling_m - dsm_elevation_m

where reference_ceiling_m is a fixed value ABOVE the tallest expected
object in the scene (so pseudo_depth stays positive everywhere). A TALL
building (high dsm_elevation_m) then produces a SMALL pseudo_depth value
(closer to zero, since it's closer to the ceiling reference) — WAIT, this
is backwards for what we want. Re-derive it correctly:

We want: tall building (high elevation) -> LARGE predicted value (DA2
convention: large = close). "Close to the nadir camera" DOES correspond to
"high elevation" for a nadir-viewing camera looking straight down, since a
taller object's surface is physically nearer the camera than the ground
is. Therefore the CORRECT pseudo-depth construction that matches DA2's
convention is:

    pseudo_depth = dsm_elevation_m - min_elevation_in_scene

i.e. pseudo-depth should be DIRECTLY proportional to elevation (not
inverted), because "higher elevation" already means "closer to a
nadir/overhead camera" which is exactly what a large DA2 predicted value
represents. Do NOT invert this a second time. This is the ONLY correct
formula for this task — implement exactly this, not the ceiling-subtraction
variant.

This is an adaptation of the general pattern used in published
fine-tuning work that converts elevation/height ground truth into
depth-convention pseudo-targets (e.g. canopy height fine-tuning of DA2) —
we are NOT reproducing any specific paper's exact formula, since our
camera geometry (near-nadir aerial orthophoto) differs from theirs.
"""
from __future__ import annotations
import numpy as np


def dsm_to_pseudo_depth(
    dsm: np.ndarray,
    valid_mask: np.ndarray | None = None,
) -> tuple[np.ndarray, dict]:
    """
    Converts a DSM elevation array (meters, arbitrary absolute scale) into
    a pseudo-depth target compatible with DA2's inverse-depth-like output
    convention (large value = close to camera = high elevation for a
    nadir view).

    Formula (see module docstring for derivation):
        pseudo_depth = dsm - min(dsm over valid pixels)

    This keeps pseudo_depth >= 0 everywhere and directly proportional to
    elevation, matching DA2's convention that larger predicted values
    correspond to points closer to the camera.

    IMPORTANT: unlike normalize_depth_per_patch() in
    preprocessing/stages/data_normalisation.py (which squashes to [0,1]
    per patch for the OLD Correction U-Net design), this function does
    NOT rescale to [0,1] — SiLog loss (used for DA2 fine-tuning) is
    already scale-invariant in its primary term, so aggressive per-patch
    rescaling would throw away real relative-scale information the loss
    could otherwise use. Only the reference minimum is subtracted, and
    that reference is returned in the params dict so it can be inverted
    for visualization if ever needed.

    Parameters
    ----------
    dsm : (H, W) float32 array of elevation values in meters.
    valid_mask : optional (H, W) bool array — the reference minimum is
        computed ONLY over valid pixels (same convention as the rest of
        this codebase), so invalid/masked pixels don't corrupt the
        reference scale, but pseudo_depth is still computed for every
        pixel (masking during loss computation happens later in the
        training loop, not here).

    Returns
    -------
    (pseudo_depth, params) where pseudo_depth is (H, W) float32 and
    params = {"min_elevation_m": float} for potential inverse-lookup.
    Degenerate case (all-invalid or all-equal DSM): min_elevation_m is
    computed as the plain min over the whole array (not NaN), so the
    function never raises or produces NaN/Inf, matching the "safety
    guard" convention already used throughout preprocessing/stages/.
    """
    sample = dsm[valid_mask] if valid_mask is not None and valid_mask.any() else dsm.ravel()
    min_elevation_m = float(np.min(sample))
    pseudo_depth = (dsm.astype(np.float32) - min_elevation_m)
    return pseudo_depth, {"min_elevation_m": min_elevation_m}
