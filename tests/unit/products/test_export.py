"""
test_export.py — Tests for Stage 6: DSM & Derived Products.

Verifies:
  1. nDSM correctly strips terrain, leaving only above-ground structures.
  2. Slope is 0° on flat terrain and > 0° on a tilted surface.
  3. Hillshade produces valid uint8 output.
  4. GeoTIFF writer produces a readable rasterio file.
  5. Confidence map encoding is correct.
  6. generate_all_products produces the correct set of files.
"""
from __future__ import annotations
import numpy as np
import os
import tempfile
import pytest

from depthwizard.products.export import (
    compute_ndsm,
    compute_slope,
    compute_hillshade,
    compute_confidence_map,
    write_geotiff,
    generate_all_products,
)


# ---------------------------------------------------------------------------
# nDSM
# ---------------------------------------------------------------------------

class TestNDSM:
    def test_flat_terrain_ndsm_is_zero(self):
        """A perfectly flat DSM should produce nDSM ≈ 0 everywhere."""
        flat = np.full((100, 100), 250.0, dtype=np.float32)
        ndsm, dtm = compute_ndsm(flat, kernel_size=11)
        assert np.allclose(ndsm, 0.0, atol=0.01)

    def test_building_on_flat_terrain(self):
        """A 10m-tall building on flat ground should appear in the nDSM."""
        dsm = np.full((200, 200), 250.0, dtype=np.float32)
        # Place a 50x50 building in the center, 10m above ground
        dsm[75:125, 75:125] = 260.0

        ndsm, dtm = compute_ndsm(dsm, kernel_size=55)

        # The building interior should have nDSM ≈ 10m
        building_mean = ndsm[85:115, 85:115].mean()
        ground_mean = ndsm[10:30, 10:30].mean()

        assert building_mean > 5.0, f"Building nDSM should be high, got {building_mean:.2f}"
        assert ground_mean < 2.0, f"Ground nDSM should be near 0, got {ground_mean:.2f}"

    def test_ndsm_non_negative(self):
        """nDSM should never be negative."""
        np.random.seed(42)
        dsm = np.random.uniform(200, 300, (100, 100)).astype(np.float32)
        ndsm, _ = compute_ndsm(dsm, kernel_size=11)
        assert (ndsm >= 0).all()


# ---------------------------------------------------------------------------
# Slope
# ---------------------------------------------------------------------------

class TestSlope:
    def test_flat_terrain_slope_is_zero(self):
        """A flat DSM should have 0° slope everywhere."""
        flat = np.full((100, 100), 250.0, dtype=np.float32)
        slope = compute_slope(flat, gsd_m=0.09)
        assert np.allclose(slope, 0.0, atol=0.01)

    def test_tilted_plane_has_positive_slope(self):
        """A linearly tilted surface should have uniform positive slope."""
        # 45° slope: rise of 1m per 1m horizontal
        rows = np.arange(100).reshape(-1, 1).repeat(100, axis=1).astype(np.float32)
        dsm = rows * 1.0  # 1m rise per pixel at 1m GSD
        slope = compute_slope(dsm, gsd_m=1.0)

        # Interior (avoiding edge effects from gradient)
        interior = slope[10:90, 10:90]
        assert (interior > 30).all(), f"Tilted plane should have significant slope, got mean={interior.mean():.1f}°"

    def test_slope_range(self):
        """Slope should be in [0°, 90°]."""
        np.random.seed(42)
        dsm = np.random.uniform(200, 300, (100, 100)).astype(np.float32)
        slope = compute_slope(dsm, gsd_m=0.09)
        assert (slope >= 0).all()
        assert (slope <= 90).all()


# ---------------------------------------------------------------------------
# Hillshade
# ---------------------------------------------------------------------------

class TestHillshade:
    def test_output_is_uint8(self):
        dsm = np.random.uniform(200, 300, (100, 100)).astype(np.float32)
        shade = compute_hillshade(dsm, gsd_m=0.09)
        assert shade.dtype == np.uint8

    def test_output_range(self):
        dsm = np.random.uniform(200, 300, (100, 100)).astype(np.float32)
        shade = compute_hillshade(dsm, gsd_m=0.09)
        assert shade.min() >= 0
        assert shade.max() <= 255

    def test_flat_terrain_is_bright(self):
        """Flat terrain illuminated from above should be uniformly bright."""
        flat = np.full((100, 100), 250.0, dtype=np.float32)
        shade = compute_hillshade(flat, gsd_m=0.09, altitude_deg=45.0)
        assert shade.mean() > 150, f"Flat terrain should be bright, got mean={shade.mean():.0f}"


# ---------------------------------------------------------------------------
# Confidence Map
# ---------------------------------------------------------------------------

class TestConfidenceMap:
    def test_all_valid_no_ransac(self):
        valid = np.ones((50, 50), dtype=bool)
        conf = compute_confidence_map(valid, ransac_inlier_mask=None)
        assert (conf == 2).all()

    def test_invalid_pixels_are_zero(self):
        valid = np.zeros((50, 50), dtype=bool)
        conf = compute_confidence_map(valid)
        assert (conf == 0).all()

    def test_ransac_outliers_are_one(self):
        valid = np.ones((50, 50), dtype=bool)
        ransac = np.ones((50, 50), dtype=bool)
        ransac[10:20, 10:20] = False  # Some outliers
        conf = compute_confidence_map(valid, ransac)
        assert (conf[10:20, 10:20] == 1).all()
        assert (conf[0:5, 0:5] == 2).all()


# ---------------------------------------------------------------------------
# GeoTIFF Writer
# ---------------------------------------------------------------------------

class TestWriteGeotiff:
    def test_write_and_read_back(self):
        """Write a GeoTIFF and verify it can be read back correctly."""
        import rasterio

        data = np.random.uniform(200, 300, (100, 100)).astype(np.float32)
        with tempfile.TemporaryDirectory() as tmpdir:
            path = os.path.join(tmpdir, "test.tif")
            write_geotiff(data, path, crs="EPSG:32633", transform=(0.09, 0, 0, 0, -0.09, 100))

            with rasterio.open(path) as src:
                read_back = src.read(1)
                assert src.crs.to_string() == "EPSG:32633"
                assert read_back.shape == (100, 100)
                assert np.allclose(read_back, data, atol=1e-4)


# ---------------------------------------------------------------------------
# Full Pipeline
# ---------------------------------------------------------------------------

class TestGenerateAllProducts:
    def test_generates_all_files(self):
        """generate_all_products should create DSM, nDSM, DTM, slope, hillshade, confidence."""
        dsm = np.random.uniform(200, 300, (100, 100)).astype(np.float32)
        valid = np.ones((100, 100), dtype=bool)

        with tempfile.TemporaryDirectory() as tmpdir:
            products = generate_all_products(
                dsm=dsm,
                output_dir=tmpdir,
                scene_name="test",
                crs="EPSG:32633",
                transform=(0.09, 0, 0, 0, -0.09, 100),
                gsd_m=0.09,
                valid_mask=valid,
            )

            assert "dsm" in products
            assert "ndsm" in products
            assert "dtm" in products
            assert "slope" in products
            assert "hillshade" in products
            assert "confidence" in products

            for name, path in products.items():
                assert os.path.isfile(path), f"Missing product file: {name} -> {path}"
