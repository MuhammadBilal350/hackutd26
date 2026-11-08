"""Free, offline warning-light detector built on OpenCV. No API key needed.

How it works:
  1. Find lit lights: keep bright, saturated red/amber/blue/green pixels (HSV threshold).
     Unlit icons are dark gray, so they drop out.
  2. Group nearby pixels into one blob per icon (dilate + connected components) and
     throw away shapes that can't be icons: gauge rings, needles, text lines, solid bars.
  3. Identify each blob: HOG shape features + k-nearest-neighbours against a reference
     set of every icon in data/warning_lights.json, rendered with random tilt/blur/
     brightness. Add real cropped icons under dash_vision/icon_refs/<light_id>/ to
     teach it real photos.
  4. Use the blob's color to separate same-shape icons (red vs blue coolant).

Returns the same JSON shape as detector.py (Claude), so the scorer works with either.
The odometer isn't read; pass the mileage in yourself.
"""

from __future__ import annotations

import random
from functools import lru_cache
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

if __package__:
    from .generate_dataset import COLORS, LIGHTS, MESSAGE_LIGHTS, draw_icon
else:
    from generate_dataset import COLORS, LIGHTS, MESSAGE_LIGHTS, draw_icon

HERE = Path(__file__).resolve().parent
REF_DIR = HERE / "icon_refs"
WORK_WIDTH = 1200          # every image is resized to this width first
DILATE = 11                # px at WORK_WIDTH: merges the strokes of one icon
MIN_SIDE, MAX_SIDE = 14, 75
MAX_FILL = 0.7             # icons are mostly outline; solid bars/blocks are rejected
MAX_ASPECT = 2.6
K = 5

# Same glyph, different meaning by color.
GLYPH_OF = {"coolant_temp": "coolant", "coolant_temp_cold": "coolant"}
ICON_IDS = [l for l in LIGHTS if l not in MESSAGE_LIGHTS]


# ---------------------------------------------------------------- pipeline
HUE_RANGES = {"red": [(0, 9), (150, 180)], "amber": [(9, 36)], "green": [(36, 85)], "blue": [(85, 135)]}


def lit_mask(bgr: np.ndarray) -> np.ndarray:
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    _, s, v = cv2.split(hsv)
    m = (s >= 110) & (v >= 120)
    return (m * 255).astype(np.uint8)


def color_masks(bgr: np.ndarray) -> dict[str, np.ndarray]:
    """One lit-pixel mask per light color, so a red icon never merges with a blue gauge ring."""
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    h = hsv[..., 0]
    lit = lit_mask(bgr) > 0
    out = {}
    for name, ranges in HUE_RANGES.items():
        hm = np.zeros_like(lit)
        for lo, hi in ranges:
            hm |= (h >= lo) & (h < hi)
        out[name] = ((lit & hm) * 255).astype(np.uint8)
    return out


def blobs(bgr: np.ndarray) -> list[dict]:
    """Candidate lit icons: list of {bbox, mask crop, color}."""
    out = []
    for color, mask in color_masks(bgr).items():
        merged = cv2.dilate(mask, np.ones((DILATE, DILATE), np.uint8))
        n, labels, stats, _ = cv2.connectedComponentsWithStats(merged, 8)
        for i in range(1, n):
            x, y, w, h, _ = stats[i]
            x0, y0 = x + DILATE // 2, y + DILATE // 2          # undo dilation padding
            w0, h0 = max(1, w - DILATE + 1), max(1, h - DILATE + 1)
            if not (MIN_SIDE <= max(w0, h0) <= MAX_SIDE):
                continue
            if max(w0, h0) / max(1, min(w0, h0)) > MAX_ASPECT:
                continue
            if h0 < 18 and w0 / h0 > 1.7:                         # a single line of text (odometer, trip)
                continue
            comp = labels[y:y + h, x:x + w] == i
            crop = mask[y:y + h, x:x + w] * comp
            fill = (crop > 0).sum() / float(w0 * h0)
            if fill > MAX_FILL or fill < 0.04:
                continue
            pts = cv2.findNonZero(crop.astype(np.uint8))
            (_, _), (rw, rh), _ = cv2.minAreaRect(pts)
            if min(rw, rh) < 0.28 * max(rw, rh):                   # thin straight line: gauge needle
                continue
            out.append({"bbox": [int(x0), int(y0), int(w0), int(h0)], "crop": crop.astype(np.uint8), "color": color})
    return out


