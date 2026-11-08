# Exterior inspection · US / USD

This branch adds a local photo/camera workflow, actual public-data fine-tuning,
held-out model evaluation, visible-condition reports and evidence-based valuation.
It does not modify the Expo app or dashboard detector branch.

## Run locally on Windows

From the repository root:

```powershell
python -m venv .venv-exterior
.\.venv-exterior\Scripts\python.exe -m pip install -r exterior_vision/requirements.txt
.\.venv-exterior\Scripts\python.exe -m exterior_vision.web
```

Open http://127.0.0.1:8770 in Chrome or Edge. Pick front/rear/left/right and upload a
photo or start the camera. Capture each view or use Auto-capture for the selected
angle. Retaking a view replaces it; it does not inflate the damage count. Stop,
switching away or hiding the page releases camera tracks. Results and JSON exports
contain stats only. Photos are processed in memory, never written to a capture log.
Session findings expire after an hour and are restored on refresh. Choose **New
inspection** when switching cars. Capture daylight views with one whole vehicle.
Close-ups without a confidently detected vehicle are rejected.

On this checkout, dependencies were installed in a system-site-packages venv to reuse
the existing CPU PyTorch installation. A clean venv with the requirements above is
the portable installation. GPU PyTorch installation instructions: https://pytorch.org/get-started/locally/

## Public data and training

### iPhone HTTPS on the same Wi-Fi

Find the PC's private Wi-Fi IPv4 address with `ipconfig`, then create local test
certificates (replace the example address with yours):

```powershell
.\.venv-exterior\Scripts\python.exe -m exterior_vision.local_https --host 10.173.186.107
.\.venv-exterior\Scripts\python.exe -m exterior_vision.web --host 10.173.186.107 --port 8443 --cert .tls-exterior/server.pem --key .tls-exterior/server.key
```

