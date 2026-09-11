import torch
import torch.nn as nn
import torch.nn.functional as F

class HeadTailCutLoss(nn.Module):
    """
    Stage 5: Head-Tail Cut (HTC) Loss for Bias-Aware Height Refinement.
    
    This loss explicitly separates the height distribution into:
    - Head (e.g. background/ground): Numerically abundant, low height.
    - Tail (e.g. buildings/foreground): Numerically rare, high height.
    
    By weighting the Tail (buildings) more heavily or treating them with a 
    classification proxy, it prevents the systemic underestimation caused by 
    naively applying MSE on long-tailed height distributions.
    """
    def __init__(self, tail_threshold_m=2.0, tail_weight=3.0):
        super().__init__()
        self.tail_threshold_m = tail_threshold_m
        self.tail_weight = tail_weight
        self.l1_loss = nn.L1Loss(reduction='none')

    def forward(self, pred_h, target_h):
        """
        Args:
            pred_h: [B, 1, H, W] Refined height prediction.
            target_h: [B, 1, H, W] Ground truth height.
            
        Returns:
            total_loss: Scalar loss value.
        """
        # Pixel-wise L1 Error
        error = self.l1_loss(pred_h, target_h)
        
        # Identify the Tail (pixels taller than threshold, representing structures)
        # Using target_h to define the cut
        is_tail = (target_h >= self.tail_threshold_m).float()
        is_head = 1.0 - is_tail
        
        # Apply weighting
        weighted_error = error * (is_head + is_tail * self.tail_weight)
        
        # Return mean error
        return weighted_error.mean()
