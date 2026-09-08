# DepthWizard — Product Requirements Document (PRD)

**Project:** SIH Problem Statement 26175 — Single-View Height Estimation & 3D Flythrough ("DepthWizard")
**Issued by:** ISRO / Department of Space · Category: Software · Theme: Disaster Management
**Status:** v2.0 — synced with `DOCS/DepthWizard_Technical_Documentation.docx`
**Owners:** ML track (S3–S5 models) · Frontend track · Backend track

---

## 1. Vision

**DepthWizard** turns a single overhead image into a validated elevation product (relative or metric, honestly labeled) and an explorable 3D flythrough — in minutes, with no signup, no configuration, and no scientific hand-waving.

The system serves two audiences that pull in different directions, and must serve both without compromising either:

1. **A hackathon judge in a 2-minute demo** — wants to be visually wowed and to walk away believing the system *actually* does what it claims.
2. **A technical evaluator** — wants to inspect intermediate outputs (raw depth d̂ vs calibrated ẑ), the confidence map, and whether the result is metric or relative-only.

The resolution is **simple mode by default, advanced panels behind a toggle** — the upload → result flow never forces technical detail on anyone, but every technical detail is one click away.

**Why it matters:** elevation data underpins disaster response, urban planning, and infrastructure monitoring. Conventional acquisition (stereo pairs, LiDAR, InSAR) is expensive and slow to deploy when only a single archived or freshly tasked optical image is available.

**Visual language (v2):** the landing page is **light, minimalist, professional** — paper-white surfaces, ink typography, deep-teal accent, hairline borders, dot-grid texture, domino scroll reveals; it reads like a serious research product, not a sci-fi dashboard. The app pages (processing / results) stay **dark cinematic** so height data and 3D elements glow where the work happens. **No purple gradients. No rainbow heatmaps. No globe on the landing page. No stock dashboard chrome.**

**Honesty is the brand.** All model techniques are adopted from cited published work; we claim integration, routing, and deployment — not novelty. Metric vs relative is always a first-class badge, never a footnote.

---

## 2. Target Users & Use Cases

| Persona | Primary Goal | Success Signal |
|---|---|---|
| **Hackathon Judge (Demo Mode)** | Be impressed in 2 minutes | Uploads an image, watches a flythrough, says "wow" |
| **Technical Evaluator** | Validate the ML pipeline | Inspects raw vs calibrated depth, confidence map, downloads GeoTIFF, checks CRS |
| **Domain User (GIS / Remote Sensing)** | Use real outputs | Exports metric DSM/nDSM into their own GIS stack |
| **Disaster-response operator** | Fast situational awareness | One image in → height context out, without waiting for LiDAR |
| **Casual Visitor** | Curious exploration | Drags an example, watches a flythrough, shares a screenshot |

---

## 3. Core Value Proposition

1. **Zero-friction input.** Drop one image → 3D result. No signup, no config, no plugin.
2. **Honest uncertainty.** Metric vs relative, DEM cross-check, cloud/shadow flags — *visible*, never hidden.
3. **Awe-inspiring 3D.** A real flythrough over a tiled/LOD mesh, not a static colored map.
4. **Pipeline transparency.** Every stage is observable with thumbnails — not a black box.
5. **Research-grounded.** Every design decision maps to a named gap and a cited published fix.

---

## 4. System Capabilities

### 4.1 What the system does

- Accepts a single overhead image (`.tif / .tiff / .png / .jpg / .jpeg`); auto-detects georeferenced vs non-georeferenced (S1).
- Runs the deterministic, fully-tested **7-stage preprocessing engine** (S2): radiometric correction → cloud/shadow masking → noise reduction → CLAHE → resolution alignment → tiling/stitching → Z-score normalization. 94 tests passing.
- Runs the **fine-tuned depth backbone** (S3): DINOv2 encoder + DPT decoder (Depth Anything V2 init), fine-tuned with RPC-aware pseudo-depth supervision (Sat3R method) → relative depth d̂.
- **Branches at S4:**
  - *Non-georeferenced* → d̂ is the delivered product (**rDSM**); no metric claim.
  - *Georeferenced* → semantic region segmentation → per-region RANSAC scale/shift against SRTM/Copernicus DEM (or GCPs) → absolute height ẑ + **DEM cross-check confidence flag**.
