"""Local inference. Base vehicle gate plus fine-tuned dent/scratch detector."""
from io import BytesIO
import json
from pathlib import Path
import threading
import time
import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError
from .data import MODEL, MODEL_REVISION

MAX_IMAGE_BYTES = 12 * 1024 * 1024


def read_image(data):
    if not data or len(data) > MAX_IMAGE_BYTES:
        raise ValueError('Choose a JPEG, PNG or WebP smaller than 12 MB')
    try:
        with Image.open(BytesIO(data)) as source:
            if source.width * source.height > 24000000 or min(source.size) < 128:
                raise ValueError('Image must be at least 128 pixels on each side and at most 24 megapixels')
            if source.format not in ('JPEG', 'PNG', 'WEBP'):
                raise ValueError('Use a JPEG, PNG or WebP photo')
            return ImageOps.exif_transpose(source).convert('RGB')
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise ValueError('Could not decode this image') from None


class DamageDetector:
    def __init__(self, checkpoint='exterior_models/damage', device='cpu'):
        self.checkpoint = Path(checkpoint)
        self.device = device
        self.lock = threading.Lock()
        self.model = None
        self.gate = None

    def status(self):
        path = self.checkpoint / 'training.json'
        training = json.loads(path.read_text(encoding='utf-8')) if path.exists() else None
        path = self.checkpoint / 'evaluation-test.json'
        evaluation = json.loads(path.read_text(encoding='utf-8')) if path.exists() else None
        rating_enabled = bool(evaluation and not evaluation.get('limited_evaluation', True)
                              and evaluation.get('evaluated_images', 0) >= 100
                              and evaluation.get('map_50', 0) >= .5
                              and evaluation.get('clean_sample_count', 0) >= 30
                              and evaluation.get('clean_false_positive_rate') is not None
                              and evaluation['clean_false_positive_rate'] <= .1)
        return {'checkpoint_present': bool(training and (self.checkpoint/'model.safetensors').exists()),
                'loaded': self.model is not None, 'training': training, 'evaluation': evaluation,
                'experimental': True, 'classes': ['dent', 'scratch'], 'rating_enabled': rating_enabled,
                'quality_gate': 'Project safeguard, not certification: full test >=100 images, mAP50 >=0.50, >=30 verified clean samples and clean false-positive rate <=0.10. Diagnostics remain available when ratings are withheld.'}

    def load(self):
        import torch
        from transformers import RTDetrImageProcessor, RTDetrV2ForObjectDetection
        if self.model is not None:
            return
        if not self.status()['checkpoint_present']:
            raise ValueError('Damage model is not trained yet. Run exterior_vision.train, then evaluate the checkpoint.')
        torch.set_num_threads(6)
        self.processor = RTDetrImageProcessor.from_pretrained(self.checkpoint, local_files_only=True)
        model = RTDetrV2ForObjectDetection.from_pretrained(self.checkpoint, local_files_only=True)
        if set(model.config.id2label.values()) != {'dent', 'scratch'}:
            raise ValueError('Checkpoint must be trained on dent and scratch classes')
        # Gate uses original COCO car labels, not the retrained damage head.
        self.gate_processor = RTDetrImageProcessor.from_pretrained(MODEL, revision=MODEL_REVISION,
                                                                  cache_dir='.cache-exterior/huggingface', local_files_only=True)
        self.gate = RTDetrV2ForObjectDetection.from_pretrained(MODEL, revision=MODEL_REVISION,
                                                             cache_dir='.cache-exterior/huggingface', local_files_only=True).to(self.device).eval()
        self.model = model.to(self.device).eval()

    def inspect(self, image):
        import torch
        brightness = float(np.array(image.convert('L').resize((64, 64))).mean())
        if brightness < 25 or brightness > 242:
            raise ValueError('Photo is too dark or overexposed. Retake in even daylight.')
        with self.lock, torch.inference_mode():
            self.load()
            start = time.monotonic()
            gate_output = self.gate(**self.gate_processor(images=image, return_tensors='pt').to(self.device))
            gate_result = self.gate_processor.post_process_object_detection(
                gate_output, target_sizes=torch.tensor([[image.height, image.width]]), threshold=.5)[0]
            vehicles = [(box.tolist(), float(score)) for box, label, score in zip(gate_result['boxes'], gate_result['labels'], gate_result['scores'])
                        if self.gate.config.id2label[int(label)] in ('car', 'truck')]
            if not vehicles:
                raise ValueError('No confident car/pickup detected. Show the whole vehicle, then capture a closer damage view separately.')
            vehicles.sort(key=lambda item: (item[0][2]-item[0][0]) * (item[0][3]-item[0][1]), reverse=True)
            largest_area = (vehicles[0][0][2]-vehicles[0][0][0]) * (vehicles[0][0][3]-vehicles[0][0][1])
            if len(vehicles) > 1 and (vehicles[1][0][2]-vehicles[1][0][0]) * (vehicles[1][0][3]-vehicles[1][0][1]) > largest_area * .4:
                raise ValueError('Multiple vehicles detected. Frame just the vehicle being inspected.')
            car_box, car_confidence = vehicles[0]
            car_area = max(1, (car_box[2]-car_box[0]) * (car_box[3]-car_box[1]))
            output = self.model(**self.processor(images=image, return_tensors='pt').to(self.device))
            result = self.processor.post_process_object_detection(output, target_sizes=torch.tensor([[image.height, image.width]]), threshold=.5)[0]
            findings = []
            for box, label, score in zip(result['boxes'].tolist(), result['labels'].tolist(), result['scores'].tolist()):
                x1, y1, x2, y2 = box
                # Ignore predictions whose center falls outside the detected vehicle.
                if not car_box[0] <= (x1+x2)/2 <= car_box[2] or not car_box[1] <= (y1+y2)/2 <= car_box[3]:
                    continue
                area = max(0, min(x2, car_box[2])-max(x1, car_box[0])) * max(0, min(y2, car_box[3])-max(y1, car_box[1]))
                findings.append({'label': self.model.config.id2label[label], 'confidence': round(score, 4),
                                 'area_fraction': round(min(1, area/car_area), 4)})
            return {'findings': findings, 'vehicle_confidence': round(car_confidence, 4),
                    'inference_ms': round((time.monotonic()-start)*1000, 1), 'experimental': True}
