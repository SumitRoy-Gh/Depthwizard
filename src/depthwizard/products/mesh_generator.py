import numpy as np
import rasterio
import trimesh
import os
import json
from PIL import Image

def generate_lod_mesh(
    dsm: np.ndarray,
    imagery: np.ndarray,
    gsd_m: float = 0.09,
    step: int = 1,
    z_scale: float = 1.0
) -> trimesh.Trimesh:
    """
    Generate a triangulated 3D mesh from a DSM and imagery with a specific decimation step.
    
    Args:
        dsm: (H, W) array of absolute elevations.
        imagery: (3, H, W) array of RGB values [0-255].
        gsd_m: Ground sample distance in meters.
        step: Decimation step (e.g. 1=100%, 2=25%, 4=6.25%).
        z_scale: Scaling factor for Z axis (elevation exaggeration).
        
    Returns:
        trimesh.Trimesh object with vertex colors.
    """
    H, W = dsm.shape
    
    # Subsample data
    h_sub = dsm[::step, ::step]
    img_sub = imagery[:, ::step, ::step]
    
    sub_H, sub_W = h_sub.shape
    
    # Create coordinate grid centered around 0,0
    # X and Y are in meters
    x = (np.arange(sub_W) - sub_W/2) * (gsd_m * step)
    y = (np.arange(sub_H) - sub_H/2) * (gsd_m * step)
    
    # y goes down (image coordinates), we want standard 3D coordinates where Y goes up (North)
    # Actually, Three.js uses Y-up by default, Z-forward, X-right.
    # Let's map X to X, Y to Z (depth), Z (elevation) to Y.
    # To keep it standard GIS: X=East, Y=North, Z=Up
    X, Y = np.meshgrid(x, y[::-1]) # flip Y so North is positive
    
    Z = h_sub * z_scale
    
    vertices = np.column_stack((X.ravel(), Y.ravel(), Z.ravel()))
    
    # Create faces (two triangles per grid cell)
    # i, j is top-left corner of the cell
    i = np.arange(sub_H - 1)
    j = np.arange(sub_W - 1)
    I, J = np.meshgrid(i, j, indexing='ij')
    
    # Vertex indices
    v0 = I * sub_W + J
    v1 = v0 + 1
    v2 = (I + 1) * sub_W + J
    v3 = v2 + 1
    
    # Triangle 1: v0, v2, v1
    # Triangle 2: v1, v2, v3
    faces = np.column_stack((
        v0.ravel(), v2.ravel(), v1.ravel(),
        v1.ravel(), v2.ravel(), v3.ravel()
    )).reshape(-1, 3)
    
    # Colors
    colors = np.column_stack((
        img_sub[0].ravel(),
        img_sub[1].ravel(),
        img_sub[2].ravel(),
        np.full(sub_H * sub_W, 255) # Alpha
    ))
    
    mesh = trimesh.Trimesh(vertices=vertices, faces=faces, vertex_colors=colors)
    # Re-orient for Three.js (X=Right, Y=Up, Z=Backward)
    # Rotate 90 degrees around X axis to flip Y and Z
    rot = trimesh.transformations.rotation_matrix(np.radians(-90), [1,0,0])
    mesh.apply_transform(rot)
    
    return mesh

def export_tiled_scene(
    dsm_path: str,
    imagery_path: str,
    output_dir: str,
    scene_name: str = "scene",
    chunk_size: int = 512,
    z_scale: float = 1.0
):
    """
    Stage 7: Generates a tiled LOD 3D scene from the final Stage 6 DSM.
    """
    os.makedirs(output_dir, exist_ok=True)
    
    with rasterio.open(dsm_path) as f:
        dsm = f.read(1)
        gsd_m = f.transform[0] # assuming square pixels
        if gsd_m == 1.0: 
            gsd_m = 0.09 # fallback
            
    with rasterio.open(imagery_path) as f:
        imagery = f.read()[:3]
        
    H, W = dsm.shape
    
    # Ensure imagery and DSM are the same shape (they should be from pipeline)
    if imagery.shape[1:] != dsm.shape:
        print(f"Resizing imagery {imagery.shape} to match DSM {dsm.shape}...")
        import cv2
        img_hwc = np.transpose(imagery, (1, 2, 0))
        img_hwc = cv2.resize(img_hwc, (W, H))
        imagery = np.transpose(img_hwc, (2, 0, 1))

    # Center the entire scene so chunks align
    center_offset_x = (W * gsd_m) / 2
    center_offset_y = (H * gsd_m) / 2
    
    manifest = {
        "scene_name": scene_name,
        "width_m": W * gsd_m,
        "height_m": H * gsd_m,
        "chunks": []
    }
    
    print(f"Generating 3D chunks for {scene_name} ({W}x{H}) into {output_dir}...")
    
    # Generate chunks
    for y in range(0, H, chunk_size):
        for x in range(0, W, chunk_size):
            y_end = min(y + chunk_size + 1, H) # +1 for stitching overlap
            x_end = min(x + chunk_size + 1, W)
            
            chunk_dsm = dsm[y:y_end, x:x_end]
            chunk_img = imagery[:, y:y_end, x:x_end]
            
            chunk_id = f"chunk_{x}_{y}"
            
            # Position of this chunk relative to scene center (Three.js coordinates)
            # Standard GIS: +X is East, +Y is North.
            # Three.js: +X is East, -Z is North, +Y is Up.
            cx = (x + (x_end - x)/2) * gsd_m - center_offset_x
            cz = -((H - y - (y_end - y)/2) * gsd_m - center_offset_y) # inverted Y for Z axis
            
            chunk_data = {
                "id": chunk_id,
                "position": [float(cx), 0, float(cz)],
                "lods": {}
            }
            
            # Generate LODs
            # LOD0: Step 1
            mesh0 = generate_lod_mesh(chunk_dsm, chunk_img, gsd_m, step=1, z_scale=z_scale)
            lod0_file = f"{chunk_id}_lod0.glb"
            mesh0.export(os.path.join(output_dir, lod0_file))
            chunk_data["lods"]["0"] = lod0_file
            
            # LOD1: Step 4
            mesh1 = generate_lod_mesh(chunk_dsm, chunk_img, gsd_m, step=4, z_scale=z_scale)
            lod1_file = f"{chunk_id}_lod1.glb"
            mesh1.export(os.path.join(output_dir, lod1_file))
            chunk_data["lods"]["1"] = lod1_file
            
            manifest["chunks"].append(chunk_data)
            print(f"  Exported {chunk_id} (Vertices LOD0: {len(mesh0.vertices)}, LOD1: {len(mesh1.vertices)})")

    # Save manifest
    manifest_path = os.path.join(output_dir, "scene.json")
    with open(manifest_path, 'w') as f:
        json.dump(manifest, f, indent=2)
        
    print(f"Export complete. Manifest: {manifest_path}")
    return manifest_path
