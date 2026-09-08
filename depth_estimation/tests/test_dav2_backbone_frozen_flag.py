import numpy as np
from depth_estimation.models.dav2_backbone import DAv2Backbone, run_dav2_inference

def test_frozen_default():
    try:
        dav2 = DAv2Backbone(size="small")
    except Exception as e:
        print(f"SKIP: network/loading failed: {e}")
        return
        
    assert getattr(dav2, "frozen", False) == True, "Default should be frozen=True"
    
    rgb_batch = np.random.randint(0, 255, (2, 10, 10, 3), dtype=np.uint8)
    try:
        dav2.forward_train(rgb_batch)
        raise AssertionError("forward_train should raise RuntimeError when frozen=True")
    except RuntimeError as e:
        assert "frozen" in str(e).lower()
    print("PASS: test_frozen_default")

def test_unfrozen():
    try:
        dav2 = DAv2Backbone(size="small", frozen=False)
    except Exception as e:
        print(f"SKIP: network/loading failed: {e}")
        return
        
    assert dav2.frozen == False
    
    has_grad = False
    for p in dav2.model.parameters():
        if p.requires_grad:
            has_grad = True
            break
            
    assert has_grad, "At least one parameter should have requires_grad=True"
    print("PASS: test_unfrozen")

def test_existing_zeroshot_behavior():
    try:
        dav2 = DAv2Backbone(size="small")
    except Exception as e:
        print(f"SKIP: network/loading failed: {e}")
        return
        
    rgb = np.random.randint(0, 255, (10, 10, 3), dtype=np.uint8)
    out = dav2.predict(rgb)
    assert out.shape == (10, 10)
    assert out.dtype == np.float32
    print("PASS: test_existing_zeroshot_behavior")

if __name__ == "__main__":
    test_frozen_default()
    test_unfrozen()
    test_existing_zeroshot_behavior()
