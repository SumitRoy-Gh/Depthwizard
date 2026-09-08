# DepthWizard — Flow

**Project:** SIH Problem Statement 26175 — Single-View Height Estimation & 3D Flythrough
**Status:** v2.0 — synced with `DOCS/DepthWizard_Technical_Documentation.docx` (canonical 8-stage workflow)

---

## 1. Global Navigation Map

```
                        ┌──────────────┐
                        │  / (Landing) │   light · minimal · no WebGL
                        └──────┬───────┘
                               │ upload + click "Generate"
                               ▼
                  ┌─────────────────────────┐
                  │  /processing/:jobId     │
                  │  (polls until complete) │
                  └──────┬─────────────┬────┘
                         │             │
                success  │             │ failure
                         ▼             ▼
             ┌────────────────────┐   ┌──────────────────┐
             │ /results/:jobId    │   │ Error state on   │
             │ (2D + 3D viewer)   │   │ /processing page │
             └──┬─────────────┬───┘   │ with retry CTA   │
                │             │       └──────────────────┘
        compare │             │ download
                ▼             ▼
    ┌───────────────────┐   (file download)
    │ .../compare       │
    │ raw vs corrected  │
    └───────────────────┘

    ┌────────────┐  ┌──────────┐  ┌──────────────┐
    │ /history   │  │ /about   │  │ /settings    │
    └────────────┘  └──────────┘  └──────────────┘
```

---

## 2. End-to-End Happy Path (Georeferenced Input — Demo Mode)

```
[User lands on /]
   ↓
LIGHT minimal landing (paper background, dot-grid texture, ink typography)
Sections reveal domino-style as the user scrolls:
   hero → what-it-does grid → 8-step pipeline → terminal log →
   why-single-view → upload studio → codeblock CTA
Headline settles in with a word-reveal; no globe, no WebGL on this route
   ↓
[User drags an image onto the drop zone]
   ↓
Client validation (< 200ms)
   • Extension check ✓ (.tif/.tiff/.png/.jpg/.jpeg)
   • Size check ✓ (warn > 200 MB)
   • geotiff.js peek → "Georeferenced ✓" or "Not georeferenced" badge
   ↓
Preview card slides up: thumbnail + badge + "Generate Height Model"
   ↓
[User clicks "Generate Height Model"]
   ↓
POST /ingest (multipart) → backend starts job → returns jobId
   ↓
Route transition → /processing/:jobId (dark cinematic theme resumes)
   ↓
Backend runs the canonical workflow (polled via /jobs/:id/status, 1.5s):
   • S1  Input & auto-detection     → emits meta event (CRS, GSD, RPC?)
   • S2  Preprocessing (7-stage)    → emits per-substage thumbnails
   • S3  Depth backbone (fine-tuned DINOv2+DPT) → emits d̂ thumbnail
   • S4  BRANCH (georef) 4b         → segmentation + per-region RANSAC
                                       vs DEM → emits ẑ thumbnail
                                       + DEM cross-check confidence flag
   • S5  Bias-aware refinement      → emits refined h(x) thumbnail
   • S6  DSM & derived products     → DSM, nDSM, slope, hillshade, confidence
   • S7  Tiled/LOD mesh + texture   → emits mesh preview thumbnail
   ↓
Stepper animates each stage; thumbnails fade in
"Estimated time remaining" appears after S2
   ↓
status === "complete"
   ↓
Transition to /results/:jobId
   ↓
[Results page mounts]
   • Left: 2D map (MapLibre if georeferenced; canvas otherwise) with viridis
     overlay + confidence-map toggle
   • Right: 3D flythrough of the tiled/LOD mesh with auto-orbit
   • Metadata strip: CRS, GSD, metric-vs-relative badge, confidence summary
"Fly this path" CTA pulses once
   ↓
[User clicks "Fly this path"]
   ↓
Scripted camera path plays (12s): rise → orbit → dive → pan
   ↓
Path completes; manual controls re-enabled
   ↓
[User clicks "Compare raw vs corrected"]
   ↓
Side-by-side compare view: slider compare (raw d̂ vs calibrated ẑ)
   ↓
[User downloads artifacts via Download menu]
   ↓
GET /jobs/:id/download/{type} → signed URL → file saved
(DSM GeoTIFF, nDSM/slope/hillshade, mesh GLB/OBJ, heightmap PNG, JSON)
```

