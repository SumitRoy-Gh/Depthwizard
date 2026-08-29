# DepthWizard Pre-Processing Architecture & Technical Documentation

Welcome to the comprehensive technical documentation for the **DepthWizard Pre-Processing Pipeline**. This documentation suite details every algorithm, mathematical foundation, module structure, and operational workflow of the data preprocessing engine powering DepthWizard.

---

## 📚 Documentation Index

| Module / Topic | File Link | Summary |
|---|---|---|
| **00. Overview & Architecture** | [00_OVERVIEW_AND_ARCHITECTURE.md](file:///d:/SIH175/DOCS/Pre-Processing%20DOCS/00_OVERVIEW_AND_ARCHITECTURE.md) | System design principles, dual-pipeline flowcharts (Training vs. Inference), module structure, and stage ordering rationale. |
| **01. Radiometric Correction** | [01_STAGE_1_RADIOMETRIC_CORRECTION.md](file:///d:/SIH175/DOCS/Pre-Processing%20DOCS/01_STAGE_1_RADIOMETRIC_CORRECTION.md) | 16-bit to 8-bit dynamic range stretching, percentile clipping math, and DAv2 RGB proxy transformation (`IR, R, G` $\rightarrow$ `R, G, G`). |
| **02. Cloud & Shadow Masking** | [02_STAGE_2_CLOUD_AND_SHADOW_MASKING.md](file:///d:/SIH175/DOCS/Pre-Processing%20DOCS/02_STAGE_2_CLOUD_AND_SHADOW_MASKING.md) | Nodata identification, percentile-based shadow heuristics, multi-spectral cloud detection, boolean `valid_mask` synthesis, and zero-pixel array guards. |
| **03. Noise Reduction** | [03_STAGE_3_NOISE_REDUCTION.md](file:///d:/SIH175/DOCS/Pre-Processing%20DOCS/03_STAGE_3_NOISE_REDUCTION.md) | Edge-preserving bilateral filtering for optical imagery, spatial median filtering for DSM elevation surfaces, and mask-aware NaN boundary isolation. |
| **04. Contrast Enhancement** | [04_STAGE_4_CONTRAST_ENHANCEMENT.md](file:///d:/SIH175/DOCS/Pre-Processing%20DOCS/04_STAGE_4_CONTRAST_ENHANCEMENT.md) | Contrast Limited Adaptive Histogram Equalization (CLAHE), local histogram clipping math, tile grid configuration, and valid-mask preservation. |
| **05. Resolution Handling** | [05_STAGE_5_RESOLUTION_HANDLING.md](file:///d:/SIH175/DOCS/Pre-Processing%20DOCS/05_STAGE_5_RESOLUTION_HANDLING.md) | Spatial GSD resampling, bilinear vs. nearest-neighbor interpolation rules, uint8 dtype preservation, and multi-channel dataset alignment. |
| **06. Tiling & Stitching** | [06_STAGE_6_TILING_AND_STITCHING.md](file:///d:/SIH175/DOCS/Pre-Processing%20DOCS/06_STAGE_6_TILING_AND_STITCHING.md) | Fixed-size patch extraction, `min_valid_fraction` thresholding, geospatial area-based train/val splits, and windowed processing with Cosine-weighted feathered stitching. |
| **07. Data Normalization** | [07_STAGE_7_DATA_NORMALIZATION.md](file:///d:/SIH175/DOCS/Pre-Processing%20DOCS/07_STAGE_7_DATA_NORMALIZATION.md) | Dataset-level imagery Z-score normalization ($\mu, \sigma$), per-patch Min-Max / Z-score depth target scaling, degenerate patch guards, and JSON parameter serialization. |
| **08. Ingest & Orchestration** | [08_INGEST_AND_PIPELINE_ORCHESTRATION.md](file:///d:/SIH175/DOCS/Pre-Processing%20DOCS/08_INGEST_AND_PIPELINE_ORCHESTRATION.md) | File I/O architecture (`ingest/training.py` & `ingest/inference.py`), GeoTIFF vs. PNG/JPG auto-detection, and pipeline execution entries (`process_scene`, `load_and_preprocess`). |
| **09. Testing & Verification** | [09_TESTING_AND_VERIFICATION_GUIDE.md](file:///d:/SIH175/DOCS/Pre-Processing%20DOCS/09_TESTING_AND_VERIFICATION_GUIDE.md) | 94-test suite architecture (`test_all.py`), synthetic scene generation, real-raster verification script (`test_real_tif.py`), and CLI developer guidelines. |

---

## ⚡ Quick Start for Developers

To run the complete automated test suite verifying all 7 stages and both pipeline paths:

```bash
uv run python preprocessing/tests/test_all.py
```

To run inference preprocessing on a custom raster file:

```bash
uv run python preprocessing/tests/test_real_tif.py "path/to/your/image.tif"
```

---

## 📂 Source Code Layout

The preprocessing module is structured under `preprocessing/` as follows:

```text
d:\SIH175\preprocessing\
├── __init__.py                  # Top-level package exports
├── stages/                      # Individual stage implementations (1 to 7)
│   ├── radiometric_correction.py # Stage 1: Dynamic range stretch & DAv2 proxy
│   ├── cloud_shadow_masking.py   # Stage 2: Boolean valid mask computation
│   ├── noise_reduction.py        # Stage 3: Bilateral & median filtering
│   ├── contrast_enhancement.py   # Stage 4: CLAHE enhancement
│   ├── resolution_handling.py    # Stage 5: GSD spatial resampling & alignment
│   ├── tiling.py                 # Stage 6: Patch cropping & area splitting
│   ├── large_image_tiling.py     # Stage 6+: Windowed inference & feathered stitching
│   └── data_normalisation.py     # Stage 7: Imagery Z-score & Depth Min-Max scaling
├── ingest/                      # Raster & Image I/O Loaders
│   ├── training.py               # Dual-raster loader (Imagery + DSM pairs)
│   └── inference.py              # Single-image auto-detector (GeoTIFF/PNG/JPG)
├── pipelines/                   # High-level Orchestrators
│   ├── training.py               # 7-Stage Training Pipeline orchestrator
│   └── inference.py              # 6-Stage Production Inference orchestrator
└── tests/                       # Automated Test Suite
    ├── test_all.py               # 94-test comprehensive test runner
    ├── test_real_tif.py          # Real image test entrypoint
    ├── make_synthetic_tif.py     # GeoTIFF test generator
    ├── test_ingest_pipeline.py   # Ingestion integration test
    └── test_pipeline_synthetic.py# Synthetic scene test runner
```
