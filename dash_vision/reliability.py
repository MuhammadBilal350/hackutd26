"""Turn a dash reading (lights + odometer) into a 0-100 reliability score.

Pure Python, no API calls, so it can be unit-tested and reused by the web app.

    from dash_vision.reliability import score_dash
    report = score_dash(lights=["check_engine", "vsc_trac"], odometer=142000,
                        unit="mi", model_year=2009, hybrid=False)
"""

from __future__ import annotations

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
KB = json.loads((HERE / "data" / "warning_lights.json").read_text(encoding="utf-8"))
GENS = json.loads((HERE / "data" / "camry_generations.json").read_text(encoding="utf-8"))
LIGHTS = {l["id"]: l for l in KB["lights"]}
PERF_DIMS = ["power", "fuel_efficiency", "safety", "drivability"]
PERF_WORDS = ["none", "slight", "noticeable", "significant", "severe"]
SEVERITY_ORDER = ["info", "low", "medium", "high", "critical"]
DRIVE_ORDER = ["yes", "limited", "no"]
CURRENT_YEAR = 2026


def generation_for(year: int | None) -> dict | None:
    if year is None:
        return None
    for g in GENS["generations"]:
        if g["years"][0] <= year <= g["years"][1]:
            return g
    return None


def mileage_penalty(miles: int, model_year: int | None) -> tuple[float, dict]:
    band = next(b for b in GENS["_meta"]["mileage_bands"] if b["max_miles"] is None or miles <= b["max_miles"])
    penalty = float(band["penalty"])
    detail = {"miles": miles, "band": band["label"], "band_penalty": band["penalty"]}
    if model_year:
        age = max(1, CURRENT_YEAR - model_year)
        expected = age * GENS["_meta"]["expected_miles_per_year"]
        ratio = miles / expected
        adj = 0.0
        if ratio > 1.5:
            adj = min(6.0, (ratio - 1.0) * 4.0)
        elif ratio < 0.5:
            adj = -min(3.0, (0.5 - ratio) * 6.0)
        penalty += adj
        detail.update(age_years=age, expected_miles=expected, usage_ratio=round(ratio, 2), usage_adjustment=round(adj, 1))
    return penalty, detail


def score_dash(
    lights: list[str],
    odometer: int | None,
    unit: str = "mi",
    model_year: int | None = None,
    hybrid: bool = False,
    flashing: list[str] | None = None,
) -> dict:
    flashing = set(flashing or [])
    unknown = [l for l in dict.fromkeys(lights) if l not in LIGHTS]
    lights = [l for l in dict.fromkeys(lights) if l in LIGHTS]
    score = 100.0
    breakdown = []

    # --- mileage
    miles = None
    if odometer is not None and odometer >= 0:
        miles = int(round(odometer / 1.609)) if unit == "km" else int(odometer)
        p, mdetail = mileage_penalty(miles, model_year)
        score -= p
        breakdown.append({"source": "mileage", "penalty": round(p, 1), **mdetail})
    else:
        breakdown.append({"source": "mileage", "penalty": 0, "note": "odometer unreadable - score is less certain"})

    # --- warning lights
    has = set(lights)
    fault_lights = []
    for lid in lights:
        info = LIGHTS[lid]
        if not info["is_fault"]:
            continue
        p = float(info["reliability_penalty"])
        sev = info["severity"]
        note = None
        if lid in flashing:
            p *= info.get("flashing_multiplier", 1.0)
            sev = info.get("flashing_severity", sev)
            note = "flashing"
        if lid == "vsc_trac" and "check_engine" in has:
            p *= 0.5
            note = "halved: Toyota disables VSC whenever the check-engine light is on"
        if lid == "master_warning" and has & {"check_hybrid_system", "at_oil_temp"}:
            p = 0.0
            note = "counted via its MID message instead"
        score -= p
        fault_lights.append((lid, sev))
        breakdown.append({"source": "light", "id": lid, "name": info["name"], "severity": sev, "penalty": round(p, 1), **({"note": note} if note else {})})

    serious = [l for l, s in fault_lights if s in ("high", "critical")]
    if len(serious) >= 2:
        score -= 5
        breakdown.append({"source": "compound", "penalty": 5, "note": f"{len(serious)} high/critical faults at once"})

    # --- generation known issues
    gen = generation_for(model_year)
    if gen:
        for issue in gen["known_issues"]:
            if issue.get("hybrid_only") and not hybrid:
                continue
            yrs = issue.get("years")
            if yrs and not (yrs[0] <= model_year <= yrs[1]):
                continue
            p = issue["penalty"]
            extra = {}
            if issue.get("engine"):  # engine isn't visible on the dash: count as "possible", half weight
                p *= 0.5
                extra = {"note": f"applies to {issue['engine']} only; half weight since engine is unknown"}
            score -= p
            breakdown.append({"source": "known_issue", "generation": gen["code"], "issue": issue["issue"], "penalty": p, **extra})

    score = max(0.0, min(100.0, score))

    # --- performance profile: worst effect per dimension across lit lights
    perf = {d: 0 for d in PERF_DIMS}
    effects = []
    drive = "yes"
    cost_lo = cost_hi = 0
    worst_sev = "info"
    for lid in lights:
        info = LIGHTS[lid]
        for d in PERF_DIMS:
            perf[d] = max(perf[d], info["performance_impact"][d])
        if info["is_fault"]:
            effects.extend(f"{info['name']}: {e}" for e in info["performance_effects"])
            cost_lo += info["repair_cost_usd"][0]
            cost_hi += info["repair_cost_usd"][1]
        sev = info.get("flashing_severity", info["severity"]) if lid in flashing else info["severity"]
        if SEVERITY_ORDER.index(sev) > SEVERITY_ORDER.index(worst_sev):
            worst_sev = sev
        if DRIVE_ORDER.index(info["drive_safe"]) > DRIVE_ORDER.index(drive):
            drive = info["drive_safe"]
        if lid in flashing and info.get("flashing_severity") == "critical":
            drive = "no"

    return {
        "score": round(score, 1),
        "grade": grade(score),
        "worst_severity": worst_sev,
        "drive_safe": drive,
        "odometer_miles": miles,
        "generation": gen["code"] if gen else None,
        "faults": [l for l, _ in fault_lights],
        "status_lights": [l for l in lights if not LIGHTS[l]["is_fault"]],
        "unknown_lights": unknown,
        "performance_impact": {d: {"level": v, "label": PERF_WORDS[v]} for d, v in perf.items()},
        "performance_effects": effects,
        "est_repair_cost_usd": [cost_lo, cost_hi],
        "actions": [LIGHTS[l]["action"] for l, _ in fault_lights],
        "breakdown": breakdown,
    }


def grade(score: float) -> str:
    for cut, g in ((90, "A"), (80, "B"), (70, "C"), (55, "D")):
        if score >= cut:
            return g
    return "F"


if __name__ == "__main__":
    import pprint

    pprint.pprint(score_dash(["check_engine", "vsc_trac", "seatbelt"], 142000, "mi", 2009, flashing=["check_engine"]), sort_dicts=False)
