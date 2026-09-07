"""
test_all_depth_estimation.py
"""
import sys
import os

# Ensure the root directory is in the python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

def main():
    print("Running test_pseudo_depth...")
    from depth_estimation.tests import test_pseudo_depth
    test_pseudo_depth.test_shape_and_dtype()
    test_pseudo_depth.test_sign_convention()
    test_pseudo_depth.test_output_minimum()
    test_pseudo_depth.test_valid_mask_exclusion()
    test_pseudo_depth.test_degenerate_case()
    
    print("\nRunning test_losses...")
    from depth_estimation.tests import test_losses
    test_losses.test_zero_loss()
    test_losses.test_positive_loss()
    test_losses.test_valid_mask()
    test_losses.test_all_false_mask()
    test_losses.test_differentiability()
    
    print("\nRunning test_finetune_dataset...")
    from depth_estimation.tests import test_finetune_dataset
    test_finetune_dataset.test_dataset_and_collate()
    
    print("\nRunning test_dav2_backbone_frozen_flag...")
    from depth_estimation.tests import test_dav2_backbone_frozen_flag
    test_dav2_backbone_frozen_flag.test_frozen_default()
    test_dav2_backbone_frozen_flag.test_unfrozen()
    test_dav2_backbone_frozen_flag.test_existing_zeroshot_behavior()
    
    print("\nALL DEPTH ESTIMATION TESTS PASSED (OR SKIPPED)")

if __name__ == "__main__":
    main()
