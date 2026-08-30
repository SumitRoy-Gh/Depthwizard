"""
dav2_backbone.py — frozen Depth Anything V2 backbone (ViT/DINOv2 encoder + DPT decoder).

Matches Diagram Stage 3: "Depth Anything V2 (Pre-trained Backbone) — ViT
Encoder (DINOv2) → Decoder (DPT) → Raw Relative Depth".

This wraps the HuggingFace `transformers` implementation so we don't need
to vendor the original Depth-Anything-V2 repo. The backbone is ALWAYS
frozen (requires_grad=False) — only the Correction U-Net downstream is
trained. Output is RELATIVE (unitless, inverse-depth-like) — absolute
scale is recovered later in Stage 4 (Scale Calibration), not here.
"""
from __future__ import annotations
import numpy as np
import torch

_MODEL_NAME_BY_SIZE = {
    "small": "depth-anything/Depth-Anything-V2-Small-hf",
    "base": "depth-anything/Depth-Anything-V2-Base-hf",
    "large": "depth-anything/Depth-Anything-V2-Large-hf",
}


class DAv2Backbone:
    """Frozen wrapper around the pretrained Depth Anything V2 model."""

    def __init__(self, size: str = "small", device: str | None = None):
        from transformers import AutoImageProcessor, AutoModelForDepthEstimation

        if size not in _MODEL_NAME_BY_SIZE:
            raise ValueError(f"size must be one of {list(_MODEL_NAME_BY_SIZE)}, got {size!r}")

        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        model_name = _MODEL_NAME_BY_SIZE[size]

        self.processor = AutoImageProcessor.from_pretrained(model_name)
        self.model = AutoModelForDepthEstimation.from_pretrained(model_name)
        self.model.to(self.device)
        self.model.eval()
        for p in self.model.parameters():
            p.requires_grad = False

    @torch.no_grad()
    def predict(self, rgb_uint8: np.ndarray) -> np.ndarray:
        """
        rgb_uint8: (H, W, 3) uint8 RGB image (the `dav2_input` produced by
            preprocessing.pipelines.inference.preprocess_for_inference).

        Returns: (H, W) float32 raw relative depth map, resized back to
            the input's original (H, W) via bilinear interpolation.
        """
        if rgb_uint8.dtype != np.uint8 or rgb_uint8.ndim != 3 or rgb_uint8.shape[-1] != 3:
            raise ValueError(f"expected (H, W, 3) uint8 RGB, got shape={rgb_uint8.shape} dtype={rgb_uint8.dtype}")

        h, w = rgb_uint8.shape[:2]
        inputs = self.processor(images=rgb_uint8, return_tensors="pt").to(self.device)
        outputs = self.model(**inputs)
        pred = outputs.predicted_depth  # (1, h', w')

        pred = torch.nn.functional.interpolate(
            pred.unsqueeze(1), size=(h, w), mode="bilinear", align_corners=False
        ).squeeze()

        return pred.detach().cpu().numpy().astype(np.float32)


def run_dav2_inference(rgb_uint8: np.ndarray, size: str = "small", device: str | None = None) -> np.ndarray:
    """One-shot convenience wrapper — loads the model, runs once, returns raw depth."""
    backbone = DAv2Backbone(size=size, device=device)
    return backbone.predict(rgb_uint8)
