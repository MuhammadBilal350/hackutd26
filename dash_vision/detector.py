"""Claude vision call: read warning lights and the odometer from a dash photo.

The light ids, colors and visual descriptions come from data/warning_lights.json,
so adding a light to the knowledge base automatically teaches the detector.
The response is constrained to a JSON schema (structured outputs).
"""

from __future__ import annotations

import base64
import json
import mimetypes
from pathlib import Path

import anthropic

HERE = Path(__file__).resolve().parent
KB = json.loads((HERE / "data" / "warning_lights.json").read_text(encoding="utf-8"))
LIGHT_IDS = [l["id"] for l in KB["lights"]]
MODEL = "claude-opus-5-5"

SYSTEM = """You read Toyota Camry instrument clusters from photos for a used-car reliability rating.

Report only indicators that are LIT (glowing in color). Every cluster also shows unlit indicators as dark gray or faint outlines; never report those. When an icon is ambiguous, prefer the closest id below and lower its confidence; if nothing fits, use "unknown" and describe it.

Read the odometer (ODO), not the trip meter (TRIP A/B). Copy the digits exactly. If any digit is unreadable, set readable to false rather than guessing.

Text messages on the center multi-information display count as lights when they match an id below (for example "Check Hybrid System" or "AT OIL TEMP").

Indicator ids:
""" + "\n".join(f"- {l['id']} ({l['color']}): {l['visual']}" for l in KB["lights"])

SCHEMA = {
    "type": "object",
    "properties": {
        "is_dashboard": {"type": "boolean", "description": "Image shows a car instrument cluster"},
        "likely_bulb_check": {"type": "boolean", "description": "Many/all indicators lit at once, as during the key-on bulb check"},
        "odometer": {
            "type": "object",
            "properties": {
                "readable": {"type": "boolean"},
                "value": {"type": "integer", "description": "Odometer digits; 0 if unreadable"},
                "unit": {"type": "string", "enum": ["mi", "km", "unknown"]},
                "raw_text": {"type": "string"},
            },
            "required": ["readable", "value", "unit", "raw_text"],
            "additionalProperties": False,
        },
        "lights": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string", "enum": LIGHT_IDS + ["unknown"]},
                    "color": {"type": "string", "enum": ["red", "amber", "green", "blue", "white", "other"]},
                    "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
                    "evidence": {"type": "string", "description": "Short description of what you saw and where"},
                },
                "required": ["id", "color", "confidence", "evidence"],
                "additionalProperties": False,
            },
        },
        "mid_messages": {"type": "array", "items": {"type": "string"}},
        "image_issues": {"type": "string", "description": "Glare, blur, cropping, etc. Empty if none"},
    },
    "required": ["is_dashboard", "likely_bulb_check", "odometer", "lights", "mid_messages", "image_issues"],
    "additionalProperties": False,
}


class DetectionRefused(RuntimeError):
    pass


def _image_block(path: Path) -> dict:
    media = mimetypes.guess_type(path.name)[0] or "image/jpeg"
    data = base64.standard_b64encode(path.read_bytes()).decode("utf-8")
    return {"type": "image", "source": {"type": "base64", "media_type": media, "data": data}}


def detect(image_path: str | Path, client: anthropic.Anthropic | None = None, effort: str = "medium") -> dict:
    """Return the structured reading for one dash photo, plus token usage."""
    client = client or anthropic.Anthropic()
    response = client.beta.messages.create(
        model=MODEL,
        max_tokens=16000,
        system=SYSTEM,
        messages=[{
            "role": "user",
            "content": [
                _image_block(Path(image_path)),
                {"type": "text", "text": "Read this dashboard."},
            ],
        }],
        output_config={"effort": effort, "format": {"type": "json_schema", "schema": SCHEMA}},
        # If a safety classifier declines, re-run on Anthropic's recommended fallback model.
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
    )
    if response.stop_reason == "refusal":
        raise DetectionRefused(str(response.stop_details))
    if response.stop_reason == "max_tokens":
        raise RuntimeError("response truncated at max_tokens")
    text = next(b.text for b in response.content if b.type == "text")
    result = json.loads(text)
    result["_usage"] = {"input_tokens": response.usage.input_tokens, "output_tokens": response.usage.output_tokens}
    return result


def confirmed_lights(result: dict, min_confidence: str = "medium") -> list[str]:
    """Light ids to score: drops unknowns and anything below min_confidence."""
    order = ["low", "medium", "high"]
    keep = order.index(min_confidence)
    return [l["id"] for l in result["lights"] if l["id"] != "unknown" and order.index(l["confidence"]) >= keep]
