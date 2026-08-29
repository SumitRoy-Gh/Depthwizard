# 04. Stage 4: Contrast Enhancement (CLAHE) — Technical Specification

- **Source File**: [`preprocessing/stages/contrast_enhancement.py`](file:///d:/SIH175/preprocessing/stages/contrast_enhancement.py)
- **Function**: `enhance_contrast(image, clip_limit=2.0, tile_grid_size=(8, 8), valid_mask=None)`

---

## 1. Problem Statement & Technical Selection

Aerial imagery captured under varying sun angles or atmospheric haze often exhibits suppressed local contrast. Standard **Global Histogram Equalization** calculates a single cumulative distribution function (CDF) across the entire scene, which over-saturates bright building roofs and washes out subtle ground surface textures.

Stage 4 utilizes **CLAHE (Contrast Limited Adaptive Histogram Equalization)**:
1. **Adaptive (Local)**: Computes independent histogram transformations across local spatial tiles ($8 \times 8$ grid).
2. **Contrast-Limited**: Clips histogram peaks at a specified threshold (`clip_limit=2.0`) to prevent noise amplification in uniform regions (such as shadows or calm water).

```mermaid
flowchart LR
    Input["Input Denoised Image (uint8)"] --> Tile["Divide into 8x8 Grid Tiles"]
    Tile --> Hist["Compute Tile Histograms"]
    Hist --> Clip["Clip Peaks > clip_limit (2.0)<br/>Redistribute Clipped Pixels"]
    Clip --> CDF["Compute Tile CDFs"]
    CDF --> Interp["Bilinear Interpolation<br/>Between Tile Boundaries"]
    Interp --> Mask["Re-apply valid_mask<br/>(Masked pixels = 0)"]
    Mask --> Output["Enhanced Image (uint8)"]
```

---

## 2. Mathematical Foundation

### 2.1 Contrast-Limited Histogram Clipping

For a local tile with $N$ pixels and $L = 256$ intensity levels, the histogram $h(k)$ counts occurrences of intensity $k$. The clip limit threshold $\beta$ is computed as:

$$\beta = \text{clip\_limit} \times \frac{N}{L}$$

Histogram counts exceeding $\beta$ are clipped:

$$h_{\text{clipped}}(k) = \min(h(k), \; \beta)$$

The total number of clipped pixels $N_{\text{clipped}} = \sum_{k=0}^{L-1} \max(0, \; h(k) - \beta)$ is redistributed uniformly across all $L$ bins:

$$h_{\text{final}}(k) = h_{\text{clipped}}(k) + \frac{N_{\text{clipped}}}{L}$$

---

### 2.2 Bilinear Boundary Interpolation

To eliminate artificial boundaries between neighboring $8 \times 8$ grid tiles, pixel intensities are transformed using bilinear interpolation of the CDF mappings from four surrounding tile centers $(C_{TL}, C_{TR}, C_{BL}, C_{BR})$.

---

## 3. Function Breakdown & Implementation

```python
def enhance_contrast(
    image: np.ndarray,
    clip_limit: float = 2.0,
    tile_grid_size: tuple[int, int] = (8, 8),
    valid_mask: np.ndarray | None = None,
) -> np.ndarray:
    """
    Applies CLAHE per-channel to uint8 imagery.
    Respects valid_mask by zeroing out invalid pixels post-enhancement.
    """
    if image.dtype != np.uint8:
        raise ValueError(f"enhance_contrast requires uint8 image, got {image.dtype}")

    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=tile_grid_size)

    if image.ndim == 2:
        enhanced = clahe.apply(image)
    else:
        channels = [clahe.apply(image[..., i]) for i in range(image.shape[2])]
        enhanced = np.stack(channels, axis=-1)

    if valid_mask is not None:
        enhanced[~valid_mask] = 0

    return enhanced
```

---

## 4. Input Constraints & Type Safety

- **`uint8` Restriction**: OpenCV's `createCLAHE` strictly requires 8-bit unsigned integer arrays. Passing `float32` arrays raises `ValueError`, enforcing correct pipeline ordering (Stage 1 stretching must precede Stage 4 CLAHE).
- **Mask Integrity**: Invalid nodata pixels are zeroed out post-CLAHE so local distribution spreading does not assign non-zero values to background collars.
