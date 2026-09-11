"""
losses.py — Scale-Invariant Logarithmic (SiLog) loss for DA2 fine-tuning.

SiLog is the standard loss for training/fine-tuning monocular depth
models when the training target's absolute scale may not perfectly match
the model's natural output scale (which is exactly our situation: our
pseudo-depth is DSM-elevation-derived, not a true calibrated depth
measurement). This is an EXISTING, widely-published loss formulation
(used across the monocular depth estimation literature, including in the
published Sat3R fine-tuning recipe referenced in this project's other
documentation) — NOT invented for this project.

Formula, for valid pixels i where both prediction and target are > 0:
    d_i = log(pred_i) - log(target_i)
    L = mean(d_i^2) - lambda * (mean(d_i))^2

lambda in [0, 1] trades off pure per-pixel log-error (lambda=0) against
full scale-invariance (lambda=1, cancels out any constant scale/shift
offset between prediction and target entirely). lambda=0.5 is the
standard default used in the literature and is used here unless
overridden.
"""
from __future__ import annotations
import torch


def silog_loss(
    pred: "torch.Tensor",
    target: "torch.Tensor",
    valid_mask: "torch.Tensor | None" = None,
    lam: float = 0.5,
    eps: float = 1e-6,
) -> "torch.Tensor":
    """
    pred, target: (B, H, W) float tensors. Must be the SAME shape.
    valid_mask: optional (B, H, W) bool tensor — pixels where this is
        False are excluded from the loss entirely (same masking
        convention as the rest of this codebase's valid_mask usage).
    lam: scale-invariance weight, in [0, 1]. Default 0.5 (literature
        standard for monocular depth training/fine-tuning).
    eps: small constant added before log() to avoid log(0)/log(negative)
        — pred and target are clamped to at least eps before taking log,
        rather than raising an error on non-positive values, since a
        fine-tuning run should never crash mid-epoch on a single bad
        pixel.

    Returns a scalar loss tensor. If valid_mask leaves ZERO valid pixels
    for a given batch, returns a zero-valued loss (with grad_fn preserved
    via pred.sum() * 0.0) instead of raising or returning NaN — this can
    happen on rare all-masked-out patches and must not crash training.
    """
    if valid_mask is None:
        valid_mask = torch.ones_like(pred, dtype=torch.bool)

    if valid_mask.sum() == 0:
        return pred.sum() * 0.0

    pred_safe = torch.clamp(pred, min=eps)
    target_safe = torch.clamp(target, min=eps)

    d = torch.log(pred_safe[valid_mask]) - torch.log(target_safe[valid_mask])
    loss = torch.mean(d ** 2) - lam * (torch.mean(d) ** 2)
    return loss


# ---------------------------------------------------------------------------
# HTC Loss Export
# ---------------------------------------------------------------------------
from .htc_loss import HeadTailCutLoss
