# DepthWizard

> **From one image, a 3D world.**
>
> Single-view monocular height estimation + interactive 3D flythrough, built for **SIH 175** (Smart India Hackathon problem 175).

[![Branch](https://img.shields.io/badge/branch-feat%2Fclient-22D3EE?style=flat-square)]()
[![Frontend](https://img.shields.io/badge/frontend-Next.js%2014-22D3EE?style=flat-square)]()
[![Backend](https://img.shields.io/badge/backend-Python%203.14%20%2B%20PyTorch-10B981?style=flat-square)]()
[![Status](https://img.shields.io/badge/preprocessing-94%2F94%20tests%20passing-10B981?style=flat-square)]()
[![Status](https://img.shields.io/badge/frontend-shipped%20(mock%20backend)-F59E0B?style=flat-square)]()

Drop a single overhead image. Watch a deterministic, 7-stage preprocessing pipeline prepare it. A frozen monocular foundation model produces a relative depth map. A small Correction U-Net calibrates that into a metric DSM. The result rises out of the canvas in twelve seconds — drag to orbit, click **Fly this path** for a cinematic camera tour.

---

## Table of Contents

1. [What this is](#what-this-is)
2. [What this is not](#what-this-is-not)
3. [Architecture](#architecture)
4. [Repository layout](#repository-layout)
6. [Quick start](#quick-start)
7. [How to run the preprocessing tests](#how-to-run-the-preprocessing-tests)
8. [How to run the frontend](#how-to-run-the-frontend)
9. [Datasets & attribution](#datasets--attribution)
10. [Documentation](#documentation)
11. [Roadmap](#roadmap)
12. [License](#license)

---

## What this is

DepthWizard is a research demo that turns a single 2D overhead image (`.tif`, `.png`, `.jpg`) into:

- A **3D heightmap mesh** — displaced plane with viridis/terrain vertex coloring, ready to fly around
- A **2D heightmap overlay** — MapLibre map (if georeferenced) or canvas fallback (if not)
- A **raw vs corrected comparison** — slider view of Depth Anything v2 output versus the Correction U-Net output
- **Downloadable artifacts** — GLB mesh, PNG heightmap, GeoTIFF (metric-only), PDF report

The system serves two audiences that pull in different directions and the product serves both:

| Audience | Need |
|---|---|
| **Hackathon judge in a 2-minute demo** | "Be visually wowed, and walk away believing the system does what it claims." |
| **Technical evaluator** | "Inspect intermediate outputs, see raw vs corrected, verify CRS / GSD preservation." |

The resolution: **simple mode by default, advanced panels behind a toggle.** Every technical detail is one click away for anyone who wants it, but the upload → flythrough loop never forces a user through it.

---

## What this is **not**

Honesty is a feature of this codebase. See [`DOCS/STATUS.md`](./DOCS/STATUS.md) §Phase B7 / [`frontend/app/about/page.tsx`](./frontend/app/about/page.tsx) for the full list. The short version:

- Not a real-time multi-user system — sessions are local-only.
- Not sub-decimeter accurate on arbitrary phone photos — accuracy is only characterized on ISPRS Vaihingen/Potsdam benchmark imagery.
- Not a replacement for LiDAR or photogrammetric survey.
- Not certified for safety-, life-, or mission-critical decisions.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Browser (Frontend)                             │
│   Next.js 14 + React 18 + TypeScript + Tailwind                         │
│   ├─ Three.js / R3F / drei / postprocessing  (cinematic flythrough)     │
│   ├─ MapLibre GL                            (georeferenced 2D view)     │
│   ├─ TanStack Query                         (job-status polling)        │
│   ├─ Zustand + persist                      (UI prefs, history)         │
│   └─ chroma-js / geotiff                    (colormaps, metadata peek)  │
└────────────────────────────────────────────────────────────────┬────────┘
                                 │ REST / JSON
                                 │   POST /ingest
                                 │   GET  /jobs/:id/status
                                 │   GET  /jobs/:id/artifacts
                                 │   GET  /jobs/:id/download/{type}
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       Backend (Python 3.14 + PyTorch)                    │
│   ┌────────────────────────────────────────────────────────────────┐    │
│   │  Ingest                                                           │  │
│   │  ├─ preprocess/ingest/inference.py — auto-detect GeoTIFF/PNG/JPG │  │
│   │  └─ preprocess/ingest/training.py  — paired imagery+DSM loader   │  │
│   └────────────────────────────────────────────────────────────────┘    │
│                                  │                                       │
│                                  ▼                                       │
│   ┌────────────────────────────────────────────────────────────────┐    │
│   │  Preprocessing (7 stages, fixed order)                          │    │
│   │  1. radiometric_correction.py  — percentile stretch + proxy    │    │
│   │  2. cloud_shadow_masking.py    — boolean valid_mask             │    │
│   │  3. noise_reduction.py         — bilateral + masked median      │    │
│   │  4. contrast_enhancement.py    — CLAHE 8×8                      │    │
│   │  5. resolution_handling.py     — GSD resample                   │    │
│   │  6. tiling.py / large_image_tiling.py — patches + stitching    │    │
│   │  7. data_normalisation.py      — Z-score + per-patch scale      │    │
│   └────────────────────────────────────────────────────────────────┘    │
│                                  │                                       │
│                                  ▼                                       │
│   ┌────────────────────────────────────────────────────────────────┐    │
│   │  Models                                                           │    │
│   │  ├─ Depth Anything v2 (frozen) → D_prior  (H, W) float32        │    │
│   │  └─ Correction U-Net          → H_pred   (H, W) metric DSM       │    │
│   └────────────────────────────────────────────────────────────────┘    │
│                                  │                                       │
│                                  ▼                                       │
│   ┌────────────────────────────────────────────────────────────────┐    │
│   │  Job Orchestrator + Artifacts                                    │    │
│   │  ├─ status events (per-stage, with thumbnail URLs)              │    │
│   │  ├─ final artifacts (mesh, heightmap, GeoTIFF, PDF, metadata)   │    │
│   │  └─ signed download URLs                                        │    │
│   └────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

The full architecture (with rationale, stage-by-stage math, API contracts, and deployment topology) lives in [`DOCS/ARCHITECTURE.md`](./DOCS/ARCHITECTURE.md).

---

## Repository layout

```
SIH175/
├── README.md                  ← you are here
├── pyproject.toml             ← Python project (backend ML service)
├── requirements.txt           ← pinned runtime deps
├── uv.lock                    ← reproducible lockfile
├── main.py                    ← backend entry
├── .python-version            ← Python 3.14 pin
├── .gitignore
│
├── preprocessing/             ← Python ML package
│   ├── stages/                ← 7 stage implementations
│   ├── ingest/                ← file I/O + format auto-detection
│   ├── pipelines/             ← training + inference orchestrators
│   └── tests/                 ← 94-test automated suite + harnesses
│
├── frontend/                  ← Next.js 14 web app
│   ├── app/                   ← App Router pages (7 routes)
│   ├── components/            ← UI, 3D, motion primitives
│   ├── lib/                   ← API hooks, colormap, history store
│   ├── store/                 ← Zustand stores
│   ├── types/                 ← shared API contracts
│   ├── public/                ← static assets (textures, samples)
│   ├── package.json
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   ├── next.config.mjs
│   └── README.md
│
└── DOCS/                      ← project documentation
    ├── PRD.md                 ← product requirements
    ├── ARCHITECTURE.md        ← system architecture
    ├── FLOW.md                ← user flows
    ├── TECHSTACK.md           ← technology choices + rationale
    ├── STATUS.md              ← live phase tracker
    ├── fe.txt                 ← original frontend spec (input)
    ├── next-step.md           ← DAv2 integration spec (input)
    └── Pre-Processing DOCS/   ← per-stage mathematical specs
        ├── 00_OVERVIEW_AND_ARCHITECTURE.md
        ├── 01_STAGE_1_RADIOMETRIC_CORRECTION.md
        ├── 02_STAGE_2_CLOUD_AND_SHADOW_MASKING.md
        ├── 03_STAGE_3_NOISE_REDUCTION.md
        ├── 04_STAGE_4_CONTRAST_ENHANCEMENT.md
        ├── 05_STAGE_5_RESOLUTION_HANDLING.md
        ├── 06_STAGE_6_TILING_AND_STITCHING.md
        ├── 07_STAGE_7_DATA_NORMALIZATION.md
        ├── 08_INGEST_AND_PIPELINE_ORCHESTRATION.md
        └── 09_TESTING_AND_VERIFICATION_GUIDE.md
```

---

## Quick start

You need **Python 3.14+** (`uv` recommended) and **Node.js 20+** (`npm`).

```bash
# 1. Clone
git clone <repo-url> sih175
cd sih175

# 2. Backend — preprocessing tests (94 tests, ~5 seconds)
uv sync
uv run python preprocessing/tests/test_all.py
# Expect: RESULTS: 94 passed, 0 failed, 94 total

# 3. Frontend
cd frontend
npm install
npm run dev          # http://localhost:3000
```

Open <http://localhost:3000>. Drop any `.tif` / `.png` / `.jpg`. The mock backend will simulate the full 7-stage pipeline in ~12 seconds and the 3D flythrough will mount automatically.

To swap the mock backend for the real one, see [`frontend/lib/jobs.ts`](./frontend/lib/jobs.ts) — the swap point is two function calls.

---

## How to run the preprocessing tests

```bash
uv run python preprocessing/tests/test_all.py
```

**Expected output**

```
======================================================================
RESULTS: 94 passed, 0 failed, 94 total
======================================================================

[OK] ALL TESTS PASSED - preprocessing pipeline is fully verified.
```

The 94 tests are partitioned across 10 groups:

| # | Group | Count |
|---|-------|-------|
| 1 | Radiometric Correction | 12 |
| 2 | Cloud & Shadow Masking | 7 |
| 3 | Noise Reduction | 5 |
| 4 | CLAHE Contrast Enhancement | 6 |
| 5 | Resolution Handling | 9 |
| 6 | Tiling | 6 |
| 7 | Data Normalization | 13 |
| 8 | Training Pipeline E2E | 10 |
| 9 | Inference Ingest | 16 |
| 10 | Inference Pipeline E2E | 10 |

To exercise the pipeline on a real raster (your own GeoTIFF / PNG / JPG):

```bash
uv run python preprocessing/tests/test_real_tif.py "path/to/your/image.tif"
```

The script prints file format, dimensions, native GSD, CRS, processing time, and `valid_mask.mean()` — everything you need to diagnose whether an input is going to behave well.

---

## How to run the frontend

```bash
cd frontend
npm install
npm run dev          # development server with HMR
npm run build        # production build (verifies all 7 routes compile)
npm run lint
npm run typecheck    # tsc --noEmit
```

### Environment variables

Copy `frontend/.env.local.example` to `frontend/.env.local`:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000   # backend root
NEXT_PUBLIC_DEMO_MODE=true                      # shows the "demo - mock backend" badge
```

When `NEXT_PUBLIC_DEMO_MODE=true` (default), the frontend uses `frontend/lib/mock-api.ts` to simulate the entire pipeline. Set to `false` and provide a real `NEXT_PUBLIC_API_BASE_URL` to hit the actual backend.

### Routes shipped

| Route | Purpose |
|---|---|
| `/` | Landing + upload + sample tiles + 3D hero scene |
| `/processing/:jobId` | Live 7-stage stepper + per-stage 3D thumbnails |
| `/results/:jobId` | 2D map + 3D flythrough + controls + downloads |
| `/results/:jobId/compare` | Raw DAv2 vs corrected U-Net slider |
| `/history` | Session-scoped past runs (localStorage) |
| `/about` | Model + dataset + honest-scope |
| `/settings` | Display / export / pipeline preferences |

### Keyboard shortcuts

- **`Cmd/Ctrl + V`** anywhere — paste an image directly into a new job
- **`/`** on `/` — focus the upload zone
- **`Drag`** the 3D scene to orbit, scroll to zoom
- **Click "Fly this path"** on results for the cinematic camera tour

---

## Datasets & attribution

This project is trained and validated on public aerial benchmarks:

- **ISPRS Vaihingen** — 9 cm/px aerial imagery with LiDAR DSM ground truth
- **ISPRS Potsdam** — 5 cm/px aerial imagery with LiDAR DSM ground truth
- **DFC2019** — multi-platform overhead benchmark

Both ISPRS datasets require attribution for scientific use; the project credits them on every About page and in every PDF report.

Models used:

- **Depth Anything v2 (Base)** — pre-trained monocular depth foundation model from the Depth Anything team. Used frozen as a feature extractor.
- **Correction U-Net** — small custom U-Net, trained on Vaihingen + Potsdam imagery+DSM pairs, mapping `[RGB, D_prior]` → metric DSM per [`DOCS/next-step.md`](./DOCS/next-step.md) §4.

---

## Documentation

| File | What's in it |
|---|---|
| [`DOCS/PRD.md`](./DOCS/PRD.md) | Product requirements — vision, users, capabilities, success metrics |
| [`DOCS/ARCHITECTURE.md`](./DOCS/ARCHITECTURE.md) | System architecture — diagrams, stack, contracts, perf budget |
| [`DOCS/FLOW.md`](./DOCS/FLOW.md) | User flows + per-page animation details + cinematic camera keyframes |
| [`DOCS/TECHSTACK.md`](./DOCS/TECHSTACK.md) | Technology choices with rationale (and what was rejected and why) |
| [`DOCS/STATUS.md`](./DOCS/STATUS.md) | Live phase tracker across Backend / Frontend / Integration tracks |
| [`DOCS/fe.txt`](./DOCS/fe.txt) | Original frontend specification (input from the team) |
| [`DOCS/next-step.md`](./DOCS/next-step.md) | DAv2 integration specification (input from the team) |
| [`DOCS/Pre-Processing DOCS/`](./DOCS/Pre-Processing%20DOCS/) | Per-stage mathematical specifications for the 7-stage pipeline |

---

## Roadmap

### Shipped

- [x] 7-stage preprocessing pipeline (radiometric → masking → denoise → CLAHE → resolution → tiling → normalization)
- [x] 94/94 preprocessing tests passing
- [x] Inference ingest with GeoTIFF auto-detection
- [x] DAv2 frozen-feature-extractor module (awaiting real weights for full e2e test)
- [x] Full Next.js frontend with 3D flythrough, MapLibre, 7 routes
- [x] Cinematic 12-second camera path ("Fly this path")
- [x] Per-stage 3D thumbnails on the processing page
- [x] Raw vs corrected comparison view
- [x] Session-scoped history with localStorage persistence
- [x] `prefers-reduced-motion` respected, dark cinematic theme

### In progress

- [ ] Correction U-Net training + integration (see [`DOCS/STATUS.md`](./DOCS/STATUS.md) §A2)
- [ ] Backend API service (FastAPI) with job orchestration (see §A3)
- [ ] Real artifact exports (GLB, GeoTIFF, PDF) from backend (see §A4)

### Future / stretch

- [ ] Batch upload
- [ ] User accounts + multi-session history
- [ ] Light theme
- [ ] PWA / offline support
- [ ] E2E tests (Playwright)
- [ ] Vercel deployment

---

## License

This project is built for the **Smart India Hackathon 2026** (Problem 175). All rights reserved by the SIH 175 team unless explicitly stated otherwise.

The third-party models and datasets used retain their original licenses:

- **Depth Anything v2** — see the Depth Anything team's license terms
- **ISPRS Vaihingen / Potsdam** — free for scientific use with attribution
- **DFC2019** — open benchmark
- **NASA Visible Earth (Blue Marble)** — public domain
- **Inter / JetBrains Mono fonts** — SIL Open Font License

---

<p align="center">
  <sub>Built for SIH 175 · Dark cinematic · Viridis-only colormaps · No purple gradients · 2026</sub>
</p>