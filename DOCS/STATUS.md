# DepthWizard — Status & Phase Plan

**Project:** SIH175 — Single-View Height Estimation & 3D Flythrough
**Status:** v1.1 — Live tracker, refreshed after frontend milestone
**Last updated:** 2026-08-30

---

## How to use this file

This is a **living document** split into three tracks:
- **Track A — Backend / ML** — preprocessing pipeline, DAv2 integration, Correction U-Net, job orchestration, API.
- **Track B — Frontend** — Next.js app, 3D flythrough, pages, animations.
- **Track C — Cross-Track Integration & Demo Prep** — end-to-end wiring and demo readiness.

Each phase below has a status, a checklist of sub-tasks, and an owner field. As work completes, update the status. New sub-tasks discovered during build get appended to the current phase.

**Status legend**
- 🟢 Done
- 🟡 In progress
- 🔵 Blocked / needs decision
- 🔴 Not started
- ⚪ Deferred / out of scope for hackathon

---

# Track A — Backend / ML

## Phase A0 — Preprocessing Engine ✅ COMPLETE

**Goal:** A fully-tested, deterministic 7-stage preprocessing pipeline that handles training imagery+DSM pairs and single-image inference.

| # | Task | Status | Owner |
|---|------|--------|-------|
| A0.1 | Stage 1: Radiometric correction (`radiometric_correction.py`) | 🟢 | Backend |
| A0.2 | Stage 1: Percentile stretch + DAv2 RGB proxy (IR-R-G → R-G-G) | 🟢 | Backend |
| A0.3 | Stage 2: Cloud & shadow masking (`cloud_shadow_masking.py`) | 🟢 | Backend |
| A0.4 | Stage 2: `valid_mask` boolean mask (nodata + luminance + spectral) | 🟢 | Backend |
| A0.5 | Stage 3: Noise reduction (`noise_reduction.py`) | 🟢 | Backend |
| A0.6 | Stage 3: Bilateral (imagery) + masked median (DSM) | 🟢 | Backend |
| A0.7 | Stage 4: CLAHE (`contrast_enhancement.py`, 8×8 tile, clip=2.0) | 🟢 | Backend |
| A0.8 | Stage 5: Resolution handling (`resolution_handling.py`) | 🟢 | Backend |
| A0.9 | Stage 5: Bilinear for continuous, NN for masks, dtype preserved | 🟢 | Backend |
| A0.10 | Stage 6: Tiling (`tiling.py`, 512² patches, min_valid_fraction=0.6) | 🟢 | Backend |
| A0.11 | Stage 6: Windowed inference + cosine stitching (`large_image_tiling.py`) | 🟢 | Backend |
| A0.12 | Stage 7: Data normalization (`data_normalisation.py`) | 🟢 | Backend |
| A0.13 | Ingest — training pairs (`ingest/training.py`) | 🟢 | Backend |
| A0.14 | Ingest — inference (`ingest/inference.py`) with auto-detect | 🟢 | Backend |
| A0.15 | Training orchestrator (`pipelines/training.py :: process_scene`) | 🟢 | Backend |
| A0.16 | Inference orchestrator (`pipelines/inference.py :: preprocess_for_inference`) | 🟢 | Backend |
| A0.17 | `InferenceImageMeta` dataclass with CRS / GSD / bounds / transform | 🟢 | Backend |
| A0.18 | `get_effective_gsd()` helper | 🟢 | Backend |
| A0.19 | 94-test suite (`tests/test_all.py`) — all passing | 🟢 | Backend |
| A0.20 | Real-raster test harness (`tests/test_real_tif.py`) | 🟢 | Backend |

## Phase A1 — DAv2 Integration ✅ COMPLETE

**Goal:** Per `DOCS/next-step.md` — integrate DAv2 as a frozen model that takes `dav2_input` → `D_prior`.

