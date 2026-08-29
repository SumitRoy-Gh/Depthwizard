"""
correction_unet.py — trainable Correction U-Net for the DepthWizard pipeline.

Matches Diagram Stage 3: "Raw Relative Depth (+) Correction U-Net (Trained)
→ Refined Depth / AGL".

Input: concat(preprocessed RGB [3ch], raw DAv2 depth [1ch]) = 4 channels.
Output: 1-channel RESIDUAL correction added to the raw depth, producing
the refined relative depth/AGL map. This is the ONLY trainable component
in Stage 3 — DAv2 stays frozen (see dav2_backbone.py).

Residual formulation (refined = raw + correction) is used instead of
direct regression because DAv2's relative depth is already a strong
geometric prior; the U-Net only needs to learn the *correction* (fixing
scale-consistency errors, edge bleeding, and dataset-specific bias),
which is a much easier learning target than depth-from-scratch.
"""
from __future__ import annotations
import torch
import torch.nn as nn


def _conv_block(in_ch: int, out_ch: int) -> nn.Sequential:
    return nn.Sequential(
        nn.Conv2d(in_ch, out_ch, 3, padding=1), nn.BatchNorm2d(out_ch), nn.ReLU(inplace=True),
        nn.Conv2d(out_ch, out_ch, 3, padding=1), nn.BatchNorm2d(out_ch), nn.ReLU(inplace=True),
    )


class CorrectionUNet(nn.Module):
    """
    Small 4-level U-Net. in_channels=4 (RGB + raw depth), out_channels=1
    (residual correction, added to raw depth outside this module).
    """

    def __init__(self, in_channels: int = 4, base_channels: int = 32):
        super().__init__()
        c = base_channels
        self.enc1 = _conv_block(in_channels, c)
        self.enc2 = _conv_block(c, c * 2)
        self.enc3 = _conv_block(c * 2, c * 4)
        self.bottleneck = _conv_block(c * 4, c * 8)

        self.pool = nn.MaxPool2d(2)
        self.up3 = nn.ConvTranspose2d(c * 8, c * 4, 2, stride=2)
        self.dec3 = _conv_block(c * 8, c * 4)
        self.up2 = nn.ConvTranspose2d(c * 4, c * 2, 2, stride=2)
        self.dec2 = _conv_block(c * 4, c * 2)
        self.up1 = nn.ConvTranspose2d(c * 2, c, 2, stride=2)
        self.dec1 = _conv_block(c * 2, c)

        self.out_conv = nn.Conv2d(c, 1, kernel_size=1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """x: (B, 4, H, W) → returns (B, 1, H, W) residual correction."""
        e1 = self.enc1(x)
        e2 = self.enc2(self.pool(e1))
        e3 = self.enc3(self.pool(e2))
        b = self.bottleneck(self.pool(e3))

        d3 = self.dec3(torch.cat([self.up3(b), e3], dim=1))
        d2 = self.dec2(torch.cat([self.up2(d3), e2], dim=1))
        d1 = self.dec1(torch.cat([self.up1(d2), e1], dim=1))

        return self.out_conv(d1)

    @torch.no_grad()
    def refine(self, rgb_chw: torch.Tensor, raw_depth_hw: torch.Tensor) -> torch.Tensor:
        """
        Inference convenience method.
        rgb_chw: (3, H, W) float tensor, normalized preprocessed RGB.
        raw_depth_hw: (H, W) float tensor, DAv2 raw relative depth.
        Returns: (H, W) refined depth = raw_depth + correction.
        """
        x = torch.cat([rgb_chw, raw_depth_hw.unsqueeze(0)], dim=0).unsqueeze(0)  # (1, 4, H, W)
        correction = self.forward(x).squeeze()
        return raw_depth_hw + correction
