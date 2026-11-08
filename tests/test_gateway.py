import json
from pathlib import Path
import threading
import unittest
import urllib.error
import urllib.request


class GatewayTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from vision_api.server import VisionServer
        cls.server = VisionServer(('127.0.0.1', 0), checkpoint='nonexistent-test-checkpoint')
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f'http://127.0.0.1:{cls.server.server_port}'

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown(); cls.server.server_close(); cls.thread.join()

    def test_dashboard_photo_uses_the_real_detector_and_manual_mileage(self):
        photo = (Path(__file__).resolve().parents[1] / 'dataset/synthetic/images/camry_0021.jpg').read_bytes()
        request = urllib.request.Request(self.base + '/api/vision/dashboard?miles=98691&year=2021&unit=mi', data=photo, headers={'Content-Type': 'image/jpeg'})
        with urllib.request.urlopen(request) as response:
            report = json.load(response)
        self.assertEqual(set(report['reliability']['faults']), {'check_engine', 'vsc_trac'})
        self.assertEqual(report['reliability']['odometer_miles'], 98691)
        self.assertNotIn('image', report)

    def test_missing_exterior_checkpoint_never_fabricates_a_rating(self):
        request = urllib.request.Request(self.base + '/api/vision/exterior?angle=front', data=b'photo')
        with self.assertRaises(urllib.error.HTTPError) as raised:
            urllib.request.urlopen(request)
        self.assertEqual(raised.exception.code, 503)
        self.assertIn('checkpoint', json.load(raised.exception)['error'])

    def test_unknown_origin_is_rejected(self):
        request = urllib.request.Request(self.base + '/api/vision/dashboard', data=b'photo', headers={'Origin': 'https://untrusted.example'})
        with self.assertRaises(urllib.error.HTTPError) as raised:
            urllib.request.urlopen(request)
        self.assertEqual(raised.exception.code, 403)

    def test_trusted_frontend_proxy_and_health_contract(self):
        request = urllib.request.Request(self.base + '/api/vision/status', headers={'Origin': 'http://127.0.0.1:5173'})
        with urllib.request.urlopen(request) as response:
            result = json.load(response)
        self.assertTrue(result['dashboard']['available'])
        self.assertFalse(result['exterior']['checkpoint_present'])

    def test_bad_photo_and_bad_metadata_return_user_errors(self):
        for suffix in ('?miles=-1', '?year=not-a-year', ''):
            request = urllib.request.Request(self.base + '/api/vision/dashboard' + suffix, data=b'bad photo')
            with self.subTest(suffix=suffix), self.assertRaises(urllib.error.HTTPError) as raised:
                urllib.request.urlopen(request)
            self.assertEqual(raised.exception.code, 400)
