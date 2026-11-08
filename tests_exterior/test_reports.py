from datetime import date, timedelta
import unittest


class ReportTests(unittest.TestCase):
    def test_failed_model_evaluation_cannot_produce_a_condition_rating(self):
        from exterior_vision.report import condition_report
        result = condition_report({'front': []}, model_qualified=False)
        self.assertIsNone(result['visible_condition_score'])
        self.assertEqual(result['condition'], 'model_not_qualified')
        self.assertIsNone(result['condition_adjustment_fraction'])

    def test_missing_views_cannot_claim_clean_or_mechanical_life(self):
        from exterior_vision.report import condition_report
        report = condition_report({'front': []})
        self.assertEqual(report['coverage']['missing'], ['rear', 'left', 'right'])
        self.assertIsNone(report['mechanical_durability_years'])
        self.assertNotEqual(report['condition'], 'well_maintained')

    def test_damage_reduces_rating_without_double_counting_duplicate_boxes(self):
        from exterior_vision.report import condition_report
        dent = {'label': 'dent', 'confidence': .9, 'area_fraction': .1}
        clean = condition_report({view: [] for view in ['front', 'rear', 'left', 'right']})
        damaged = condition_report({'front': [dent, dent]})
        once = condition_report({'front': [dent]})
        self.assertLess(damaged['visible_condition_score'], clean['visible_condition_score'])
        self.assertEqual(damaged['visible_condition_score'], once['visible_condition_score'])

    def test_no_current_comparables_means_no_market_price(self):
        from exterior_vision.market import estimate_value
        result = estimate_value([], vehicle(), today=date(2026, 11, 7))
        self.assertEqual(result['status'], 'unavailable')
        self.assertIsNone(result['baseline_usd'])

    def test_failed_model_cannot_adjust_a_real_market_baseline(self):
        from exterior_vision.market import estimate_value
        from exterior_vision.report import condition_report
        condition = condition_report({view: [] for view in ['front', 'rear', 'left', 'right']}, model_qualified=False)
        result = estimate_value([listing(price) for price in [18000, 20000, 22000]], vehicle(), condition, today=date(2026, 11, 7))
        self.assertEqual(result['baseline_usd'], 20000)
        self.assertIsNone(result['condition_scenario_usd'])

    def test_market_uses_recent_matching_prices_and_reports_purchase_change(self):
        from exterior_vision.market import estimate_value
        rows = [listing(price) for price in [18000, 20000, 22000]]
        rows += [listing(99999, observed_at='2020-01-01'), listing(1, model='Corolla')]
        result = estimate_value(rows, vehicle(purchase_price=25000), today=date(2026, 11, 7))
        self.assertEqual(result['baseline_usd'], 20000)
        self.assertEqual(result['sample_count'], 3)
        self.assertEqual(result['change_from_purchase_usd'], -5000)
        self.assertEqual(result['currency'], 'USD')

    def test_future_prices_and_duplicate_listing_ids_are_not_extra_evidence(self):
        from exterior_vision.market import estimate_value
        row = listing(20000, listing_id='same')
        result = estimate_value([row, row, listing(1, observed_at='2027-01-01')], vehicle(), today=date(2026, 11, 7))
        self.assertEqual(result['status'], 'insufficient_comparables')
        self.assertIsNone(result['baseline_usd'])


def vehicle(**extra):
    return dict(make='Toyota', model='Camry', trim='LE', year=2021, mileage=60000, zip='75080', **extra)


def listing(price, **extra):
    row = dict(make='Toyota', model='Camry', trim='LE', year=2021, mileage=60000,
               zip='75080', price_usd=price, observed_at='2026-11-01', listing_id=str(price))
    row.update(extra)
    return row
