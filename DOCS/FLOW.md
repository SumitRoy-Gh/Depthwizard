# DepthWizard — Flow

**Project:** SIH175 — Single-View Height Estimation & 3D Flythrough
**Status:** Draft v1.0

---

## 1. Global Navigation Map

```
                        ┌──────────────┐
                        │  / (Landing) │
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

## 2. End-to-End Happy Path (Demo Mode)

```
[User lands on /]
   ↓
Background Earth slowly rotates (Three.js canvas, behind UI)
Particle field drifts in foreground
Header logo fades in: "DepthWizard"
Headline types in: "From one image, a 3D world."
   ↓
[User drags an image onto the page]
   ↓
Client validation (< 200ms)
   • Extension check ✓
   • Size check ✓
   • geotiff.js peek → "Georeferenced ✓" or "Not georeferenced"
   ↓
Preview card slides up: thumbnail + badge + "Generate Height Model" button
   ↓
[User clicks "Generate Height Model"]
   ↓
POST /ingest (multipart) → backend starts job → returns jobId
   ↓
Route transition (Framer Motion shared layout): page morphs into stepper
Navigate to /processing/:jobId
   ↓
Backend runs pipeline (polled via /jobs/:id/status, 1.5s cadence):
   • Stage 1 Radiometric       ─ on complete → emit event + thumbnail
   • Stage 2 Cloud/Shadow      ─ on complete → emit event + valid_mask thumb
   • Stage 3 Noise Reduction   ─ on complete → emit event
   • Stage 4 CLAHE             ─ on complete → emit event
   • Stage 5 Resolution        ─ on complete or skipped → emit event
   • Stage 6 DAv2 (frozen)     ─ emits D_prior thumbnail
   • Stage 7 Correction U-Net  ─ emits H_pred thumbnail (metric)
   ↓
Stepper animates each stage; thumbnails fade in
"Estimated time remaining: 18s" appears after stage 2
   ↓
status === "complete"
   ↓
Cinema-mode transition: 600ms cross-fade to /results/:jobId
   ↓
[Results page mounts]
   • Left: 2D map (MapLibre if georeferenced; canvas otherwise) with viridis overlay
   • Right: 3D flythrough with auto-orbit
"Fly this path" CTA pulses once
   ↓
[User clicks "Fly this path"]
   ↓
Scripted camera path plays (12s): rise → orbit → dive → pan
Bloom + vignette intensify during cinematic
   ↓
Path completes; manual controls re-enabled
   ↓
[User clicks "Compare raw vs corrected"]
   ↓
Side-by-side compare view: slider compare with synced zoom
   ↓
[User downloads OBJ via Download menu]
   ↓
GET /jobs/:id/download/mesh → signed URL → file saved
```

---

## 3. Non-Georeferenced Input Flow

```
Same as happy path until /processing/:jobId completes
   ↓
On /results/:jobId:
   • Right panel: 3D flythrough (same as happy path)
   • Left panel: plain canvas (NOT MapLibre map)
   • Persistent amber badge top-left:
     "Relative height only — this image wasn't georeferenced,
      so heights are not in real-world units."
   • GeoTIFF download item: DISABLED with tooltip
     "Unavailable: input image was not georeferenced"
   • OBJ/GLB download item: enabled
   • PNG heightmap download item: enabled
   • PDF report: enabled, but includes relative-only notice
   • Stage 5 (Resolution) shown as "skipped — no GSD available"
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
   • Stages 1-2 complete normally
   • Stage 3 (Noise reduction) fails:
     backend returns stage=3, status=failed,
     reason="Bilateral filter diverged on sparse valid_mask"
   ↓
Frontend stepper freezes; failed stage shows red ✗ + plain-language reason
"Try another image" CTA pulses
"View technical log" disclosure expands to show stack trace
   ↓
No automatic redirect; user stays on processing page until they act
```

---

## 5. Session History Flow

```
[User completes a run → navigates away]
   ↓
On next visit to /:
   • localStorage retains last 10 runs
   • "Recent uploads" strip appears below drop zone
   ↓
[User clicks /history in nav]
   ↓
