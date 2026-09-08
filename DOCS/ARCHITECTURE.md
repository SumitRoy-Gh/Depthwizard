# DepthWizard — Architecture

**Project:** SIH Problem Statement 26175 — Single-View Height Estimation & 3D Flythrough ("DepthWizard")
**Issued by:** ISRO / Department of Space · Category: Software · Theme: Disaster Management
**Status:** v2.0 — synced with `DOCS/DepthWizard_Technical_Documentation.docx` (corrected workflow, evidence-labeled)
**Supersedes:** Draft v1.0 (frozen-DAv2 + Correction U-Net design — retired, see §3.4)

---

## 1. System Overview

The system converts a single-view optical image into an elevation product and an interactive 3D flythrough. Two input regimes are supported end-to-end:

- **Non-georeferenced** (PNG/JPG) → relative DSM (**rDSM**) — no metric claim is made.
- **Georeferenced** (GeoTIFF with CRS + geotransform) → absolute metric DSM, calibrated against an external reference (SRTM/Copernicus DEM or GCPs), with a DEM cross-check confidence flag.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Browser (Frontend)                             │
│                                                                         │
│   ┌──────────────┐  ┌──────────────────┐  ┌──────────────────────────┐  │
│   │  Next.js App │  │   TanStack Query │  │   Three.js (R3F)         │  │
│   │  Shell + UI  │◄►│   Data Layer     │  │   3D Renderer            │  │
│   │  (Routing,   │  │  (polling jobs,  │  │  (flythrough, tiled      │  │
│   │   Layout)    │  │   artifacts)     │  │   LOD mesh, heightmap)   │  │
│   └──────┬───────┘  └────────┬─────────┘  └────────────┬─────────────┘  │
│          │      ┌────────────▼─────────────┐            │                │
│          │      │   Zustand UI Store       │            │                │
│          └─────►│   (view prefs, scene     │◄───────────┘                │
│                 │    state, history)       │                             │
│                 └──────────────────────────┘                             │
│   Landing route renders in a LIGHT minimal theme; app pages (processing  │
│   / results) remain dark cinematic. Tokens are CSS-variable driven.      │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │  REST / JSON  (multipart upload + poll)
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    Backend / ML Service (Python)                        │
│        Canonical 8-stage workflow (technical documentation §21)         │
│                                                                         │
│   S1 Input & auto-detection    rasterio/GDAL parse → CRS, transform,    │
│                                GSD, RPC. Geo reference never discarded. │
│   S2 Preprocessing             preprocess/stages/ 7-stage engine        │
│                                (radiometric → mask → denoise → CLAHE →  │
│                                resolution → tiling → normalize).        │
│                                Cloud-masked regions retained as flag.   │
│   S3 Fine-tuned depth          DINOv2 encoder + DPT decoder (DAv2 init),│
│      backbone                  RPC-aware pseudo-depth supervision       │
│                                (Sat3R method) → relative depth d̂.       │
│   S4 BRANCH (fusion point)     4a non-georef: d̂ is the product (rDSM).  │
│                                4b georef: semantic region segmentation  │
│                                → per-region RANSAC (a_c, b_c) vs        │
│                                SRTM/Copernicus DEM or GCPs → absolute ẑ;│
│                                DEM cross-check → confidence flag.       │
│   S5 Bias-aware refinement     Classification-regression, adaptive bins │
│                                + head-tail cut (HTC-DC Net method) —    │
│                                fixes long-tail height underestimation.  │
│   S6 DSM & products            Outlier removal, smoothing, gap fill →   │
│                                DSM, nDSM, slope, hillshade, confidence. │
│   S7 3D flythrough assets      Tiled/LOD heightmap-to-mesh; RGB texture │
│                                projection; LOD swap by camera distance. │
│   S8 Evaluation / feedback     RMSE/MAE/correlation vs LiDAR, by        │
│                                terrain type and region class.           │
│                                                                         │
│   Job Orchestrator: per-stage status events + artifacts                 │
│   Artifacts: DSM GeoTIFF · nDSM/slope/hillshade · GLB/OBJ mesh ·        │
│   heightmap PNG (viridis) · confidence map · JSON metadata              │
└─────────────────────────────────────────────────────────────────────────┘
                                     ▲
                                     │  /ingest, /jobs/{id}, /jobs/{id}/status,
                                     │  /jobs/{id}/artifacts, /jobs/{id}/download/*
                                     │
                                  [Client]
```

**Novelty statement (mandatory, carried from the technical documentation):** no new model architecture, loss function, or training algorithm is proposed. The backbone, the fine-tuning strategy, RPC-aware pseudo-depth supervision, and classification-regression correction are adopted from published work. Our contribution is their integration, the georef/non-georef auto-routing logic, and the interactive visualization/deployment layer.

---

## 2. Frontend Architecture

### 2.1 Tech Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| Framework | **Next.js 14 (App Router) + React 18** | File routing, RSC for static `/about`, fast HMR |
| Language | **TypeScript (strict)** | Type safety against backend contracts |
| 3D Engine | **Three.js + @react-three/fiber + drei + postprocessing** | Declarative scene graph; LOD terrain + flythrough |
| Animation | **Framer Motion** | Section reveals, micro-interactions, layout animations |
| Maps | **MapLibre GL JS** | Open-source, no API key (demo-safe), WebGL-rendered |
| Styling | **Tailwind CSS + shadcn/ui (Radix primitives)** | Utility-first + accessible primitives; token-driven theming |
| Icons | **lucide-react** | Consistent, tree-shakable, free |
| Server State | **TanStack Query (React Query)** | Polling, caching, retry — built for our exact use case |
| Client State | **Zustand** | Tiny, no boilerplate, perfect for UI prefs |
| Colormaps | **chroma.js** | Viridis/terrain sampling, perceptually uniform |
| Geo Preview | **geotiff.js** | Read embedded metadata client-side before upload |
| Theming | **CSS-variable tokens + route-scoped `.theme-light`** | Landing = light minimal; app pages = dark cinematic; no theme flash |
| Deploy | **Vercel** | Zero-config Next.js hosting, edge CDN |

### 2.2 Design Language (v2)

- **Landing page** — light, minimalist, professional: paper-white background, ink text, deep-teal accent, hairline borders, dot-grid texture, domino section reveals (fade + 24px rise on scroll into view), staggered card cascades, terminal-style pipeline log with copy affordance, codeblock CTA. Inspired by Linear/Odysseus-style restraint. **No purple gradients, no rainbow heatmaps, no globe on the landing route.**
- **App pages (processing/results/history/about/settings)** — dark cinematic stage retained for the 2D/3D viewers where height data glows.
- Tokens live in `globals.css` as RGB-triplet CSS variables; Tailwind consumes them via `<alpha-value>`; the landing route wraps the shell in `.theme-light`, which re-maps the variables — components themselves stay theme-agnostic.

### 2.3 Directory Structure

```
frontend/
├── app/                                # Next.js App Router
│   ├── layout.tsx                      # Root layout (providers, header/footer)
│   ├── page.tsx                        # Landing (light theme, upload studio)
│   ├── processing/[jobId]/page.tsx
│   ├── results/[jobId]/page.tsx
│   ├── results/[jobId]/compare/page.tsx
│   ├── history/page.tsx
│   ├── about/page.tsx
│   ├── settings/page.tsx
│   └── globals.css                     # Tokens (RGB triplets) + .theme-light scope
├── components/
│   ├── three/                          # Three.js / R3F (results route only)
│   │   ├── FlythroughViewer.tsx        # Tiled/LOD mesh viewer + camera path
│   │   └── ...
│   ├── shared/                         # Header, Footer, Motion primitives, Pill
│   ├── upload/                         # DropZone, SampleTiles, AdvancedOptions
│   ├── processing/                     # StageStepper, thumbnails
│   └── results/                        # MapPanel, DownloadMenu, MetadataStrip
├── lib/                                # jobs.ts (mock/real swap), colormap, cn
├── store/                              # Zustand: ui-store, history-store
└── types/api.ts                        # Contracts mirrored from backend OpenAPI
```

### 2.4 Rendering Rules

- Landing route: zero WebGL — CSS-only backdrop (dot grid + soft radial tints), Framer Motion reveals. Three.js chunk is **never** pulled on `/`.
- `/processing` and `/results`: lazy-load Three.js only there.
- Heightmap mesh: max 1024² vertices client-side; tiled/LOD mesh (S7) is the deployed geometry path; full-res delivered only as download.

### 2.5 Data Flow

1. User drops file → client-side validation (extension/size; geotiff.js peek for badge).
2. `POST /ingest` (multipart) → returns `{ jobId }`.
3. Navigate to `/processing/:jobId`.
4. `useJobStatus(jobId)` polls `/jobs/:id/status` every 1.5s with React Query.
5. Each completed stage triggers a thumbnail refresh via signed URL on the stage artifact.
6. On `status === "complete"` → navigate to `/results/:jobId`.
7. Results page fetches final artifacts once (mesh, DSM products, metadata, confidence).

### 2.6 State Boundaries

| State type | Tool | Why |
|---|---|---|
| Server (jobs, results) | React Query | Caching, polling, retry built-in |
| UI prefs (exaggeration, opacity, colormap) | Zustand + `localStorage` | Survives reload, no server roundtrip |
| Session history | Zustand `persist` (localStorage) | Session-scoped, no server user model |
| Animation state | Framer Motion / R3F internals | Don't fight the renderers |

---

## 3. Backend / ML Architecture

### 3.1 Module Layout

```
preprocessing/                          # Shipped, 94-test-covered (S2 of canonical workflow)
├── stages/
│   ├── radiometric_correction.py       # percentile stretch + DAv2 RGB proxy (IR-R-G → R-G-G)
│   ├── cloud_shadow_masking.py         # boolean valid_mask (nodata + luminance + spectral)
│   ├── noise_reduction.py              # bilateral (imagery) + masked median (DSM)
│   ├── contrast_enhancement.py         # CLAHE 8×8, clip=2.0
│   ├── resolution_handling.py          # GSD resample (bilinear / NN)
│   ├── tiling.py / large_image_tiling.py  # 512² patches + cosine-window stitching
│   └── data_normalisation.py           # Z-score + per-patch scale (stats.json)
├── ingest/
│   ├── training.py                     # paired imagery+DSM loader
│   └── inference.py                    # auto-detect .tif/.png/.jpg + meta (CRS/GSD/RPC)
├── pipelines/
│   ├── training.py                     # process_scene() — full stage chain
│   └── inference.py                    # preprocess_for_inference()
└── tests/                              # test_all.py (94) + real-raster harness

ml/                                     # S3–S5 (owner: ML track) — planned layout
├── backbone/                           # DINOv2 + DPT (Depth Anything V2 init)
│   ├── finetune.py                     # Sat3R-style RPC-aware pseudo-depth supervision
│   └── loss.py                         # SiLog or L1 vs d_rpc
├── calibration/                        # S4b (georeferenced branch)
│   ├── segment.py                      # land-cover/structure segmentation (off-the-shelf)
│   ├── dem_fetch.py                    # SRTM / Copernicus DEM retrieval + alignment
│   └── ransac_fit.py                   # per-region scale/shift (a_c, b_c) + DEM cross-check
├── refine/                             # S5 bias-aware refinement
│   └── htc_head.py                     # adaptive bins + head-tail cut (HTC-DC Net method)
└── products/                           # S6 DSM post-processing + derived products
```

### 3.2 Corrected vs. Retired Design

| # | v1.0 (retired) | v2.0 (corrected) | Evidence / gap fixed |
|---|----------------|------------------|----------------------|
| G1 | Freeze DAv2, patch its output | **Fine-tune the depth backbone against satellite/RPC geometry** (Sat3R-style pseudo-depth supervision) | Monocular models generalize poorly to overhead views; published fix is RPC-aware fine-tuning |
| G2 | Single global affine calibration | **Region-aware per-class calibration** — segmentation → per-region RANSAC (a_c, b_c) vs reference DEM | One global scale-and-shift is not physically appropriate under off-nadir viewing geometry |
| G3 | Implicit regression | **Bias-aware refinement** — adaptive bins + head-tail cut (HTC-DC Net method) | Long-tailed height distribution makes naive regressors systematically underestimate buildings |
| G4 | SpaceNet / WorldStrat / LEVIR-NVS | **DFC2019 + ISPRS Vaihingen/Potsdam** | The original datasets contain no elevation ground truth |
| G5 | Single static mesh | **Tiled / LOD heightmap-to-mesh** | Full-res single mesh exceeds browser WebGL interactive frame budgets |

### 3.3 Model Layer (S3–S5 detail)

**Depth backbone (S3).** Encoder-decoder `f_θ` initialized from pretrained Depth Anything V2 (DINOv2 encoder + DPT decoder). Fine-tuning objective vs RPC-derived pseudo-depth `d_rpc` (Sat3R construction): `L(θ) = SiLog(d̂, d_rpc)` or `L(θ) = ‖d̂ − d_rpc‖₁`, updated by gradient descent.

**Geometry-aware calibration (S4b).** Scene partitioned by segmentation `s(x) ∈ {ground, building, vegetation}`. Per class `c`, RANSAC fits `z_c(x) = a_c·d̂(x) + b_c` against reference DEM elevation `z_ref(x)`; full-scene prediction `ẑ(x) = a_{s(x)}·d̂(x) + b_{s(x)}`. The DEM cross-check emits a confidence flag consumed by S6 and surfaced in the UI. Segmentation errors at class boundaries propagate locally into calibration error — accepted, made visible via the confidence map.

**Bias-aware refinement (S5).** Adaptive-bin classification-regression: the network predicts bin edges `b₀<…<b_N` + distribution `P(x,i)`; height is the expectation `h(x)=Σᵢ P(x,i)·c_i`. The head-tail cut re-weights supervision so rare tall ("tail") pixels are not swamped by near-zero ground ("head") pixels — this is what corrects the long-tail underestimation bias.

### 3.4 Stage Ordering Rationale (S2 preprocessing — locked)

| Order | Stage | Must-run-when |
|-------|-------|---------------|
| 1 | Radiometric | First — everything else needs uint8 normalized range |
| 2 | Cloud/Shadow | Before noise — filters need `valid_mask` |
| 3 | Noise | Before resolution — otherwise noise spreads on resample |
| 4 | CLAHE | After noise (don't amplify noise); before resolution (native pixel distribution) |
| 5 | Resolution | Before tiling — patches must represent uniform real-world footprint |
| 6 | Tiling | Before dataset normalization — stats are pooled across patches |
| 7 | Normalize | Last — produces zero-mean tensors for the model |

### 3.5 Job Orchestration

- Job state machine: `queued → running → (stage_completed)* → completed | failed`
- Each stage emits `{stage_id, status, artifact_url?, reason?}`; the S4 branch is explicit in the event stream (`s4a_relative` vs `s4b_calibrated`).
- Frontend polls `GET /jobs/:id/status` every 1.5s and rehydrates UI from the event stream.
- Stage artifacts (per-stage thumbnails) live behind short-lived signed URLs.

### 3.6 Backend Tech

| Concern | Choice |
|---------|--------|
| Runtime | Python ≥ 3.14 (per `pyproject.toml`), managed with uv |
| Core libs | numpy, opencv-python, rasterio, scipy, scikit-image |
| ML | PyTorch — DINOv2/DPT backbone (DAv2 init), off-the-shelf segmentation, RANSAC |
| External data | SRTM / Copernicus DEM tiles (fetched + co-registered at job time) |
| API | FastAPI (assumed) — typed contracts shared with frontend via `types/api.ts` |
| Tests | `preprocessing/tests/test_all.py` — 94 tests, all passing |

---

## 4. Cross-Cutting Concerns

### 4.1 Visual System

**Landing (light, minimal):**

```css
--bg-page:    #FAFAF9   /* paper */
--bg-alt:     #F4F4F1   /* alternating sections */
--bg-panel:   #FFFFFF
--border-hairline: rgba(20, 23, 28, 0.08)
--text-ink:   #14171C
--text-muted: #5C6470
--text-faint: #8A919E
--accent:     #0E7490   /* deep teal — AA contrast on paper */
--accent-soft:#14B8A6
--ok: #059669   --warn: #B45309   --bad: #DC2626
```

**App pages (dark, cinematic — unchanged):**

```css
--bg-void: #05060A   --bg-stage: #0B0E14   --bg-elevated: #11151F
--text-primary: #F4F6FA   --text-muted: #9AA3B2
--accent-cyan: #22D3EE   --accent-amber: #F59E0B
--accent-emerald: #10B981   --accent-rose: #F43F5E
```

Height colormaps: **viridis** (primary), **terrain** (secondary). Both perceptually uniform. No jet/rainbow. No purple gradients anywhere.

### 4.2 Motion Tokens

- `--ease-out-cubic: cubic-bezier(0.33, 1, 0.68, 1)`; `--ease-in-out-cubic: cubic-bezier(0.65, 0, 0.35, 1)`
- Section reveals: 600ms fade + 24px rise, fired once on viewport entry (domino style)
- Card cascades: 500ms, 50ms stagger
- Default UI: 240ms; camera moves: 1200ms; reduced-motion: ≤ 80ms cross-fades, no parallax, no autoplay camera path

### 4.3 Security & Privacy

- No PII collected; uploads scoped to a session id; browser-local history only
- Download URLs are short-lived signed URLs. No third-party tracking. No telemetry

### 4.4 Deployment

| Component | Target |
|-----------|--------|
| Frontend | Vercel (edge CDN) |
| Backend | GPU-backed container (Fly.io / RunPod / Modal — demo-time flexible) |
| DEM tiles | Cached server-side (SRTM/Copernicus), no client key needed |
| Env vars | `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_DEMO_MODE` |

### 4.5 Risks

| Risk | Mitigation |
|------|------------|
| GPU unavailable on demo | Pre-render demo results as cached fallback |
| 3D perf tanks on judge laptops | Tiled/LOD mesh (S7); DPR cap; auto-degrade to 30 fps |
| DEM fetch fails at job time | Cache tiles; degrade to relative product + explicit badge (never fake metric) |
| Segmentation misclassifies a region | Confidence map + DEM cross-check make the failure visible, not silent |
| MapLibre tile fetch fails | Fallback to canvas-only 2D view |
| Pipeline stage crashes on malformed input | Stage-level guards + named-failure UI state |