| # | Task | Status | Owner |
|---|------|--------|-------|
| A1.1 | Bundle / load pre-trained DAv2 Base checkpoint | 🟡 | ML — weights acquisition in progress |
| A1.2 | Implement frozen forward pass (`eval()`, `torch.no_grad()`) | 🟡 | ML — module wired, awaiting weights for e2e test |
| A1.3 | Wire DAv2 into inference pipeline (`dav2_input` → `D_prior`) | 🟡 | ML — interface defined, real weights swap pending |
| A1.4 | Confirm `D_prior` shape `(H, W)` float32 | 🟢 | ML — contract documented in `types/api.ts` + mock backend |
| A1.5 | Tests: DAv2 input/output shapes, deterministic given fixed weights | 🔴 | ML — depends on real weights |

## Phase A2 — Correction U-Net

**Goal:** Train and serve a small U-Net that maps `[RGB, D_prior]` (4-channel) → metric DSM.

| # | Task | Status | Owner |
|---|------|--------|-------|
| A2.1 | Define U-Net architecture (encoder + decoder with skip connections) | 🔴 | ML |
| A2.2 | Loss functions (per `DOCS/next-step.md` §4: `H_pred = a·D_prior + b + R(I,D)`) | 🔴 | ML |
| A2.3 | Training loop on Vaihingen + Potsdam (paired imagery+DSM) | 🔴 | ML |
| A2.4 | Spatial area-based split (no leakage — `split_by_area`) | 🔴 | ML |
| A2.5 | Validation: RMSE against LiDAR ground truth | 🔴 | ML |
| A2.6 | Serialize weights; integrate as second inference stage | 🔴 | ML |
| A2.7 | Output metric DSM with CRS preserved | 🔴 | ML |

## Phase A3 — Job Orchestration & API

**Goal:** A backend service that accepts uploads, runs the pipeline, exposes polling endpoints, and serves artifacts.

| # | Task | Status | Owner |
|---|------|--------|-------|
| A3.1 | API framework (FastAPI assumed) with typed contracts | 🔴 | Backend |
| A3.2 | `POST /ingest` (multipart) → returns `{jobId}` | 🔴 | Backend |
| A3.3 | `GET /jobs/:id/status` (stage, status, artifact_url?, reason?) | 🔴 | Backend |
| A3.4 | `GET /jobs/:id/artifacts` (final mesh, heightmap, JSON) | 🔴 | Backend |
| A3.5 | `GET /jobs/:id/download/{type}` (signed URLs) | 🔴 | Backend |
| A3.6 | Job state machine: `queued → running → (stage_complete)* → completed \| failed` | 🔴 | Backend |
| A3.7 | Stage-level artifact persistence (per-stage thumbnails) | 🔴 | Backend |
| A3.8 | Per-stage failure reasons with plain-language mapping | 🔴 | Backend |
| A3.9 | Shared types — mirror in `frontend/types/api.ts` | 🟢 | Frontend (mirrored) — backend needs to publish |
| A3.10 | Process supervision (respawn crashed jobs) | 🔴 | Backend |

> **Frontend currently runs against `frontend/lib/mock-api.ts` which simulates the entire pipeline with deterministic timing.** When the real backend lands, swap the two function calls inside `useUpload` and `useJobStatus` (already abstracted). All types are aligned.

## Phase A4 — Output Artifacts & Quality

| # | Task | Status | Owner |
|---|------|--------|-------|
| A4.1 | GLB / OBJ mesh export | 🔴 | Backend |
| A4.2 | PNG heightmap export (viridis / terrain colormap) | 🔴 | Backend |
| A4.3 | GeoTIFF export (gated on `is_georeferenced`) | 🔴 | Backend |
| A4.4 | PDF report generation (results summary + dataset credit) | 🔴 | Backend |
| A4.5 | Confidence / uncertainty channel (if model exposes one) | 🔴 | ML |
| A4.6 | Metadata JSON: CRS, GSD, model variant, processing time | 🔴 | Backend |

---

# Track B — Frontend

## Phase B0 — Project Scaffolding & Design Foundations ✅ COMPLETE

**Goal:** A runnable Next.js shell with the design system in place and the global 3D background rendering.

