"""Pipeline orchestrators — training and inference."""
from .training import process_scene, normalize_pooled_patches, save_stats
from .inference import preprocess_for_inference, load_and_preprocess