- Applies **bias-aware refinement** (S5): classification-regression with adaptive bins + head-tail cut (HTC-DC Net method) to correct long-tail underestimation of buildings.
- Produces **DSM & derived products** (S6): outlier removal, smoothing, gap fill → DSM, nDSM, slope, hillshade, confidence map.
- Generates the **interactive 3D flythrough** (S7): tiled/LOD heightmap-to-mesh with RGB texture projection.
- Supports **evaluation** (S8): RMSE/MAE/correlation against LiDAR, broken out by terrain type and region class.

### 4.2 What the system does NOT do (scope guardrails)

- No user accounts, no auth, no persistent multi-session storage beyond browser-local history.
- No batch upload (one image in, one result out).
- No in-browser model retraining or fine-tuning.
- No real-time collaborative viewing.
- No claims of sub-decimeter accuracy; no metric output for non-georeferenced inputs — ever.
- No novel-architecture claims (per the novelty statement in the technical documentation).

---

## 5. Functional Requirements

| # | Requirement |
|---|-------------|
| **F1.** | Drag/drop/paste/browse upload with client-side validation (format, size) and georef peek badge |
| **F2.** | Job submission (`POST /ingest`) + processing page polling (`GET /jobs/:id/status`, 1.5s) |
| **F3.** | Per-stage stepper with live thumbnails and named failure states (no raw stack traces) |
| **F4.** | Results page: 2D map (MapLibre when georeferenced; canvas otherwise) with viridis overlay + confidence toggle |
| **F5.** | Results page: 3D tiled/LOD flythrough with orbit/pan/zoom + scripted 12s camera path |
| **F6.** | Compare view: slider compare of raw depth d̂ vs calibrated ẑ |
| **F7.** | Download menu: DSM GeoTIFF (georef only), nDSM/slope/hillshade, GLB/OBJ mesh, heightmap PNG, JSON metadata |
| **F8.** | Session-scoped history grid (localStorage) with clear-history confirmation |
| **F9.** | About page: canonical 8-stage diagram, "what this is NOT" section, dataset + method attribution |
| **F10.** | Landing page: light minimal hero, capability grid, 8-step pipeline visualization, terminal-style pipeline log, story section, upload studio, codeblock CTA — **zero WebGL on this route** |
| **F11.** | Honest badges everywhere: metric-vs-relative, georef-vs-not, confidence summary, branch taken (S4a/S4b) |
| **F12.** | Height exaggeration slider, colormap toggle (viridis/terrain), height-color vs photo-texture toggle |
| **F13.** | Settings page: export format defaults, target GSD, model variant selector, advanced-detail toggle |
| **F14.** | Demo mode (`NEXT_PUBLIC_DEMO_MODE`): sample tiles + deterministic mock backend for offline iteration |

---

## 6. UX & Design Principles

1. **Calm where you decide, cinematic where you explore.** The landing (read + upload) is light and quiet; the results (fly) are dark and luminous.
2. **Light landing done properly.** Paper `#FAFAF9`, ink `#14171C`, deep-teal accent `#0E7490`, hairline borders, dot-grid texture, domino reveals, staggered card cascades. Minimalist — not empty.
3. **Color restraint.** One accent per context; semantic colors only for meaning (emerald=metric/ok, amber=relative/warn, rose=failure). **No purple gradients. No rainbow heatmaps.**
4. **Height color = viridis or terrain only.** Perceptually uniform, colorblind-safe. Jet is forbidden.
5. **Motion = meaning.** Every animation maps to a real state change; one-shot reveals, no looping decoration (except live-status indicators).
6. **Honesty is a feature.** Metric/relative, georef/non-georef, branch taken, confidence — first-class badges, never tooltips.
7. **Pipeline transparency.** Per-stage thumbnails on the processing page prove real work is happening.
8. **Respect hardware and motion preferences.** No WebGL on landing; DPR caps; `prefers-reduced-motion` honored globally.

