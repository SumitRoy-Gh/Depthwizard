import torch
import numpy as np

def apply_bias_refinement(
    calibrated_dsm: np.ndarray,
    weights_path: str = None,
    device: str = "cuda" if torch.cuda.is_available() else "cpu"
) -> np.ndarray:
    """
    Stage 5: Bias-Aware Height Refinement (Inference Wrapper).
    
    This function loads the HTC-AdaBins BiasRefinementNet and applies it to the
    calibrated DSM to correct the long-tailed building height underestimation.
    
    If no weights are provided (e.g. before the network has been trained on a
    specific domain), it safely passes through the calibrated DSM unchanged,
    but logs a warning.
    
    Args:
        calibrated_dsm: (H, W) float32 array, absolute height map.
        weights_path: Path to the trained BiasRefinementNet weights (.pt).
        device: 'cuda' or 'cpu'.
        
    Returns:
        (H, W) float32 array, bias-corrected absolute height map.
    """
    if weights_path is None:
        print("  [WARN] Stage 5: No bias refinement weights provided. Passing through unrefined DSM.")
        return calibrated_dsm.copy()
        
    try:
        from depthwizard.models.bias_refinement import HTC_BiasRefinementNet
        model = HTC_BiasRefinementNet(in_channels=1).to(device)
        model.load_state_dict(torch.load(weights_path, map_location=device))
        model.eval()
        
        # Convert numpy to tensor: [1, 1, H, W]
        input_tensor = torch.from_numpy(calibrated_dsm).unsqueeze(0).unsqueeze(0).float().to(device)
        
        with torch.no_grad():
            refined_h, _, _ = model(input_tensor)
            
        refined_numpy = refined_h.squeeze().cpu().numpy()
        print("  [OK] Stage 5: Bias-Aware Height Refinement applied successfully.")
        return refined_numpy
        
    except FileNotFoundError:
        print(f"  [WARN] Stage 5: Weights not found at {weights_path}. Passing through unrefined DSM.")
        return calibrated_dsm.copy()
    except Exception as e:
        print(f"  [ERROR] Stage 5: Failed to apply bias refinement ({str(e)}). Passing through.")
        return calibrated_dsm.copy()
