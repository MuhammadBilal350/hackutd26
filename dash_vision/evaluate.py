"""Measure the vision model against the labeled dataset.

    python dash_vision/evaluate.py --dry-run              # score ground-truth labels only, no API calls
    python dash_vision/evaluate.py --limit 10             # run Claude on 10 images (costs API credits)
    python dash_vision/evaluate.py --labels dataset/real/labels.json

Reports per-light precision/recall, exact-set accuracy, odometer accuracy, and how far
the reliability score from detected lights lands from the score from true lights.
Predictions are cached in <dataset>/predictions.json so re-runs don't re-bill.
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path

from reliability import score_dash


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--labels", type=Path, default=Path("dataset/synthetic/labels.json"))
    ap.add_argument("--limit", type=int)
    ap.add_argument("--effort", default="medium")
    ap.add_argument("--dry-run", action="store_true", help="no API calls; show reliability scores for the ground truth")
    args = ap.parse_args()

    root = args.labels.parent
    samples = json.loads(args.labels.read_text(encoding="utf-8"))["samples"][: args.limit]

    if args.dry_run:
        print(f"{'id':<12}{'gen':<6}{'year':<6}{'odometer':>10}  {'score':>5} grade  lights")
        for s in samples:
            r = score_dash(s["lights_on"], s["odometer"], s["unit"], s["model_year"], s["hybrid"])
            print(f"{s['id']:<12}{s['generation']:<6}{s['model_year']:<6}{s['odometer']:>8} {s['unit']:<2} {r['score']:>5}  {r['grade']:<5} {', '.join(s['lights_on']) or '-'}")
        return

    from detector import confirmed_lights, detect  # imported here so --dry-run works without the SDK
    import anthropic

    client = anthropic.Anthropic()
    cache_path = root / "predictions.json"
    cache = json.loads(cache_path.read_text(encoding="utf-8")) if cache_path.exists() else {}

    tp, fp, fn = Counter(), Counter(), Counter()
    exact = odo_ok = odo_n = 0
    score_err = []
    tokens = Counter()
    for i, s in enumerate(samples, 1):
        key = f"{s['file']}|{args.effort}"
        if key not in cache:
            cache[key] = detect(root / s["file"], client=client, effort=args.effort)
            cache_path.write_text(json.dumps(cache, indent=2), encoding="utf-8")
        pred = cache[key]
        tokens.update(pred.get("_usage", {}))

        got, want = set(confirmed_lights(pred)), set(s["lights_on"])
        for l in got & want:
            tp[l] += 1
        for l in got - want:
            fp[l] += 1
        for l in want - got:
            fn[l] += 1
        exact += got == want

        o = pred["odometer"]
        odo_n += 1
        odo_ok += o["readable"] and o["value"] == s["odometer"]

        true_score = score_dash(s["lights_on"], s["odometer"], s["unit"], s["model_year"], s["hybrid"])["score"]
        pred_score = score_dash(list(got), o["value"] if o["readable"] else None, o["unit"] if o["unit"] != "unknown" else "mi", s["model_year"], s["hybrid"])["score"]
        score_err.append(abs(true_score - pred_score))
        miss = f"  missed={sorted(want - got)}" if want - got else ""
        extra = f"  extra={sorted(got - want)}" if got - want else ""
        print(f"[{i}/{len(samples)}] {s['id']} odo {'ok ' if o['value'] == s['odometer'] else 'BAD'} score {true_score}->{pred_score}{miss}{extra}")

    print("\nPer-light results")
    print(f"{'light':<24}{'prec':>6}{'recall':>8}{'tp':>5}{'fp':>5}{'fn':>5}")
    for l in sorted(set(tp) | set(fp) | set(fn)):
        p = tp[l] / (tp[l] + fp[l]) if tp[l] + fp[l] else 0
        r = tp[l] / (tp[l] + fn[l]) if tp[l] + fn[l] else 0
        print(f"{l:<24}{p:>6.2f}{r:>8.2f}{tp[l]:>5}{fp[l]:>5}{fn[l]:>5}")
    T, F, N = sum(tp.values()), sum(fp.values()), sum(fn.values())
    print(f"\nmicro precision {T / max(1, T + F):.3f}  recall {T / max(1, T + N):.3f}")
    print(f"exact light-set match {exact}/{len(samples)}")
    print(f"odometer exact {odo_ok}/{odo_n}")
    print(f"mean |score error| {sum(score_err) / max(1, len(score_err)):.2f} points")
    print(f"tokens: {dict(tokens)}")


if __name__ == "__main__":
    main()
