# DepthWizard — Architecture

**Project:** SIH175 — Single-View Height Estimation & 3D Flythrough
**Status:** Draft v1.0

---

## 1. System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Browser (Frontend)                             │
│                                                                         │
│   ┌──────────────┐  ┌──────────────────┐  ┌──────────────────────────┐  │
│   │  Next.js App │  │   TanStack Query │  │   Three.js (R3F)         │  │
│   │  Shell + UI  │◄►│   Data Layer     │  │   3D Renderer            │  │
│   │  (Routing,   │  │  (polling jobs,  │  │  (flythrough,            │  │
│   │   Layout)    │  │   artifacts)     │  │   Earth bg, particles)   │  │
│   └──────┬───────┘  └────────┬─────────┘  └────────────┬─────────────┘  │
│          │                   │                          │                │
│          │      ┌────────────▼─────────────┐            │                │
│          │      │   Zustand UI Store       │            │                │
│          └─────►│   (theme, view prefs,    │◄───────────┘                │
│                 │    scene state)          │                            │
│                 └──────────────────────────┘                            │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │  REST / JSON  (multipart upload + job status poll)
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       Backend (Python ML Service)                       │
│                                                                         │
│   ┌──────────────────────────────────────────────────────────────────┐ │
│   │  Ingest Layer                                                     │ │
│   │  ├─ preprocess/ingest/training.py     (imagery + DSM pairs)       │ │
│   │  └─ preprocess/ingest/inference.py    (auto-detect .tif/.png/.jpg)│ │
│   └──────────────────────────────────────────────────────────────────┘ │
│                                  │                                      │
│                                  ▼                                      │
│   ┌──────────────────────────────────────────────────────────────────┐ │
│   │  Preprocessing Stages (preprocess/stages/)                        │ │
│   │  ├─ 1. radiometric_correction.py   (percentile stretch + proxy)  │ │
│   │  ├─ 2. cloud_shadow_masking.py     (boolean valid_mask)          │ │
│   │  ├─ 3. noise_reduction.py          (bilateral + median)          │ │
│   │  ├─ 4. contrast_enhancement.py     (CLAHE 8×8)                   │ │
│   │  ├─ 5. resolution_handling.py      (GSD resample)                │ │
│   │  ├─ 6. tiling.py / large_image_tiling.py (512² + cosine)        │ │
│   │  └─ 7. data_normalisation.py       (Z-score + per-patch scale)   │ │
│   └──────────────────────────────────────────────────────────────────┘ │
│                                  │                                      │
│                                  ▼                                      │
│   ┌──────────────────────────────────────────────────────────────────┐ │
│   │  Model Layer                                                      │ │
│   │  ├─ DAv2 (frozen) ─────►  D_prior  (H, W) float32                │ │
│   │  └─ Correction U-Net ──►  H_pred   (H, W) float32 metric DSM       │ │
│   └──────────────────────────────────────────────────────────────────┘ │
│                                  │                                      │
│                                  ▼                                      │
│   ┌──────────────────────────────────────────────────────────────────┐ │
│   │  Job Orchestrator                                                  │ │
│   │  ├─ Status events (per-stage)                                      │ │
│   │  ├─ Stage artifacts (thumbnails for frontend)                     │ │
│   │  └─ Final artifacts: GLB mesh, PNG heightmap, GeoTIFF, PDF        │ │
│   └──────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                                     ▲
                                     │  /ingest, /jobs/{id}, /jobs/{id}/status,
                                     │  /jobs/{id}/artifacts, /jobs/{id}/download/*
                                     │
                                  [Client]
```

---

## 2. Frontend Architecture

### 2.1 Tech Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| Framework | **Next.js 14 (App Router) + React 18** | File routing, RSC for static `/about`, fast HMR |
| Language | **TypeScript (strict)** | Type safety against backend contracts |
| 3D Engine | **Three.js + @react-three/fiber + @react-three/drei + @react-three/postprocessing** | Declarative scene graph; mature GPU-effect ecosystem |
| Animation | **Framer Motion** | Page transitions, micro-interactions |
| Maps | **MapLibre GL JS** | Open-source, no API key (demo-safe), WebGL-rendered |
| Styling | **Tailwind CSS + shadcn/ui (Radix primitives)** | Utility-first + accessible primitives, fast bespoke look |
| Icons | **lucide-react** | Consistent, tree-shakable, free |
| Server State | **TanStack Query (React Query)** | Polling, caching, retry — built for our exact use case |
| Client State | **Zustand** | Tiny, no boilerplate, perfect for UI prefs |
| Forms | **React Hook Form + Zod** | Validation for advanced options |
| Colormaps | **chroma.js** | Viridis/terrain sampling, perceptually uniform |
| Geo Preview | **geotiff.js** | Read embedded metadata client-side before upload |
| Theme | **next-themes** | Theme infra (dark default; light deferred) |
| Lint/Format | **ESLint + Prettier** | Code quality |
| Deploy | **Vercel** | Zero-config Next.js hosting |

### 2.2 Directory Structure

```
frontend/
├── app/                                # Next.js App Router
│   ├── layout.tsx                      # Root layout (background globe, providers)
│   ├── page.tsx                        # Landing / Upload
│   ├── processing/[jobId]/page.tsx
│   ├── results/[jobId]/page.tsx
│   ├── results/[jobId]/compare/page.tsx
│   ├── history/page.tsx
│   ├── about/page.tsx
│   ├── settings/page.tsx
│   └── globals.css
├── components/
│   ├── three/                          # Three.js / R3F components
│   │   ├── EarthBackground.tsx         # Animated globe behind everything
│   │   ├── HeightMesh.tsx              # Extruded heightmap mesh
│   │   ├── FlythroughCamera.tsx        # Scripted cinematic path
│   │   ├── ParticleField.tsx           # Ambient star/dot background
│   │   └── PostFX.tsx                  # Bloom + vignette composer
│   ├── ui/                             # shadcn primitives + wrappers
│   ├── upload/
│   │   ├── DropZone.tsx
│   │   ├── PreviewCard.tsx
│   │   └── GeorefBadge.tsx
│   ├── processing/
│   │   ├── StageStepper.tsx
│   │   └── StageThumbnail.tsx
│   ├── results/
│   │   ├── TwoPanelLayout.tsx
│   │   ├── MapPanel.tsx
│   │   ├── FlythroughPanel.tsx
│   │   ├── MetadataStrip.tsx
│   │   └── DownloadMenu.tsx
│   ├── compare/
│   │   └── SliderCompare.tsx
│   ├── history/
│   │   └── ResultCard.tsx
│   └── shared/
│       ├── Header.tsx
│       ├── Footer.tsx
│       └── PageTransition.tsx
├── lib/
│   ├── api.ts                          # fetch wrappers
│   ├── jobs.ts                         # React Query hooks
│   ├── colormap.ts                     # viridis/terrain sampling
│   ├── geotiff-preview.ts              # client-side metadata peek
│   ├── history-store.ts                # localStorage session history
│   └── design-tokens.ts
├── store/
│   └── ui-store.ts                     # Zustand
├── public/
│   ├── sample-images/                  # 3 demo tiles
│   ├── textures/                       # earth-day.jpg, normal-map, etc.
│   └── fonts/
├── styles/
│   └── tokens.css
└── types/
    └── api.ts                          # shared types from backend
```

### 2.3 Three.js Integration Strategy
- **One persistent `<Canvas>` at the app root** — fixed full-viewport, `pointer-events: none` on idle layers.
- **Background globe** is a separate lower-DPR canvas; costs almost nothing per frame.
- **Scene composition** uses R3F's declarative scene graph; we never write imperative Three.js outside `<Canvas>`.
- Lazy-load Three.js chunk only when entering `/processing` or `/results`.

### 2.4 Performance Budget
- Render budget per frame: **16.6 ms**.
- Background globe: capped to 30 fps, throttled when tab is hidden.
- Main flythrough: 60 fps target, drops to 30 fps on integrated GPUs (DPR cap).
- Heightmap mesh: max 1024² vertices client-side; full-res delivered only as download.

### 2.5 Data Flow
1. User drops file → client-side validation (`lib/geotiff-preview.ts`).
2. `POST /ingest` (multipart) → returns `{ jobId }`.
3. Navigate to `/processing/:jobId`.
4. `useJobStatus(jobId)` polls `/jobs/:id/status` every 1.5s with React Query.
5. Each completed stage triggers a thumbnail refresh via signed URL on stage artifact.
6. On `status === "complete"` → navigate to `/results/:jobId`.
7. Results page fetches final artifacts (mesh, heightmap, JSON metadata) once.

### 2.6 State Boundaries
| State type | Tool | Why |
|---|---|---|
| Server (jobs, results) | React Query | Caching, polling, retry built-in |
| UI prefs (theme, exaggeration, opacity) | Zustand + `localStorage` | Survives reload, no server roundtrip |
| Form state | React Hook Form | Predictable, isolated |
| Animation state | Framer Motion / R3F internals | Don't fight the renderers |

---

## 3. Backend / ML Architecture

### 3.1 Pipeline Module Layout

```
preprocessing/
├── __init__.py
├── stages/                              # 7 stage implementations
│   ├── radiometric_correction.py        # 1. percentile stretch + DAv2 proxy
│   ├── cloud_shadow_masking.py          # 2. boolean valid_mask
│   ├── noise_reduction.py               # 3. bilateral + median
│   ├── contrast_enhancement.py          # 4. CLAHE
│   ├── resolution_handling.py           # 5. GSD resample (bilinear / NN)
│   ├── tiling.py                        # 6a. patch cropping (training)
│   ├── large_image_tiling.py            # 6b. windowed inference + cosine stitch
│   └── data_normalisation.py            # 7. Z-score + per-patch scale
├── ingest/
│   ├── training.py                      # paired imagery+DSM loader
│   └── inference.py                     # auto-detect .tif/.png/.jpg
├── pipelines/
│   ├── training.py                      # process_scene() — full 7-stage
│   └── inference.py                     # preprocess_for_inference() — 6-stage
└── tests/
    ├── test_all.py                      # 94-test runner
    ├── test_real_tif.py                 # real-image harness
    ├── make_synthetic_tif.py
    ├── test_ingest_pipeline.py
    └── test_pipeline_synthetic.py
```

### 3.2 Stage Pipeline (Inference Path — 6 stages)

| # | Stage | Function | Input → Output |
|---|-------|----------|----------------|
| 1 | Radiometric | `radiometric_correction_pipeline` | raw `(H,W,C)` → `{unet_input uint8, dav2_input RGB-proxy uint8}` |
| 2 | Masking | `compute_valid_mask` | uint8 → `valid_mask` `(H,W) bool` |
| 3 | Noise | `denoise_imagery` (bilateral) | uint8 → uint8 |
| 4 | CLAHE | `enhance_contrast` | uint8 → uint8 |
| 5 | Resolution | `resample_to_gsd` (bilinear / NN) | aligned to target GSD if known |
| 6 | Normalize | `normalize_image` (Z-score via training stats) | uint8 → float32 zero-mean |
| — | Model | DAv2 (frozen) + Correction U-Net | `D_prior` + `H_pred` |

The **training path** inserts DSM handling between stages 2 and 6 (`denoise_dsm`, per-patch depth Min-Max) and produces a `stats.json` artifact consumed at inference time.

### 3.3 Model Layer

**Depth Anything v2 (DAv2)** — frozen foundation model.
- Input: `dav2_input` `(H,W,3)` uint8 RGB proxy.
- Output: `D_prior` `(H,W)` float32 — uncalibrated relative depth.
- `eval()` mode + `torch.no_grad()`.

**Correction U-Net** — downstream model (per `DOCS/next-step.md`).
- Input: 4-channel tensor `[RGB, D_prior]` of shape `(4, H, W)`.
- Learns mapping $H_{\text{pred}} = a \cdot D_{\text{prior}} + b + R(I, D)$.
- Output: calibrated metric DSM `(H, W)`.

### 3.4 Stage Ordering Rationale (locked)

| Order | Stage | Must-run-when |
|-------|-------|---------------|
| 1 | Radiometric | First — everything else needs uint8 normalized range |
| 2 | Cloud/Shadow | Before noise — filters need `valid_mask` |
| 3 | Noise | Before resolution — otherwise noise spreads on resample |
| 4 | CLAHE | After noise (don't amplify noise); before resolution (operate on native pixel distribution) |
| 5 | Resolution | Before tiling — patches must represent uniform real-world footprint |
| 6 | Tiling | Before dataset normalization — stats are pooled across patches |
| 7 | Normalize | Last — produces zero-mean tensors for model |

### 3.5 Job Orchestration

- Job state machine: `queued → running → (stage_completed)* → completed | failed`
- Each stage emits a status event with `{stage_id, status, artifact_url?, reason?}`
- Frontend polls `GET /jobs/:id/status` every 1.5s and rehydrates UI from event stream.
- Stage artifacts (per-stage thumbnails) live behind signed URLs.

### 3.6 Backend Tech

| Concern | Choice |
|---------|--------|
| Runtime | Python 3.14 (per `pyproject.toml`) |
| Core libs | numpy, opencv-python, rasterio, scipy, scikit-image |
| ML | PyTorch (DAv2 + U-Net) |
| GPU | CUDA at inference time (demo) |
| API | FastAPI (assumed) — typed contracts shared with frontend via `types/api.ts` |
| Tests | `preprocessing/tests/test_all.py` — 94 tests |

---

## 4. Cross-Cutting Concerns

### 4.1 Visual System

```css
--bg-void:       #05060A
--bg-stage:      #0B0E14
--bg-elevated:   #11151F
--border-subtle: #1F2530
--text-primary:  #F4F6FA
--text-muted:    #9AA3B2
--accent-cyan:   #22D3EE
--accent-amber:  #F59E0B
--accent-emerald:#10B981
--accent-rose:   #F43F5E
```

Height colormaps: **viridis** (primary), **terrain** (secondary). Both perceptually uniform. No jet/rainbow.

### 4.2 Motion Tokens

- `--ease-out-cubic:  cubic-bezier(0.33, 1, 0.68, 1)`
- `--ease-in-out-cubic: cubic-bezier(0.65, 0, 0.35, 1)`
- Default UI: 240ms; camera moves: 1200ms; first-paint intros: 3000ms.

### 4.3 Security & Privacy
- No PII collected.
- Uploaded images scoped to a session id; cleared on browser data wipe.
- Download URLs are short-lived signed URLs.
- No third-party tracking.

### 4.4 Deployment

| Component | Target |
|-----------|--------|
| Frontend | Vercel (edge CDN) |
| Backend | GPU-backed container (Fly.io / RunPod / Modal — demo-time flexible) |
| Assets | Vercel CDN for frontend textures & sample images |
| Env vars | `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_DEMO_MODE` |

### 4.5 Risks

| Risk | Mitigation |
|------|------------|
| GPU unavailable on demo | Pre-render demo results as cached fallback |
| 3D perf tanks on judge laptops | DPR cap; auto-degrade to 30 fps |
| MapLibre tile fetch fails | Fallback to canvas-only 2D view |
| `preprocess_for_inference` crashes on malformed input | Stage-level guards + named-failure UI state |
| `prefers-reduced-motion` users get motion sickness | Disable cinematic path; shorten transitions |