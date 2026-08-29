# Next Step Specification: Depth Anything v2 (DAv2) Integration

> **File**: `DOCS/next-step.md`  
> **Target Developer**: ML / Backend Developer  
> **Scope**: **Depth Anything v2 (DAv2) Integration ONLY**  
> *(Note: Do NOT implement the Correction U-Net, loss functions, or training loop in this task.)*

---

## 1. Task Objective

Your sole responsibility in this step is to integrate the pre-trained **Depth Anything v2 (DAv2)** foundation model as a frozen feature extractor.

---

## 2. What You Have To Do

1. **Input Ingestion**:
   - Call `load_and_preprocess()` from `preprocessing.pipelines.inference`.
   - Extract the `dav2_input` tensor (`(H, W, 3)` `uint8` array, RGB proxy format).

2. **Model Forward Pass**:
   - Load pre-trained Depth Anything v2 weights (e.g., `Depth-Anything-V2-Base` checkpoint).
   - Freeze model parameters (`eval()` mode, `torch.no_grad()`).
   - Pass `dav2_input` through the frozen DAv2 model.

---

## 3. What Output You Will Produce

- **Output Tensor**: A 2D `float32` array `D_prior` of spatial shape `(H, W)`.
- **Meaning**: Represents the uncalibrated, relative monocular depth map predicted by DAv2.

---

## 4. What We Will Do With That Output (Downstream Task)

Once `D_prior` is produced, the subsequent phase (**Correction U-Net**) will:

1. **Concatenate Inputs**:
   - Stack the 3-channel preprocessed imagery and 1-channel `D_prior` into a **4-channel input tensor**: `[RGB, D_prior]` of shape `(4, H, W)`.

2. **Train Correction U-Net**:
   - The Correction U-Net will take this 4-channel tensor and learn the mapping $H_{\text{pred}} = a \cdot D_{\text{prior}} + b + R(I, D)$ to convert relative depth into absolute ground-truth elevation (DSM).
