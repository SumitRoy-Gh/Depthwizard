# DepthWizard — Product Requirements Document (PRD)

**Project:** SIH175 — Single-View Height Estimation & 3D Flythrough ("DepthWizard")
**Status:** Draft v1.0 — Hackathon Build
**Owners:** Backend / ML track + Frontend track

---

## 1. Vision

**DepthWizard** turns a single 2D overhead image into a fully-interactive 3D height model and an explorable 3D flythrough — in under two minutes, with no signup, no configuration, and no scientific white-knuckling.

The system serves two audiences that pull in different directions, and the product must serve both without compromising either:

1. **A hackathon judge in a 2-minute demo** — wants to be visually wowed, and to walk away believing the system *actually* does what it claims.
2. **A technical evaluator** — wants to inspect intermediate outputs (raw DAv2 depth vs. corrected U-Net output), confidence/uncertainty, and whether the result is metric (real-world scale) or relative-only.

The resolution is **simple mode by default, advanced panels behind a toggle** — the upload → result flow never forces a user through technical detail, but every technical detail is one click away for anyone who wants it.

**Visual language:** dark, cinematic, tactile, three-dimensional. A black-and-graphite stage where a luminous Earth-like data globe orbits in the background, where uploaded tiles of land rise out of the canvas as if extruded from light itself, and where every transition feels like a camera move, not a page load. **No purple gradients. No rainbow heatmaps. No stock dashboard chrome.**

---

## 2. Target Users & Use Cases

| Persona | Primary Goal | Success Signal |
|---|---|---|
| **Hackathon Judge (Demo Mode)** | Be impressed in 2 minutes | Uploads an image, watches a flythrough, says "wow" |
| **Technical Evaluator** | Validate the ML pipeline | Inspects raw vs corrected depth, downloads GeoTIFF, checks CRS |
| **Domain User (GIS / Remote Sensing)** | Use real outputs | Exports metric height map into their own GIS stack |
| **Casual Visitor** | Curious exploration | Drags an example, watches a flythrough, shares a screenshot |

---

## 3. Core Value Proposition

1. **Zero-friction input.** Drop one image → 3D result. No signup, no config, no plugin.
2. **Honest uncertainty.** Metric vs. relative heights are *visible*, never hidden.
3. **Awe-inspiring 3D.** A real flythrough, not a static colored map.
4. **Pipeline transparency.** Every preprocessing stage is observable, not a black box.

---

## 4. System Capabilities

### 4.1 What the system does
- Accepts a single overhead image (`.tif / .tiff / .png / .jpg / .jpeg`).
- Auto-detects georeferenced vs. non-georeferenced input.
- Runs a deterministic, fully-tested **7-stage preprocessing pipeline** (radiometric correction → cloud/shadow masking → noise reduction → CLAHE → resolution alignment → tiling/stitching → Z-score normalization).
- Runs **Depth Anything v2 (DAv2)** as a frozen foundation-model feature extractor to produce a relative prior depth map.
- (Downstream) Runs a **Correction U-Net** on the 4-channel input `[RGB, D_prior]` to map relative depth → absolute elevation (DSM) in metric units.
- Returns a 3D height mesh, a 2D heightmap with viridis colormap, raw-vs-corrected depth comparison, and downloadable artifacts (GeoTIFF / GLB / PNG / PDF).

### 4.2 What the system does NOT do (scope guardrails)
- No user accounts, no auth, no persistent multi-session storage beyond browser-local history.
- No batch upload (one image in, one result out).
- No in-browser model retraining or fine-tuning.
- No real-time collaborative viewing.
- No claims of sub-decimeter accuracy on arbitrary user photos — see honest scope section on `/about`.

---

## 5. Functional Requirements (cross-cutting)

### 5.1 Frontend (7 pages)
| Route | Purpose | P0? |
|---|---|---|
| `/` | Landing / Upload | ✅ |
| `/processing/:jobId` | Live 7-stage pipeline progress | ✅ |
| `/results/:jobId` | 2D map + 3D flythrough viewer | ✅ |
| `/results/:jobId/compare` | Raw DAv2 vs corrected U-Net | ✅ |
| `/history` | Session-scoped past runs | ✅ |
| `/about` | Model + architecture + dataset credits | ✅ |
| `/settings` | Advanced preferences | 🟡 (low priority) |

### 5.2 Frontend Features
- **F1.** Drag-and-drop upload with `.tif / .jpg / .png` support and client-side pre-checks.
- **F2.** Live pipeline progress with per-stage live thumbnails (7 stages).
- **F3.** 3D flythrough viewer — orbit camera, WASD/joystick navigation, scripted cinematic camera path.
- **F4.** 2D map view with viridis/terrain height overlay (MapLibre if georeferenced; canvas otherwise).
- **F5.** Persistent "metric vs. relative" badges.
- **F6.** Downloads: OBJ/GLB mesh, PNG heightmap, GeoTIFF (gated on metric), PDF report.
- **F7.** Raw vs corrected depth compare view.
- **F8.** Session-scoped history grid (localStorage).
- **F9.** About page with architecture diagram + dataset credits.
- **F10.** Global animated 3D Earth/globe background on landing page (Three.js).
- **F11.** Particle/dot-field background reactive to scroll/mouse.
- **F12.** Vertical exaggeration slider, opacity slider, coordinate readout (georef only).
- **F13.** Mobile fallback — auto-defer 3D load on small screens.
- **F14.** `prefers-reduced-motion` respected.

