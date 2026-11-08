"""US/USD market evidence and separate, explicitly hypothetical condition adjustments."""
import csv
from datetime import date
import io
import json
import math
import os
import re
import statistics
from urllib.parse import urlencode
from urllib.request import urlopen


def validate_vehicle(vehicle):
    if not isinstance(vehicle, dict):
        raise ValueError('Vehicle details must be an object')
    cleaned = {}
    for field in ('make', 'model', 'trim'):
        value = str(vehicle.get(field, '')).strip()
        if not value or len(value) > 80:
            raise ValueError(f'{field} is required (maximum 80 characters)')
        cleaned[field] = value
    for field, low, high in (('year', 1900, date.today().year + 1), ('mileage', 0, 2000000)):
        try:
            value = int(vehicle[field])
        except (ValueError, TypeError, KeyError):
            raise ValueError(f'{field} must be a whole number') from None
        if not low <= value <= high:
            raise ValueError(f'{field} must be between {low} and {high}')
        cleaned[field] = value
    cleaned['zip'] = str(vehicle.get('zip', '')).strip()
    if not re.fullmatch(r'\d{5}', cleaned['zip']):
        raise ValueError('Enter a five-digit US ZIP code')
    for field in ('purchase_price',):
        raw = vehicle.get(field)
        if raw not in ('', None):
            value = float(raw)
            if not math.isfinite(value) or value <= 0:
                raise ValueError('Purchase price must be a positive USD amount')
            cleaned[field] = value
    vin = str(vehicle.get('vin', '')).strip().upper()
    if vin and not re.fullmatch(r'[A-HJ-NPR-Z0-9]{17}', vin):
        raise ValueError('VIN must contain 17 valid VIN characters')
    cleaned['vin'] = vin
    return cleaned


def parse_listings(text):
    if len(text) > 2000000:
        raise ValueError('Comparable CSV must be smaller than 2 MB')
    reader = csv.DictReader(io.StringIO(text.lstrip('\ufeff')))
    required = {'listing_id', 'make', 'model', 'trim', 'year', 'mileage', 'zip', 'price_usd', 'observed_at'}
    if not required <= set(reader.fieldnames or []):
        raise ValueError('CSV needs columns: ' + ', '.join(sorted(required)))
    rows = list(reader)
    if len(rows) > 10000:
        raise ValueError('Use at most 10,000 comparables')
    return rows


