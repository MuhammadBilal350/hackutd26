"""Local exterior inspection UI: python -m exterior_vision.web"""
import argparse
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import ipaddress
import logging
import os
import ssl
from pathlib import Path
import threading
import time
from urllib.parse import parse_qs, urlsplit
import uuid

from .detector import DamageDetector, MAX_IMAGE_BYTES, read_image
from .market import estimate_value, parse_listings, provider_value, validate_vehicle
from .report import VIEWS, condition_report

ASSETS = Path(__file__).with_name('web')


class InspectionServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, address, checkpoint='exterior_models/damage'):
        super().__init__(address, Handler)
        self.detector = DamageDetector(checkpoint)
        self.sessions = {}
        self.session_lock = threading.Lock()
        self.scheme = 'http'
        self.ca_cert = None


def enable_tls(server, cert, key):
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    context.load_cert_chain(str(cert), str(key))
    server.socket = context.wrap_socket(server.socket, server_side=True)
    server.scheme = 'https'


class Handler(BaseHTTPRequestHandler):
    def session(self):
        cookie = SimpleCookie()
        try:
            cookie.load(self.headers.get('Cookie', ''))
            candidate = cookie.get('inspection_tls' if self.server.scheme == 'https' else 'inspection')
            candidate = candidate.value if candidate else None
        except Exception:
            candidate = None
        now = time.monotonic()
        with self.server.session_lock:
            self.server.sessions = {key: value for key, value in self.server.sessions.items() if now-value['updated'] < 3600}
            if candidate not in self.server.sessions:
                if len(self.server.sessions) >= 64:
                    oldest = min(self.server.sessions, key=lambda key: self.server.sessions[key]['updated'])
                    del self.server.sessions[oldest]
                candidate = uuid.uuid4().hex
                self.server.sessions[candidate] = {'views': {}, 'updated': now}
            self.sid = candidate
            self.server.sessions[candidate]['updated'] = now
            return self.server.sessions[candidate]

    def send(self, status, value, mime='application/json'):
        if isinstance(value, dict):
            value = json.dumps(value).encode()
        self.send_response(status)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(value)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        if hasattr(self, 'sid'):
            name = 'inspection_tls' if self.server.scheme == 'https' else 'inspection'
            secure = '; Secure' if self.server.scheme == 'https' else ''
            self.send_header('Set-Cookie', f'{name}={self.sid}; HttpOnly; SameSite=Strict; Path=/{secure}')
        self.end_headers(); self.wfile.write(value)

    def allowed(self):
        expected = f'{self.server.server_address[0]}:{self.server.server_port}'
        if self.headers.get('Host') != expected:
            self.send(403, {'error': 'Use ' + self.server.scheme + '://' + expected})
            return False
        origin = self.headers.get('Origin')
        if origin and origin != self.server.scheme + '://' + expected:
            self.send(403, {'error': 'Requests must originate in this local app'})
            return False
        return True

    def do_GET(self):
        if not self.allowed():
            return
        path = urlsplit(self.path).path
        if path == '/local-ca.cer' and self.server.ca_cert:
            return self.send(200, self.server.ca_cert.read_bytes(), 'application/x-x509-ca-cert')
        if path == '/api/status':
            state = self.session()
            with self.server.session_lock:
                report = condition_report(state['views'], model_qualified=self.server.detector.status()['rating_enabled'])
            return self.send(200, {'model': self.server.detector.status(), 'condition': report,
                                   'market_provider_configured': bool(os.environ.get('MARKETCHECK_API_KEY'))})
        files = {'/': ('index.html', 'text/html; charset=utf-8'), '/style.css': ('style.css', 'text/css'), '/app.js': ('app.js', 'text/javascript')}
        if path not in files:
            return self.send(404, {'error': 'Not found'})
        name, mime = files[path]
        self.send(200, (ASSETS/name).read_bytes(), mime)

    def do_POST(self):
        if not self.allowed():
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= MAX_IMAGE_BYTES:
                return self.send(413, {'error': 'Request must be smaller than 12 MB'})
            route = urlsplit(self.path)
            body = self.rfile.read(length)
            state = self.session()
            if route.path == '/api/inspect':
                angle = parse_qs(route.query).get('angle', [''])[0]
                if angle not in VIEWS:
                    raise ValueError('Choose front, rear, left or right')
                result = self.server.detector.inspect(read_image(body))
                with self.server.session_lock:
                    state['views'][angle] = result['findings']
                    report = condition_report(state['views'], model_qualified=self.server.detector.status()['rating_enabled'])
                return self.send(200, {'condition': report, 'capture': {'angle': angle, **result},
                                       'model': self.server.detector.status()})
            if route.path == '/api/reset':
                with self.server.session_lock:
                    state['views'].clear()
                return self.send(200, {'condition': condition_report({}, model_qualified=self.server.detector.status()['rating_enabled'])})
            if route.path == '/api/value':
                payload = json.loads(body)
                if not isinstance(payload, dict):
                    raise ValueError('Request must be a JSON object')
                vehicle = validate_vehicle(payload.get('vehicle', {}))
                with self.server.session_lock:
                    condition = condition_report(state['views'], model_qualified=self.server.detector.status()['rating_enabled'])
                rows = parse_listings(payload['listings_csv']) if payload.get('listings_csv') else []
                value = estimate_value(rows, vehicle, condition)
                if payload.get('use_market_provider') is True:
                    if not os.environ.get('MARKETCHECK_API_KEY') or not vehicle['vin']:
                        raise ValueError('Live market lookup requires MARKETCHECK_API_KEY on the server and a VIN')
                    try:
                        value = provider_value(vehicle, condition)
                    except Exception:
                        return self.send(502, {'error': 'Market provider unavailable. Check your key/quota or use comparable CSV data.'})
                return self.send(200, {'condition': condition, 'valuation': value})
            return self.send(404, {'error': 'Not found'})
        except (ValueError, TypeError, KeyError, json.JSONDecodeError) as error:
            return self.send(400, {'error': str(error)})
        except Exception:
            logging.exception('Exterior inspection failed')
            return self.send(500, {'error': 'Inspection failed. Check the model installation or try another clear photo.'})

    def log_message(self, fmt, *args):
        # Avoid logging VINs, CSVs, image content, query strings, or API keys.
        logging.info('Local request completed')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8770)
    parser.add_argument('--host', default='127.0.0.1', help='Bind a specific local IPv4 address for same-Wi-Fi phone testing')
    parser.add_argument('--checkpoint', type=Path, default=Path('exterior_models/damage'))
    parser.add_argument('--cert', type=Path, help='TLS certificate PEM')
    parser.add_argument('--key', type=Path, help='TLS private-key PEM')
    parser.add_argument('--ca-cert', type=Path, help='Public DER CA certificate served at /local-ca.cer for phone installation')
    args = parser.parse_args()
    if bool(args.cert) != bool(args.key):
        parser.error('Use --cert and --key together')
    try:
        address = ipaddress.IPv4Address(args.host)
        if not (address.is_private or address.is_loopback) or address.is_unspecified:
            raise ValueError()
    except ValueError:
        parser.error('--host must be a specific private or loopback IPv4 address')
    with InspectionServer((args.host, args.port), args.checkpoint) as server:
        if args.cert:
            enable_tls(server, args.cert, args.key)
        if args.ca_cert:
            server.ca_cert = args.ca_cert
        print(f'Open {server.scheme}://{args.host}:{args.port} - Ctrl+C to stop.', flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == '__main__':
    main()
