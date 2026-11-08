# Exterior analysis implementation plan

> **For agentic workers:** Use superpowers:executing-plans. Work inline, then request a final code review.

**Goal:** Train an open model on public damage images and provide local capture,
visible-condition reports, US/USD comparable-based value and transparent limits.
**Architecture:** Independent exterior_vision Python package, lazy ML imports,
stdlib HTTP server, local static browser UI. Existing Expo/backend remain untouched.
**Tech Stack:** PyTorch, Transformers 4.x, Pillow, NumPy, pycocotools; vanilla JS.
**Spec:** docs/exterior-design.md

## Constraints / review focus
No image-derived mechanical life; no made-up market prices; no clean labels from
missing annotations; no claim high accuracy without held-out results. CPU-only
training available. Validate ZIP/metadata/dates, upload size, image quality, and
checkpoint labels. Detect split leakage. Keep previous dashboard changes separate.

## Tasks
- [x] Write failing tests for condition coverage/deduplication, valuation filtering,
  missing market data, date invalidation, and COCO data conversion/split hygiene.
- [x] Implement report.py and market.py with disclosed rating and value scenarios.
- [x] Implement data.py, train.py, evaluate.py and detector.py; run real training
  smoke test and held-out evaluation, recording exact run scope and limitations.
- [x] Implement local web.py and web assets with multi-angle upload/capture and
  stats-only results. Report model readiness and evaluation status.
- [x] Run all tests and end-to-end checks; request review; document install/train/run
  and preserve user-facing artifacts and branch status.

## Execution result
Full one-epoch CPU baseline trained; held-out mAP50 0.0367. High-accuracy target not achieved. Ratings and damage-price scenarios withheld by quality gate; predictions remain research-only. No market key supplied; CSV/live provider adapter implemented, live provider not exercised. Browser camera hardware permission unavailable for testing.
