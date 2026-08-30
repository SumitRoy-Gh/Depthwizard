# DepthWizard — Technology Stack

**Project:** SIH175 — Single-View Height Estimation & 3D Flythrough
**Status:** Draft v1.0

---

## 1. Stack at a Glance

### 1.1 Frontend

| Layer | Technology | Why |
|-------|------------|-----|
| Framework | **Next.js 14 (App Router) + React 18** | File routing, SSR for `/about`, RSC for static parts, Vite-based HMR |
| Language | **TypeScript (strict)** | Type safety against backend contracts |
| 3D Engine | **Three.js + @react-three/fiber + @react-three/drei + @react-three/postprocessing** | Declarative scene graph, mature ecosystem, all GPU effects we need |
| Animation | **Framer Motion** | Page transitions, micro-interactions, layout animations |
| Maps | **MapLibre GL JS** | Open-source, no API key, vector tiles, WebGL-based |
| Styling | **Tailwind CSS + shadcn/ui (Radix)** | Utility-first + accessible primitives, fast bespoke look |
| Icons | **lucide-react** | Consistent, tree-shakable, free |
| Server State | **TanStack Query (React Query)** | Polling, caching, retry — built for our exact use case |
| Client State | **Zustand** | Tiny, no boilerplate, perfect for UI prefs |
| Forms | **React Hook Form + Zod** | Validation for advanced options |
| Colormaps | **chroma.js** | Viridis/terrain sampling, perceptually uniform |
| Geo Preview | **geotiff.js** | Read embedded metadata client-side before upload |
| Theme | **next-themes** | Theme infra (dark default; light deferred) |
| Lint/Format | **ESLint + Prettier** | Code quality |
| Tests (post-hackathon) | **Vitest + Testing Library + Playwright** | Unit + e2e |
| Deploy | **Vercel** | Zero-config Next.js hosting, edge CDN |

### 1.2 Backend / ML

| Layer | Technology | Why |
|-------|------------|-----|
| Runtime | **Python 3.14** | Per `pyproject.toml` |
| Numerical core | **numpy** (≥2.5.2) | Array operations throughout |
| Image processing | **opencv-python** (≥5.0) | Bilateral filter, CLAHE, affine ops |
| Geospatial I/O | **rasterio** (≥1.5) | GeoTIFF read with CRS / transform |
| Scientific utils | **scipy**, **scikit-image** | ndimage.zoom, percentile, morphology |
| ML | **PyTorch** (assumed) | DAv2 + U-Net inference |
| Model — Depth | **Depth Anything v2 (Base)** | Frozen foundation model (per `DOCS/next-step.md`) |
| Model — Correction | **Custom U-Net** | Per-patch calibration, `[RGB, D_prior]` → metric DSM |
| Package manager | **uv** | Fast, lockfile-based |
| Tests | **`preprocessing/tests/test_all.py`** | 94 tests, run via `uv run` |
| API layer | **FastAPI** (assumed) | Typed endpoints, OpenAPI schema shared with frontend |

---

## 2. Library Selection Rationale

### 2.1 Why React Three Fiber (not raw Three.js or Babylon)
- Declarative scene graph fits React's mental model — components map to scene objects.
- Ecosystem (`drei`) provides `OrbitControls`, `Environment`, `Float`, `Stars`, `PerspectiveCamera` without custom code.
- Smaller bundle vs. full GIS engines (Cesium) — we don't need a globe-class GIS, just single-scene 3D + an ambient Earth background.
- Active community, fast issue resolution, TypeScript-first.

### 2.2 Why MapLibre (not Leaflet, not Google Maps)
- **No API key** — critical for a hackathon demo that must work on stage without rate-limit surprises.
- WebGL-rendered, smooth pan/zoom even with large overlays.
- Open-source, no vendor lock-in.

### 2.3 Why Tailwind + shadcn (not MUI, Chakra, Mantine)
- Tailwind lets us define a *bespoke* design system rather than fighting a defaults look.
- shadcn/ui gives us accessible primitives (Radix under the hood) without imposing visual style.
- Faster to reach "premium dark cinematic" than themeing a full component library.

### 2.4 Why Framer Motion (not GSAP for UI)
- GSAP is excellent but license-restricted for some commercial uses; Framer Motion is MIT.
- Framer Motion integrates with React's render cycle (no DOM-fighting).
- For complex 3D camera scripting in R3F, we use `useFrame` directly — best of both worlds.

### 2.5 Why Zustand (not Redux, not Context)
- Single store for UI prefs (exaggeration, panel split, history filter) — Redux is overkill.
- No provider hell, no boilerplate.
- Persistence via `zustand/middleware` for free.

### 2.6 Why React Query (not SWR)
- More mature polling/retry/stale-while-revalidate semantics.
- Better DevTools.
- SWR would also work fine; this is a marginal call.

### 2.7 Why DAv2 (not MiDaS, not ZoeDepth)
- SOTA monocular depth at the time of selection; robust on natural images.
- Easy to freeze + integrate as a feature extractor.
- Light enough to run on demo hardware.

