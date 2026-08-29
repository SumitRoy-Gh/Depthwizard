"""Preprocessing stage modules — re-exports for convenience."""
from .radiometric_correction import radiometric_correction_pipeline, percentile_stretch, stretch_multiband, build_dav2_rgb_proxy
from .cloud_shadow_masking import compute_valid_mask, detect_nodata, detect_shadow, detect_cloud
from .noise_reduction import denoise_imagery, denoise_dsm
from .contrast_enhancement import enhance_contrast
from .resolution_handling import resample_to_gsd, align_dataset_to_common_gsd
from .tiling import crop_patches, split_by_area, Patch
from .large_image_tiling import process_large_raster, generate_tile_windows, feather_weight
from .data_normalisation import (
    compute_dataset_stats, normalize_image, denormalize_image,
    normalize_depth_per_patch, denormalize_depth_per_patch, ChannelStats,
)
