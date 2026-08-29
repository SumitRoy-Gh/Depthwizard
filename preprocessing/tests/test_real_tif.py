"""
test_real_tif.py — helper to test the inference pipeline with a real file.

Usage:
  uv run python preprocessing/tests/test_real_tif.py path/to/your/image.tif
"""
import sys
import os
import time

# Ensure we can import the package
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from preprocessing.pipelines.inference import load_and_preprocess

def main():
    if len(sys.argv) < 2:
        print("Usage: uv run python preprocessing/tests/test_real_tif.py <path_to_image>")
        sys.exit(1)
        
    image_path = sys.argv[1]
    
    if not os.path.exists(image_path):
        print(f"Error: File not found: {image_path}")
        sys.exit(1)
        
    print(f"Running inference pipeline on: {image_path}")
    print("-" * 50)
    
    start_time = time.time()
    
    # Run the full pipeline!
    result = load_and_preprocess(
        image_path,
        target_gsd_m=None,      # Set to None to prevent 34GB memory crash on unscaled test files
        verbose=True,
    )
    
    elapsed = time.time() - start_time
    print("-" * 50)
    print(f"Done in {elapsed:.2f} seconds!")
    print("\nResult summary:")
    print(f"  preprocessed array: shape {result['preprocessed'].shape}, dtype {result['preprocessed'].dtype}")
    print(f"  dav2_input proxy:   shape {result['dav2_input'].shape}, dtype {result['dav2_input'].dtype}")
    print(f"  valid_mask:         shape {result['valid_mask'].shape}, fraction true = {result['valid_mask'].mean():.3f}")
    print("\nMetadata:")
    meta = result["meta"]
    print(f"  Width:  {meta.width} px")
    print(f"  Height: {meta.height} px")
    print(f"  Is Geo: {meta.is_georeferenced}")
    if meta.is_georeferenced:
        print(f"  CRS:    {meta.crs}")
    print(f"  GSD:    {meta.gsd_m} meters/pixel")
    
if __name__ == "__main__":
    main()
