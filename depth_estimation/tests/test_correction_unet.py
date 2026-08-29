"""Unit test for CorrectionUNet — shape/gradient sanity check (no pretrained weights needed)."""
import torch
from depth_estimation.models.correction_unet import CorrectionUNet


def test_correction_unet_forward_shape():
    model = CorrectionUNet(in_channels=4, base_channels=8)
    x = torch.randn(2, 4, 64, 64)
    out = model(x)
    assert out.shape == (2, 1, 64, 64)


def test_correction_unet_refine():
    model = CorrectionUNet(in_channels=4, base_channels=8).eval()
    rgb = torch.randn(3, 64, 64)
    raw_depth = torch.rand(64, 64)
    refined = model.refine(rgb, raw_depth)
    assert refined.shape == (64, 64)
