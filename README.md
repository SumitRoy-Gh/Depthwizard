# DepthWizard

**From one image, a 3D world.**

Single-view height estimation + interactive 3D flythrough. Transform overhead imagery into exploration-ready 3D meshes with metric-accurate height calibration. Built by DepthWizard for **SIH 26175** (ISRO / Department of Space, Disaster Management).

[![Preprocessing](https://img.shields.io/badge/preprocessing-94%2F94%20tests-10B981?style=flat-square)](./DOCS/Pre-Processing%20DOCS/)
[![Frontend](https://img.shields.io/badge/frontend-Next.js%2014-22D3EE?style=flat-square)]()
[![Backend](https://img.shields.io/badge/backend-Python%203.14%20%2B%20PyTorch-10B981?style=flat-square)]()

---

## What This Does

Drop a single overhead image (`.tif`, `.png`, `.jpg`). Out comes:

- **3D heightmap mesh** — ready to fly around with cinematic controls
- **2D heightmap overlay** — georeferenced MapLibre map or fallback canvas
- **Raw vs calibrated comparison** — slider view of preprocessing impact
- **Downloadable artifacts** — GLB mesh, PNG heightmap, GeoTIFF, PDF report

Works on **ISPRS Vaihingen / Potsdam** aerial benchmarks (9cm–5cm resolution) with metric-level accuracy. Designed for both **visual impact** (judges, stakeholders) and **technical depth** (engineers, validating outputs).

---

## Key Capabilities

- **Deterministic 7-stage preprocessing** — radiometric correction → masking → denoise → contrast → resolution → tiling → normalization
- **Fine-tuned depth backbone** — DINOv2 + DPT, pre-trained on overhead geometry with RPC-aware pseudo-depth
- **Per-region calibration** — RANSAC against SRTM / Copernicus DEM for metric DSM
- **Cinematic 3D viewer** — Three.js / React Three Fiber with 12-second guided tour
- **Full technical audit trail** — per-stage thumbnails, CRS / GSD preservation, honest scope (see `DOCS/STATUS.md`)

---

## Quick Start

**Requires:** Python 3.14+ (or `uv`) + Node.js 20+

```bash
# 1. Clone
git clone https://github.com/SumitRoy-Gh/Depthwizard.git
cd Depthwizard

# 2. Backend — preprocessing tests
uv sync
uv run python preprocessing/tests/test_all.py
# Expect: RESULTS: 94 passed, 0 failed, 94 total

# 3. Frontend
cd frontend
npm install
npm run dev  # http://localhost:3000
```

Drop any `.tif` / `.png` / `.jpg` at `localhost:3000`. The mock backend simulates the full pipeline in ~12 seconds; 3D flythrough loads automatically.

To swap the mock backend for the real one, edit [`frontend/lib/jobs.ts`](./frontend/lib/jobs.ts) (two function calls).

---

## Running the Real Backend (Local Setup)

If you prefer to run the backend natively without Docker, ensure you have Python 3.14+ (or `uv`) and install the dependencies:

### 1. Environment Setup
Create a `.env` file from the `.env.example` template:
```bash
cp .env.example .env
```
Ensure you set the `OPENTOPOGRAPHY_API_KEY` in `.env` (required for fetching coarse DEM tiles for calibration). You can register for a free API key at [OpenTopography](https://portal.opentopography.org/myopentopo).

### 2. Start the Uvicorn Server
```bash
uv sync
uv run uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
The API will be available at `http://localhost:8000`.

---

## Running the Real Backend (FastAPI + Docker)

The actual Deep Learning backend (powered by PyTorch and DepthAnythingV2) is fully containerized. It automatically falls back to CPU if a GPU is unavailable.

### 1. Build the Docker Image
```bash
docker build -t depthwizard-api .
```

### 2. Run the Container
We use Volume Mounts (`-v`) so you don't have to copy massive AI models or datasets directly into the container. 

**Standard Run (CPU):**
```bash
# Replace /path/to/repo with the actual absolute path to your cloned repository
docker run -p 8000:8000 \
  -v "/path/to/repo/models:/app/models" \
  -v "/path/to/repo/data:/app/data" \
  -v "/path/to/repo/dataset:/app/dataset" \
  depthwizard-api
```

**NVIDIA GPU Run (Warp Speed):**
If you have an NVIDIA GPU and the Docker Container Toolkit installed, simply add `--gpus all`:
```bash
docker run --gpus all -p 8000:8000 -v "/path/to/repo/models:/app/models" -v "/path/to/repo/data:/app/data" -v "/path/to/repo/dataset:/app/dataset" depthwizard-api
```

The API will now be live at `http://localhost:8000`.

---

## Project Structure

```
Depthwizard/
├── src/
│   └── depthwizard/      # Core ML library (ingestion, processing, products)
├── scripts/              # Executable Python scripts
│   └── inference/        # (run_pipeline_real_image.py, run_pipeline_custom_image.py)
├── models/               # PyTorch Checkpoints (mounted via Docker)
├── data/                 # Raw/Uploaded/Products data (mounted via Docker)
├── dataset/              # Ground truth and reference DSMs (mounted via Docker)
├── viewer/               # Vanilla JS/Three.js frontend 3D Viewer
├── main.py               # FastAPI backend server (Auto-detects Ground Truth)
├── Dockerfile            # Production-ready Docker container definition
├── pyproject.toml        # Python project dependencies (Hatchling)
└── DOCS/                 # Documentation (Specs, Architecture, Status)
```

---

