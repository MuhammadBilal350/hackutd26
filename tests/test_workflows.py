"""Offline smoke tests: python -m unittest discover -s tests -v."""

import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class WorkflowTests(unittest.TestCase):
    def run_cli(self, *args, cwd=ROOT):
        result = subprocess.run(
            [sys.executable, *map(str, args)], cwd=cwd,
            capture_output=True, text=True, timeout=180,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout

    def test_entry_points_support_scripts_and_modules(self):
        for name in ("analyze", "camera", "evaluate", "generate_dataset"):
            for entry in ((f"dash_vision/{name}.py",), ("-m", f"dash_vision.{name}")):
                with self.subTest(entry=entry):
                    self.assertIn("usage:", self.run_cli(*entry, "--help"))

    def test_detector_can_be_reused_as_a_package(self):
        from dash_vision.cv_detector import detect_array
        import numpy as np

        reading, annotated = detect_array(np.zeros((520, 1200, 3), dtype=np.uint8))
        self.assertEqual(reading["lights"], [])
        self.assertEqual(annotated.shape, (520, 1200, 3))

    def test_default_evaluation_dataset_is_independent_of_working_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            output = self.run_cli(
                ROOT / "dash_vision/evaluate.py", "--dry-run", "--limit", "1", cwd=directory,
            )
        self.assertIn("camry_0000", output)

    def test_documented_photo_analysis_saves_annotations(self):
        with tempfile.TemporaryDirectory() as directory:
            debug = Path(directory) / "boxed.jpg"
            output = self.run_cli(
                "-m", "dash_vision.analyze", "dataset/synthetic/images/camry_0021.jpg",
                "--miles", "98691", "--year", "2021", "--debug", debug,
            )
            self.assertGreater(debug.stat().st_size, 0)
        result = json.loads(output)
        self.assertEqual(result["reliability"]["odometer_miles"], 98691)
        self.assertEqual(set(result["reliability"]["faults"]), {"check_engine", "vsc_trac"})


if __name__ == "__main__":
    unittest.main()