Grid of result cards: thumbnail, timestamp, georef badge, metric/relative badge
Click card → navigate to /results/:jobId
"Clear history" button at top-right with confirmation modal
```

---

## 6. Visual / Animation Flow Details

### 6.1 Landing Page First Paint

| Time | Element | Animation |
|------|---------|-----------|
| 0ms | Background globe canvas | Mounted, DPR=0.75 |
| 0ms | Particle field | Mounted, static |
| 100ms | Logo | Fade + slight rise, 240ms |
| 200ms | Headline | Type-in (split by chars), 600ms |
| 400ms | Sub-headline | Fade in, 240ms |
| 600ms | Drop zone | Scale from 0.96 → 1, fade, 320ms |
| 1200ms | Sample thumbnails | Stagger in, 80ms apart |

### 6.2 Page Transitions
All route changes use a **shared layout animation** via Framer Motion `layoutId`:
- Card-to-page transitions morph the thumbnail into a fullscreen image.
- 480ms ease-in-out-cubic.

### 6.3 Cinematic Camera Path (Flythrough) — 12s

| t (s) | Camera Position | LookAt | Notes |
|-------|----------------|--------|-------|
| 0.0 | (0, 80, 80) | (0, 0, 0) | Start: high above, slight tilt |
| 2.0 | (0, 40, 60) | (0, 5, 0) | Descend |
| 5.0 | (60, 25, 0) | (0, 5, 0) | Orbit 90° east |
| 8.0 | (0, 15, -60) | (0, 8, 0) | Orbit to north, lower |
| 10.0 | (-30, 30, 30) | (0, 6, 0) | Pull back to reveal |
| 12.0 | (0, 60, 80) | (0, 0, 0) | Return to start view |

Easing: ease-in-out-cubic per segment. Bloom intensity ramps up 0.3 → 0.6 → 0.3.

### 6.4 Earth Background (Landing + Idle Pages)
- Procedural sphere with day-texture + cloud overlay (cloud sphere rotates 1.4× faster than surface).
- Subtle atmospheric rim glow (Fresnel shader).
- Auto-rotates at 0.04 rad/s.
- Slow camera dolly: 60s period sine wave, ±2 units on z-axis.
- Star/dot field surrounds it; dots parallax with mouse movement.

### 6.5 3D Height Mesh
- Geometry: `PlaneGeometry(100, 100, n, n)` where n ≤ 512.
- Vertex Z displaced by normalized height × exaggeration slider × 5 world units.
- Material: `MeshStandardMaterial` with viridis-color vertex attribute, `flatShading: false`, `roughness: 0.6`.
- Optional wireframe overlay toggle (debug mode).

---

## 7. Backend Pipeline Data Flow (Inference)

```
Upload (multipart)
   │
   ▼
ingest/inference.py :: load_inference_image()
   ├─ rasterio → GeoTIFF → (H,W,C) + InferenceImageMeta{is_georeferenced, crs, gsd_m, ...}
   └─ PIL fallback → PNG/JPG → (H,W,3) uint8 + meta{is_georeferenced=False}
   │
   ▼
pipelines/inference.py :: preprocess_for_inference()
   │
   ├─ Stage 1 radiometric  → {unet_input uint8, dav2_input uint8}
   ├─ Stage 2 masking      → valid_mask bool
   ├─ Stage 3 noise        → bilateral-filtered uint8
   ├─ Stage 4 CLAHE        → enhanced uint8
   ├─ Stage 5 resolution   → GSD-aligned (skipped if no GSD)
   └─ Stage 6 normalize    → float32 (uses training stats.json)
   │
   ▼
Model Layer
   ├─ DAv2(dav2_input)         → D_prior (H,W) float32
   └─ U-Net([RGB, D_prior])    → H_pred  (H,W) float32 metric DSM
   │
   ▼
Artifacts
   ├─ GLB / OBJ mesh
   ├─ PNG heightmap (viridis)
   ├─ GeoTIFF (only if metric)
   ├─ PDF report
   └─ JSON metadata (CRS, GSD, processing time, confidence)
```

---

## 8. Responsive Behavior

| Breakpoint | Behavior |
|------------|----------|
| ≥ 1280px | Full two-panel results page; Earth background fullscreen |
| 768–1279px | Two-panel stacks vertically; Earth scales down |
| < 768px | Single-column; 3D flythrough deferred behind "Load 3D view" button; Earth replaced with static gradient backdrop |

---

## 9. Accessibility Flows
- All interactive elements keyboard-reachable; focus rings use cyan accent.
- Drop zone has a `<input type="file">` fallback activated by Enter/Space.
- 3D viewer has keyboard alternatives: arrow keys for orbit, +/- for zoom.
- All animations respect `prefers-reduced-motion`: animations disabled or shortened to 80ms cross-fades.
- Colormaps chosen for colorblind safety (viridis).