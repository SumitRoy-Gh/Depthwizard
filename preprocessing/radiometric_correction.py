"""
radiometric_correction.py — Stage 1 of preprocessing.

Runs on RAW DN values (e.g. the 11-bit-in-16-bit Vaihingen IR,R,G) BEFORE
any uint8 stretch. Output is still float32 in DN-like (or physical, if
calibration coefficients are supplied) units — NOT yet display/model-ready.
That stretch is a separate later stage, kept apart deliberately so "fix the
haze" and "fix the display range" don't get conflated into one lossy step.
"""
from __future__ import annotations
import numpy as np


# ---------------------------------------------------------------------------
# 1. Sensor calibration (DN -> physical units)
# ---------------------------------------------------------------------------

def apply_sensor_calibration(dn: np.ndarray, gain: float | None = None,
                              offset: float | None = None) -> np.ndarray:
    """
    radiance = DN * gain + offset, using vendor/camera calibration coefficients.

    If gain/offset aren't available (true for a delivered orthophoto product
    like Vaihingen, where you don't have raw sensor DN + a calibration
    report), this is a DOCUMENTED pass-through — not a silent assumption
    that no calibration is needed.
    """
    if gain is None or offset is None:
        return dn.astype(np.float32)
    return dn.astype(np.float32) * gain + offset


# ---------------------------------------------------------------------------
# 2. Dark Object Subtraction (Chavez, 1988) — atmospheric haze removal
# ---------------------------------------------------------------------------

def estimate_dark_object(band: np.ndarray, valid_mask: np.ndarray | None = None,
                          percentile: float = 0.5) -> float:
    """
    Estimate the additive atmospheric-haze offset for one band as a very low
    percentile of its histogram (the darkest ~percentile% of valid pixels —
    deep shadow, clear water — assumed close to zero true reflectance; any
    DN they show above zero is attributed to haze).
    percentile is in PERCENT (0.5 = the 0.5th percentile), not a fraction.
    """
    sample = band[valid_mask] if valid_mask is not None else band.ravel()
    return float(np.percentile(sample.astype("float64"), percentile))


def dark_object_subtraction(native: np.ndarray, valid_mask: np.ndarray | None = None,
                             percentile: float = 0.5) -> tuple[np.ndarray, list[float]]:
    """
    native: (H, W, C). Returns (corrected float32 array, per-channel dark
    values subtracted). Clipped at zero — DN/radiance can't go negative.
    """
    corrected = np.zeros(native.shape, dtype=np.float32)
    dark_values = []
    for c in range(native.shape[-1]):
        dark = estimate_dark_object(native[..., c], valid_mask, percentile)
        corrected[..., c] = np.clip(native[..., c].astype(np.float32) - dark, 0, None)
        dark_values.append(dark)
    return corrected, dark_values


# ---------------------------------------------------------------------------
# 3. Cross-scene consistency (different capture dates / strips)
# ---------------------------------------------------------------------------

def compute_reference_stats(band: np.ndarray, valid_mask: np.ndarray | None = None) -> tuple[float, float]:
    sample = band[valid_mask] if valid_mask is not None else band.ravel()
    return float(sample.mean()), float(sample.std())


def match_to_reference_stats(band: np.ndarray, ref_mean: float, ref_std: float,
                              valid_mask: np.ndarray | None = None) -> np.ndarray:
    """
    Linear mean/std histogram matching to a reference scene's statistics.
    Deliberately simple (not full histogram-shape matching) because it's
    robust with small sample areas and easy to reason about — it preserves
    relative contrast within a scene while aligning overall
    brightness/contrast to the reference.
    """
    sample = band[valid_mask] if valid_mask is not None else band.ravel()
    mean, std = sample.mean(), sample.std()
    if std < 1e-6:
        return band.copy()
    return ((band - mean) / std * ref_std + ref_mean).astype(np.float32)


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------

def apply_radiometric_correction(
    native_dn: np.ndarray,
    valid_mask: np.ndarray | None = None,
    gain: float | None = None,
    offset: float | None = None,
    reference_stats: list[tuple[float, float]] | None = None,
    dos_percentile: float = 0.5,
) -> tuple[np.ndarray, dict]:
    """
    Full chain: sensor calibration -> DOS -> optional cross-scene matching.

    reference_stats: list of (mean, std) per channel from a reference area's
    OWN post-DOS output. Pass None when processing the reference area itself
    (typically the first area processed); pass the reference area's stats
    when processing every subsequent area, so they all get pulled toward the
    same brightness/contrast baseline.

    Returns (corrected float32 array, debug_info dict) — debug_info always
    gets logged so you can audit exactly what each stage did per area.
    """
    calibrated = np.stack([
        apply_sensor_calibration(native_dn[..., c], gain, offset)
        for c in range(native_dn.shape[-1])
    ], axis=-1)

    dos_corrected, dark_values = dark_object_subtraction(calibrated, valid_mask, dos_percentile)

    debug_info = {
        "calibration_applied": gain is not None and offset is not None,
        "dark_object_values": dark_values,
        "cross_scene_matched": reference_stats is not None,
    }

    if reference_stats is not None:
        matched = np.zeros_like(dos_corrected)
        for c in range(dos_corrected.shape[-1]):
            ref_mean, ref_std = reference_stats[c]
            matched[..., c] = match_to_reference_stats(dos_corrected[..., c], ref_mean, ref_std, valid_mask)
        dos_corrected = matched

    return dos_corrected, debug_info