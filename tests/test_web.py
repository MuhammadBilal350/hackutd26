import unittest
import cv2
import numpy as np


class AnalysisTests(unittest.TestCase):
    def test_image_returns_stats_without_source_image(self):
        from dash_vision.web import analyze_image
        _, image = cv2.imencode('.jpg', np.zeros((520, 1200, 3), dtype=np.uint8))
        result = analyze_image(image.tobytes(), {'miles': '10000', 'year': '2021'})
        self.assertEqual(result['reliability']['odometer_miles'], 10000)
        self.assertEqual(result['reading']['lights'], [])
        self.assertEqual(set(result), {'reading', 'reliability', 'limitations'})

    def test_invalid_image_is_rejected(self):
        from dash_vision.web import analyze_image
        with self.assertRaisesRegex(ValueError, 'image'):
            analyze_image(b'not a picture', {})

    def test_invalid_metadata_is_rejected(self):
        from dash_vision.web import analyze_image
        _, image = cv2.imencode('.jpg', np.zeros((100, 100, 3), dtype=np.uint8))
        for metadata in ({'miles': '-1'}, {'year': 'bad'}, {'unit': 'meters'}, {'hybrid': 'oops'}):
            with self.subTest(metadata=metadata), self.assertRaises(ValueError):
                analyze_image(image.tobytes(), metadata)