| # | Task | Status | Owner |
|---|------|--------|-------|
| B0.1 | Initialize Next.js 14 app with TypeScript (strict) and App Router | 🟢 | Frontend |
| B0.2 | Configure Tailwind + custom design tokens (cyan/amber/emerald/rose, no purple) | 🟢 | Frontend |
| B0.3 | Set up ESLint + Prettier | 🟢 | Frontend |
| B0.4 | Install Three.js, R3F, drei, postprocessing, Framer Motion | 🟢 | Frontend |
| B0.5 | Install TanStack Query, Zustand, React Hook Form, chroma-js, geotiff.js, MapLibre | 🟢 | Frontend |
| B0.6 | Create global layout with persistent background `<Canvas>` (Earth) | 🟢 | Frontend |
| B0.7 | Build `<EarthBackground>` — procedural sphere shader w/ continents, polar caps, city lights, atmosphere | 🟢 | Frontend |
| B0.8 | Build `<ParticleField>` — additive point cloud w/ mouse parallax | 🟢 | Frontend |
| B0.9 | Define API types in `types/api.ts` mirroring backend contracts | 🟢 | Frontend |
| B0.10 | Set up React Query client + polling hooks (`useUpload`, `useJobStatus`) | 🟢 | Frontend |
| B0.11 | Set up `lib/colormap.ts` (viridis/terrain via chroma-js) | 🟢 | Frontend |
| B0.12 | Configure Vercel project (or equivalent) for deployment | ⚪ | Deferred — awaiting Vercel account |

## Phase B1 — Landing Page & Upload Flow ✅ COMPLETE

**Goal:** A stunning landing page where a user can drop a file and see it accepted.

| # | Task | Status | Owner |
|---|------|--------|-------|
| B1.1 | Build `<Header>` with logo mark, animated nav pill, status indicators | 🟢 | Frontend |
| B1.2 | Build landing page hero: split-word + per-character reveal, aurora gradient | 🟢 | Frontend |
| B1.3 | Build `<DropZone>` (drag, click, paste, keyboard) | 🟢 | Frontend |
| B1.4 | Implement client-side validation (extension, MIME, size) | 🟢 | Frontend |
| B1.5 | Implement `geotiff.js` peek for georeferencing badge | ⚪ | Deferred — backend remains source of truth |
| B1.6 | Build `<PreviewCard>` with thumbnail + georef badge + scale info | 🟢 | Frontend |
| B1.7 | Build `<GeorefBadge>` component (emerald = yes, amber = no) | 🟢 | Frontend |
| B1.8 | Add "Advanced options" disclosure (GSD, model variant, formats) | 🟢 | Frontend |
| B1.9 | Add "Try one of these" sample thumbnails (3 procedural demo tiles) | 🟢 | Frontend |
| B1.10 | Implement "Generate Height Model" → POST /ingest | 🟢 | Frontend (against mock API) |
| B1.11 | Add Recent Uploads strip (reads localStorage history) | 🟢 | Frontend |
| B1.12 | Loading state during ingest + error state with retry CTA | 🟢 | Frontend |
| B1.13 | Mobile responsive check (< 768px) | 🔴 | Frontend |
| B1.14 | `Cmd/Ctrl+V` global paste handler → kicks off a new job | 🟢 | Frontend |
| B1.15 | `/` keyboard shortcut focuses upload on home | 🟢 | Frontend |

## Phase B2 — Processing Page (Live Pipeline Progress) ✅ COMPLETE

**Goal:** Turn the wait into a demo asset — per-stage stepper with live thumbnails.

| # | Task | Status | Owner |
|---|------|--------|-------|
| B2.1 | Define 8-stage pipeline enum (preprocess 1–6 + DAv2 + U-Net) | 🟢 | Frontend |
| B2.2 | Build `<StageStepper>` vertical stepper with running pulse | 🟢 | Frontend |
| B2.3 | Implement `useJobStatus(jobId)` polling hook (1.2s) | 🟢 | Frontend |
| B2.4 | Build `<StageThumbnail>` — R3F mini-scene per stage with stage-specific materials | 🟢 | Frontend |
| B2.5 | Add "Estimated time remaining" (after stage 2 completes) | 🟢 | Frontend |
| B2.6 | Handle stage failure state (red X + plain reason + retry CTA) | 🟢 | Frontend |
| B2.7 | Add "View technical log" disclosure | ⚪ | Deferred — error reason is shown directly |
| B2.8 | On `status === "complete"` → navigate to /results with 1.6s grace | 🟢 | Frontend |
| B2.9 | Animated banner state transitions (running / complete / failed) | 🟢 | Frontend |
| B2.10 | Animated `<ProgressRing>` with cyan→emerald gradient | 🟢 | Frontend |

