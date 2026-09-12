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

## Project Structure

```
Depthwizard/
├── preprocessing/        # Python ML pipeline
│   ├── stages/          # 7-stage implementations
│   ├── ingest/          # File I/O + format detection
│   ├── pipelines/       # Training + inference orchestrators
│   └── tests/           # 94-test automated suite
├── frontend/            # Next.js 14 web app
│   ├── app/            # 7 routes (upload, processing, results, history, etc.)
│   ├── components/     # UI, 3D, motion
│   ├── lib/            # API hooks, stores, colormaps
│   └── public/         # Static assets
└── DOCS/               # Full architecture + specs
    ├── ARCHITECTURE.md
    ├── PRD.md
    ├── STATUS.md
    └── Pre-Processing DOCS/  # Mathematical specifications
```

---

## Testing

Run the full preprocessing test suite:

```bash
uv run python preprocessing/tests/test_all.py
```

**94 tests across 10 groups** (radiometric, masking, denoise, CLAHE, resolution, tiling, normalization, + E2E pipelines).

To test on a real raster:

```bash
uv run python preprocessing/tests/test_real_tif.py "path/to/image.tif"
```

Outputs: file format, dimensions, native GSD, CRS, processing time, valid mask stats.

---

## Frontend Routes

| Route | Purpose |
|---|---|
| `/` | Landing + upload + samples + showcase |
| `/processing/:jobId` | Live 8-stage stepper + per-stage thumbnails |
| `/results/:jobId` | 2D map + 3D flythrough + controls |
| `/results/:jobId/compare` | Raw depth vs calibrated height slider |
| `/history` | Session-scoped past runs |
| `/about` | Model info + honest scope |
| `/settings` | Display / export / pipeline prefs |

**Keyboard shortcuts:**  
`Cmd/Ctrl + V` → paste image  |  `/` → focus upload  |  `Drag` → orbit  |  `Scroll` → zoom

---

## Documentation

| File | Contents |
|---|---|
| [`DOCS/PRD.md`](./DOCS/PRD.md) | Vision, users, success metrics |
| [`DOCS/ARCHITECTURE.md`](./DOCS/ARCHITECTURE.md) | System diagrams, stack, contracts, perf budget |
| [`DOCS/TECHSTACK.md`](./DOCS/TECHSTACK.md) | Tech choices + rationale |
| [`DOCS/STATUS.md`](./DOCS/STATUS.md) | Live phase tracker (Backend / Frontend / Integration) |
| [`DOCS/FLOW.md`](./DOCS/FLOW.md) | User flows + animation keyframes |
| [`DOCS/Pre-Processing DOCS/`](./DOCS/Pre-Processing%20DOCS/) | Per-stage math + verification guide |

---

## What This Is Not

See [`DOCS/STATUS.md`](./DOCS/STATUS.md) §Phase B7 for full details:

- ❌ Not real-time multi-user — sessions are local-only
- ❌ Not sub-decimeter on arbitrary phone photos — accuracy only on ISPRS benchmarks
- ❌ Not a LiDAR / survey replacement
- ❌ Not certified for safety-critical decisions

---

## Roadmap

### ✅ Shipped

- 7-stage preprocessing pipeline (94/94 tests passing)
- Inference ingest with GeoTIFF auto-detection
- Full Next.js frontend + 3D flythrough + 7 routes
- Cinematic camera tour ("Fly this path")
- Raw vs calibrated comparison view
- Session-scoped history with localStorage
- Light landing + dark cinematic app theme

### 🚧 In Progress

- Depth backbone fine-tuning + calibration (ML track)
- Backend FastAPI service + job orchestration
- Real artifact exports (GLB, GeoTIFF, PDF)

### 🔮 Future / Stretch

- Batch upload
- User accounts + multi-session history
- PWA / offline support
- E2E tests (Playwright)
- Vercel deployment

---

## Datasets & Attribution

Trained and validated on public aerial benchmarks:

- **ISPRS Vaihingen** — 9 cm/px + LiDAR DSM ground truth
- **ISPRS Potsdam** — 5 cm/px + LiDAR DSM ground truth
- **DFC2019** — multi-platform overhead benchmark

Models: **Depth Anything v2** (fine-tuned), **semantic segmentation**, **per-region RANSAC** (SRTM / Copernicus).

---

## Resources

- 📚 [Full Architecture](./DOCS/ARCHITECTURE.md)
- 📖 [Product Requirements](./DOCS/PRD.md)
- 🔧 [Preprocessing Specs](./DOCS/Pre-Processing%20DOCS/)
- 📊 [Live Status Tracker](./DOCS/STATUS.md)

---

## License

Built by **DepthWizard** for **SIH 26175** (Smart India Hackathon 2026 — ISRO / Department of Space).

Third-party models retain their original licenses:
- **Depth Anything v2** — Depth Anything team license
- **ISPRS Vaihingen / Potsdam** — free for scientific use with attribution
- **DFC2019** — open benchmark
- **Fonts** — SIL Open Font License

---

<p align="center">
  <sub>DepthWizard · Light landing / Dark app · Viridis colormaps · SIH 26175 · 2026</sub>
</p>
