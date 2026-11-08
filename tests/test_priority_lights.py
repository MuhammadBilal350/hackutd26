from pathlib import Path
import unittest
import cv2
import numpy as np
from dash_vision.cv_detector import detect_array
from dash_vision.web import analyze_image

REFERENCE=Path(__file__).resolve().parents[1]/'dash_vision/icon_refs/priority_symbols.png'
EXPECTED={'oil_pressure','brake_system','parking_brake','check_engine','charging_system'}

class PriorityLightTests(unittest.TestCase):
    def test_supplied_illuminated_symbols_are_identified_without_spurious_labels(self):
        image=cv2.imread(str(REFERENCE))
        reading,_=detect_array(image)
        self.assertEqual({light['id'] for light in reading['lights']},EXPECTED)

    def test_unlit_gray_symbols_are_not_counted_as_warning_lights(self):
        image=cv2.imread(str(REFERENCE))
        gray=cv2.cvtColor(image,cv2.COLOR_BGR2GRAY)
        unlit=cv2.cvtColor((gray*.12).astype(np.uint8),cv2.COLOR_GRAY2BGR)
        reading,_=detect_array(unlit)
        self.assertEqual(reading['lights'],[])

    def test_oil_only_photo_does_not_invent_other_symbols(self):
        image=cv2.imread(str(REFERENCE))[35:135,15:225]
        canvas=np.zeros((400,700,3),np.uint8)
        canvas[130:230,220:430]=image
        reading,_=detect_array(canvas)
        self.assertEqual({light['id'] for light in reading['lights']},{'oil_pressure'})

    def test_smaller_repositioned_engine_symbol_is_still_detected(self):
        image=cv2.imread(str(REFERENCE))[158:254,30:198]
        image=cv2.resize(image,(70,40))
        canvas=np.zeros((520,1200,3),np.uint8);canvas[300:340,770:840]=image
        reading,_=detect_array(canvas)
        self.assertEqual({light['id'] for light in reading['lights']},{'check_engine'})

    def test_score_changes_for_lit_versus_unlit_with_same_vehicle_metadata(self):
        image=cv2.imread(str(REFERENCE));_,lit=cv2.imencode('.png',image)
        _,unlit=cv2.imencode('.png',np.zeros_like(image))
        metadata={'miles':'84210','year':'2019'}
        on=analyze_image(lit.tobytes(),metadata);off=analyze_image(unlit.tobytes(),metadata)
        self.assertLess(on['reliability']['score'],off['reliability']['score'])
        self.assertEqual(set(on['reliability']['faults']),EXPECTED-{'parking_brake'})

    def test_parking_brake_symbol_is_a_status_not_an_extra_damage_penalty(self):
        from dash_vision.reliability import score_dash
        self.assertEqual(score_dash(['parking_brake'],84210,'mi',2019)['score'],score_dash([],84210,'mi',2019)['score'])
