"""Generate a labeled synthetic dataset of Toyota Camry instrument-cluster images.

Each image is a stylized Camry cluster for one generation (XV30-XV80) with a
known odometer reading and a known set of warning lights lit. Unlit icons are
drawn as faint "ghosts" (as on a real cluster) so the model has to tell lit
from unlit. Photo-style augmentations (tilt, blur, glare, noise, exposure, JPEG)
make the images look like phone shots of a dash.

Usage:
    python dash_vision/generate_dataset.py --count 60 --out dataset/synthetic

Writes <out>/images/*.jpg and <out>/labels.json.
"""

from __future__ import annotations

import argparse
import json
import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

HERE = Path(__file__).resolve().parent
KB = json.loads((HERE / "data" / "warning_lights.json").read_text(encoding="utf-8"))
GENS = json.loads((HERE / "data" / "camry_generations.json").read_text(encoding="utf-8"))
LIGHTS = {l["id"]: l for l in KB["lights"]}

W, H = 1200, 520
COLORS = {
    "amber": (255, 168, 0),
    "red": (238, 42, 32),
    "blue": (60, 140, 255),
    "green": (40, 220, 90),
}
GHOST = (38, 38, 42)

# Lights shown as text on the MID / LCD instead of an icon.
MESSAGE_LIGHTS = {
    "check_hybrid_system": "Check Hybrid System",
    "at_oil_temp": "AT OIL TEMP",
}

THEMES = {
    "XV30": {"bg": (12, 12, 14), "face": (24, 22, 20), "ink": (235, 235, 225), "needle": (255, 90, 30), "lcd": (255, 150, 40), "glow": (230, 230, 210)},
    "XV40": {"bg": (6, 8, 14), "face": (10, 14, 26), "ink": (190, 220, 255), "needle": (255, 255, 255), "lcd": (150, 210, 255), "glow": (60, 120, 255)},
    "XV50": {"bg": (8, 8, 10), "face": (16, 16, 18), "ink": (230, 240, 255), "needle": (255, 70, 40), "lcd": (220, 235, 255), "glow": (120, 170, 255)},
    "XV70": {"bg": (5, 5, 7), "face": (12, 12, 14), "ink": (245, 245, 245), "needle": (255, 60, 40), "lcd": (240, 240, 240), "glow": (90, 160, 255)},
    "XV80": {"bg": (3, 4, 8), "face": (8, 10, 18), "ink": (235, 240, 255), "needle": (80, 200, 255), "lcd": (235, 240, 255), "glow": (60, 190, 255)},
}

# Lights that can appear per model year (feature introduced / hybrid only).
def available_lights(year: int, hybrid: bool) -> list[str]:
    out = []
    for lid in LIGHTS:
        if lid == "tpms" and year < 2008:
            continue
        if lid == "pcs_warning" and year < 2015:
            continue
        if lid == "coolant_temp_cold" and year < 2012:
            continue
        if lid == "check_hybrid_system" and not hybrid:
            continue
        if lid in MESSAGE_LIGHTS and year < 2007:
            continue
        out.append(lid)
    return out


# --------------------------------------------------------------------- fonts
def font(size: int, mono: bool = False) -> ImageFont.FreeTypeFont:
    names = ["consola.ttf", "DejaVuSansMono.ttf", "cour.ttf"] if mono else ["arialbd.ttf", "arial.ttf", "DejaVuSans-Bold.ttf", "DejaVuSans.ttf"]
    for n in names:
        try:
            return ImageFont.truetype(n, size)
        except OSError:
            continue
    return ImageFont.load_default(size=size)


def text_c(d: ImageDraw.ImageDraw, xy, txt, size, fill, mono=False):
    f = font(size, mono)
    d.text(xy, txt, font=f, fill=fill, anchor="mm")