---

## 3. Non-Georeferenced Input Flow (S4a branch)

```
Same as happy path until /processing/:jobId
   ↓
S1 reports is_georeferenced = false → event stream takes the 4a branch
   • S4b (DEM calibration) is SKIPPED — shown as "not applicable:
     relative product"
   • S5 refinement still runs (relative heights, bias-corrected)
   ↓
On /results/:jobId:
   • Right panel: 3D flythrough of the relative surface (same as happy path)
   • Left panel: plain canvas (NOT MapLibre map)
   • Persistent amber badge top-left:
     "Relative height only — this image wasn't georeferenced,
      so heights are not in real-world units."
   • GeoTIFF download item: DISABLED with tooltip
     "Unavailable: input image was not georeferenced"
   • Mesh GLB/OBJ, heightmap PNG: enabled
   • Confidence map: cloud/shadow flag only (no DEM cross-check channel)
```

---

## 4. Backend Stage Failure Flow

```
User uploads a malformed file on /
   ↓
Client validation passes (looks like a valid extension)
   ↓
POST /ingest succeeds, returns jobId
   ↓
On /processing/:jobId:
   • S1–S2 sub-stages complete normally
   • S3 (depth backbone) fails:
     backend returns stage=3, status=failed,
     reason="Backbone tile inference diverged on masked tile #12"
   ↓
Frontend stepper freezes; failed stage shows red ✗ + plain-language reason
"Try another image" CTA pulses
"View technical log" disclosure expands to show the stack trace
   ↓
No automatic redirect; user stays on processing page until they act
```

Degradation flows (honest, never silent):

```
DEM fetch fails (S4b)          → job continues as RELATIVE product
                                 + amber "metric calibration unavailable" badge
Segmentation low-quality (S4b) → confidence map flags those regions
Large scene (S7)               → tiled/LOD mesh keeps frame budget; UI notes LOD
```

---

## 5. Session History Flow

---

## 6. Visual / Animation Flow Details

### 6.1 Landing Page First Paint (light theme, no WebGL)

| Time | Element | Animation |
|------|---------|-----------|
| 0ms | Paper background + dot-grid texture | Static (paint cost ~0) |
| 80ms | Header wordmark + nav | Fade + slight rise, 240ms |
| 150ms | Eyebrow pill row | Stagger in, 60ms apart |
| 250ms | Headline | Word-reveal (masked rise), 700ms |
| 600ms | Lede paragraph | Fade + rise, 500ms |
| 750ms | CTA pair | Fade + rise, 500ms |
| 900ms | Stat row | Stagger in, 80ms apart |

### 6.2 Domino Section Reveals (Odysseus-style)

- Every landing section is wrapped in a reveal container: `opacity 0 → 1`, `translateY(24px) → 0`, 600ms, fired **once** when ~20% of the section enters the viewport.
- Feature cards inside a revealed section cascade in with 50ms stagger (domino effect).
- The pipeline step row animates its connecting line left→right on first reveal.
- Terminal log lines "type in" sequentially with a blinking caret on the active line.
- All reveals respect `prefers-reduced-motion` (collapse to 80ms opacity-only).

### 6.3 Page Transitions
Route changes stay simple (fade/slide, 240ms) — the landing is light, app pages are dark; a full-viewport morph between themes would feel broken.

### 6.4 Cinematic Camera Path (Flythrough) — 12s

| t (s) | Camera Position | LookAt | Notes |
|-------|----------------|--------|-------|
| 0.0 | (0, 80, 80) | (0, 0, 0) | Start: high above, slight tilt |
| 2.0 | (0, 40, 60) | (0, 5, 0) | Descend |
| 5.0 | (60, 25, 0) | (0, 5, 0) | Orbit 90° east |
| 8.0 | (0, 15, -60) | (0, 8, 0) | Orbit to north, lower |
| 10.0 | (-30, 30, 30) | (0, 6, 0) | Pull back to reveal |
| 12.0 | (0, 60, 80) | (0, 0, 0) | Return to start view |


---

## 7. Backend Data Flow (Inference — canonical 8-stage)

