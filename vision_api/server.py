"""Run the original vision detectors behind a same-origin frontend proxy."""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import logging
import os
from urllib.parse import parse_qs, urlsplit

from dash_vision.web import analyze_image, MAX_BYTES
from exterior_vision.detector import DamageDetector, read_image
from exterior_vision.report import VIEWS, condition_report


class VisionServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, address, checkpoint='exterior_models/damage'):
        super().__init__(address, Handler)
        self.detector = DamageDetector(checkpoint)
        self.allowed_origins = {'http://127.0.0.1:5173', 'http://localhost:5173'}
        self.allowed_origins.update(value.strip() for value in os.environ.get('VISION_ALLOWED_ORIGINS', '').split(',') if value.strip())


class Handler(BaseHTTPRequestHandler):
    def send(self, status, value):
        body = json.dumps(value).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(body)

    def allowed(self):
        authority = f'127.0.0.1:{self.server.server_port}'
        if self.headers.get('Host') != authority:
            self.send(403, {'error': 'Use the local vision server address.'})
            return False
        origin = self.headers.get('Origin')
        if origin and origin not in self.server.allowed_origins | {f'http://{authority}'}:
            self.send(403, {'error': 'This photo request did not originate from the configured frontend.'})
            return False
        return True

    def do_GET(self):
        if not self.allowed():
            return
        if urlsplit(self.path).path == '/api/vision/status':
            return self.send(200, {'dashboard': {'available': True}, 'exterior': self.server.detector.status()})
        self.send(404, {'error': 'Not found'})

    def do_POST(self):
        if not self.allowed():
            return
        route = urlsplit(self.path)
        if route.path not in ('/api/vision/dashboard', '/api/vision/exterior'):
            return self.send(404, {'error': 'Not found'})
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= MAX_BYTES:
                return self.send(413, {'error': 'Choose an image smaller than 12 MB.'})
            metadata = {key: values[0] for key, values in parse_qs(route.query).items()}
            if route.path.endswith('/dashboard'):
                result = analyze_image(self.rfile.read(length), metadata)
            else:
                angle = metadata.get('angle', 'front')
                if angle not in VIEWS:
                    raise ValueError('Choose front, rear, left or right.')
                status = self.server.detector.status()
                if not status['checkpoint_present']:
                    return self.send(503, {'error': 'Exterior checkpoint is not available. Dashboard analysis can still be used.', 'model': status})
                capture = self.server.detector.inspect(read_image(self.rfile.read(length)))
                result = {'capture': {'angle': angle, **capture}, 'condition': condition_report({angle: capture['findings']}, model_qualified=status['rating_enabled']), 'model': status}
            self.send(200, result)
        except (ValueError, TypeError) as error:
            self.send(400, {'error': str(error)})
        except Exception:
            logging.exception('Vision analysis failed')
            self.send(500, {'error': 'Vision analysis failed. Please try another clear photo.'})

    def log_message(self, _fmt, *_args):
        # Do not log images, metadata, query strings, or model paths.
        pass


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8780)
    parser.add_argument('--checkpoint', default='exterior_models/damage')
    args = parser.parse_args()
    with VisionServer(('127.0.0.1', args.port), args.checkpoint) as server:
        print(f'Vision API: http://127.0.0.1:{args.port}/api/vision/status', flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == '__main__':
    main()
