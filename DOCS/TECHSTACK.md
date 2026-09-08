# DepthWizard — Technology Stack

**Project:** SIH Problem Statement 26175 — Single-View Height Estimation & 3D Flythrough
**Status:** v2.0 — synced with `DOCS/DepthWizard_Technical_Documentation.docx`

---

## 1. Stack at a Glance

### 1.1 Frontend

| Layer | Technology | Why |
|-------|------------|-----|
| Framework | **Next.js 14 (App Router) + React 18** | File routing, RSC for static pages, fast HMR |
| Language | **TypeScript (strict)** | Type safety against backend contracts |
| 3D Engine | **Three.js + @react-three/fiber + drei + postprocessing** | Declarative scene graph, tiled/LOD terrain, flythrough camera |
| Animation | **Framer Motion** | Domino section reveals, card cascades, micro-interactions |
| Maps | **MapLibre GL JS** | Open-source, no API key, vector tiles, WebGL-based |
| Styling | **Tailwind CSS + shadcn/ui (Radix)** | Utility-first + accessible primitives; token-driven theming |
| Icons | **lucide-react** | Consistent, tree-shakable, free |
| Server State | **TanStack Query (React Query)** | Polling, caching, retry — built for our exact use case |
| Client State | **Zustand** | Tiny, no boilerplate, perfect for UI prefs |
| Colormaps | **chroma.js** | Viridis/terrain sampling, perceptually uniform |
| Geo Preview | **geotiff.js** | Read embedded metadata client-side before upload |
| Theming | **CSS-variable tokens + route-scoped `.theme-light`** | Light minimal landing, dark cinematic app pages, zero dependency |
| Lint/Format | **ESLint + Prettier** | Code quality |
| Deploy | **Vercel** | Zero-config Next.js hosting, edge CDN |

> Theming note: v1 planned `next-themes`; v2 ships a lighter approach — RGB-triplet
> CSS variables consumed by Tailwind (`<alpha-value>`) plus a `.theme-light` scope
> applied by the shell on the landing route. No runtime theme library needed.

### 1.2 Backend / ML

| Layer | Technology | Why |
|-------|------------|-----|
| Runtime | **Python ≥ 3.14** (uv-managed) | Per `pyproject.toml` |
| Numerical core | **numpy** (≥2.5.2) | Array operations throughout |
| Image processing | **opencv-python** (≥5.0) | Bilateral filter, CLAHE, affine ops |
| Geospatial I/O | **rasterio / GDAL** (≥1.5) | GeoTIFF read with CRS / transform / RPC tags |
| Scientific utils | **scipy**, **scikit-image** | ndimage, percentile, morphology, **RANSAC** (S4b) |
| ML framework | **PyTorch** | Backbone fine-tuning + inference |
| Depth backbone | **Depth Anything V2 init → DINOv2 encoder + DPT decoder** | Fine-tuned against RPC geometry (S3, Sat3R-style) — *not frozen* |
| Calibration | **Off-the-shelf semantic segmentation** + **per-region RANSAC** vs **SRTM / Copernicus DEM** | Region-aware metric calibration (S4b, fixes G2) |
| Refinement | **Adaptive bins + head-tail cut (HTC-DC Net method)** | Long-tail bias correction (S5, fixes G3) |
| Datasets | **DFC2019, ISPRS Vaihingen, ISPRS Potsdam** | Contain elevation ground truth (fixes G4) |
| External data | **SRTM / Copernicus DEM tiles** | Metric reference for calibration; cached server-side |
| API layer | **FastAPI** (assumed) | Typed endpoints, OpenAPI schema shared with frontend |
| Tests | **`preprocessing/tests/test_all.py`** | 94 tests, run via `uv run` |

---

## 2. Library Selection Rationale

### 2.1 Why React Three Fiber (not raw Three.js or Babylon)
- Declarative scene graph fits React's mental model — components map to scene objects.
- Ecosystem (`drei`) provides `OrbitControls`, `Environment`, `PerspectiveCamera` without custom code.
- Smaller bundle vs. full GIS engines (Cesium) — we need a single-scene terrain viewer, not a globe-class GIS.
- Active community, TypeScript-first.

### 2.2 Why MapLibre (not Leaflet, not Google Maps)
- **No API key** — critical for a stage demo without rate-limit surprises.
- WebGL-rendered, smooth pan/zoom even with large overlays.
- Open-source, no vendor lock-in.

### 2.3 Why Tailwind + CSS-variable tokens (not MUI, Chakra, not next-themes)
- Tailwind lets us define a *bespoke* design system rather than fighting a defaults look.
- shadcn/ui gives accessible primitives (Radix) without imposing visual style.
- Token theming: the landing route needs a light, paper-like system while viewer pages stay dark cinematic. Variables + a route-scoped class do this with zero runtime cost and no flash-of-wrong-theme; component classes (`bg-stage`, `text-primary`, `border-hairline`) stay identical in both themes.

### 2.4 Why fine-tuning instead of frozen backbone + corrector (per technical documentation)
- Gap G1: monocular depth models are trained on egocentric natural imagery and generalize poorly to overhead remote-sensing geometry. The published fix (Sat3R) is RPC-aware fine-tuning with physically consistent pseudo-depth supervision — cheaper and more principled than bolting a corrector network onto a frozen backbone.
- Gap G2: a single global affine depth→height fit is invalid under off-nadir geometry; per-region RANSAC against a DEM is the minimal correct fix.
- Gap G3: naive regression underestimates rare tall structures; adaptive bins + head-tail cut (HTC-DC Net) is the published fix.
- **Honesty rule:** all techniques are adopted from cited publications; our claim is integration + routing + deployment, not novelty.