### 2.8 Why a separate Correction U-Net (not end-to-end DAv2 fine-tuning)
- DAv2 outputs are scale-ambiguous (relative depth only) — true elevation requires a learned affine + residual correction.
- Separating concerns preserves DAv2's generalization while letting a small U-Net specialize in metric calibration.
- Cheaper to retrain the U-Net than to fine-tune DAv2.

### 2.9 Why NOT include Cesium / deck.gl / Mapbox
- Cesium: massive bundle, overkill for single-scene 3D.
- deck.gl: great for large geospatial viz but adds complexity we don't need.
- Mapbox: requires API key; would be a demo-stage risk.

---

## 3. Visual & Asset Stack

| Asset | Source | License |
|-------|--------|---------|
| Earth day texture | NASA Visible Earth (Blue Marble) | Public domain |
| Earth normal/spec map | Poly Haven / NASA | CC0 / Public domain |
| Particle field | Custom shader (procedural) | MIT (our code) |
| Sample images | ISPRS Vaihingen / Potsdam benchmark | ISPRS terms (attribution on `/about`) |
| Fonts | Inter (UI), JetBrains Mono (numerics) | OFL |
| Icons | lucide-react | ISC |

---

## 4. Browser Support Matrix

| Browser | Minimum Version | Notes |
|---------|----------------|-------|
| Chrome | 110+ | Primary target |
| Edge | 110+ | Primary target |
| Firefox | 115+ | Primary target |
| Safari | 16+ | WebGL2 quirks handled with fallbacks |
| Mobile Safari | iOS 16+ | 3D deferred behind tap |
| Chrome Android | Latest | 3D deferred behind tap |

WebGL2 is required. WebGL1 fallback is out of scope for the hackathon.

---

## 5. Performance Targets

| Metric | Target |
|--------|--------|
| Time-to-Interactive (landing) | ≤ 1.5s on broadband |
| First 3D frame | ≤ 2.5s after results page mounts |
| Steady-state fps (dedicated GPU) | ≥ 60 fps |
| Steady-state fps (integrated GPU) | ≥ 30 fps |
| Bundle size (landing route) | ≤ 350 KB gzipped, excl. Three.js lazy chunk |
| Three.js chunk | Lazy-loaded only on `/results` and `/processing` |

---

## 6. Environment Variables

```bash
# Frontend
NEXT_PUBLIC_API_BASE_URL    # Backend base URL
NEXT_PUBLIC_CDN_BASE_URL    # Asset CDN
NEXT_PUBLIC_DEMO_MODE       # "true" to enable sample thumbnails

# Backend (assumed)
APP_PORT
JOB_STORAGE_DIR
MODEL_DIR
SIGNING_SECRET              # for signed artifact URLs
GPU_DEVICE                  # "cuda:0" | "cpu"
```

---

## 7. Dependencies

### 7.1 Frontend `package.json` (preview)

```jsonc
{
  "dependencies": {
    "next": "^14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "three": "^0.165.0",
    "@react-three/fiber": "^8.16.0",
    "@react-three/drei": "^9.105.0",
    "@react-three/postprocessing": "^2.16.0",
    "framer-motion": "^11.0.0",
    "maplibre-gl": "^4.0.0",
    "tailwindcss": "^3.4.0",
    "@radix-ui/react-dialog": "...",
    "@radix-ui/react-slider": "...",
    "@radix-ui/react-tooltip": "...",
    "@radix-ui/react-toast": "...",
    "lucide-react": "^0.400.0",
    "@tanstack/react-query": "^5.40.0",
    "zustand": "^4.5.0",
    "react-hook-form": "^7.51.0",
    "zod": "^3.23.0",
    "chroma-js": "^2.4.0",
    "geotiff": "^2.0.7",
    "next-themes": "^0.3.0",
    "d3-scale": "^4.0.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "@types/three": "...",
    "eslint": "^8.57.0",
    "prettier": "^3.2.0",
    "tailwindcss-animate": "..."
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

*(to be extended with `torch`, `transformers` or local DAv2 weights, `fastapi`, `pydantic`)*

---

## 8. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| GPU unavailable at demo time | Pre-render demo results as cached fallback; queue offline |
| 3D perf tanks on judge laptops | DPR cap; auto-degrade to 30fps; mesh resolution cap |
| Three.js bundle bloats first paint | Dynamic import; only loaded on `/processing` and `/results` |
| MapLibre tile fetch fails on stage | Fallback to canvas-only 2D view with colormap overlay |
| Geotiff.js parse fails in some browsers | Wrap in try/catch; backend remains source of truth |
| Color-blind confusion on height | Viridis colormap + numeric legend always shown |
| `prefers-reduced-motion` users get motion sickness | Disable cinematic camera path; shorten transitions to 80ms cross-fade |
| Mobile drains battery | 3D auto-deferred on `<768px` viewports |
| Pipeline stage crashes on malformed input | Stage-level named failure UI; no raw stack trace in user-facing state |