# Use a lightweight Python 3.12 base image
# (This image is universally compatible. If a host has an NVIDIA GPU and uses --gpus all,
# PyTorch will detect it. If not, it will seamlessly fall back to CPU).
FROM python:3.12-slim

# Set working directory
WORKDIR /app

# Install system dependencies required for OpenCV and Rasterio (GDAL)
# We need libgdal-dev and gdal-bin for geospatial processing.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    gdal-bin \
    libgdal-dev \
    python3-gdal \
    && rm -rf /var/lib/apt/lists/*

# Set GDAL environment variables so rasterio finds it
ENV CPLUS_INCLUDE_PATH=/usr/include/gdal
ENV C_INCLUDE_PATH=/usr/include/gdal

# Copy dependency files first to leverage Docker cache
COPY requirements.txt pyproject.toml ./

# Install python dependencies (including PyTorch). 
# This automatically grabs the version of PyTorch that has CUDA binaries bundled, 
# ensuring GPU compatibility if the host supports it.
RUN pip install --no-cache-dir -r requirements.txt

# Copy the source code and necessary directories
COPY src/ /app/src/
COPY main.py /app/main.py
COPY viewer/ /app/viewer/

# Install the local package
RUN pip install .

# Define VOLUMES. 
# We do not copy the massive models or datasets into the image. 
# Instead, users will mount them at runtime.
VOLUME ["/app/data", "/app/models", "/app/dataset"]

# Expose the FastAPI port
EXPOSE 8000

# Run the FastAPI server via Uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