### 5.3 Backend / ML Capabilities
- **B1.** 7-stage preprocessing pipeline (training + inference variants).
- **B2.** `load_inference_image()` auto-detects GeoTIFF vs PNG/JPG, extracts CRS/GSD/bounds.
- **B3.** `preprocess_for_inference()` orchestrates stages 1–6 (no DSM) and returns `preprocessed`, `dav2_input`, `valid_mask`, `meta`.
- **B4.** `process_scene()` orchestrates stages 1–7 for training imagery+DSM pairs.
- **B5.** DAv2 frozen inference: produces `D_prior` `(H, W)` float32.
- **B6.** Correction U-Net: takes 4-channel `[RGB, D_prior]` → outputs calibrated metric DSM.
- **B7.** Job orchestration with status polling (`/jobs/:id/status`).
- **B8.** Download endpoints for artifacts (signed URLs).
- **B9.** Stage artifacts exposed for frontend thumbnails (per-stage previews).

### 5.4 Quality Requirements
- **Q1.** 94-test preprocessing suite must remain 100% green (no regressions).
- **Q2.** Backend cold-start (single image, no GSD resample) ≤ 60s on demo hardware.
- **Q3.** Results page Time-to-Interactive ≤ 2.5s.
- **Q4.** 3D flythrough ≥ 60fps on dedicated GPU; ≥ 30fps on integrated GPU.
- **Q5.** Georeferenced result preserves source CRS in downloads.
- **Q6.** No silent failures — every pipeline error has a named stage + plain reason + retry CTA.

---

## 6. UX & Design Principles

1. **Cinematic, not corporate.** Backgrounds are always in motion — Earth, starfield, or particle field. No static white pages.
2. **Dark by default.** Visual stage is near-black so height data and 3D elements glow.
3. **Color restraint.** Accents are calibrated: cyan (#22D3EE), amber (#F59E0B), emerald (#10B981), rose (#F43F5E) on near-black. **No purple gradients. No rainbow heatmaps.**
4. **Height color = viridis or terrain only.** Perceptually uniform, colorblind-safe. Jet is forbidden.
5. **Motion = meaning.** Every animation maps to a real state change.
6. **Honesty is a feature.** Metric/relative, georef/non-georef are first-class UI badges, never tooltips.
7. **Pipeline transparency.** Per-stage thumbnails on the processing page prove real work is happening.

---

## 7. Architecture Summary

```
   ┌───────────────────────────────────────────────────────────────┐
   │                      Browser (Frontend)                       │
   │   Next.js + React + Three.js + MapLibre + TanStack Query     │
   │   ├─ /upload → POST /ingest                                   │
   │   ├─ /processing/:id → GET /jobs/:id/status (poll 1.5s)     │
   │   ├─ /results/:id → GET /jobs/:id/artifacts                  │
   │   └─ /download → GET /jobs/:id/download/{type}               │
   └──────────────────────┬────────────────────────────────────────┘
                          │ REST / JSON
                          ▼
   ┌───────────────────────────────────────────────────────────────┐
   │                Backend / ML Service (Python)                  │
   │   ┌─────────────────────────────────────────────────────┐    │
   │   │ Stage 1: Radiometric Correction   (uint8 stretch)   │    │
   │   │ Stage 2: Cloud/Shadow Masking     (valid_mask)      │    │
   │   │ Stage 3: Noise Reduction          (bilateral+median)│    │
   │   │ Stage 4: CLAHE Contrast           (8×8 tiles)       │    │
   │   │ Stage 5: Resolution Handling      (GSD resample)    │    │
   │   │ Stage 6: Tiling / Stitching       (512² + cosine)   │    │
   │   │ Stage 7: Data Normalization       (Z-score)         │    │
   │   └─────────────────────────────────────────────────────┘    │
   │   DAv2 (frozen) → D_prior  (H, W)                             │
   │   Correction U-Net → H_pred  (H, W) metric DSM                │
   │   Job orchestrator → status events + artifact URLs            │
   └───────────────────────────────────────────────────────────────┘
```

---

## 8. Success Metrics (Hackathon)

| Metric | Target |
|---|---|
| End-to-end demo (image → flythrough) | < 90 seconds |
| Preprocessing test suite | 94 / 94 passing |
| Visual "wow" reaction (qualitative judge feedback) | High — primary differentiator |
| Demo runs end-to-end without errors | 100% of seeded test images |
| Lighthouse Performance on results page | ≥ 80 |

---

## 9. Constraints & Assumptions

- Python ≥ 3.14 (per `pyproject.toml`); ML models require GPU at inference time (acceptable for demo).
- Browser support: latest Chrome, Edge, Safari, Firefox (WebGL2 required for 3D).
- Backend exposes HTTP polling endpoint at 1 Hz (assumed) — websocket/SSE is a stretch goal.
- Session id sufficient for history; no server-side user model.

---

## 10. Open Questions

- **Q1.** Does the backend expose a websocket / SSE stream, or only HTTP polling? *(assumed: HTTP polling at 1 Hz)*
- **Q2.** What's the max output mesh resolution we should render client-side? *(assumed: cap at 1024² verts; full-res delivered only as download)*
- **Q3.** Is the Correction U-Net trained and shipped by demo time? *(assumed: DAv2 baseline ships; U-Net as a stretch/secondary deliverable)*
- **Q4.** Is PDF report generation in scope for the hackathon? *(assumed: optional, generated server-side)*