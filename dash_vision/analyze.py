"""Analyze one dash photo: detect the lit warning lights, then score reliability.

Default detector is OpenCV (free, offline, no API key). Mileage is typed in.

    python dash_vision/analyze.py photo.jpg --miles 142000 --year 2009
    python dash_vision/analyze.py photo.jpg --miles 98000 --year 2021 --flashing check_engine
    python dash_vision/analyze.py photo.jpg --miles 98000 --debug boxed.jpg   # save a picture of what it found
    python dash_vision/analyze.py photo.jpg --detector claude                 # optional: Claude vision, needs ANTHROPIC_API_KEY
"""

from __future__ import annotations

import argparse
import json

if __package__:
    from .reliability import score_dash
else:
    from reliability import score_dash


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("image")
    ap.add_argument("--miles", type=int, help="odometer reading (typed in; the OpenCV detector doesn't read it)")
    ap.add_argument("--km", action="store_true", help="--miles value is in kilometers")
    ap.add_argument("--year", type=int, help="model year (improves the mileage and known-issue scoring)")
    ap.add_argument("--hybrid", action="store_true")
    ap.add_argument("--flashing", nargs="*", default=[], help="light ids the seller reports as flashing (a still photo can't show it)")
    ap.add_argument("--detector", default="cv", choices=["cv", "claude"])
    ap.add_argument("--min-confidence", default="medium", choices=["low", "medium", "high"])
    ap.add_argument("--debug", metavar="OUT.jpg", help="cv only: save the photo with detected lights boxed")
    args = ap.parse_args()

    if args.detector == "cv":
        if __package__:
            from . import cv_detector
        else:
            import cv_detector

        reading = cv_detector.detect(args.image)
        reading.pop("_rejected_blobs", None)
        if args.debug:
            cv_detector.debug_image(args.image, args.debug)
    else:
        if __package__:
            from .detector import DetectionRefused, detect
        else:
            from detector import DetectionRefused, detect

        try:
            reading = detect(args.image)
        except DetectionRefused as e:
            raise SystemExit(f"model declined to read the image: {e}")
        if not reading["is_dashboard"]:
            raise SystemExit("This doesn't look like a dashboard photo.")

    if reading["likely_bulb_check"]:
        print("WARNING: looks like the key-on bulb check (all lights lit). Retake with the engine running.")

    order = ["low", "medium", "high"]
    lights = [l["id"] for l in reading["lights"] if l["id"] != "unknown" and order.index(l["confidence"]) >= order.index(args.min_confidence)]

    miles, unit = args.miles, "km" if args.km else "mi"
    odo = reading["odometer"]
    if miles is None and odo["readable"]:
        miles, unit = odo["value"], (odo["unit"] if odo["unit"] != "unknown" else "mi")

    report = score_dash(lights, miles, unit, args.year, args.hybrid, args.flashing)
    print(json.dumps({"reading": reading, "reliability": report}, indent=2))


if __name__ == "__main__":
    main()
