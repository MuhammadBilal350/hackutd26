# hackutd26

## Dash vision: Camry warning lights + odometer → reliability score

Take a photo of a Toyota Camry's dashboard and type in the mileage. OpenCV finds which warning lights are lit (free, offline, no API key), then a rules-based scorer turns the lights + mileage into a 0-100 reliability score with a per-system performance impact.

```
photo ──► cv_detector.py (OpenCV) ──► lit light ids ──► reliability.py ──► score, grade, effects, repair cost
mileage (typed in) ───────────────────────────────────────┘     ▲
                               data/warning_lights.json ─────────┘ + data/camry_generations.json
```

**Accuracy on the 60 synthetic images:** precision 0.98, recall 0.94, exact light set on 54/60, mean score error 0.67 points. These images are drawn with the same icon shapes the detector learns from, so expect lower accuracy on real photos until real icon crops are added to `dash_vision/icon_refs/`.

### Layout

| Path | What it is |
|---|---|
| `dash_vision/data/warning_lights.json` | Knowledge base for 21 Camry indicators: color, what the icon looks like, severity, whether it's safe to drive, affected systems, performance impact (power / fuel efficiency / safety / drivability, 0-4), common Camry causes, repair cost range, reliability penalty |
| `dash_vision/data/camry_generations.json` | XV30-XV80 generations: years, engines, cluster style, mileage bands, known issues by year |
| `dash_vision/cv_detector.py` | **Default detector.** OpenCV: color threshold → icon blobs → HOG + k-NN shape match. Same JSON output as the Claude one |
| `dash_vision/icon_refs/<light_id>/` | Optional: drop real cropped icon photos here to teach the OpenCV detector real dashes |
| `dash_vision/detector.py` | Optional Claude vision detector (`--detector claude`, needs `ANTHROPIC_API_KEY`; also reads the odometer) |
| `dash_vision/reliability.py` | Scoring: mileage band + usage vs. age, light penalties (flashing multiplier, VSC-with-CEL dedup, compound faults), generation known issues |
| `dash_vision/camera.py` | Webcam app: live preview, SPACE to capture, verdict window |
| `dash_vision/analyze.py` | CLI: one photo + mileage → lights + score (`--debug out.jpg` saves the photo with detections boxed) |
| `dash_vision/generate_dataset.py` | Renders labeled synthetic Camry clusters, with and without faults, plus photo-style augmentation |
| `dash_vision/evaluate.py` | Per-light precision/recall and score error against a labeled set |
| `dataset/synthetic/` | 60 generated images (36 with faults, 24 without) + `labels.json` ground truth |
| `dataset/real/` | Where real photos go, with labeling instructions |

### Setup

```
python -m venv .venv
.venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
```

No API key is needed.

On Windows PowerShell, activation is optional. You can run the environment's
Python directly (also avoids PowerShell execution-policy errors):

```powershell
.\.venv\Scripts\python.exe dash_vision/analyze.py dataset/synthetic/images/camry_0021.jpg --miles 98691 --year 2021
.\.venv\Scripts\python.exe dash_vision/camera.py --miles 142000 --year 2009
```

Run these from the repository root. The command-line tools also support module
execution, for example `python -m dash_vision.analyze photo.jpg --miles 142000`.
The detector can be imported as `from dash_vision.cv_detector import detect`.

### Verify the installation

```
python -m unittest discover -s tests -v
python -m dash_vision.evaluate
```

The smoke tests cover script and module startup, importing the detector, finding
the default dataset from another working directory, and analyzing a bundled photo
with an annotated output. Evaluation reports detection accuracy separately; it is
not a claim of perfect detection. Camera windows require a desktop session and
the live camera mode requires an available webcam.

### Test with your camera

For the browser interface with photo upload, live camera preview, optional
continuous analysis and **stats-only results**, run:

```powershell
.\.venv\Scripts\python.exe -m dash_vision.web
```

Open `http://127.0.0.1:8765` in Chrome or Edge. Wait for the offline detector to
finish warming up. Upload a dashboard photo and click **Analyze dashboard**, or
choose **Live camera**, allow camera access, and use **Capture & analyze**.
Enable **Auto-analyze** for another reading two seconds after each completed
analysis. **Stop**, changing tabs, or leaving the page releases the camera.
The camera preview is for aiming; results and exported JSON contain statistics
only. Images stay in memory on the local server and are not saved by this UI.
Use **Export stats** to save a JSON report. Add `--port 8766` if the port is busy.
Mileage must be entered manually. The offline detector does not read the odometer
or guarantee an image is a dashboard; no detected lights is not a health check.

The older OpenCV desktop window remains available with:

```
python dash_vision/camera.py --miles 142000 --year 2009
```

Point the webcam at a dashboard (or at a dash photo on your phone), press **SPACE** to take the photo, and a window shows the lights it found plus the score, grade and repair estimate. Any key goes back to the camera; **Q** quits. Every capture and its result are saved to `captures/` (not committed). Use `--camera 1` for a second or USB camera, or `--image photo.jpg` to judge a file the same way.

### Use

```
python dash_vision/analyze.py dataset/synthetic/images/camry_0021.jpg --miles 98691 --year 2021
python dash_vision/analyze.py my_dash.jpg --miles 142000 --year 2015 --hybrid --flashing check_engine
python dash_vision/analyze.py my_dash.jpg --miles 142000 --debug boxed.jpg   # see what it detected
python dash_vision/evaluate.py                    # accuracy of the OpenCV detector on the dataset
python dash_vision/evaluate.py --dry-run          # scores from the true labels
python dash_vision/generate_dataset.py --count 200 --seed 7 --out dataset/synthetic_big
```

### Scoring summary

Start at 100, then subtract:

- **Mileage**: 0 (<30k), 3, 7, 12, 18, 24, 30 (>250k), adjusted by up to −6/+3 when miles are far above or below 12k/year for the car's age.
- **Each fault light**: its `reliability_penalty`, e.g. oil pressure 35, coolant temp 30, check hybrid 30, check engine 18 (×1.8 if flashing), brake 20, EPS 18, airbag 15, ABS 12, TPMS 4. Status lights (seatbelt, low fuel, door, VSC OFF) cost 0.
- **Compound**: −5 when two or more high/critical faults are on together.
- **Known generation issues**: for example 2007-2009 2AZ-FE oil consumption (−6).

Grades: A ≥ 90, B ≥ 80, C ≥ 70, D ≥ 55, F below. Penalty values are starting points to tune, not industry figures.

### Limits

- The OpenCV detector finds icons only. Text messages on the center display (Check Hybrid System, AT OIL TEMP) aren't read; its master-warning triangle is.
- It works best on photos taken fairly straight-on with the engine running. Strong glare can wash out a light's color.
- A still photo can't show a flashing light. Pass `--flashing` when the seller reports one.
- All lights glow for about 3 s at key-on (bulb check). The detector flags this; retake those photos with the engine running.
- The synthetic icons are simplified versions of the ISO symbols. Accuracy on them doesn't guarantee accuracy on real photos, so add real labeled photos to `dataset/real/` and evaluate on those as well.

## Exterior inspection (US / USD)

The exterior camera/upload workflow is available alongside dashboard analysis.
See [exterior setup and training](exterior_vision/README.md) and
[measured model results](exterior_vision/MODEL_CARD.md).

```powershell
python -m exterior_vision.web
```

The initial public-data checkpoint is research-only (0.0367 mAP50). Condition
ratings and damage-based price adjustments remain withheld until its evaluation
gate passes. Current USD values require real recent comparables or a configured
market-data provider. Mechanical durability is not inferred from exterior photos.