---

## 3. Data & Asset Licensing

| Asset | Source | License |
|-------|--------|---------|
| ISPRS Vaihingen / Potsdam | ISPRS benchmark | Free for scientific use with attribution |
| DFC2019 | IEEE Data Fusion Contest 2019 | Open benchmark |
| SRTM / Copernicus DEM | USGS / Copernicus | Public domain / open license |
| Sample images | Curated demo tiles | ISPRS terms (attribution on `/about`) |
| Inter / JetBrains Mono fonts | Google Fonts | SIL Open Font License |

*(v1's NASA Blue Marble earth textures are retired along with the globe.)*

---

## 4. Browser Support

| Browser | Version | Notes |
|---------|---------|-------|
| Chrome | Latest | Primary demo target |
| Edge | Latest | Chromium — same as Chrome |
| Firefox | Latest | WebGL2 quirks handled with fallbacks |
| Safari | 17+ | WebGL2 quirks handled with fallbacks |
| Mobile Safari | iOS 16+ | 3D deferred behind tap |
| Chrome Android | Latest | 3D deferred behind tap |

WebGL2 is required for `/results`. WebGL1 fallback is out of scope for the hackathon.
The landing route requires no WebGL at all.

---

## 5. Performance Targets

| Metric | Target |
|--------|--------|
| Time-to-Interactive (landing) | ≤ 1.2s on broadband (no WebGL, no heavy fonts) |
| First 3D frame | ≤ 2.5s after results page mounts |
| Steady-state fps (dedicated GPU) | ≥ 60 fps |
| Steady-state fps (integrated GPU) | ≥ 30 fps |
| Bundle size (landing route) | ≤ 200 KB gzipped — **Three.js never loads on `/`** |
| Three.js chunk | Lazy-loaded only on `/results` |

---

## 6. Environment Variables

```bash
# Frontend
NEXT_PUBLIC_API_BASE_URL    # Backend base URL

---

## 7. Dependencies

### 7.1 Frontend `package.json` (actual, as shipped)

```jsonc
{
  "dependencies": {
    "next": "14.2.18",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "three": "0.169.0",
    "@react-three/fiber": "8.17.10",
    "@react-three/drei": "9.114.3",
    "@react-three/postprocessing": "2.16.3",
    "framer-motion": "11.11.17",
    "maplibre-gl": "4.7.1",
    "lucide-react": "0.460.0",
    "@tanstack/react-query": "5.59.20",
    "zustand": "5.0.1",
    "chroma-js": "3.1.2",
    "geotiff": "2.1.3",
    "clsx": "2.1.1",
    "tailwind-merge": "2.5.4"
  },
  "devDependencies": {
    "typescript": "5.6.3",
    "tailwindcss": "3.4.14",
    "postcss": "8.4.49",
    "autoprefixer": "10.4.20",
    "eslint": "8.57.1",
    "eslint-config-next": "14.2.18"
  }
}
```

### 7.2 Backend `pyproject.toml` (current)

```toml
[project]
name = "sih175"
version = "0.1.0"
requires-python = ">=3.14"
dependencies = [
    "numpy>=2.5.2",
    "opencv-python>=5.0.0.93",
    "rasterio>=1.5.1",
    "scikit-image>=0.26.0",
    "scipy>=1.18.1",
]
```

*(to be extended by the ML track: `torch`, DAv2/DINOv2 weights, segmentation checkpoint, `fastapi`, `pydantic`)*

---

## 8. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| GPU unavailable at demo time | Pre-render demo results as cached fallback; queue offline |
| 3D perf tanks on judge laptops | Tiled/LOD mesh; DPR cap; auto-degrade to 30fps |
| Three.js bundle bloats first paint | Not imported on landing; lazy-loaded on `/results` only |
| DEM fetch fails on stage | Server-side tile cache pre-warmed; degrade to relative product + badge |
| Segmentation checkpoint unavailable | Ship with a small off-the-shelf model; confidence map marks low-quality regions |
| MapLibre tile fetch fails on stage | Fallback to canvas-only 2D view with colormap overlay |
| Geotiff.js parse fails in some browsers | Wrap in try/catch; backend remains source of truth |
| Color-blind confusion on height | Viridis colormap + numeric legend always shown |
| `prefers-reduced-motion` users get motion sickness | Disable camera path; collapse reveals to 80ms cross-fades |
| Mobile drains battery | 3D auto-deferred on `<768px` viewports; landing has zero WebGL |
| Pipeline stage crashes on malformed input | Stage-level named failure UI; no raw stack traces in user-facing state |
NEXT_PUBLIC_CDN_BASE_URL    # Asset CDN
NEXT_PUBLIC_DEMO_MODE       # "true" to enable sample thumbnails

# Backend (assumed)
APP_PORT
JOB_STORAGE_DIR
MODEL_DIR                   # fine-tuned backbone + refinement head weights
DEM_CACHE_DIR               # SRTM / Copernicus tile cache
SIGNING_SECRET              # for signed artifact URLs
GPU_DEVICE                  # "cuda:0" | "cpu"
```