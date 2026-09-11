import torch
from depthwizard.models.losses import silog_loss

def test_zero_loss():
    pred = torch.ones(2, 5, 5) * 5.0
    target = torch.ones(2, 5, 5) * 5.0
    loss = silog_loss(pred, target)
    assert torch.isclose(loss, torch.tensor(0.0)), "Loss should be exactly 0.0"
    print("PASS: test_zero_loss")

def test_positive_loss():
    pred = torch.ones(2, 5, 5) * 5.0
    target = torch.ones(2, 5, 5) * 2.0
    loss = silog_loss(pred, target)
    assert loss > 0.0, "Loss should be strictly positive"
    print("PASS: test_positive_loss")

def test_valid_mask():
    pred = torch.ones(2, 5, 5) * 5.0
    target = torch.ones(2, 5, 5) * 5.0
    
    # Massively disagree in masked-out pixels
    pred[:, 0, 0] = 1000.0
    target[:, 0, 0] = 0.001
    
    valid_mask = torch.ones(2, 5, 5, dtype=torch.bool)
    valid_mask[:, 0, 0] = False
    
    loss = silog_loss(pred, target, valid_mask=valid_mask)
    assert torch.isclose(loss, torch.tensor(0.0), atol=1e-5), "Loss should be 0 because disagreed pixels are masked"
    print("PASS: test_valid_mask")

def test_all_false_mask():
    pred = torch.ones(2, 5, 5)
    target = torch.ones(2, 5, 5) * 2.0
    valid_mask = torch.zeros(2, 5, 5, dtype=torch.bool)
    
    loss = silog_loss(pred, target, valid_mask=valid_mask)
    assert loss == 0.0, "Loss should be 0 without raising NaN"
    print("PASS: test_all_false_mask")

def test_differentiability():
    pred = torch.rand(2, 5, 5, requires_grad=True)
    target = torch.rand(2, 5, 5)
    
    loss = silog_loss(pred, target)
    loss.backward()
    
    assert pred.grad is not None
    assert not torch.isnan(pred.grad).any()
    print("PASS: test_differentiability")
