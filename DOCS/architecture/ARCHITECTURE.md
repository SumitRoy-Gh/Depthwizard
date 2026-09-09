# DepthWizard Architecture

## Core Pipeline

DepthWizard is a single-view height estimation pipeline designed specifically for overhead optical satellite imagery.

Unlike traditional pipelines that rely on standard auto-encoders or U-Net architectures, DepthWizard uses **Depth Anything V2 (DAv2)** as a foundation backbone, followed by robust geospatial calibration and refinement steps.

### Workflow

1. **Ingestion & Preprocessing**
   - Radiometric Correction
   - Noise Reduction
   - Cloud & Shadow Masking
   - Resolution Alignment (GSD mapping)

2. **Depth Inference**
   - **Backbone**: Fine-tuned `Depth-Anything-V2-Small` (`best.pt`)
   - Produces raw, relative metric depth.

3. **Calibration & Refinement**
   - **Metric Calibration**: Anchors the relative depth to real-world elevation (e.g. above sea level).
   - **Region-Aware Calibration**: Uses RANSAC on semantic segments (e.g. ground vs buildings) to properly scale vertical structures while keeping terrain flat.

4. **Geospatial Products**
   - **DSM** (Digital Surface Model)
   - **DTM** (Digital Terrain Model / Bare Earth)
   - **nDSM** (Normalized DSM / Building Heights)
   - **Slope Map**
   - **Hillshade Relief**
   - **Confidence Map**

5. **3D Reconstruction & Flythrough**
   - Converts the resulting height maps into interactive WebGL terrain meshes.

## Architecture Principles

- **No U-Net**: The core neural architecture does not use a Correction U-Net. It leverages full backbone fine-tuning.
- **Modularity**: The pipeline is strictly divided into `preprocessing`, `models`, `calibration`, `inference`, and `products`.
- **Geospatial Safety**: All TIFF operations preserve CRS, bounds, and affine transforms.
