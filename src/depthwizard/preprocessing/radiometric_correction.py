"""
radiometric_correction.py — Stage 1 of the DepthWizard preprocessing chain.

Two distinct jobs live here, and they must NOT be confused with
data_normalization.py's job (see that module's docstring):

  1. Bit-depth compression: raw sensor imagery from sources like Vaihingen
     arrives as 11-bit values packed into 16-bit TIFFs. A per-tile
     percentile stretch (not a fixed linear /65535 scale, which would let
     one bright outlier crush the rest of the histogram into a few gray
     levels) maps this to 0-255 uint8, which is what the frozen DAv2
     depth backbone's image processor expects as input.

  2. Band-domain adaptation: Vaihingen's TIFF band order is IR-R-G, not
     RGB, despite what the container tag says. DAv2 was pretrained on
     natural RGB imagery, so feeding it a raw IR-R-G stack would silently
     confuse its geometric prior (near-IR reflectance looks nothing like
     a red channel to a network that's never seen it labeled that way).
     We build a cheap RGB proxy stack(R, G, G) for the frozen branch only.
     The from-scratch correction U-Net is band-agnostic and should NOT
     go through this proxy — feed it the native IR,R,G (+ raw depth)
     directly so it can exploit the vegetation/rooftop contrast that NIR
     actually gives you. This proxy step exists purely to keep DAv2 happy.
"""
from __future__ import annotations
import numpy as np


def percentile_stretch(
    band: np.ndarray,
    low_pct: float = 2.0,
    high_pct: float = 98.0,
    valid_mask: np.ndarray | None = None,
) -> np.ndarray:
    """
    Compress ONE band (any numeric dtype, typically 11-bit-in-16-bit) to
    uint8 [0, 255] using per-tile percentile clipping. Computed per-tile,
    not per-dataset, because illumination/atmosphere varies tile to tile
    and a global stretch would over- or under-expose individual patches.

    Percentiles are computed only over valid_mask pixels if given, so a
    masked-out cloud/nodata region can't skew the stretch for the rest
    of the tile.
    """
    sample = band[valid_mask] if valid_mask is not None else band.ravel()
    sample = sample[np.isfinite(sample)]
    if sample.size == 0:
        return np.zeros_like(band, dtype=np.uint8)

    lo, hi = np.percentile(sample, [low_pct, high_pct])
    if hi - lo < 1e-6:
        return np.full(band.shape, 128, dtype=np.uint8)

    stretched = (band.astype(np.float32) - lo) / (hi - lo)
    stretched = np.clip(stretched, 0.0, 1.0) * 255.0
    return stretched.astype(np.uint8)


def stretch_multiband(image: np.ndarray, valid_mask: np.ndarray | None = None,
                       low_pct: float = 2.0, high_pct: float = 98.0) -> np.ndarray:
    """Apply percentile_stretch independently to every band of an (H, W, C) stack."""
    out = np.zeros(image.shape, dtype=np.uint8)
    for c in range(image.shape[-1]):
        out[..., c] = percentile_stretch(image[..., c], low_pct, high_pct, valid_mask)
    return out


def build_dav2_rgb_proxy(ir_r_g_image: np.ndarray) -> np.ndarray:
    """
    Build the cheap RGB proxy for the FROZEN DAv2 branch only:
    stack(R, G, G) — R goes to the red slot, G is duplicated into both
    green and blue slots (G is the closest visible-spectrum analog we
    have to a blue channel in a 3-band IR-R-G product).

    ir_r_g_image: (H, W, 3) uint8, band order IR, R, G (already stretched).
    Returns (H, W, 3) uint8 in R, G, G order — feed this to DAv2 only.
    Do NOT feed this to the correction U-Net; give the U-Net the native
    IR-R-G stack instead.
    """
    assert ir_r_g_image.shape[-1] == 3, "expected 3-band IR,R,G stack"
    _ir, r, g = ir_r_g_image[..., 0], ir_r_g_image[..., 1], ir_r_g_image[..., 2]
    return np.stack([r, g, g], axis=-1)


def radiometric_correction_pipeline(
    raw_ir_r_g: np.ndarray, valid_mask: np.ndarray | None = None
) -> dict[str, np.ndarray]:
    """
    Full stage-1 entry point. Takes raw 16-bit IR-R-G imagery and returns
    both artifacts consumers downstream will need:
      - "unet_input": native-band uint8 stack (IR, R, G) for the correction U-Net
      - "dav2_input": RGB-proxy uint8 stack (R, G, G) for the frozen DAv2 branch
    """
    stretched = stretch_multiband(raw_ir_r_g, valid_mask)
    return {
        "unet_input": stretched,
        "dav2_input": build_dav2_rgb_proxy(stretched),
    }