---

## 7. Architecture Summary

```
   ┌───────────────────────────────────────────────────────────────┐
   │                      Browser (Frontend)                       │
   │   Next.js + React + Three.js (results only) + MapLibre        │
   │   ├─ / (light landing) → POST /ingest                         │
   │   ├─ /processing/:id → GET /jobs/:id/status (poll 1.5s)       │
   │   ├─ /results/:id → GET /jobs/:id/artifacts                   │
   │   └─ /download → GET /jobs/:id/download/{type}                │
   └──────────────────────┬────────────────────────────────────────┘
                          │ REST / JSON
                          ▼
   ┌───────────────────────────────────────────────────────────────┐
   │                Backend / ML Service (Python)                  │
   │  S1 Input & auto-detection (rasterio/GDAL, RPC tags)          │
   │  S2 Preprocessing (7-stage tested engine)                     │
   │  S3 Fine-tuned depth backbone (DINOv2+DPT, Sat3R-style)       │
   │  S4 BRANCH: 4a rDSM │ 4b segmentation + per-region RANSAC     │
   │             vs SRTM/Copernicus DEM + cross-check              │
   │  S5 Bias-aware refinement (adaptive bins + head-tail cut)     │
   │  S6 DSM + nDSM/slope/hillshade + confidence map               │
   │  S7 Tiled/LOD mesh + RGB texture projection                   │
   │  S8 Evaluation: RMSE/MAE/corr vs LiDAR by terrain & class     │
   └───────────────────────────────────────────────────────────────┘
```

---

## 8. Success Metrics (Hackathon)

| Metric | Target |
|---|---|
| Official evaluation (problem statement) | 50% DSM accuracy (RMSE/MAE/correlation vs LiDAR, by terrain) + 50% visualization quality (projection accuracy, navigability, stability, standalone deployment) |
| End-to-end demo (image → flythrough) | < 90 seconds |
| Preprocessing test suite | 94 / 94 passing |
| Demo runs end-to-end without errors | 100% of seeded test images |
| Lighthouse Performance on landing | ≥ 90 (no WebGL, light payload) |
| Lighthouse Performance on results page | ≥ 80 |
| Visual "wow" reaction (qualitative judge feedback) | High — primary differentiator |

---

## 9. Constraints & Assumptions

- Python ≥ 3.14 (per `pyproject.toml`); ML models require GPU at inference time (acceptable for demo).
- Fine-tuned backbone weights and the segmentation checkpoint are owned by the ML track; frontend ships against a deterministic mock until the API lands.
- DEM availability: SRTM/Copernicus tiles fetched server-side and cached; failure degrades to relative product with an explicit badge (never fake metric).
- Browser support: latest Chrome, Edge, Safari, Firefox (WebGL2 required for `/results` only).
- Backend exposes HTTP polling (1.5s cadence) — websocket/SSE is a stretch goal.
- Session id sufficient for history; no server-side user model.

---

## 10. Open Questions

- **Q1.** Which segmentation checkpoint for S4b? *(assumed: small off-the-shelf land-cover model; exact architecture is an ML-track implementation decision)*
- **Q2.** DEM source default — SRTM 30m or Copernicus 30m? *(assumed: Copernicus, SRTM fallback; both cached)*
- **Q3.** Is S5 (bias-aware refinement) trained and shipped by demo time? *(assumed: S3 backbone + S4b calibration ship first; S5 as stretch — pipeline must handle its absence honestly)*
- **Q4.** Is PDF report generation in scope? *(assumed: optional, generated server-side)*
- **Q5.** RPC availability: which demo tiles carry RPC tags for S3 fine-tuning supervision? *(ML track to confirm per dataset)*