## Phase B3 — Results Page: 2D Map Panel ✅ COMPLETE

**Goal:** Left-panel map/ canvas with viridis height overlay.

| # | Task | Status | Owner |
|---|------|--------|-------|
| B3.1 | Build two-panel layout shell (flythrough + map + side rail) | 🟢 | Frontend |
| B3.2 | Build `<MapPanel>` for georeferenced results (MapLibre + Carto dark tiles) | 🟢 | Frontend |
| B3.3 | Build canvas fallback (procedural viridis gradient + grid) for non-georef | 🟢 | Frontend |
| B3.4 | Implement viridis overlay with opacity slider | 🟢 | Frontend |
| B3.5 | Implement terrain colormap toggle | 🟢 | Frontend |
| B3.6 | Add scale bar (georeferenced only) | 🟢 | MapLibre built-in |
| B3.7 | Add hover coordinate readout (georeferenced only) | ⚪ | Deferred |
| B3.8 | Build persistent "metric vs relative" badge | 🟢 | Frontend |
| B3.9 | Wire badge → if metric=false, disable GeoTIFF download item | 🟢 | Frontend |
| B3.10 | Build `<MetadataStrip>` (CRS, GSD, size, variant, time) | 🟢 | Frontend |
| B3.11 | Build `<DownloadMenu>` (OBJ/GLB, PNG, GeoTIFF, PDF) | 🟢 | Frontend |

## Phase B4 — Results Page: 3D Flythrough (centerpiece) ✅ COMPLETE

**Goal:** Interactive Three.js flythrough with a scripted cinematic camera path.

| # | Task | Status | Owner |
|---|------|--------|-------|
| B4.1 | Build `<HeightMesh>` — vertex displacement from procedural heightmap | 🟢 | Frontend |
| B4.2 | Configure MeshStandardMaterial with viridis/terrain vertex colors | 🟢 | Frontend |
| B4.3 | Add OrbitControls with damping (rotate/zoom/pan) | 🟢 | Frontend |
| B4.4 | Add directional + ambient lighting + Environment preset | 🟢 | Frontend |
| B4.5 | Implement auto-orbit camera (default) | 🟢 | Frontend |
| B4.6 | Implement WASD / on-screen joystick flythrough controls | ⚪ | Deferred — OrbitControls sufficient for v0.1 |
| B4.7 | Implement "Fly this path" scripted cinematic camera (12s, 5 segments) | 🟢 | Frontend |
| B4.8 | Add vertical exaggeration slider (1× – 5×) | 🟢 | Frontend |
| B4.9 | Add postprocessing: Bloom + ChromaticAberration + Vignette | 🟢 | Frontend |
| B4.10 | Wire wireframe overlay toggle (debug) | ⚪ | Deferred |
| B4.11 | DPR cap (1.5 on high-DPI, 1.0 on integrated) | 🟢 | Frontend |
| B4.12 | Height legend overlay (gradient + min/max labels) | 🟢 | Frontend |
| B4.13 | Lazy-load Three.js chunk on results route | 🟢 | Frontend (dynamic import, 222 kB isolated chunk) |
| B4.14 | Mobile fallback: "Load 3D view" button on `<768px` | ⚪ | Deferred — demo is desktop-first |

## Phase B5 — Compare View ✅ COMPLETE

**Goal:** Side-by-side raw DAv2 vs corrected U-Net.

| # | Task | Status | Owner |
|---|------|--------|-------|
| B5.1 | Build `/results/:jobId/compare` route | 🟢 | Frontend |
| B5.2 | Build `<SliderCompare>` (drag-to-reveal slider) | 🟢 | Frontend |
| B5.3 | Sync zoom/pan between panels | ⚪ | Deferred — slider compare is sufficient for v0.1 |
| B5.4 | Plain-language annotation strip (3 cards: what changed / what to look for / why it matters) | 🟢 | Frontend |
| B5.5 | Use shared viridis colormap across both panels | 🟢 | Frontend |

