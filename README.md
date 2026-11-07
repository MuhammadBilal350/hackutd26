# hackutd26

## Dash vision: Camry warning lights + odometer → reliability score

Take a photo of a Toyota Camry's dashboard. A Claude vision model reads which warning lights are lit and what the odometer says, then a rules-based scorer turns that into a 0-100 reliability score with a per-system performance impact.

```
photo ──► detector.py (Claude, structured JSON) ──► reliability.py (rules) ──► score, grade, effects, repair cost
               ▲                                          ▲
               └──────── data/warning_lights.json ────────┘   + data/camry_generations.json
```

### Layout

| Path | What it is |
|---|---|
| `dash_vision/data/warning_lights.json` | Knowledge base for 21 Camry indicators: color, what the icon looks like, severity, whether it's safe to drive, affected systems, performance impact (power / fuel efficiency / safety / drivability, 0-4), common Camry causes, repair cost range, reliability penalty |
| `dash_vision/data/camry_generations.json` | XV30-XV80 generations: years, engines, cluster style, mileage bands, known issues by year |
| `dash_vision/detector.py` | Claude vision call (`claude-opus-5-5`, JSON-schema output, server-side refusal fallback) |
| `dash_vision/reliability.py` | Scoring: mileage band + usage vs. age, light penalties (flashing multiplier, VSC-with-CEL dedup, compound faults), generation known issues |
| `dash_vision/analyze.py` | CLI: one photo → reading + score |
| `dash_vision/generate_dataset.py` | Renders labeled synthetic Camry clusters, with and without faults, plus photo-style augmentation |
| `dash_vision/evaluate.py` | Per-light precision/recall, odometer accuracy and score error against a labeled set |
| `dataset/synthetic/` | 60 generated images (36 with faults, 24 without) + `labels.json` ground truth |
| `dataset/real/` | Where real photos go, with labeling instructions |

### Setup

```
python -m venv .venv
.venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
set ANTHROPIC_API_KEY=sk-ant-...  # or: ant auth login
```

### Use

```
python dash_vision/analyze.py dataset/synthetic/images/camry_0003.jpg --year 2008
python dash_vision/analyze.py my_dash.jpg --year 2015 --hybrid --flashing check_engine
python dash_vision/evaluate.py --dry-run          # scores from ground truth, no API calls
python dash_vision/evaluate.py --limit 10         # run the model on 10 images (uses API credits)
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

- A still photo can't show a flashing light. Pass `--flashing` when the seller reports one.
- All lights glow for about 3 s at key-on (bulb check). The detector flags this; retake those photos with the engine running.
- The synthetic icons are simplified versions of the ISO symbols. Accuracy on them doesn't guarantee accuracy on real photos, so add real labeled photos to `dataset/real/` and evaluate on those as well.