Install the public `.tls-exterior/FORM-Local-CA.cer` on the iPhone, then enable its
SSL trust in Settings > General > About > Certificate Trust Settings. Open
`https://10.173.186.107:8443` in Safari and allow camera access. Installing the
certificate profile alone does not enable SSL trust. See
[Apple's instructions](https://support.apple.com/en-us/102390).
`--ca-cert .tls-exterior/FORM-Local-CA.cer` serves only the public certificate at
`/local-ca.cer`; use an HTTP instance to download it before HTTPS is trusted.
No trust settings are changed automatically. Server certificates last 7 days and
the local CA lasts 30 days; the CA signing key is never saved. The server key stays
in the git-ignored TLS directory. Remove the phone's certificate profile after
testing. Changing the PC IP requires a new certificate directory and phone setup.

Base: [PekingU/rtdetr_v2_r18vd](https://huggingface.co/PekingU/rtdetr_v2_r18vd),
Apache-2.0, approximately 20.2M parameters. The untouched COCO head gates vehicle
presence; the fine-tuned head predicts dents and scratches. Base weights are not a
pretrained car-damage expert. Do not substitute the untouched model for a trained
checkpoint and interpret COCO classes as damage.

Data: [JIJO/car-damage-new on Hugging Face](https://huggingface.co/datasets/JijoJS/car-damage-new1),
CC BY 4.0, by JIJO, Roboflow Universe, 2024. Source and pinned revisions are in data.py;
archives have recorded SHA-256 checksums in exterior_data/manifest.json. Dataset
Python code is not executed. Exact and near-duplicate images are excluded, with
test and validation taking priority. Vehicle IDs are not available, so leakage
from different photos of the same vehicle cannot be conclusively excluded.

```powershell
.\.venv-exterior\Scripts\python.exe -m exterior_vision.data
.\.venv-exterior\Scripts\python.exe -m exterior_vision.train --out exterior_models/damage --epochs 10 --size 416 --batch-size 4
.\.venv-exterior\Scripts\python.exe -m exterior_vision.evaluate --checkpoint exterior_models/damage --split validation
.\.venv-exterior\Scripts\python.exe -m exterior_vision.evaluate --checkpoint exterior_models/damage --split test
```

Use a fresh output directory for each run. `--device cuda` enables an installed GPU;
CPU is supported but full training can take hours. The recorded local baseline uses
**one epoch, 320 px, batch 4, frozen backbone**, not the suggested longer experiment.
`training.json` records actual steps, loss, image count and runtime. `evaluation-test.json`
records held-out mAP50, mAP50–95, recall and CPU latency. A completed training pass
does not establish production quality. See `MODEL_CARD.md` for this run's actual results.

Continue experimenting from local weights without overwriting the initial run:

```powershell
.\.venv-exterior\Scripts\python.exe -m exterior_vision.train --init-checkpoint exterior_models/damage --out exterior_models/damage-v2 --epochs 5 --size 416 --batch-size 4 --unfreeze-backbone
.\.venv-exterior\Scripts\python.exe -m exterior_vision.evaluate --checkpoint exterior_models/damage-v2 --split validation
.\.venv-exterior\Scripts\python.exe -m exterior_vision.web --checkpoint exterior_models/damage-v2
```

This warm-starts weights; it does not restore optimizer state. Use validation for
model selection. Keep the test split untouched until final evaluation.

## Adding healthy and broader damage examples

Public base data contains only dent/scratch labels. Missing annotations are **not**
treated as healthy. Add rights-cleared COCO images/annotations to the prepared splits;
human-reviewed undamaged images must have `"verified_clean": true` in their image
record and an empty annotation list. Include a representative clean held-out set
to measure false positives. Do not label a car well maintained from a clean exterior.
Run split deduplication again and retrain. Currently, dents/scratches are the only
accepted classes; rust, broken lamps, glass and tire damage require extending the
taxonomy, collecting labels and validating a new checkpoint.

## Condition, durability and positive condition

The initial local model scored only 0.0367 mAP50 on its held-out test. **Ratings and
condition price scenarios are withheld** for that checkpoint. Research predictions
remain visible. The project gate requires a full test >=100 images, mAP50 >=0.50,
>=30 verified clean test photos and clean false-positive rate <=0.10. These are
project safeguards, not production certification. Adding reviewed healthy examples
to the prepared test split lets evaluate.py measure the clean false-positive rate.

The 0–100 number is an **uncalibrated visual heuristic**, using maximum class
penalties across views to avoid counting one defect repeatedly. It is not a
mechanical reliability score. Remaining useful life, accident history, maintenance,
structural integrity and scratch depth cannot be determined from these photos.
No confident damage matches is reported literally, never as proof of a healthy car.

With all four views, a separate illustrative damage discount can be calculated
against a real price baseline. An undamaged-looking car keeps that baseline, while
a visibly damaged car receives a lower scenario value. This is not a trained resale
adjustment. A positive maintenance premium needs service records and market
comparables for that condition; the app does not invent one.

## Current market value and change over time

The default has no market-data credentials. It shows **unavailable** until evidence
is supplied. Choose either:

1. A CSV with real listings: `listing_id,make,model,trim,year,mileage,zip,price_usd,observed_at`.
   `observed_at` is YYYY-MM-DD. At least 3 unique listings from the last 30 days,
   same make/model/trim, year ±1, mileage ±20,000 and ZIP prefix must match. The median
   and observed min/max describe **asking prices**, not guaranteed transaction values.
   Older matching monthly groups with at least 3 listings appear as historical evidence.
2. Set `$env:MARKETCHECK_API_KEY = 'your-key'` before starting the server. Enter VIN,
   mileage and ZIP, check **Fetch live MarketCheck estimate**, then calculate. Only
   that explicit action sends those details to MarketCheck. API access/quota may
   require a provider plan; no key or live pricing is bundled. See
   [provider documentation](https://docs.marketcheck.com/docs/api/cars/market-insights/marketcheck-price).

An optional purchase price shows the difference versus today's baseline. That is
not a measured depreciation rate. Future appreciation/depreciation is not predicted.
The illustrative damage scenario is labeled separately from observed market data.
CSV observations are supplied by the user and are not independently authenticated.

## Verify

```powershell
.\.venv-exterior\Scripts\python.exe -m unittest discover -s tests_exterior -v
node --check exterior_vision/web/app.js
```

The tests exercise real loopback HTTP requests, session separation, malformed images,
unavailable models, fabricated client findings, comparison filters and split hygiene.
Datasets, weights, local environments and training runs are git-ignored. Keep weights
with this local checkout, or distribute them separately with source-data attribution.
