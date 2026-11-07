"""Point the webcam at a dashboard (or a photo of one), press SPACE, get the reliability verdict.

    python dash_vision/camera.py                          # asks for mileage + year
    python dash_vision/camera.py --miles 142000 --year 2009
    python dash_vision/camera.py --camera 1               # use a second/USB camera
    python dash_vision/camera.py --image photo.jpg        # judge a file instead of the camera

Keys in the camera window:
    SPACE  take the photo and judge it
    Q/ESC  quit
In the result window: any key goes back to the camera.

Each capture is saved to captures/ with a .json of the result.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime
from pathlib import Path

import cv2
import numpy as np

import cv_detector
from reliability import LIGHTS, score_dash

ROOT = Path(__file__).resolve().parent.parent
CAPTURES = ROOT / "captures"
GRADE_COLORS = {"A": (80, 200, 80), "B": (120, 200, 60), "C": (0, 200, 230), "D": (0, 140, 255), "F": (40, 40, 230)}
SEV_COLORS = {"critical": (40, 40, 230), "high": (0, 110, 255), "medium": (0, 200, 230), "low": (200, 200, 120), "info": (170, 170, 170)}


def ask_int(prompt: str) -> int | None:
    raw = input(prompt).strip().replace(",", "")
    return int(raw) if raw.isdigit() else None


def judge(frame: np.ndarray, args) -> tuple[dict, np.ndarray]:
    reading, annotated = cv_detector.detect_array(frame)
    lights = [l["id"] for l in reading["lights"] if l["confidence"] != "low"]
    report = score_dash(lights, args.miles, "km" if args.km else "mi", args.year, args.hybrid, args.flashing)
    if reading["likely_bulb_check"]:
        report["warning"] = "Most lights are on: probably the key-on bulb check. Retake with the engine running."
    reading.pop("_rejected_blobs", None)
    return {"reading": reading, "reliability": report}, annotated


def result_view(result: dict, annotated: np.ndarray, width: int = 1000) -> np.ndarray:
    """Annotated photo on top, verdict panel underneath."""
    img = cv2.resize(annotated, (width, int(annotated.shape[0] * width / annotated.shape[1])))
    r = result["reliability"]
    lines: list[tuple[str, tuple, float]] = []
    lines.append((f"Reliability {r['score']:.1f} / 100   Grade {r['grade']}", GRADE_COLORS[r["grade"]], 1.0))
    miles = f"{r['odometer_miles']:,} mi" if r["odometer_miles"] is not None else "mileage not given"
    lines.append((f"Safe to drive: {r['drive_safe'].upper()}    Worst: {r['worst_severity']}    {miles}", (230, 230, 230), 0.6))
    if r.get("warning"):
        lines.append((r["warning"], (0, 140, 255), 0.55))
    if r["faults"]:
        for lid in r["faults"]:
            sev = LIGHTS[lid]["severity"]
            lines.append((f"  [{sev.upper()}] {LIGHTS[lid]['name']}", SEV_COLORS[sev], 0.55))
    else:
        lines.append(("  No warning lights detected", (80, 200, 80), 0.55))
    if r["status_lights"]:
        lines.append(("  Status (no penalty): " + ", ".join(r["status_lights"]), (170, 170, 170), 0.5))
    perf = "   ".join(f"{k.replace('_', ' ')}: {v['label']}" for k, v in r["performance_impact"].items())
    lines.append(("Impact  " + perf, (230, 230, 230), 0.5))
    lo, hi = r["est_repair_cost_usd"]
    if hi:
        lines.append((f"Est. repair cost ${lo:,} - ${hi:,}", (230, 230, 230), 0.55))
    for a in r["actions"][:2]:
        lines.append(("> " + a[:110], (200, 200, 200), 0.45))
    lines.append(("any key: back to camera    Q: quit", (130, 130, 130), 0.45))

    panel_h = 20 + sum(int(36 * s) + 10 for _, _, s in lines)
    panel = np.full((panel_h, width, 3), 24, np.uint8)
    y = 10
    for text, color, scale in lines:
        y += int(36 * scale) + 6
        cv2.putText(panel, text, (16, y), cv2.FONT_HERSHEY_SIMPLEX, scale, color, 2 if scale >= 0.9 else 1, cv2.LINE_AA)
        y += 4
    return np.vstack([img, panel])


def save(frame: np.ndarray, result: dict, view: np.ndarray) -> Path:
    CAPTURES.mkdir(exist_ok=True)
    stem = CAPTURES / datetime.now().strftime("capture_%Y%m%d_%H%M%S")
    cv2.imwrite(str(stem) + ".jpg", frame)
    cv2.imwrite(str(stem) + "_result.jpg", view)
    Path(str(stem) + ".json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    return stem


def print_summary(result: dict, stem: Path) -> None:
    r = result["reliability"]
    print(f"\nScore {r['score']} ({r['grade']})  drive safe: {r['drive_safe']}  faults: {', '.join(r['faults']) or 'none'}")
    print(f"saved {stem}.jpg / _result.jpg / .json")


def open_camera(index: int) -> cv2.VideoCapture:
    cap = cv2.VideoCapture(index, cv2.CAP_DSHOW) if sys.platform == "win32" else cv2.VideoCapture(index)
    if not cap.isOpened():
        cap = cv2.VideoCapture(index)
    if not cap.isOpened():
        raise SystemExit(f"Couldn't open camera {index}. Try --camera 1, or close other apps using the camera.")
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
    return cap


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--miles", type=int)
    ap.add_argument("--km", action="store_true")
    ap.add_argument("--year", type=int)
    ap.add_argument("--hybrid", action="store_true")
    ap.add_argument("--flashing", nargs="*", default=[])
    ap.add_argument("--camera", type=int, default=0)
    ap.add_argument("--image", help="judge this file instead of using the camera")
    args = ap.parse_args()

    if args.miles is None:
        args.miles = ask_int("Odometer mileage (Enter to skip): ")
    if args.year is None:
        args.year = ask_int("Model year, e.g. 2012 (Enter to skip): ")

    print("Loading the light detector...")
    t = time.time()
    cv_detector.reference_set()
    print(f"ready in {time.time() - t:.1f}s")

    if args.image:
        frame = cv2.imread(args.image)
        if frame is None:
            raise SystemExit(f"can't read {args.image}")
        result, annotated = judge(frame, args)
        view = result_view(result, annotated)
        print_summary(result, save(frame, result, view))
        cv2.imshow("Dash verdict", view)
        cv2.waitKey(0)
        cv2.destroyAllWindows()
        return

    cap = open_camera(args.camera)
    live = "Camera - SPACE: judge photo   Q: quit"
    seen, n = [], 0
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                raise SystemExit("camera stopped sending frames")
            n += 1
            if n % 10 == 0:  # light live preview so you can aim
                seen = [l["id"] for l in cv_detector.detect_array(frame)[0]["lights"]]
            show = frame.copy()
            cv2.rectangle(show, (0, 0), (show.shape[1], 64), (0, 0, 0), -1)
            cv2.putText(show, "SPACE = take photo & judge    Q = quit", (12, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2, cv2.LINE_AA)
            cv2.putText(show, "seeing: " + (", ".join(seen) or "no lit warning lights"), (12, 54), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 220, 255), 1, cv2.LINE_AA)
            cv2.imshow(live, show)
            key = cv2.waitKey(1) & 0xFF
            if key in (ord("q"), ord("Q"), 27):
                break
            if key == ord(" "):
                result, annotated = judge(frame, args)
                view = result_view(result, annotated)
                print_summary(result, save(frame, result, view))
                cv2.imshow("Dash verdict", view)
                k2 = cv2.waitKey(0) & 0xFF
                cv2.destroyWindow("Dash verdict")
                if k2 in (ord("q"), ord("Q"), 27):
                    break
    finally:
        cap.release()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