def feature(crop: np.ndarray) -> np.ndarray:
    ys, xs = np.nonzero(crop)
    crop = crop[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    side = max(crop.shape) + 4
    sq = np.zeros((side, side), np.uint8)
    oy, ox = (side - crop.shape[0]) // 2, (side - crop.shape[1]) // 2
    sq[oy:oy + crop.shape[0], ox:ox + crop.shape[1]] = crop
    small = cv2.resize(sq, (32, 32), interpolation=cv2.INTER_AREA).astype(np.float32)
    return hog(small)


def hog(img: np.ndarray, cell: int = 8, bins: int = 9) -> np.ndarray:
    """Histogram of oriented gradients (cv2.HOGDescriptor left core OpenCV in 5.x)."""
    gx = cv2.Sobel(img, cv2.CV_32F, 1, 0, ksize=1)
    gy = cv2.Sobel(img, cv2.CV_32F, 0, 1, ksize=1)
    mag, ang = cv2.cartToPolar(gx, gy, angleInDegrees=True)
    b = ((ang % 180) / (180 / bins)).astype(int) % bins
    n = img.shape[0] // cell
    cells = np.zeros((n, n, bins), np.float32)
    for i in range(n):
        for j in range(n):
            sl = (slice(i * cell, (i + 1) * cell), slice(j * cell, (j + 1) * cell))
            cells[i, j] = np.bincount(b[sl].ravel(), weights=mag[sl].ravel(), minlength=bins)
    blocks = [cells[i:i + 2, j:j + 2].ravel() for i in range(n - 1) for j in range(n - 1)]
    blocks = [v / (np.linalg.norm(v) + 1e-6) for v in blocks]
    f = np.concatenate(blocks)
    return f / (np.linalg.norm(f) + 1e-6)


def to_work(bgr: np.ndarray) -> np.ndarray:
    h, w = bgr.shape[:2]
    if w == WORK_WIDTH:
        return bgr
    return cv2.resize(bgr, (WORK_WIDTH, int(round(h * WORK_WIDTH / w))), interpolation=cv2.INTER_AREA)


# ---------------------------------------------------------- reference set
def _render_ref(lid: str, rng: random.Random) -> np.ndarray:
    size = rng.uniform(28, 46)
    canvas = Image.new("RGB", (140, 140), tuple([rng.randint(3, 25)] * 3))
    d = ImageDraw.Draw(canvas)
    col = COLORS[LIGHTS[lid]["color"]]
    if lid == "master_warning" and rng.random() < 0.5:
        col = COLORS["amber"]
    draw_icon(d, lid, 70, 70, size, col, newer=rng.random() < 0.5)
    sh = rng.uniform(-0.12, 0.12)
    canvas = canvas.transform(canvas.size, Image.AFFINE, (1, sh, -sh * 70, 0, 1, 0), resample=Image.BICUBIC)
    canvas = canvas.rotate(rng.uniform(-9, 9), resample=Image.BICUBIC)
    if rng.random() < 0.6:
        canvas = canvas.filter(ImageFilter.GaussianBlur(rng.uniform(0.3, 1.7)))
    canvas = ImageEnhance.Brightness(canvas).enhance(rng.uniform(0.75, 1.2))
    return cv2.cvtColor(np.array(canvas), cv2.COLOR_RGB2BGR)


def _largest_blob(bgr: np.ndarray) -> dict | None:
    bs = blobs(bgr)
    return max(bs, key=lambda b: b["bbox"][2] * b["bbox"][3]) if bs else None


@lru_cache(maxsize=1)
def reference_set(per_icon: int = 120, seed: int = 0) -> tuple[np.ndarray, list[str]]:
    rng = random.Random(seed)
    feats, names = [], []
    for lid in ICON_IDS:
        for _ in range(per_icon):
            b = _largest_blob(_render_ref(lid, rng))
            if b is not None:
                feats.append(feature(b["crop"]))
                names.append(GLYPH_OF.get(lid, lid))
    # real crops: dash_vision/icon_refs/<light_id>/*.png|jpg
    if REF_DIR.exists():
        for d in REF_DIR.iterdir():
            if not d.is_dir() or d.name not in LIGHTS:
                continue
            for p in d.glob("*.*"):
                img = cv2.imread(str(p))
                if img is None:
                    continue
                img = cv2.resize(img, (140 * img.shape[1] // max(img.shape[:2]), 140 * img.shape[0] // max(img.shape[:2])))
                b = _largest_blob(cv2.copyMakeBorder(img, 20, 20, 20, 20, cv2.BORDER_CONSTANT))
                if b is not None:
                    feats.append(feature(b["crop"]))
                    names.append(GLYPH_OF.get(d.name, d.name))
    return np.stack(feats), names


def classify(feat: np.ndarray) -> tuple[str, float]:
    X, names = reference_set()
    dist = np.linalg.norm(X - feat, axis=1)
    idx = np.argsort(dist)[:K]
    votes: dict[str, list[float]] = {}
    for i in idx:
        votes.setdefault(names[i], []).append(dist[i])
    best = max(votes, key=lambda n: (len(votes[n]), -min(votes[n])))
    return best, float(min(votes[best]))


# ------------------------------------------------------------------ public
HIGH, MEDIUM, LOW = 0.45, 0.62, 0.78   # HOG distance cut-offs (tuned on the synthetic set)


def resolve(glyph: str, color: str) -> str:
    if glyph == "coolant":
        return "coolant_temp_cold" if color == "blue" else "coolant_temp"
    return glyph


def detect_array(bgr: np.ndarray) -> tuple[dict, np.ndarray]:
    """Detect lit lights in a BGR image (file or camera frame). Returns (reading, annotated image)."""
    bgr = to_work(bgr)
    shown = bgr.copy()
    found: dict[str, dict] = {}
    rejected = []
    for b in blobs(bgr):
        glyph, dist = classify(feature(b["crop"]))
        lid = resolve(glyph, b["color"])
        x, y, w, h = b["bbox"]
        if dist > LOW:
            rejected.append({"bbox": b["bbox"], "color": b["color"], "closest": lid, "distance": round(dist, 3)})
            cv2.rectangle(shown, (x - 3, y - 3), (x + w + 3, y + h + 3), (0, 0, 255), 1)
            continue
        conf = "high" if dist <= HIGH else "medium" if dist <= MEDIUM else "low"
        cv2.rectangle(shown, (x - 3, y - 3), (x + w + 3, y + h + 3), (0, 255, 0), 2)
        cv2.putText(shown, f"{lid} ({conf})", (x, max(12, y - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1, cv2.LINE_AA)
        entry = {"id": lid, "color": b["color"], "confidence": conf,
                 "evidence": f"{b['color']} blob at x={x} y={y}, shape distance {dist:.2f}"}
        if lid not in found or dist < found[lid]["_d"]:
            found[lid] = {**entry, "_d": dist}
    lights = [{k: v for k, v in e.items() if k != "_d"} for e in found.values()]
    reading = {
        "is_dashboard": True,
        "likely_bulb_check": len(lights) >= 10,
        "odometer": {"readable": False, "value": 0, "unit": "unknown", "raw_text": ""},
        "lights": lights,
        "mid_messages": [],
        "image_issues": "",
        "_rejected_blobs": rejected,
    }
    return reading, shown


def detect(image_path: str | Path) -> dict:
    bgr = cv2.imread(str(image_path))
    if bgr is None:
        raise FileNotFoundError(image_path)
    return detect_array(bgr)[0]


def debug_image(image_path: str | Path, out_path: str | Path) -> None:
    """Save a copy of the photo with detections boxed: green = light found, red = shape rejected."""
    bgr = cv2.imread(str(image_path))
    if bgr is None:
        raise FileNotFoundError(image_path)
    cv2.imwrite(str(out_path), detect_array(bgr)[1])
