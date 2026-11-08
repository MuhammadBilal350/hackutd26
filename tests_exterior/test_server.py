import http.cookiejar
import json
import threading
import unittest
import urllib.error
import urllib.request


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from exterior_vision.web import InspectionServer
        cls.server = InspectionServer(('127.0.0.1', 0), 'exterior_models/nonexistent-test-checkpoint')
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f'http://127.0.0.1:{cls.server.server_port}'

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown(); cls.server.server_close(); cls.thread.join()

    def opener(self):
        jar = http.cookiejar.CookieJar()
        client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
        client.cookie_jar = jar
        return client

    def test_untrained_model_is_explicit_in_status(self):
        with self.opener().open(self.base + '/api/status') as response:
            result = json.load(response)
        self.assertFalse(result['model']['checkpoint_present'])
        self.assertIsNone(result['condition']['visible_condition_score'])

    def test_invalid_uploaded_photo_returns_a_user_error(self):
        request = urllib.request.Request(self.base + '/api/inspect?angle=front', data=b'not an image')
        with self.assertRaises(urllib.error.HTTPError) as raised:
            self.opener().open(request)
        self.assertEqual(raised.exception.code, 400)

    def test_client_cannot_fabricate_inspection_evidence(self):
        payload = dict(vehicle=dict(make='Toyota', model='Camry', trim='LE', year=2021, mileage=60000, zip='75080'),
                       views={view: [] for view in ['front', 'rear', 'left', 'right']})
        request = urllib.request.Request(self.base + '/api/value', data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json'})
        with self.opener().open(request) as response:
            result = json.load(response)
        self.assertFalse(result['condition']['coverage']['complete'])
        self.assertEqual(result['valuation']['status'], 'unavailable')

    def test_external_website_cannot_submit_photos(self):
        request = urllib.request.Request(self.base + '/api/inspect?angle=front', data=b'anything', headers={'Origin': 'https://example.com'})
        with self.assertRaises(urllib.error.HTTPError) as raised:
            self.opener().open(request)
        self.assertEqual(raised.exception.code, 403)

    def test_sessions_do_not_share_vehicle_findings(self):
        first, second = self.opener(), self.opener()
        for client in (first, second):
            client.open(self.base + '/api/status').close()
        first_id = next(iter(first.cookie_jar)).value
        with self.server.session_lock:
            first_state = self.server.sessions[first_id]
            first_state['views']['front'] = [dict(label='dent', confidence=.9, area_fraction=.1)]
        with first.open(self.base + '/api/status') as response:
            self.assertEqual(json.load(response)['condition']['coverage']['captured'], ['front'])
        with second.open(self.base + '/api/status') as response:
            result = json.load(response)
        self.assertIsNone(result['condition']['visible_condition_score'])
