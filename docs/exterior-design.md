# Exterior inspection — US / USD

Use an independent Python service and browser capture UI on feature/exterior-vision,
based on main, preserving both the mobile app and the separate dashboard checkout.
The user selected public data and US/USD following the proposed detector-plus-market
design. Builder choice: RT-DETRv2 R18 instead of R50 to fit the available CPU.

## Model and data
Apache-2.0 PekingU/rtdetr_v2_r18vd (20.2M parameters), fine-tuned on the CC BY 4.0
JijoJS/car-damage-new1 dataset, pinned revisions in data.py. Download data archives
directly; never run the dataset repository's remote Python loader. Keep original
splits, remove exact/perceptual duplicate leakage and record counts. Classes are
dent and scratch only; additional damage and confirmed clean examples can be
provided in the same COCO format. Empty damage labels require explicit human review.
Do not call unlabeled images clean. Evaluate held-out mAP and precision/recall;
measure CPU latency. Training completion is not evidence of high accuracy.

## Product
Capture or upload front/rear/left/right photos; recapture replaces that view.
Use the original COCO model as a vehicle-presence gate, then a fine-tuned checkpoint
for damage detection. Keep photos local, in memory. Stats-only report, no annotated
image. Explicit camera start/stop and optional repeated captures for current angle.
Browser and HTTP errors must not leave old results looking current.

Visible-condition score is a disclosed configurable heuristic, not trained vehicle
durability. Do not claim remaining mechanical life, maintenance history or structural
integrity from images. No detected damage means only no confident matches in the
covered classes and views. Show scope and missing views. No automatic clean-car
premium without sufficient coverage and evidence.

## Market value
US/USD. Optional MarketCheck integration using user-supplied server-side API key,
VIN, ZIP and mileage; otherwise accept real dated comparable-listing CSV. Use
recent matching make/model/trim, nearby ZIP prefix and comparable year/mileage.
Report median asking-price interval, sample count and dates; do not call asking
prices realized sales. Condition adjustment is an explicit uncalibrated scenario,
separate from market baseline. Acquisition price/date optionally yields change
since purchase. Historical market observations required for a market trend.
Without actual current prices return unavailable, never a fabricated dollar value.

## Sources
- https://huggingface.co/PekingU/rtdetr_v2_r18vd
- https://huggingface.co/datasets/JijoJS/car-damage-new1
- https://docs.marketcheck.com/docs/api/cars/market-insights/marketcheck-price

## Alternatives
Larger general VLMs add hardware needs and do not provide calibrated price or
durability outputs. Specialist public YOLO weights have less clear licensing and
dataset provenance. Choose directly trainable Apache detector plus separate market
adapter; production quality remains dependent on broader labels and evaluation.
