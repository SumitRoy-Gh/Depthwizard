import torch
import torch.nn as nn
import torch.nn.functional as F

class MiniUNet(nn.Module):
    """A lightweight U-Net to extract local and global features from the height map."""
    def __init__(self, in_channels=1, hidden_dim=64):
        super().__init__()
        # Encoder
        self.enc1 = nn.Sequential(
            nn.Conv2d(in_channels, hidden_dim, 3, padding=1),
            nn.ReLU(inplace=True),
            nn.Conv2d(hidden_dim, hidden_dim, 3, padding=1),
            nn.ReLU(inplace=True)
        )
        self.pool1 = nn.MaxPool2d(2)
        
        self.enc2 = nn.Sequential(
            nn.Conv2d(hidden_dim, hidden_dim * 2, 3, padding=1),
            nn.ReLU(inplace=True),
            nn.Conv2d(hidden_dim * 2, hidden_dim * 2, 3, padding=1),
            nn.ReLU(inplace=True)
        )
        
        # Decoder
        self.up = nn.Upsample(scale_factor=2, mode='bilinear', align_corners=True)
        self.dec = nn.Sequential(
            nn.Conv2d(hidden_dim * 3, hidden_dim, 3, padding=1),
            nn.ReLU(inplace=True),
            nn.Conv2d(hidden_dim, hidden_dim, 3, padding=1),
            nn.ReLU(inplace=True)
        )

    def forward(self, x):
        e1 = self.enc1(x)
        e2 = self.enc2(self.pool1(e1))
        
        d = self.up(e2)
        out = self.dec(torch.cat([d, e1], dim=1))
        
        # Return both dense spatial features and global contextual features
        global_feat = F.adaptive_avg_pool2d(e2, 1).flatten(1)
        return out, global_feat


class HTC_BiasRefinementNet(nn.Module):
    """
    Stage 5: Bias-Aware Height Refinement (Head-Tail Cut / Adaptive Bins).
    Takes a calibrated 1-channel height map (or relative depth map) and 
    corrects systemic underestimation of long-tailed (building) heights.
    """
    def __init__(self, in_channels=1, num_bins=256, hidden_dim=64, min_val=0.01, max_val=250.0):
        super().__init__()
        self.num_bins = num_bins
        self.min_val = min_val
        self.max_val = max_val
        
        # Feature extractor
        self.unet = MiniUNet(in_channels=in_channels, hidden_dim=hidden_dim)
        
        # Adaptive Bin Center Predictor (Global)
        self.bin_predictor = nn.Sequential(
            nn.Linear(hidden_dim * 2, 256),
            nn.ReLU(inplace=True),
            nn.Linear(256, num_bins),
            nn.Softmax(dim=1)  # Predict normalized bin widths
        )
        
        # Spatial Probability Predictor (Dense)
        self.prob_predictor = nn.Sequential(
            nn.Conv2d(hidden_dim, hidden_dim, 3, padding=1),
            nn.ReLU(inplace=True),
            nn.Conv2d(hidden_dim, num_bins, 1)
        )

    def forward(self, x):
        """
        Args:
            x: [B, 1, H, W] Absolute or relative height map tensor.
        Returns:
            refined_h: [B, 1, H, W] Refined continuous height.
            bin_centers: [B, num_bins] Adaptive bin centers.
            probs: [B, num_bins, H, W] Dense probability distribution.
        """
        B, C, H, W = x.shape
        
        # 1. Feature Extraction
        dense_feat, global_feat = self.unet(x)
        
        # 2. Adaptive Bins (Regression pass part 1)
        # Predict normalized bin widths (sum to 1)
        bin_widths_norm = self.bin_predictor(global_feat) # [B, num_bins]
        
        # Scale to the global height range
        bin_widths = bin_widths_norm * (self.max_val - self.min_val)
        
        # Construct bin edges and centers
        # edges[0] = min_val
        # edges[i] = edges[i-1] + width[i-1]
        bin_edges = torch.cumsum(bin_widths, dim=1)
        bin_edges = F.pad(bin_edges, (1, 0), value=0.0) + self.min_val
        
        # Centers are the midpoints between edges
        bin_centers = 0.5 * (bin_edges[:, :-1] + bin_edges[:, 1:]) # [B, num_bins]
        
        # 3. Spatial Probability (Classification pass)
        logits = self.prob_predictor(dense_feat) # [B, num_bins, H, W]
        probs = F.softmax(logits, dim=1)         # [B, num_bins, H, W]
        
        # 4. Hybrid Regression (Final expected value)
        # Reshape bin_centers for broadcasting: [B, num_bins, 1, 1]
        c = bin_centers.view(B, self.num_bins, 1, 1)
        
        refined_h = torch.sum(probs * c, dim=1, keepdim=True) # [B, 1, H, W]
        
        return refined_h, bin_centers, probs
