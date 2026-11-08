# Real Camry dash photos

Put real photos of Toyota Camry dashboards here, both with and without warning lights. Use only photos you have the rights to:

- photos your team takes yourselves (friends' cars, dealer lots with permission, rental cars)
- photos sellers upload to your app (with consent)
- images with a license that allows reuse (for example CC-BY on Wikimedia Commons, with attribution in `labels.json`)

Don't commit scraped listing photos (Craigslist, Facebook Marketplace, dealer sites). They're copyrighted and often show plates and faces.

## Labeling

Add each photo to `labels.json` in the same format the synthetic set uses, so `evaluate.py` runs on it without changes:

```json
{
  "_meta": { "description": "Real Camry dash photos" },
  "samples": [
    {
      "id": "real_0001",
      "file": "images/real_0001.jpg",
      "generation": "XV40",
      "model_year": 2009,
      "hybrid": false,
      "odometer": 148213,
      "unit": "mi",
      "lights_on": ["check_engine", "vsc_trac"],
      "has_fault": true,
      "source": "team photo, 2026-11-08",
      "license": "own"
    }
  ]
}
```

Light ids must match `dash_vision/data/warning_lights.json`. Take each photo with the engine running, not during the key-on bulb check. Then run:

```
python dash_vision/evaluate.py --labels dataset/real/labels.json
```
