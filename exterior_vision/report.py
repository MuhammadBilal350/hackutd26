"""Disclosed visual-condition heuristics. These are not mechanical diagnostics."""
import math

VIEWS = ('front', 'rear', 'left', 'right')
LABELS = ('dent', 'scratch')


def condition_report(views: dict, model_qualified=True) -> dict:
    if not set(views) <= set(VIEWS):
        raise ValueError('Unknown exterior view')
    worst = {}
    detections = []
    for view, findings in views.items():
        for finding in findings:
            label = finding['label']
            confidence = float(finding['confidence'])
            area = float(finding['area_fraction'])
            if label not in LABELS or not math.isfinite(confidence) or not 0 <= confidence <= 1:
                raise ValueError('Invalid damage class or confidence')
            if not math.isfinite(area) or not 0 <= area <= 1:
                raise ValueError('Invalid damage area')
            if confidence < .5:
                continue
            # Size is a visual proxy, never scratch depth or structural severity.
            size = 'large_visible_region' if area >= .08 else 'small_visible_region'
            penalty = (25 if area >= .08 else 12) if label == 'dent' else (12 if area >= .08 else 5)
            worst[label] = max(worst.get(label, 0), penalty)
            detections.append({**finding, 'view': view, 'visual_extent': size})
    score = max(0, 100 - sum(worst.values()))
    missing = [view for view in VIEWS if view not in views]
    if not views or not model_qualified:
        score = None
    condition = 'visible_damage_detected' if worst else 'no_covered_damage_detected' if views else 'not_inspected'
    if views and not model_qualified:
        condition = 'model_not_qualified'
    return {
        'visible_condition_score': score,
        'condition': condition,
        'coverage': {'captured': [v for v in VIEWS if v in views], 'missing': missing, 'complete': not missing},
        'findings': detections,
        'covered_damage_classes': list(LABELS),
        'mechanical_durability_years': None,
        'durability_assessment': 'Mechanical life and structural integrity cannot be determined from these exterior photos.',
        'maintenance_verified': False,
        'condition_adjustment_fraction': min(.2, sum(worst.values()) / 100 * .3) if model_qualified else None,
        'rating_enabled': model_qualified,
        'rating_note': 'Research rating heuristic only.' if model_qualified else 'Rating withheld: checkpoint has not passed the project evaluation gate. Predictions are research diagnostics only.',
        'score_method': 'Experimental heuristic: maximum penalty per damage class across views to avoid counting the same defect repeatedly. Not calibrated to repairs or resale transactions.',
        'next_steps': ([
            'Have visible dents inspected for hidden panel or structural damage.' if 'dent' in worst else 'Have paint damage inspected for depth, exposed metal and corrosion risk.',
            'Obtain a repair quote before using a condition discount in a purchase decision.',
        ] if worst else ['No confident dent/scratch matches in these views. This is not evidence of maintenance or proof of no damage.']) +
            (['Capture the missing angles: ' + ', '.join(missing)] if missing else []),
        'limitations': 'Detects dents and scratches only. Other damage, rust, repainting and mechanical faults may be missed. Visible size depends on framing; confidence is not certainty.',
    }
