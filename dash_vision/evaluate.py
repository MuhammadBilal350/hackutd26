"""Measure a detector against the labeled dataset.

    python dash_vision/evaluate.py                      # OpenCV detector (free, offline)
    python dash_vision/evaluate.py --dry-run            # just show scores from the true labels
    python dash_vision/evaluate.py --detector claude --limit 10   # Claude vision (needs ANTHROPIC_API_KEY)
    python dash_vision/evaluate.py --labels dataset/real/labels.json

Reports per-light precision/recall, exact-set accuracy, and how far the reliability
score from detected lights lands from the score from the true lights. Mileage comes
from the labels (the OpenCV detector doesn't read the odometer).

Text-only messages on the center display (check_hybrid_system, at_oil_temp) aren't
icons, so they're left out of the comparison for the OpenCV detector.
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path

if __package__:
    from .reliability import score_dash
else:
    from reliability import score_dash

TEXT_ONLY = {"check_hybrid_system", "at_oil_temp"}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--labels", type=Path, default=Path(__file__).resolve().parents[1] / "dataset/synthetic/labels.json")
    ap.add_argument("--detector", default="cv", choices=["cv", "claude"])
    ap.add_argument("--limit", type=int)
    ap.add_argument("--dry-run", action="store_true", help="no detection; show reliability scores for the ground truth")
    args = ap.parse_args()

    root = args.labels.parent
    samples = json.loads(args.labels.read_text(encoding="utf-8"))["samples"][: args.limit]

    if args.dry_run:
        print(f"{'id':<12}{'gen':<6}{'year':<6}{'odometer':>10}  {'score':>5} grade  lights")
        for s in samples:
            r = score_dash(s["lights_on"], s["odometer"], s["unit"], s["model_year"], s["hybrid"])
            print(f"{s['id']:<12}{s['generation']:<6}{s['model_year']:<6}{s['odometer']:>8} {s['unit']:<2} {r['score']:>5}  {r['grade']:<5} {', '.join(s['lights_on']) or '-'}")
        return

    if args.detector == "cv":
        if __package__:
            from . import cv_detector
        else:
            import cv_detector

        def run(path):
            return cv_detector.detect(path)
    else:
        import anthropic
        if __package__:
            from .detector import detect
        else:
            from detector import detect

        client = anthropic.Anthropic()
        cache_path = root / "predictions.json"
        cache = json.loads(cache_path.read_text(encoding="utf-8")) if cache_path.exists() else {}

        def run(path):  # cached so re-runs don't re-bill
            key = str(path.relative_to(root))
            if key not in cache:
                cache[key] = detect(path, client=client)
                cache_path.write_text(json.dumps(cache, indent=2), encoding="utf-8")
            return cache[key]

    tp, fp, fn = Counter(), Counter(), Counter()
    exact = 0
    score_err = []
    for i, s in enumerate(samples, 1):
        pred = run(root / s["file"])
        got = {l["id"] for l in pred["lights"] if l["id"] != "unknown" and l["confidence"] != "low"}
        want = set(s["lights_on"])
        if args.detector == "cv":
            want -= TEXT_ONLY
        for l in got & want:
            tp[l] += 1
        for l in got - want:
            fp[l] += 1
        for l in want - got:
            fn[l] += 1
        exact += got == want

        true_score = score_dash(sorted(want), s["odometer"], s["unit"], s["model_year"], s["hybrid"])["score"]
        pred_score = score_dash(sorted(got), s["odometer"], s["unit"], s["model_year"], s["hybrid"])["score"]
        score_err.append(abs(true_score - pred_score))
        status = "ok " if got == want else "ERR"
        miss = f"  missed={sorted(want - got)}" if want - got else ""
        extra = f"  extra={sorted(got - want)}" if got - want else ""
        print(f"[{i:>2}/{len(samples)}] {status} {s['id']} {s['generation']} score {true_score:>5} -> {pred_score:>5}{miss}{extra}")

    print(f"\n{'light':<24}{'prec':>6}{'recall':>8}{'tp':>5}{'fp':>5}{'fn':>5}")
    for l in sorted(set(tp) | set(fp) | set(fn)):
        p = tp[l] / (tp[l] + fp[l]) if tp[l] + fp[l] else 0
        r = tp[l] / (tp[l] + fn[l]) if tp[l] + fn[l] else 0
        print(f"{l:<24}{p:>6.2f}{r:>8.2f}{tp[l]:>5}{fp[l]:>5}{fn[l]:>5}")
    T, F, N = sum(tp.values()), sum(fp.values()), sum(fn.values())
    print(f"\nprecision {T / max(1, T + F):.3f}  recall {T / max(1, T + N):.3f}")
    print(f"exact light-set match {exact}/{len(samples)}")
    print(f"mean |score error| {sum(score_err) / max(1, len(score_err)):.2f} points")


if __name__ == "__main__":
    main()
