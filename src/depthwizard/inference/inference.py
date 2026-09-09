"""
inference.py — Depth estimation orchestrator: preprocessed imagery → DAv2 → raw relative depth.

Sits directly downstream of preprocessing.pipelines.inference.preprocess_for_inference().
Takes that stage's output dict and produces the raw relative depth map from DA2.

NOTE: The Correction U-Net has been removed from the pipeline. The output of this
module is a raw, relative (unitless, inverse-depth-like) depth map. Absolute metric
height calibration is handled downstream by calibration/region_calibration.py.
"""
from __future__ import annotations
import numpy as np

from depthwizard.models.dav2_backbone import DAv2Backbone


def run_depth_estimation(
    preprocessed_output: dict,
    dav2: DAv2Backbone,
    verbose: bool = True,
) -> dict[str, np.ndarray]:
    """
    Parameters
    ----------
    preprocessed_output : the dict returned by
        preprocessing.pipelines.inference.preprocess_for_inference(), must
        contain \"dav2_input\" (H,W,3 uint8).
    dav2 : a loaded DAv2Backbone instance (frozen for inference).

    Returns
    -------
    dict with key:
        \"raw_depth\"  — (H, W) float32, direct DAv2 relative depth output.
                        Larger values = closer to the nadir camera = higher elevation.
                        Pass this to calibration/region_calibration.py for metric scaling.
    """
    def log(msg):
        if verbose:
            print(f"  [depth_estimation] {msg}")

    dav2_input = preprocessed_output["dav2_input"]

    raw_depth = dav2.predict(dav2_input)
    log(f"DAv2 raw relative depth {raw_depth.shape}, "
        f"range=[{raw_depth.min():.3f}, {raw_depth.max():.3f}]")

    return {"raw_depth": raw_depth}
