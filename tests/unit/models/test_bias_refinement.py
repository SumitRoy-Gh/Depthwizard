import torch
import numpy as np
import pytest

from depthwizard.models.bias_refinement import HTC_BiasRefinementNet
from depthwizard.models.losses import HeadTailCutLoss
from depthwizard.calibration.htc_refinement import apply_bias_refinement

def test_bias_refinement_net_forward():
    # 1 batch, 1 channel, 64x64
    x = torch.randn(1, 1, 64, 64)
    model = HTC_BiasRefinementNet(in_channels=1, num_bins=64)
    
    refined_h, bin_centers, probs = model(x)
    
    # Check shapes
    assert refined_h.shape == (1, 1, 64, 64)
    assert bin_centers.shape == (1, 64)
    assert probs.shape == (1, 64, 64, 64)
    
    # Check probabilities sum to 1 over the bin dimension
    prob_sum = probs.sum(dim=1)
    assert torch.allclose(prob_sum, torch.ones_like(prob_sum))
    
    # Check bin centers are strictly increasing
    diffs = bin_centers[:, 1:] - bin_centers[:, :-1]
    assert torch.all(diffs > 0)
    
def test_htc_loss():
    loss_fn = HeadTailCutLoss(tail_threshold_m=2.0, tail_weight=3.0)
    
    # Create target with 50% head (1.0m) and 50% tail (5.0m)
    target = torch.ones(1, 1, 10, 10)
    target[:, :, 5:, :] = 5.0
    
    # Pred has uniform error of 1.0m everywhere
    pred = target - 1.0
    
    loss = loss_fn(pred, target)
    
    # Head error is 1.0, weighted by 1.0. 
    # Tail error is 1.0, weighted by 3.0.
    # Expected mean loss = (1.0 + 3.0) / 2 = 2.0
    assert torch.isclose(loss, torch.tensor(2.0))
    
def test_htc_inference_wrapper(tmp_path):
    dsm = np.ones((64, 64), dtype=np.float32) * 10.0
    
    # 1. Test fallback without weights
    out_fallback = apply_bias_refinement(dsm, weights_path=None)
    assert np.allclose(out_fallback, dsm)
    
    # 2. Test successful forward pass with dummy weights
    model = HTC_BiasRefinementNet(in_channels=1)
    weight_path = tmp_path / "dummy_weights.pt"
    torch.save(model.state_dict(), weight_path)
    
    # Even with random weights, it should run without crashing
    out_refined = apply_bias_refinement(dsm, weights_path=str(weight_path), device='cpu')
    assert out_refined.shape == (64, 64)
    # The output will be scrambled noise because weights are untrained, but the forward pass is proven.
    assert out_refined.dtype == np.float32