# --------------------------------------------------------------------- icons
def draw_icon(d: ImageDraw.ImageDraw, lid: str, cx: float, cy: float, s: float, col, newer: bool):
    """Draw a simplified ISO-style glyph for light `lid`, ~s px square."""
    u = s / 24.0
    w = max(2, int(round(2 * u)))

    def P(x, y):
        return (cx + x * u, cy + y * u)

    def poly(pts, fill=None):
        d.line([P(*p) for p in pts] + [P(*pts[0])], fill=col, width=w, joint="curve")
        if fill:
            d.polygon([P(*p) for p in pts], fill=fill)

    def circ(x, y, r, fill=None, width=None):
        d.ellipse([P(x - r, y - r), P(x + r, y + r)], outline=col, width=width or w, fill=fill)

    def arc(x, y, r, a0, a1):
        d.arc([P(x - r, y - r), P(x + r, y + r)], a0, a1, fill=col, width=w)

    def line(*pts):
        d.line([P(*p) for p in pts], fill=col, width=w, joint="curve")

    def wave(y, x0=-10, x1=10, amp=1.2):
        pts = [(x, y + amp * math.sin((x - x0) * 0.9)) for x in [x0 + i * 0.5 for i in range(int((x1 - x0) / 0.5) + 1)]]
        line(*pts)

    def txt(t, x, y, size):
        text_c(d, P(x, y), t, max(8, int(size * u)), col)

    def bang(x, y, h=8):
        line((x, y - h / 2), (x, y + h / 4))
        circ(x, y + h / 2, 0.6, fill=col, width=1)

    def car_side(x0, y0, sc=1.0):
        pts = [(-9, 2), (-9, -1), (-6, -2), (-3, -6), (4, -6), (7, -2), (9, -1), (9, 2)]
        line(*[(x0 + px * sc, y0 + py * sc) for px, py in pts], (x0 - 9 * sc, y0 + 2 * sc))
        circ(x0 - 5 * sc, y0 + 2.5 * sc, 1.8 * sc)
        circ(x0 + 5 * sc, y0 + 2.5 * sc, 1.8 * sc)

    if lid == "check_engine":
        poly([(-9, -3), (-5, -3), (-5, -6), (-1, -6), (-1, -8), (3, -8), (3, -6), (5, -6), (7, -3), (10, -3), (10, 6), (7, 6), (7, 4), (4, 8), (-5, 8), (-5, 4), (-9, 4)])
        line((-12, -2), (-12, 3))
        line((-12, 0.5), (-9, 0.5))
    elif lid == "oil_pressure":
        poly([(-11, -1), (3, -1), (11, -5), (12, -3), (4, 7), (-11, 7)])
        line((-6, -1), (-6, -4), (-2, -4), (-2, -1))
        circ(12, 4, 1.2, fill=col)
    elif lid == "charging_system":
        poly([(-10, -5), (10, -5), (10, 8), (-10, 8)])
        d.rectangle([P(-8, -8), P(-4, -5)], fill=col)
        d.rectangle([P(4, -8), P(8, -5)], fill=col)
        line((-7, 1.5), (-3, 1.5))
        line((3, 1.5), (7, 1.5))
        line((5, -0.5), (5, 3.5))
    elif lid in ("coolant_temp", "coolant_temp_cold"):
        line((0, -11), (0, 3))
        circ(0, 4.5, 2, fill=col)
        line((0, -8), (4, -8))
        line((0, -4), (4, -4))
        line((0, 0), (4, 0))
        wave(8.5)
        wave(11.5)
    elif lid in ("brake_system", "abs"):
        circ(0, 0, 7.5)
        arc(0, 0, 11, 125, 235)
        arc(0, 0, 11, -55, 55)
        if lid == "abs":
            txt("ABS", 0, 0.5, 7)
        else:
            bang(0, -1, 9)
    elif lid == "srs_airbag":
        circ(-5, -8, 2.2)
        line((-5, -5), (-6, 3), (1, 3), (2, 10))
        line((-8, -3), (-3, 4))
        circ(6, -3, 5, fill=col)
    elif lid == "tpms":
        arc(0, 0, 10, 160, 380)
        line((-9.4, -3.4), (-6, -9))
        line((9.4, -3.4), (6, -9))
        for x in (-6, -2, 2, 6):
            line((x, 9.5), (x, 11.5))
        bang(0, -1, 9)
    elif lid in ("vsc_trac", "vsc_off"):
        car_side(0, -4, 0.9 if lid == "vsc_trac" else 0.75)
        line((-7, 6), (-5, 8), (-7, 10), (-5, 12))
        line((5, 6), (7, 8), (5, 10), (7, 12))
        if lid == "vsc_off":
            txt("OFF", 0, 9, 6)
    elif lid == "eps":
        circ(-2, 0, 8)
        circ(-2, 0, 2, fill=col)
        line((-10, 0), (-4, 0))
        line((0, 0), (6, 0))
        line((-2, 2), (-2, 8))
        bang(11, -1, 10)
    elif lid == "low_fuel":
        poly([(-8, -10), (2, -10), (2, 10), (-8, 10)])
        d.rectangle([P(-6, -8), P(0, -3)], fill=col)
        line((2, -5), (7, -2), (7, 6), (5, 8))
        line((7, -2), (9, -6))
    elif lid == "seatbelt":
        circ(-2, -9, 2.5)
        line((-2, -6), (-3, 4), (4, 4), (5, 11))
        line((-7, -5), (5, 6))
        circ(-7, -5, 0.8, fill=col, width=1)
    elif lid == "door_ajar":
        d.rounded_rectangle([P(-5, -11), P(5, 11)], radius=3 * u, outline=col, width=w)
        line((5, -3), (10, -7))
        line((-5, -3), (-10, -7))
        line((-4, 3), (4, 3))
    elif lid == "master_warning":
        poly([(0, -10), (11, 9), (-11, 9)])
        bang(0, 1, 10)
    elif lid == "maintenance_required":
        if newer:
            line((-8, 8), (4, -4))
            arc(6, -6, 4, 120, 410)
        else:
            txt("MAINT", 0, -4, 7)
            txt("REQD", 0, 5, 7)
    elif lid == "pcs_warning":
        car_side(-4, 0, 0.6)
        car_side(7, 0, 0.6)
        star = []
        for i in range(10):
            r = 4 if i % 2 == 0 else 1.8
            a = math.pi / 5 * i - math.pi / 2
            star.append((1.5 + r * math.cos(a), -6 + r * math.sin(a)))
        poly(star, fill=col)
        txt("PCS", 0, 9, 6)
    elif lid == "low_washer_fluid":
        poly([(-11, 9), (-8, -1), (8, -1), (11, 9)])
        for i, a in enumerate(range(200, 345, 25)):
            r = 7
            x = r * math.cos(math.radians(a))
            y = -1 + r * math.sin(math.radians(a))
            circ(x, y, 0.8, fill=col, width=1)
        line((0, -1), (0, 3))


