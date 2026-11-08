from pathlib import Path
import ssl
import tempfile
import threading
import unittest
import urllib.request


class HttpsTests(unittest.TestCase):
    def test_https_works_with_certificate_validation_and_same_origin_post(self):
        from exterior_vision.local_https import create_certificates
        from exterior_vision.web import InspectionServer, enable_tls
        with tempfile.TemporaryDirectory() as directory:
            files = create_certificates('127.0.0.1', Path(directory))
            with InspectionServer(('127.0.0.1', 0), 'nonexistent-checkpoint') as server:
                enable_tls(server, files['cert'], files['key'])
                thread = threading.Thread(target=server.serve_forever, daemon=True)
                thread.start()
                try:
                    origin = f'https://127.0.0.1:{server.server_port}'
                    context = ssl.create_default_context(cafile=str(files['ca_pem']))
                    with urllib.request.urlopen(origin + '/api/status', context=context) as response:
                        self.assertEqual(response.status, 200)
                        self.assertIn('Secure', response.headers['Set-Cookie'])
                    request = urllib.request.Request(origin + '/api/reset', data=b'{}', headers={'Origin': origin})
                    with urllib.request.urlopen(request, context=context) as response:
                        self.assertEqual(response.status, 200)
                finally:
                    server.shutdown(); thread.join()

    def test_ca_signing_key_is_not_saved(self):
        from exterior_vision.local_https import create_certificates
        with tempfile.TemporaryDirectory() as directory:
            create_certificates('127.0.0.1', Path(directory))
            self.assertEqual([file.name for file in Path(directory).glob('*.key')], ['server.key'])
