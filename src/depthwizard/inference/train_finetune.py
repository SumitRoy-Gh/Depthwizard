"""
train_finetune.py
"""
import argparse
import os
from pathlib import Path
import torch
from torch.utils.data import DataLoader

from depthwizard.preprocessing.ingest.training import load_scene
from depthwizard.preprocessing.pipelines.training import process_scene
from depthwizard.preprocessing.tiling import split_by_area
from depthwizard.ingestion.finetune_dataset import DAv2FineTuneDataset, collate_finetune_batch
from depthwizard.models.dav2_backbone import DAv2Backbone
from depthwizard.models.losses import silog_loss


def match_pairs(imagery_dir: Path, dsm_dir: Path) -> list[tuple[Path, Path]]:
    imagery_files = list(imagery_dir.glob("*.tif"))
    dsm_files = list(dsm_dir.glob("*.tif"))
    
    imagery_stems = {f.name.replace("_imagery.tif", ""): f for f in imagery_files if "_imagery.tif" in f.name}
    dsm_stems = {f.name.replace("_dsm.tif", ""): f for f in dsm_files if "_dsm.tif" in f.name}
    
    pairs = []
    for stem, img_path in imagery_stems.items():
        if stem not in dsm_stems:
            raise ValueError(f"No DSM match found for imagery file: {img_path}")
        pairs.append((img_path, dsm_stems[stem]))
        
    for stem, dsm_path in dsm_stems.items():
        if stem not in imagery_stems:
            raise ValueError(f"No imagery match found for DSM file: {dsm_path}")
            
    return pairs

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--imagery-dir", type=str, required=True)
    parser.add_argument("--dsm-dir", type=str, required=True)
    parser.add_argument("--target-gsd", type=float, default=0.09)
    parser.add_argument("--tile-size", type=int, default=256)
    parser.add_argument("--epochs", type=int, default=10)
    parser.add_argument("--batch-size", type=int, default=4)
    parser.add_argument("--lr", type=float, default=1e-5)
    parser.add_argument("--backbone-size", type=str, default="small")
    parser.add_argument("--checkpoint-dir", type=str, default="checkpoints/dav2_finetune")
    parser.add_argument("--val-split-ratio", type=float, default=0.2)
    args = parser.parse_args()

    print("NOTE: fine-tuning risk — this may cause catastrophic forgetting of "
          "DA2's general depth prior if the learning rate is too high or too many "
          "epochs are run without validation improvement. Watch the val MAE trend, "
          "not just train loss.")

    imagery_dir = Path(args.imagery_dir)
    dsm_dir = Path(args.dsm_dir)
    pairs = match_pairs(imagery_dir, dsm_dir)
    
    all_patches = []
    for img_path, dsm_path in pairs:
        imagery, dsm, meta = load_scene(str(img_path), str(dsm_path))
        
        print(f"[Debug] {img_path.name}: source_gsd_m = {meta.gsd_m}")
        if meta.gsd_m is None or meta.gsd_m > 0.5:
            print(f"[Warning] Suspicious GSD ({meta.gsd_m}) for {img_path.name} — assuming missing georeferencing. Hard-coding known Vaihingen GSD (0.09m).")
            meta.gsd_m = 0.09

        patches = process_scene(
            raw_ir_r_g=imagery, 
            raw_dsm=dsm, 
            source_gsd_m=meta.gsd_m, 
            target_gsd_m=args.target_gsd, 
            tile_size=args.tile_size,
            verbose=False,
        )
        all_patches.extend(patches)
        
    if not all_patches:
        raise ValueError("No patches extracted.")

    max_row_off = max(p.row_off for p in all_patches)
    split_point = int(max_row_off * (1.0 - args.val_split_ratio))
    
    test_area_row_ranges = [(split_point, max_row_off + args.tile_size)]
    train_patches, val_patches = split_by_area(all_patches, test_area_row_ranges)

    train_ds = DAv2FineTuneDataset(train_patches)
    val_ds = DAv2FineTuneDataset(val_patches)
    
    train_loader = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True, collate_fn=collate_finetune_batch)
    val_loader = DataLoader(val_ds, batch_size=args.batch_size, shuffle=False, collate_fn=collate_finetune_batch)

    dav2 = DAv2Backbone(size=args.backbone_size, frozen=False)
    optimizer = torch.optim.AdamW(dav2.model.parameters(), lr=args.lr)
    
    os.makedirs(args.checkpoint_dir, exist_ok=True)
    
    best_val_loss = float('inf')

    try:
        for epoch in range(args.epochs):
            dav2.model.train()
            train_loss = 0.0
            
            for batch in train_loader:
                rgb_proxy = batch["rgb_proxy"]
                pseudo_depth = batch["pseudo_depth"].to(dav2.device)
                valid_mask = batch["valid_mask"].to(dav2.device)
                
                optimizer.zero_grad()
                pred = dav2.forward_train(rgb_proxy)
                
                loss = silog_loss(pred, pseudo_depth, valid_mask=valid_mask)
                loss.backward()
                optimizer.step()
                
                train_loss += loss.item()
                
            train_loss /= max(1, len(train_loader))
            
            dav2.model.eval()
            val_loss = 0.0
            val_mae = 0.0
            
            with torch.no_grad():
                for batch in val_loader:
                    rgb_proxy = batch["rgb_proxy"]
                    pseudo_depth = batch["pseudo_depth"].to(dav2.device)
                    valid_mask = batch["valid_mask"].to(dav2.device)
                    
                    pred = dav2.forward_train(rgb_proxy)
                    
                    loss = silog_loss(pred, pseudo_depth, valid_mask=valid_mask)
                    val_loss += loss.item()
                    
                    mae = torch.mean(torch.abs(pred[valid_mask] - pseudo_depth[valid_mask]))
                    val_mae += mae.item()
                    
            val_loss /= max(1, len(val_loader))
            val_mae /= max(1, len(val_loader))
            
            print(f"Epoch {epoch}: Train SiLog: {train_loss:.4f}, Val SiLog: {val_loss:.4f}, Val MAE: {val_mae:.4f}")
            
            torch.save(dav2.model.state_dict(), os.path.join(args.checkpoint_dir, f"epoch_{epoch}.pt"))
            if val_loss < best_val_loss:
                best_val_loss = val_loss
                torch.save(dav2.model.state_dict(), os.path.join(args.checkpoint_dir, "best.pt"))

    except Exception as e:
        print(f"Training interrupted: {e}")
        torch.save(dav2.model.state_dict(), os.path.join(args.checkpoint_dir, "interrupted.pt"))
        raise

if __name__ == "__main__":
    main()