```
Upload (multipart)
   │
   ▼
S1 ingest/inference.py :: load_inference_image()
   ├─ rasterio → GeoTIFF → (H,W,C) + meta{is_georeferenced, crs, gsd_m, rpc?, ...}
   └─ PIL fallback → PNG/JPG → (H,W,3) uint8 + meta{is_georeferenced=False}
   │     (CRS/geotransform retained for the whole pipeline — never discarded)
   ▼
S2 pipelines/inference.py :: preprocess_for_inference()        [7 sub-stages]
   ├─ radiometric   → {backbone_input uint8, proxy RGB}
   ├─ masking       → valid_mask bool (retained, not discarded)
   ├─ noise         → bilateral-filtered uint8
   ├─ CLAHE         → enhanced uint8
   ├─ resolution    → GSD-aligned (skipped if no GSD — reported, not silent)
   ├─ tiling        → 512² patches (+ windowed inference, cosine stitch)
   └─ normalize     → float32 zero-mean (training stats.json)
   ▼
S3 ml/backbone (fine-tuned DINOv2+DPT, DAv2 init)
   └─ → d̂ (H,W) float32 relative depth      ← first "prediction" artifact
   ▼
BRANCH
   ├─ 4a non-georeferenced: d̂ IS the height product (rDSM) → skip to S6
   └─ 4b georeferenced:
        segmentation s(x) → per-region RANSAC (a_c, b_c) vs DEM z_ref
        ẑ(x) = a_{s(x)}·d̂(x) + b_{s(x)}   +   DEM cross-check confidence flag
   ▼
S5 ml/refine (adaptive bins + head-tail cut) → h(x) final height surface
   ▼
S6 products: outlier removal → smoothing → gap fill
   → DSM (+ nDSM, slope, hillshade) + confidence map (cloud flag ∪ DEM check)
   ▼
S7 tiled/LOD mesh + RGB texture projection
   ▼
Artifacts
   ├─ DSM GeoTIFF (georef only) + nDSM / slope / hillshade PNGs
   ├─ GLB / OBJ mesh (tiled/LOD)
   ├─ PNG heightmap (viridis)
   ├─ Confidence map (PNG + channel in metadata)
   └─ JSON metadata (CRS, GSD, branch taken, stage timings, confidence)
```

---

## 8. Responsive Behavior

| Breakpoint | Behavior |
|------------|----------|
| ≥ 1280px | Full two-panel results page; landing sections at max-width 7xl |
| 768–1279px | Results panels stack vertically; landing grids drop to 2 columns |
| < 768px | Single-column; 3D flythrough deferred behind "Load 3D view" button; feature grid → 1 column; terminal log scrollable |

---

## 9. Accessibility Flows

- All interactive elements keyboard-reachable; focus rings use the accent color of the active theme.
- Drop zone has a `<input type="file">` fallback activated by Enter/Space.
- 3D viewer has keyboard alternatives: arrow keys for orbit, +/- for zoom.
- All animations respect `prefers-reduced-motion`: reveals collapse to 80ms cross-fades; camera path disabled.
- Metric-vs-relative and georef/non-georef states are first-class visible badges — never tooltips, never color-only.
- Landing light theme holds WCAG AA contrast (ink #14171C on paper #FAFAF9 ≈ 15.9:1; accent teal #0E7490 on paper ≈ 4.8:1).
- Colormaps chosen for colorblind safety (viridis).
Easing: ease-in-out-cubic per segment. Skipped entirely under `prefers-reduced-motion`.

### 6.5 3D Height Mesh (Tiled / LOD — S7)

- The DSM is converted to spatial tiles; each tile carries precomputed detail levels; the renderer swaps coarser geometry for distant tiles (standard terrain-rendering practice).
- Vertex Z displaced by normalized height × exaggeration slider × 5 world units.
- Material: `MeshStandardMaterial` with viridis-color vertex attribute; original RGB image projected as texture (toggle between "height color" and "photo texture").
- Optional wireframe overlay toggle (debug mode).

```
[User completes a run → navigates away]
   ↓
On next visit to /:
   • localStorage retains last 10 runs
   • "Recent runs" strip appears in the studio section
   ↓
[User clicks /history in nav]
   ↓
Grid of result cards: thumbnail, timestamp, georef badge, metric/relative badge
Click card → navigate to /results/:jobId
"Clear history" button at top-right with confirmation modal
```