import numpy as np
import torch
from depth_estimation.finetune_dataset import DAv2FineTuneDataset, collate_finetune_batch
from preprocessing.stages.tiling import Patch

def test_dataset_and_collate():
    patches = []
    for _ in range(3):
        imagery = np.random.randint(0, 255, (10, 10, 3), dtype=np.uint8)
        dsm = np.random.rand(10, 10).astype(np.float32)
        valid_mask = np.ones((10, 10), dtype=bool)
        patch = Patch(imagery=imagery, dsm=dsm, valid_mask=valid_mask, row_off=0, col_off=0)
        patches.append(patch)
        
    ds = DAv2FineTuneDataset(patches)
    assert len(ds) == 3
    print("PASS: Dataset __len__")
    
    item = ds[0]
    assert "rgb_proxy" in item and "pseudo_depth" in item and "valid_mask" in item
    assert item["rgb_proxy"].shape == (10, 10, 3)
    assert item["rgb_proxy"].dtype == np.uint8
    print("PASS: Dataset __getitem__")
    
    batch = [ds[i] for i in range(3)]
    collated = collate_finetune_batch(batch)
    
    assert collated["rgb_proxy"].shape == (3, 10, 10, 3)
    assert isinstance(collated["rgb_proxy"], np.ndarray)
    
    assert collated["pseudo_depth"].shape == (3, 10, 10)
    assert isinstance(collated["pseudo_depth"], torch.Tensor)
    assert collated["pseudo_depth"].dtype == torch.float32
    
    assert collated["valid_mask"].shape == (3, 10, 10)
    assert isinstance(collated["valid_mask"], torch.Tensor)
    assert collated["valid_mask"].dtype == torch.bool
    print("PASS: collate_finetune_batch")
