"""
risk_analysis.py — Disaster-risk proxy layer for DepthWizard.

Consumes products already computed in Stage 6 (DTM, nDSM) to produce
rule-based flood and earthquake risk proxies. No new model needed.

Flood risk proxy  : relative ground elevation from DTM — low spots relative
                    to their local neighbourhood collect water.
Earthquake risk   : structural proxy from nDSM — building density and height
                    variance. Dense clusters of irregularly-tall buildings are
                    more vulnerable to differential shaking response.

Both are honest, explainable proxies appropriate for a first-pass GIS risk
tool. They are NOT seismic/soil/rainfall data — state this clearly in demos.
"""
from __future__ import annotations
import numpy as np
from scipy.ndimage import uniform_filter


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _local_mean(arr: np.ndarray, window_px: int) -> np.ndarray:
    """Box-filter mean over a square neighbourhood."""
    return uniform_filter(arr.astype(np.float32), size=window_px, mode="nearest")


# ---------------------------------------------------------------------------
# Per-pixel risk grids  (H, W) float32 in [0, 1]
# ---------------------------------------------------------------------------

def compute_flood_risk(dtm: np.ndarray, gsd_m: float, window_m: float = 50.0) -> np.ndarray:
    """
    Flood-risk proxy — relative ground elevation.

    Pixels that sit below their local neighbourhood average are depressions
    where water tends to pool. The score is normalised to [0, 1] using the
    1st–99th percentile of the depression depth across the scene.

    Args:
        dtm:      (H, W) bare-earth elevation array (metres).
        gsd_m:    Ground sampling distance in metres per pixel.
        window_m: Neighbourhood radius in metres (default 50 m).

    Returns:
        (H, W) float32 risk grid, 1 = most flood-prone.
    """
    window_px = max(3, int(round(window_m / gsd_m)))
    if window_px % 2 == 0:
        window_px += 1

    local_avg = _local_mean(dtm, window_px)
    relative_elev = dtm - local_avg          # negative = depression
    depression = np.clip(-relative_elev, 0, None)

    p1, p99 = np.percentile(depression, [1, 99])
    span = max(p99 - p1, 1e-6)
    risk = np.clip((depression - p1) / span, 0, 1)
    return risk.astype(np.float32)


def compute_earthquake_risk(
    ndsm: np.ndarray,
    gsd_m: float,
    window_m: float = 50.0,
    building_threshold_m: float = 2.0,
) -> np.ndarray:
    """
    Earthquake structural-vulnerability proxy.

    Score = 0.6 × building_density + 0.4 × height_variance_score.

    Dense clusters of irregularly-tall buildings experience higher differential
    shaking response — a defensible structural proxy without soil/fault data.

    Args:
        ndsm:                   (H, W) above-ground height array (metres).
        gsd_m:                  Ground sampling distance in metres per pixel.
        window_m:               Neighbourhood size in metres.
        building_threshold_m:   Height above which a pixel is counted as a
                                building (default 2 m).

    Returns:
        (H, W) float32 risk grid, 1 = most earthquake-vulnerable.
    """
    window_px = max(3, int(round(window_m / gsd_m)))
    if window_px % 2 == 0:
        window_px += 1

    # Building density: fraction of neighbourhood pixels that are buildings
    is_building = (ndsm > building_threshold_m).astype(np.float32)
    density = _local_mean(is_building, window_px)

    # Local height variance (computed from E[x²] - E[x]² to avoid two passes)
    local_mean_h = _local_mean(ndsm, window_px)
    local_mean_sq = _local_mean(ndsm ** 2, window_px)
    local_var = np.clip(local_mean_sq - local_mean_h ** 2, 0, None)
    local_std = np.sqrt(local_var)

    p1, p99 = np.percentile(local_std, [1, 99])
    span = max(p99 - p1, 1e-6)
    height_variance_score = np.clip((local_std - p1) / span, 0, 1)

    risk = 0.6 * density + 0.4 * height_variance_score
    return np.clip(risk, 0, 1).astype(np.float32)


