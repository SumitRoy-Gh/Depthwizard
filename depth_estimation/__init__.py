"""Depth Estimation package — DAv2 frozen backbone + trainable Correction U-Net."""
import os

# Prevent OpenMP duplicate library conflict crash on Windows Anaconda + PyTorch environments
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"
