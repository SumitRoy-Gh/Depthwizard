"""
large_image_tiling.py — memory-safe windowed reading of large rasters, and
seamless stitching of per-tile outputs back into one mosaic.

This is NOT the same thing as tiling.py's patch-cropping (that one
assumes the raster already fits in memory and just wants fixed 512x512
crops for a training dataset). This module solves a different problem:
a real deployment input could be 10000x10000px or larger, which will
not fit in memory or GPU VRAM at once. Two things are needed:

  1. Read only a WINDOW of the file at a time (rasterio windowed I/O),
     never the full array.
  2. When windows overlap (they must, or per-tile model predictions show
     visible seams at tile boundaries), blend the overlapping predictions
     with a feathered weight — not just paste tile B over tile A, which
     creates hard seams wherever the two tiles disagree even slightly.
"""
from __future__ import annotations
import numpy as np
import rasterio
from rasterio.windows import Window
from dataclasses import dataclass
from typing import Callable


@dataclass
class TileWindow:
    window: Window
    row_off: int
    col_off: int
    height: int
    width: int


def generate_tile_windows(full_height: int, full_width: int, tile_size: int, overlap: int) -> list[TileWindow]:
    """
    Overlapping windows covering the full raster. `overlap` is in pixels —
    each tile shares this many pixels with its neighbors, which is the
    region the feather-blending in stitch below will smooth over.
    """
    stride = tile_size - overlap
    assert stride > 0, "overlap must be smaller than tile_size"

    row_offs = list(range(0, max(full_height - tile_size, 0) + 1, stride))
    col_offs = list(range(0, max(full_width - tile_size, 0) + 1, stride))
    if not row_offs or row_offs[-1] != full_height - tile_size:
        row_offs.append(max(full_height - tile_size, 0))
    if not col_offs or col_offs[-1] != full_width - tile_size:
        col_offs.append(max(full_width - tile_size, 0))

    windows = []
    for r in sorted(set(row_offs)):
        for c in sorted(set(col_offs)):
            h = min(tile_size, full_height - r)
            w = min(tile_size, full_width - c)
            windows.append(TileWindow(Window(c, r, w, h), r, c, h, w))
    return windows


def read_tile(raster_path: str, tile: TileWindow) -> np.ndarray:
    """
    Reads ONLY this window from disk — the full raster is never loaded.
    Returns (h, w, C) for multi-band, (h, w) for single-band.
    """
    with rasterio.open(raster_path) as src:
        arr = src.read(window=tile.window)
        if arr.shape[0] == 1:
            return arr[0]
        return np.transpose(arr, (1, 2, 0))


def feather_weight(h: int, w: int, overlap: int) -> np.ndarray:
    """
    A weight mask that ramps linearly from 0 to 1 across the first
    `overlap` pixels on each edge, and is 1.0 in the tile's interior.
    Multiplying a tile's output by this before accumulating means
    overlapping tiles blend smoothly instead of one hard-overwriting
    the other at the seam.
    """
    ramp_h = np.ones(h, dtype=np.float32)
    ramp_w = np.ones(w, dtype=np.float32)
    o = min(overlap, h // 2, w // 2)
    if o > 0:
        edge = np.linspace(0, 1, o, endpoint=False, dtype=np.float32)
        ramp_h[:o] = edge
        ramp_h[-o:] = edge[::-1]
        ramp_w[:o] = edge
        ramp_w[-o:] = edge[::-1]
    return ramp_h[:, None] * ramp_w[None, :]


def process_large_raster(
    raster_path: str,
    tile_size: int,
    overlap: int,
    process_fn: Callable[[np.ndarray], np.ndarray],
    n_output_channels: int = 1,
) -> np.ndarray:
    """
    The full "tile -> process -> stitch" flow for a raster too large to
    process whole (e.g. running depth-model inference or the correction
    U-Net over a full scene rather than a pre-cropped training patch).

    process_fn: takes one tile array (h, w, C_in) and returns (h, w,
    n_output_channels) or (h, w) if n_output_channels == 1.

    Returns the full-resolution stitched output — same (H, W) as the input
    raster, blended seamlessly across tile boundaries.
    """
    with rasterio.open(raster_path) as src:
        full_h, full_w = src.height, src.width

    tiles = generate_tile_windows(full_h, full_w, tile_size, overlap)

    accum = np.zeros((full_h, full_w, n_output_channels), dtype=np.float32)
    weight_sum = np.zeros((full_h, full_w), dtype=np.float32)

    for tile in tiles:
        tile_array = read_tile(raster_path, tile)
        result = process_fn(tile_array)
        if result.ndim == 2:
            result = result[..., np.newaxis]

        w = feather_weight(tile.height, tile.width, overlap)
        r0, c0 = tile.row_off, tile.col_off
        accum[r0:r0 + tile.height, c0:c0 + tile.width, :] += result * w[..., np.newaxis]
        weight_sum[r0:r0 + tile.height, c0:c0 + tile.width] += w

    weight_sum = np.maximum(weight_sum, 1e-8)
    stitched = accum / weight_sum[..., np.newaxis]
    return stitched[..., 0] if n_output_channels == 1 else stitched