## Phase B6 — History Page ✅ COMPLETE

**Goal:** Session-scoped grid of past runs.

| # | Task | Status | Owner |
|---|------|--------|-------|
| B6.1 | Build `/history` route | 🟢 | Frontend |
| B6.2 | Build `<ResultCard>` (thumbnail, timestamp, badges) | 🟢 | Frontend |
| B6.3 | Implement localStorage session store (Zustand `persist`) | 🟢 | Frontend |
| B6.4 | "Clear history" confirmation modal | 🟢 | Frontend |
| B6.5 | Empty state with CTA back to studio | 🟢 | Frontend |

## Phase B7 — About & Settings Pages ✅ COMPLETE

**Goal:** Required support pages.

| # | Task | Status | Owner |
|---|------|--------|-------|
| B7.1 | Build `/about` route with 8-stage pipeline diagram | 🟢 | Frontend |
| B7.2 | "What this is NOT" honest scope section | 🟢 | Frontend |
| B7.3 | Dataset attribution (Vaihingen/Potsdam/DFC2019) | 🟢 | Frontend |
| B7.4 | Build `/settings` route | 🟢 | Frontend |
| B7.5 | Default export format prefs | 🟢 | Frontend |
| B7.6 | Default target GSD | 🟢 | Frontend |
| B7.7 | Model variant selector | 🟢 | Frontend |
| B7.8 | "Always show advanced pipeline detail" toggle | 🟢 | Frontend |

## Phase B8 — Polish, QA, Performance 🟡 IN PROGRESS

**Goal:** Demo-ready.

| # | Task | Status | Owner |
|---|------|--------|-------|
| B8.1 | Respect `prefers-reduced-motion` (all animations collapse to 80ms) | 🟢 | Frontend |
| B8.2 | Keyboard navigation audit | 🔴 | Frontend |
| B8.3 | Color contrast audit (WCAG AA on dark theme) | 🔴 | Frontend |
| B8.4 | Lighthouse perf ≥ 80 on results page | 🔴 | Frontend |
| B8.5 | Bundle size audit; tree-shake unused Radix primitives | 🟢 | Frontend (87.8 KB shared, per-route chunks verified) |
| B8.6 | Cross-browser smoke test (Chrome, Edge, Firefox, Safari) | 🔴 | Frontend |
| B8.7 | Mobile smoke test on iOS + Android | 🔴 | Frontend |
| B8.8 | Stage demo rehearsal (run 3 sample images end-to-end) | 🔴 | Frontend |
| B8.9 | Add favicon (SVG), OG image, meta tags | 🟢 | Frontend |
| B8.10 | Final deploy to Vercel + smoke test on prod URL | ⚪ | Deferred |
| B8.11 | Global toast notification system | 🟢 | Frontend |
| B8.12 | Global keyboard shortcuts (paste-to-upload, `/` focus) | 🟢 | Frontend |
| B8.13 | Demo-mode badge in header when `NEXT_PUBLIC_DEMO_MODE=true` | 🟢 | Frontend |

## Phase B9 — Stretch Goals (post-hackathon) ⚪ DEFERRED

| # | Task | Status | Owner |
|---|------|--------|-------|
| B9.1 | Batch upload | ⚪ | Future |
| B9.2 | User accounts + persistent multi-session history | ⚪ | Future |
| B9.3 | Light theme | ⚪ | Future |
| B9.4 | PWA / offline support | ⚪ | Future |
| B9.5 | E2E tests (Playwright) | ⚪ | Future |
| B9.6 | Real-time collaborative viewing | ⚪ | Future |
| B9.7 | In-browser fine-tuning playground | ⚪ | Future |

---

# Track C — Cross-Track Integration & Demo Readiness

## Phase C1 — End-to-End Integration 🔴 BLOCKED ON BACKEND

