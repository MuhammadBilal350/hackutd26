"""Analyze one dash photo: detect lights + odometer with Claude, then score reliability.

    python dash_vision/analyze.py photo.jpg --year 2009
    python dash_vision/analyze.py photo.jpg --year 2015 --hybrid --flashing check_engine
"""

from __future__ import annotations

import argparse
import json

from detector import DetectionRefused, confirmed_lights, detect
from reliability import score_dash


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("image")
    ap.add_argument("--year", type=int, help="model year (improves the mileage and known-issue scoring)")
    ap.add_argument("--hybrid", action="store_true")
    ap.add_argument("--flashing", nargs="*", default=[], help="light ids the seller reports as flashing (a still photo can't show it)")
    ap.add_argument("--effort", default="medium", choices=["low", "medium", "high", "xhigh", "max"])
    ap.add_argument("--min-confidence", default="medium", choices=["low", "medium", "high"])
    args = ap.parse_args()

    try:
        reading = detect(args.image, effort=args.effort)
    except DetectionRefused as e:
        raise SystemExit(f"model declined to read the image: {e}")

    if not reading["is_dashboard"]:
        raise SystemExit("This doesn't look like a dashboard photo.")
    if reading["likely_bulb_check"]:
        print("WARNING: looks like the key-on bulb check (all lights lit). Retake with the engine running.")

    odo = reading["odometer"]
    report = score_dash(
        lights=confirmed_lights(reading, args.min_confidence),
        odometer=odo["value"] if odo["readable"] else None,
        unit=odo["unit"] if odo["unit"] != "unknown" else "mi",
        model_year=args.year,
        hybrid=args.hybrid,
        flashing=args.flashing,
    )
    print(json.dumps({"reading": reading, "reliability": report}, indent=2))


if __name__ == "__main__":
    main()
