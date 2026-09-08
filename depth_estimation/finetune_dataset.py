"""
finetune_dataset.py — PyTorch Dataset wrapping the existing preprocessing
Patch objects for DA2 fine-tuning.

Reuses preprocessing.pipelines.training.process_scene() (already built
and tested — 7-stage pipeline) to produce Patch objects, then converts
each Patch's DSM into a pseudo-depth target via
depth_estimation.pseudo_depth.dsm_to_pseudo_depth(), and its imagery into
the DA2 RGB-proxy format via
preprocessing.stages.radiometric_correction.build_dav2_rgb_proxy()
(already built and tested).

Does NOT reimplement any preprocessing logic — this file is purely a thin
adapter between the existing Patch list and torch.utils.data.Dataset.
"""
from __future__ import annotations
import numpy as np
import torch
from torch.utils.data import Dataset

from preprocessing.stages.tiling import Patch
from preprocessing.stages.radiometric_correction import build_dav2_rgb_proxy
from depth_estimation.pseudo_depth import dsm_to_pseudo_depth


class DAv2FineTuneDataset(Dataset):
    """
    Wraps a list of Patch objects (from preprocessing.pipelines.training
    .process_scene(), already run through the full 7-stage pipeline) for
    DA2 fine-tuning.

    __getitem__ returns a dict with keys:
        "rgb_proxy"     — (H, W, 3) uint8 numpy array, DA2 RGB-proxy input
        "pseudo_depth"  — (H, W) float32 numpy array, training target
        "valid_mask"    — (H, W) bool numpy array

    Deliberately returns numpy, not tensors, from __getitem__ — the
    training loop's collate step converts to tensors and moves to device,
    keeping this class free of any device/dtype assumptions.
    """

    def __init__(self, patches: list[Patch]):
        self.patches = patches

    def __len__(self) -> int:
        return len(self.patches)

    def __getitem__(self, idx: int) -> dict[str, np.ndarray]:
        patch = self.patches[idx]

        # patch.imagery is already uint8 (native IR,R,G band order, per
        # Patch's existing contract from tiling.py) — build the DA2 proxy
        # from it exactly as the inference pipeline already does.
        rgb_proxy = build_dav2_rgb_proxy(patch.imagery)

        pseudo_depth, _params = dsm_to_pseudo_depth(patch.dsm, valid_mask=patch.valid_mask)

        return {
            "rgb_proxy": rgb_proxy,
            "pseudo_depth": pseudo_depth,
            "valid_mask": patch.valid_mask,
        }


def collate_finetune_batch(batch: list[dict[str, np.ndarray]]) -> dict[str, torch.Tensor]:
    """
    Custom collate_fn for DataLoader. Stacks the numpy arrays from
    multiple __getitem__ calls into batched torch tensors.

    rgb_proxy stays as a numpy-array BATCH (not torch tensor) since
    DAv2Backbone.forward_train() expects a numpy (B,H,W,3) uint8 array
    matching its existing HuggingFace processor's expected input format
    — converting to a torch tensor here would need to be undone anyway.
    """
    rgb_batch = np.stack([b["rgb_proxy"] for b in batch], axis=0)
    depth_batch = torch.from_numpy(np.stack([b["pseudo_depth"] for b in batch], axis=0)).float()
    mask_batch = torch.from_numpy(np.stack([b["valid_mask"] for b in batch], axis=0)).bool()
    return {"rgb_proxy": rgb_batch, "pseudo_depth": depth_batch, "valid_mask": mask_batch}