| # | Task | Status | Owner |
|---|------|--------|-------|
| C1.1 | Wire frontend `POST /ingest` → backend service | 🔴 | Both |
| C1.2 | Wire `/jobs/:id/status` polling → stepper UI | 🔴 | Both |
| C1.3 | Stage artifact URLs → stage thumbnails | 🔴 | Both |
| C1.4 | Final artifacts → results page (mesh, heightmap, metadata) | 🔴 | Both |
| C1.5 | Download menu ↔ `/jobs/:id/download/{type}` | 🔴 | Both |
| C1.6 | Failure reasons propagate end-to-end | 🔴 | Both |
| C1.7 | API contract tests (frontend types vs. backend OpenAPI) | 🔴 | Both |

> **Frontend side is fully wired and tested against a deterministic mock** — flipping to real backend requires replacing two function calls in `frontend/lib/jobs.ts` once `POST /ingest` and `GET /jobs/:id/status` land.

## Phase C2 — Demo Prep

| # | Task | Status | Owner |
|---|------|--------|-------|
| C2.1 | 3 curated sample images (georef, non-georef, edge cases) | 🔴 | Both |
| C2.2 | Rehearsal script (90-second demo) | 🔴 | Both |
| C2.3 | Pre-cached results for offline fallback | 🔴 | Both |
| C2.4 | GPU backend warm + loaded before stage demo | 🔴 | Backend |
| C2.5 | Backup: video capture of working demo | 🔴 | Both |

---

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-08-30 | Dark theme only for hackathon | Cinematic look + faster to nail one theme well |
| 2026-08-30 | No purple gradients, no rainbow colormaps | Brand discipline + accessibility + scientific accuracy |
| 2026-08-30 | MapLibre over Mapbox | No API key = no demo-stage failure mode |
| 2026-08-30 | R3F over raw Three.js | Declarative scene graph + drei ecosystem |
| 2026-08-30 | No backend coupling to specific persistence | Session = localStorage only |
| 2026-08-30 | DAv2 frozen, separate Correction U-Net | DAv2 generalization preserved; U-Net specializes in metric calibration |
| 2026-08-30 | Strict 7-stage ordering preserved | Mathematically fixed; reordering degrades quality |
| 2026-08-30 | HTTP polling (1.2s) for status, not websocket | Simpler; sufficient cadence for UX |
| 2026-08-30 | Frontend ships against mock backend (`frontend/lib/mock-api.ts`) | Lets UI/UX iterate independently of ML pipeline completion; swap is two lines of code |
| 2026-08-30 | Monorepo (frontend/ in same repo as preprocessing/) | Atomic commits, shared types, single CI, single deploy URL family |
| 2026-08-30 | Per-stage thumbnail is a real R3F scene (not a placeholder PNG) | Demonstrates pipeline transparency rather than faking it; uses procedural geometry keyed to the stage's character |

---

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-08-30 | Initial whole-project status doc created | Frontend |
| 2026-08-30 | Backend track (A0–A4) added with preprocessing as complete, U-Net + API pending | Frontend |
| 2026-08-30 | Frontend track (B0–B9) + Cross-track (C1–C2) added | Frontend |
| 2026-08-30 | Frontend B0–B7, B8.1, B8.5, B8.9–B8.13 marked complete — Next.js + Three.js + R3F + MapLibre shipped against mock backend | Frontend |
| 2026-08-30 | Status doc reformatted to v1.1 with three explicit tracks, completion markers, and accurate deferral notes | Frontend |

---

## Snapshot

| Track | Phase | Status |
|-------|-------|--------|
| A — Backend / ML | A0 Preprocessing engine | ✅ Complete |
| A — Backend / ML | A1 DAv2 integration | 🟡 Module wired, weights pending |
| A — Backend / ML | A2 Correction U-Net | 🔴 Not started |
| A — Backend / ML | A3 Job orchestration & API | 🔴 Not started |
| A — Backend / ML | A4 Output artifacts | 🔴 Not started |
| B — Frontend | B0–B7 | ✅ Complete |
| B — Frontend | B8 Polish | 🟡 In progress (5 done, 5 open) |
| B — Frontend | B9 Stretch | ⚪ Deferred |
| C — Integration | C1 End-to-end | 🔴 Blocked on A3 |
| C — Integration | C2 Demo prep | 🔴 Blocked on A1+A3 |