# ---------------------------------------------------------------------------
# Visualisation helpers
# ---------------------------------------------------------------------------

def risk_to_rgba(
    risk: np.ndarray,
    low_color: tuple[int, int, int] = (0, 200, 0),
    high_color: tuple[int, int, int] = (220, 0, 0),
) -> np.ndarray:
    """
    Convert a [0, 1] risk grid to an RGBA uint8 image (green → red gradient).

    Alpha is scaled by risk so low-risk areas remain near-transparent, making
    the overlay visually readable when composited over the source imagery.

    Args:
        risk:       (H, W) float32 grid in [0, 1].
        low_color:  RGB triple for risk = 0.
        high_color: RGB triple for risk = 1.

    Returns:
        (H, W, 4) uint8 RGBA array.
    """
    low = np.array(low_color, dtype=np.float32)
    high = np.array(high_color, dtype=np.float32)
    risk3 = risk[..., None]
    rgb = (1 - risk3) * low + risk3 * high
    alpha = (risk * 200 + 30).clip(0, 255)
    rgba = np.concatenate([rgb, alpha[..., None]], axis=-1).astype(np.uint8)
    return rgba


# ---------------------------------------------------------------------------
# Zone aggregation
# ---------------------------------------------------------------------------

def aggregate_zones(risk_grid: np.ndarray, n_zones_per_side: int = 6) -> list[dict]:
    """
    Collapse a (H, W) risk grid into an NxN coarse zone summary.

    Each zone reports its mean risk score and a categorical band label
    ("low" / "medium" / "high"). Zones are sorted worst-first.

    Args:
        risk_grid:        (H, W) float32 risk grid.
        n_zones_per_side: Grid division on each axis (default 6 → 36 zones).

    Returns:
        List of dicts: {zone_id, row, col, score, band}, sorted by descending score.
    """
    h, w = risk_grid.shape
    zh = h // n_zones_per_side
    zw = w // n_zones_per_side
    zones: list[dict] = []

    for r in range(n_zones_per_side):
        for c in range(n_zones_per_side):
            y0 = r * zh
            y1 = (r + 1) * zh if r < n_zones_per_side - 1 else h
            x0 = c * zw
            x1 = (c + 1) * zw if c < n_zones_per_side - 1 else w
            cell = risk_grid[y0:y1, x0:x1]
            if cell.size == 0:
                continue
            score = float(cell.mean())
            band = "high" if score > 0.66 else "medium" if score > 0.33 else "low"
            zones.append({
                "zone_id": f"r{r}c{c}",
                "row": r,
                "col": c,
                "score": round(score, 3),
                "band": band,
            })

    zones.sort(key=lambda z: -z["score"])
    return zones


# ---------------------------------------------------------------------------
# Top-level entry point
# ---------------------------------------------------------------------------

def compute_all_risk_products(
    dtm: np.ndarray,
    ndsm: np.ndarray,
    gsd_m: float,
) -> dict:
    """
    Compute both risk grids and their zone summaries.

    Args:
        dtm:   (H, W) bare-earth elevation array (metres).
        ndsm:  (H, W) above-ground height array (metres).
        gsd_m: Ground sampling distance in metres per pixel.

    Returns:
        {
            "flood_risk_grid":      (H, W) float32,
            "earthquake_risk_grid": (H, W) float32,
            "flood_zones":          list[dict],
            "earthquake_zones":     list[dict],
        }
    """
    flood = compute_flood_risk(dtm, gsd_m)
    quake = compute_earthquake_risk(ndsm, gsd_m)
    return {
        "flood_risk_grid": flood,
        "earthquake_risk_grid": quake,
        "flood_zones": aggregate_zones(flood),
        "earthquake_zones": aggregate_zones(quake),
    }
