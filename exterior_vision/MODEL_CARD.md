# Exterior RT-DETRv2 — initial local baseline

## Status: research only; condition ratings withheld

The model completed real fine-tuning, but the held-out result is poor. It must not
be called high accuracy or used to determine durability, maintenance premiums or
purchase discounts. The UI allows research diagnostics; numeric condition ratings
and damage-based dollar scenarios are withheld. Market evidence is independent.

## Run
- Base: PekingU/rtdetr_v2_r18vd, Apache-2.0, pinned revision in data.py.
- Data: JijoJS/car-damage-new1, CC BY 4.0; JIJO, Roboflow Universe, 2024.
- Classes: dent, scratch. No healthy-car or maintenance-history labels.
- Training: 1,840 de-duplicated images; one epoch, 460 AdamW steps, 320 px,
  batch 4, learning rate 0.0001, frozen backbone.
- Runtime: 1,615.5 seconds (about 27 minutes), CPU PyTorch 2.9.1.
- First/final batch loss: 82.1158 / 16.5061. Different batches; not an accuracy metric.

## Held-out result
- Test: all 120 retained test images, no test-set training.
- mAP50: **0.0367** (3.67%).
- mAP50–95: **0.0185** (1.85%).
- Average recall at 100 detections: 0.3344.
- Mean damage-model inference: 235.0 ms on this CPU, excluding weight loading,
  the separate vehicle-presence model, and camera encoding.
- Clean-car false-positive rate: unavailable; no verified clean test images.
- Vehicle IDs are unavailable; different photos of the same vehicle may remain
  across splits despite perceptual de-duplication.

These measure detection on this dataset, not durability, repair-cost or resale-value
accuracy. No confident damage detection must not be interpreted as a clean car.

## Quality gate
Project safeguard, not industry certification: full test >=100 images, mAP50 >=0.50,
>=30 explicitly reviewed clean images and clean false-positive rate <=0.10. The
initial checkpoint fails. Passing these floors still requires broader evaluation
on representative held-out vehicles, cameras, lighting and views.

## Next work
Use the provided GPU/warm-start commands for longer training, add broader whole-car
and close-up views, and add human-reviewed healthy negatives. Use validation for
model selection. After exploratory test results influence model choices, create a
new untouched final test set. More epochs alone do not guarantee good performance.

## Sources and attribution
- https://huggingface.co/PekingU/rtdetr_v2_r18vd
- https://huggingface.co/datasets/JijoJS/car-damage-new1
- https://universe.roboflow.com/jijo/car-damage-new/dataset/2

Weights and datasets are local in git-ignored directories, not included in the source
commit. Machine-readable training/evaluation JSON files accompany the checkpoint.
