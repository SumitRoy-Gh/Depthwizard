"""
inference.py — Stage 3 orchestrator: raw DAv2 depth → Correction U-Net → refined depth.

Sits directly downstream of preprocessing.pipelines.inference.preprocess_for_inference().
Takes that stage's output dict and produces the refined depth/AGL map
handed off to Stage 4 (Scale Calibration).
"""
from __future__ import annotations
import numpy as np
import torch

from depth_estimation.models.dav2_backbone import DAv2Backbone
from depth_estimation.models.correction_unet import CorrectionUNet


def run_depth_estimation(
    preprocessed_output: dict,
    dav2: DAv2Backbone,
    correction_unet: CorrectionUNet,
    verbose: bool = True,
) -> dict[str, np.ndarray]:
    """
    Parameters
    ----------
    preprocessed_output : the dict returned by
        preprocessing.pipelines.inference.preprocess_for_inference(), must
        contain "dav2_input" (H,W,3 uint8) and "preprocessed" (H,W,3 float32).
    dav2 : a loaded, frozen DAv2Backbone instance.
    correction_unet : a loaded, trained CorrectionUNet instance (eval mode).

    Returns
    -------
    dict with keys:
        "raw_depth"     — (H, W) float32, direct DAv2 output
        "refined_depth" — (H, W) float32, after Correction U-Net residual
    """
    def log(msg):
        if verbose:
            print(f"  [depth_estimation] {msg}")

    dav2_input = preprocessed_output["dav2_input"]
    preprocessed = preprocessed_output["preprocessed"]

    raw_depth = dav2.predict(dav2_input)
    log(f"stage 3a (DAv2): raw relative depth {raw_depth.shape}, "
        f"range=[{raw_depth.min():.3f}, {raw_depth.max():.3f}]")

    rgb_chw = torch.from_numpy(preprocessed).permute(2, 0, 1).float().to(dav2.device)
    raw_depth_t = torch.from_numpy(raw_depth).float().to(dav2.device)

    correction_unet.eval()
    refined_depth = correction_unet.refine(rgb_chw, raw_depth_t).cpu().numpy().astype(np.float32)
    log(f"stage 3b (correction U-Net): refined depth "
        f"range=[{refined_depth.min():.3f}, {refined_depth.max():.3f}]")

    return {"raw_depth": raw_depth, "refined_depth": refined_depth}
