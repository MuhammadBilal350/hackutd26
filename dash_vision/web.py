"""Local camera/upload UI. Run: python -m dash_vision.web"""
from __future__ import annotations

import argparse
from datetime import date
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
import json
import logging
from pathlib import Path
import threading
from urllib.parse import parse_qs, urlsplit

import cv2
import numpy as np
from PIL import Image, UnidentifiedImageError

if __package__:
    from . import cv_detector
    from .reliability import LIGHTS, score_dash
else:
    import cv_detector
    from reliability import LIGHTS, score_dash

ASSETS = Path(__file__).with_name('web')
MAX_BYTES = 12 * 1024 * 1024
LOCK = threading.Lock()
READY = threading.Event()
LOAD_ERROR = None


def analyze_image(data: bytes, metadata: dict) -> dict:
    def number(key, low, high):
        raw = metadata.get(key, '')
        if raw == '':
            return None
        try:
            value = int(raw)
        except (TypeError, ValueError):
            raise ValueError(f'{key} must be a whole number') from None
        if not low <= value <= high:
            raise ValueError(f'{key} must be between {low} and {high}')
        return value

    miles = number('miles', 0, 2000000)
    year = number('year', 1900, date.today().year + 1)
    unit = metadata.get('unit', 'mi')
    hybrid = metadata.get('hybrid', 'false')
    if unit not in ('mi', 'km') or hybrid not in ('true', 'false'):
        raise ValueError('Invalid unit or hybrid setting')
    if not data or len(data) > MAX_BYTES:
        raise ValueError('Choose an image smaller than 12 MB')
    try:
        with Image.open(BytesIO(data)) as image:
            if image.width * image.height > 24000000:
                raise ValueError('Choose an image smaller than 24 megapixels')
            from PIL import ImageOps
            image = ImageOps.exif_transpose(image).convert('RGB')
            frame = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise ValueError('Cannot read this image. Use a JPEG, PNG or WebP photo.') from None
    with LOCK:
        reading, _ = cv_detector.detect_array(frame)
    lights = [light for light in reading['lights'] if light['confidence'] != 'low']
    report = score_dash([light['id'] for light in lights], miles, unit, year, hybrid == 'true')
    if reading['likely_bulb_check']:
        report['warning'] = 'Possible key-on bulb check. Retake with the engine running.'
    # Return only structured stats. Never send the source or annotated photo back.
    return {
        'reading': {
            'lights': [{**{key: light[key] for key in ('id', 'color', 'confidence')},
                        'name': LIGHTS[light['id']]['name']} for light in lights],
            'likely_bulb_check': reading['likely_bulb_check'],
        },
        'reliability': report,
        'limitations': 'Experimental visual estimate, not a vehicle diagnosis. No lights detected does not prove the vehicle is healthy. Mileage is entered manually.',
    }


class Handler(BaseHTTPRequestHandler):
    def send(self, status, body, content_type='application/json'):
        if isinstance(body, dict):
            body = json.dumps(body).encode()
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        route = urlsplit(self.path).path
        if route == '/api/health':
            return self.send(200, {'ready': READY.is_set(), 'error': LOAD_ERROR})
        assets = {'/': ('index.html', 'text/html; charset=utf-8'),
                  '/app.js': ('app.js', 'text/javascript; charset=utf-8'),
                  '/style.css': ('style.css', 'text/css; charset=utf-8')}
        if route not in assets:
            return self.send(404, {'error': 'Not found'})
        name, mime = assets[route]
        self.send(200, (ASSETS / name).read_bytes(), mime)

    def do_POST(self):
        if urlsplit(self.path).path != '/api/analyze':
            return self.send(404, {'error': 'Not found'})
        # Browser calls must originate from this local app, never another website.
        origin = self.headers.get('Origin')
        expected = f'http://127.0.0.1:{self.server.server_port}'
        if origin and origin != expected:
            return self.send(403, {'error': 'Open the app at ' + expected})
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= MAX_BYTES:
                return self.send(413, {'error': 'Choose an image smaller than 12 MB'})
            metadata = {key: values[0] for key, values in parse_qs(urlsplit(self.path).query).items()}
            result = analyze_image(self.rfile.read(length), metadata)
        except ValueError as error:
            return self.send(400, {'error': str(error)})
        except Exception:
            logging.exception('Analysis failed')
            return self.send(500, {'error': 'Analysis failed. Try another clear dashboard photo.'})
        self.send(200, result)


def warmup():
    global LOAD_ERROR
    try:
        with LOCK:
            cv_detector.reference_set()
        READY.set()
    except Exception as error:
        LOAD_ERROR = str(error)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8765)
    args = parser.parse_args()
    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    threading.Thread(target=warmup, daemon=True).start()
    print(f'Open http://127.0.0.1:{args.port} — press Ctrl+C to stop.', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