# ----------------------------------------------------------------- the cluster
def gauge(d, cx, cy, r, theme, labels, needle_frac, title=None):
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=theme["face"], outline=theme["glow"], width=3)
    a0, a1 = 135, 405
    n = len(labels) - 1
    for i in range(n * 5 + 1):
        a = math.radians(a0 + (a1 - a0) * i / (n * 5))
        major = i % 5 == 0
        r1 = r - (24 if major else 14)
        d.line([(cx + (r - 6) * math.cos(a), cy + (r - 6) * math.sin(a)), (cx + r1 * math.cos(a), cy + r1 * math.sin(a))], fill=theme["ink"], width=3 if major else 1)
        if major:
            lr = r - 48
            text_c(d, (cx + lr * math.cos(a), cy + lr * math.sin(a)), labels[i // 5], int(r * 0.12), theme["ink"])
    a = math.radians(a0 + (a1 - a0) * needle_frac)
    d.line([(cx, cy), (cx + (r - 30) * math.cos(a), cy + (r - 30) * math.sin(a))], fill=theme["needle"], width=5)
    d.ellipse([cx - 12, cy - 12, cx + 12, cy + 12], fill=(30, 30, 30), outline=theme["ink"])
    if title:
        text_c(d, (cx, cy - r * 0.38), title, int(r * 0.09), theme["ink"])


def slot_positions(gen: str) -> list[tuple[int, int]]:
    slots = []
    for y in (52, 108):
        for i in range(6):
            slots.append((470 + i * 52, y))
    for x in (165, 240, 315):
        slots.append((x, 420))
    for x in (885, 960, 1035):
        slots.append((x, 420))
    if gen in ("XV30", "XV40"):  # no big MID: use the center for more rows
        for y in (200, 260):
            for i in range(6):
                slots.append((470 + i * 52, y))
    else:
        for i in range(6):
            slots.append((470 + i * 52, 470))
    return slots


def fmt_odo(value: int, unit: str, gen: str) -> str:
    if gen in ("XV30", "XV40"):
        return f"ODO {value:6d}"
    return f"ODO {value:,} {unit}" if gen == "XV80" else f"ODO {value:6d} {unit}"


def render(sample: dict, rng: random.Random) -> Image.Image:
    gen = sample["generation"]
    theme = THEMES[gen]
    newer = gen in ("XV70", "XV80")
    img = Image.new("RGB", (W, H), theme["bg"])
    d = ImageDraw.Draw(img)

    hybrid = sample["hybrid"]
    if gen == "XV80":
        # digital cluster: big speed readout + power bar
        d.rounded_rectangle([60, 120, 420, 470], radius=40, fill=theme["face"], outline=theme["glow"], width=3)
        text_c(d, (240, 270), "0", 120, theme["ink"])
        text_c(d, (240, 350), sample["unit"] == "km" and "km/h" or "MPH", 26, theme["ink"])
        d.rounded_rectangle([780, 120, 1140, 470], radius=40, fill=theme["face"], outline=theme["glow"], width=3)
        text_c(d, (960, 180), "READY", 30, COLORS["green"])
        for i in range(10):
            c = theme["glow"] if i < 2 else GHOST
            d.rectangle([820 + i * 31, 240, 842 + i * 31, 300], fill=c)
        text_c(d, (850, 320), "CHG", 18, theme["ink"])
        text_c(d, (960, 320), "ECO", 18, theme["ink"])
        text_c(d, (1080, 320), "PWR", 18, theme["ink"])
    else:
        unit_lbl = "km/h" if sample["unit"] == "km" else "MPH"
        speeds = [str(v) for v in range(0, 161, 20)] if sample["unit"] != "km" else [str(v) for v in range(0, 241, 30)]
        gauge(d, 240, 255, 195, theme, speeds, 0.0, unit_lbl)
        if hybrid:
            gauge(d, 960, 255, 195, theme, ["CHG", "", "ECO", "", "", "PWR", ""], 0.25, "HYBRID")
        else:
            gauge(d, 960, 255, 195, theme, [str(v) for v in range(0, 9)], 0.09, "x1000 r/min")

    # odometer / MID
    odo = fmt_odo(sample["odometer"], sample["unit"], gen)
    trip = f"TRIP A {rng.uniform(0, 999):.1f}"
    msgs = [MESSAGE_LIGHTS[l] for l in sample["lights_on"] if l in MESSAGE_LIGHTS]
    if gen in ("XV30", "XV40"):
        d.rectangle([158, 292, 322, 352], fill=(4, 4, 4), outline=(60, 60, 60))
        text_c(d, (240, 309), odo, 21, theme["lcd"], mono=True)
        text_c(d, (240, 335), msgs[0] if msgs else trip, 14 if msgs else 17, COLORS["amber"] if msgs else theme["lcd"], mono=True)
    else:
        d.rounded_rectangle([470, 150, 750, 440], radius=14, fill=(6, 6, 8), outline=(70, 70, 80), width=2)
        text_c(d, (610, 175), f"{rng.randint(-5, 35)}°C" if sample["unit"] == "km" else f"{rng.randint(25, 95)}°F", 18, theme["lcd"])
        if msgs:
            d.rounded_rectangle([490, 220, 730, 330], radius=8, fill=(30, 10, 6))
            text_c(d, (610, 255), "!", 34, COLORS["amber"])
            text_c(d, (610, 300), msgs[0], 20, theme["lcd"])
        else:
            text_c(d, (610, 250), "D", 60, theme["lcd"])
            text_c(d, (610, 310), f"{rng.uniform(22, 48):.1f} MPG" if sample["unit"] != "km" else f"{rng.uniform(4, 9):.1f} L/100km", 22, theme["lcd"])
        text_c(d, (610, 370), odo, 22, theme["lcd"], mono=True)
        text_c(d, (610, 405), trip, 18, theme["lcd"], mono=True)

    # warning lights: fixed slot per light for this generation, ghosts for unlit
    slots = slot_positions(gen)
    icon_ids = [l for l in available_lights(sample["model_year"], hybrid) if l not in MESSAGE_LIGHTS]
    order = sorted(icon_ids)
    random.Random(gen).shuffle(order)
    for lid, (x, y) in zip(order, slots):
        lit = lid in sample["lights_on"]
        col = COLORS[LIGHTS[lid]["color"]] if lit else GHOST
        if lit and lid == "master_warning" and LIGHTS[lid]["color"] == "red" and rng.random() < 0.4:
            col = COLORS["amber"]
        draw_icon(d, lid, x, y, 36, col, newer)
    return img


# --------------------------------------------------------------- augmentation
def photo_augment(img: Image.Image, rng: random.Random) -> tuple[Image.Image, dict]:
    p = {
        "rotate_deg": round(rng.uniform(-6, 6), 2),
        "shear": round(rng.uniform(-0.08, 0.08), 3),
        "brightness": round(rng.uniform(0.7, 1.25), 2),
        "contrast": round(rng.uniform(0.8, 1.2), 2),
        "blur": round(rng.choice([0, 0, 0.6, 1.0, 1.6]), 2),
        "glare": rng.random() < 0.35,
        "noise": round(rng.uniform(0, 18), 1),
        "jpeg_quality": rng.randint(55, 92),
    }
    out = img.transform(img.size, Image.AFFINE, (1, p["shear"], -p["shear"] * H / 2, 0, 1, 0), resample=Image.BICUBIC, fillcolor=(0, 0, 0))
    out = out.rotate(p["rotate_deg"], resample=Image.BICUBIC, expand=False, fillcolor=(0, 0, 0))
    if p["glare"]:
        glare = Image.new("L", out.size, 0)
        gd = ImageDraw.Draw(glare)
        gx, gy = rng.randint(100, W - 100), rng.randint(40, H - 40)
        gd.ellipse([gx - 220, gy - 70, gx + 220, gy + 70], fill=rng.randint(40, 90))
        glare = glare.filter(ImageFilter.GaussianBlur(60))
        out = Image.composite(Image.new("RGB", out.size, (255, 255, 255)), out, glare)
    if p["blur"]:
        out = out.filter(ImageFilter.GaussianBlur(p["blur"]))
    out = ImageEnhance.Brightness(out).enhance(p["brightness"])
    out = ImageEnhance.Contrast(out).enhance(p["contrast"])
    if p["noise"]:
        noise = Image.effect_noise(out.size, p["noise"]).convert("RGB")
        out = Image.blend(out, noise, 0.06)
    return out, p


# ------------------------------------------------------------------ scenarios
CO_OCCUR = {
    "check_engine": ["vsc_trac"],          # Toyota disables VSC on engine faults
    "abs": ["vsc_trac", "brake_system"],
    "check_hybrid_system": ["master_warning", "check_engine"],
    "at_oil_temp": ["master_warning"],
    "oil_pressure": ["check_engine"],
}
STATUS_LIGHTS = ["low_fuel", "seatbelt", "door_ajar", "vsc_off", "low_washer_fluid", "coolant_temp_cold"]


def make_sample(idx: int, rng: random.Random, faulty: bool) -> dict:
    g = rng.choice(GENS["generations"])
    year = rng.randint(*g["years"])
    hybrid = g["code"] == "XV80" or (year >= 2007 and rng.random() < 0.25)
    age = max(0.3, 2026 - year + rng.uniform(-0.5, 0.5))
    miles = int(max(5, rng.gauss(10500, 3500) * age))
    if rng.random() < 0.1:
        miles = int(miles * rng.uniform(1.6, 2.3))  # high-mileage outlier
    unit = "km" if rng.random() < 0.1 else "mi"
    odo = int(miles * 1.609) if unit == "km" else miles

    avail = available_lights(year, hybrid)
    lights: set[str] = set()
    if faulty:
        faults = [l for l in avail if LIGHTS[l]["is_fault"] and l != "master_warning"]
        for f in rng.sample(faults, k=rng.choice([1, 1, 1, 2, 2, 3])):
            lights.add(f)
            for extra in CO_OCCUR.get(f, []):
                if extra in avail and rng.random() < 0.6:
                    lights.add(extra)
        if rng.random() < 0.3:
            lights.add("maintenance_required")
    if rng.random() < 0.35:
        lights.add(rng.choice([s for s in STATUS_LIGHTS if s in avail]))
    if not faulty and rng.random() < 0.15:
        lights.add("maintenance_required")
    # message-type faults need the master warning on MID-equipped Camrys
    if any(l in MESSAGE_LIGHTS for l in lights) and g["code"] not in ("XV30", "XV40"):
        lights.add("master_warning")

    return {
        "id": f"camry_{idx:04d}",
        "generation": g["code"],
        "model_year": year,
        "hybrid": hybrid,
        "odometer": odo,
        "unit": unit,
        "lights_on": sorted(lights),
        "has_fault": any(LIGHTS[l]["is_fault"] for l in lights),
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--count", type=int, default=60)
    ap.add_argument("--fault-ratio", type=float, default=0.6, help="share of images with at least one fault light")
    ap.add_argument("--seed", type=int, default=26)
    ap.add_argument("--out", type=Path, default=Path("dataset/synthetic"))
    ap.add_argument("--clean", action="store_true", help="skip photo augmentation (perfect renders)")
    args = ap.parse_args()

    rng = random.Random(args.seed)
    (args.out / "images").mkdir(parents=True, exist_ok=True)
    n_fault = round(args.count * args.fault_ratio)
    flags = [True] * n_fault + [False] * (args.count - n_fault)
    rng.shuffle(flags)

    labels = []
    for i, faulty in enumerate(flags):
        s = make_sample(i, rng, faulty)
        img = render(s, rng)
        aug = {}
        if not args.clean:
            img, aug = photo_augment(img, rng)
        fname = f"{s['id']}.jpg"
        img.save(args.out / "images" / fname, quality=aug.get("jpeg_quality", 92))
        s["file"] = f"images/{fname}"
        s["augmentation"] = aug
        labels.append(s)

    meta = {
        "description": "Synthetic Toyota Camry dash images. Ground truth for the vision model eval.",
        "seed": args.seed,
        "count": len(labels),
        "with_fault": sum(l["has_fault"] for l in labels),
        "without_fault": sum(not l["has_fault"] for l in labels),
        "generator": "dash_vision/generate_dataset.py",
    }
    (args.out / "labels.json").write_text(json.dumps({"_meta": meta, "samples": labels}, indent=2), encoding="utf-8")
    print(f"wrote {len(labels)} images to {args.out} ({meta['with_fault']} with faults, {meta['without_fault']} without)")


if __name__ == "__main__":
    main()