def estimate_value(rows, vehicle, condition=None, today=None):
    today = today or date.today()
    vehicle = validate_vehicle(vehicle)
    result = {'status': 'unavailable', 'currency': 'USD', 'market': 'USA', 'as_of': today.isoformat(),
              'baseline_usd': None, 'asking_range_usd': None, 'sample_count': 0,
              'condition_scenario_usd': None, 'change_from_purchase_usd': None,
              'maintenance_premium_usd': None, 'market_history': [],
              'source': 'User-supplied comparable asking prices',
              'note': 'No current market data supplied. Add recent matching listings or configure MARKETCHECK_API_KEY.'}
    matched, seen = [], set()
    for row in rows:
        try:
            if any(str(row[key]).strip().casefold() != vehicle[key].casefold() for key in ('make', 'model', 'trim')):
                continue
            if abs(int(row['year']) - vehicle['year']) > 1 or abs(int(row['mileage']) - vehicle['mileage']) > 20000:
                continue
            if str(row['zip']).strip()[:3] != vehicle['zip'][:3]:
                continue
            observed = date.fromisoformat(row['observed_at'])
            price = float(row['price_usd'])
            identity = str(row['listing_id']).strip()
            if not identity or not math.isfinite(price) or not 0 < price < 10000000 or observed > today:
                continue
            # Same advertisement can appear once per observation date, never multiple times.
            key = (identity, observed.isoformat())
            if key in seen:
                continue
            seen.add(key)
            matched.append((identity, observed, price))
        except (ValueError, TypeError, KeyError):
            continue
    # For today's baseline, use only the newest observation of each listing.
    newest = {}
    for identity, observed, price in sorted(matched, key=lambda row: row[1]):
        if 0 <= (today - observed).days <= 30:
            newest[identity] = (observed, price)
    prices = sorted(price for _, price in newest.values())
    result['sample_count'] = len(prices)
    if prices and len(prices) < 3:
        result.update(status='insufficient_comparables', note='At least 3 unique comparable listings observed in the last 30 days are required.')
    if len(prices) >= 3:
        base = round(statistics.median(prices))
        result.update(status='available', baseline_usd=base, asking_range_usd=[round(prices[0]), round(prices[-1])],
                      note='Median asking price, not a guaranteed sale price. Same make/model/trim, year ±1, mileage ±20,000 and matching ZIP prefix; not adjusted for options, title history or exact distance.',
                      observation_dates=sorted({observed.isoformat() for observed, _ in newest.values()}))
        apply_condition_scenario(result, condition)
        if 'purchase_price' in vehicle:
            result['change_from_purchase_usd'] = base - vehicle['purchase_price']
            result['purchase_change_note'] = 'Current comparable asking-price baseline versus your purchase price. This is not a measured market depreciation rate.'
    groups = {}
    for identity, observed, price in sorted(matched, key=lambda row: row[1]):
        if 30 < (today - observed).days <= 3650:
            groups.setdefault(observed.strftime('%Y-%m'), {})[identity] = price
    result['market_history'] = [dict(month=month, median_asking_usd=round(statistics.median(group.values())), sample_count=len(group))
                                for month, group in sorted(groups.items()) if len(group) >= 3]
    return result


def apply_condition_scenario(result, condition):
    if condition and condition.get('condition_adjustment_fraction') is None:
        result['condition_note'] = 'Condition scenario withheld because the damage model has not passed the project evaluation gate.'
        return
    if not condition or not condition['coverage']['complete']:
        result['condition_note'] = 'Capture all four exterior views before calculating a condition scenario.'
        return
    fraction = condition['condition_adjustment_fraction']
    result['condition_scenario_usd'] = round(result['baseline_usd'] * (1 - fraction))
    result['illustrative_condition_discount_pct'] = round(fraction * 100, 1)
    result['condition_note'] = 'Illustrative, uncalibrated damage discount. Not part of the observed market baseline. No visible damage preserves the baseline; it does not prove maintenance or appreciation.'


def provider_value(vehicle, condition=None):
    """Explicitly enabled US MarketCheck request; never log credentials or VIN."""
    key = os.environ.get('MARKETCHECK_API_KEY')
    vehicle = validate_vehicle(vehicle)
    if not key or not vehicle['vin']:
        return None
    params = urlencode({'api_key': key, 'vin': vehicle['vin'], 'miles': vehicle['mileage'], 'zip': vehicle['zip']})
    with urlopen('https://api.marketcheck.com/v2/predict/car/us/marketcheck_price?' + params, timeout=25) as response:
        payload = json.load(response)
    price = float(payload['marketcheck_price'])
    if not math.isfinite(price) or price <= 0:
        raise ValueError('Market provider returned an invalid price')
    result = {'status': 'available', 'currency': 'USD', 'market': 'USA', 'as_of': date.today().isoformat(),
              'baseline_usd': round(price), 'source': 'MarketCheck US predicted retail price', 'sample_count': None,
              'asking_range_usd': None, 'condition_scenario_usd': None, 'market_history': [],
              'maintenance_premium_usd': None, 'change_from_purchase_usd': None,
              'note': 'Provider price prediction, not a sale offer or mechanical inspection.'}
    apply_condition_scenario(result, condition)
    if 'purchase_price' in vehicle:
        result['change_from_purchase_usd'] = round(price - vehicle['purchase_price'])
    return result
