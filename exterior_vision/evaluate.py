"""Evaluate a checkpoint on held-out COCO damage images with standard mAP."""
import argparse
from contextlib import redirect_stdout
import io
import json
from pathlib import Path
import time
from .train import CocoImages


def evaluate(checkpoint, data='exterior_data', split='test', limit=None, device='cpu'):
    import torch
    from pycocotools.coco import COCO
    from pycocotools.cocoeval import COCOeval
    from transformers import RTDetrImageProcessor, RTDetrV2ForObjectDetection
    torch.set_num_threads(6)
    checkpoint = Path(checkpoint)
    processor = RTDetrImageProcessor.from_pretrained(checkpoint, local_files_only=True)
    model = RTDetrV2ForObjectDetection.from_pretrained(checkpoint, local_files_only=True).to(device).eval()
    dataset = CocoImages(data, split, limit)
    if not len(dataset):
        raise ValueError('No evaluation images')
    predictions, latencies = [], []
    clean_count = clean_false_alarms = 0
    # Warm-up is excluded from timing. Scores are not filtered at the display threshold.
    image, _ = dataset[0]
    with torch.inference_mode():
        model(**processor(images=image, return_tensors='pt').to(device))
    for i in range(len(dataset)):
        image, annotations = dataset[i]
        started = time.monotonic()
        with torch.inference_mode():
            output = model(**processor(images=image, return_tensors='pt').to(device))
        result = processor.post_process_object_detection(output, target_sizes=torch.tensor([[image.height, image.width]]), threshold=.01)[0]
        if not annotations['annotations'] and dataset.images[i].get('verified_clean') is True:
            clean_count += 1
            clean_false_alarms += bool((result['scores'] >= .5).any())
        latencies.append(time.monotonic() - started)
        for box, label, confidence in zip(result['boxes'].tolist(), result['labels'].tolist(), result['scores'].tolist()):
            x1, y1, x2, y2 = box
            predictions.append(dict(image_id=annotations['image_id'], category_id=label,
                                    bbox=[x1, y1, max(0, x2-x1), max(0, y2-y1)], score=confidence))
        if (i+1) % 20 == 0:
            print(f'Evaluated {i+1}/{len(dataset)} images', flush=True)
    with redirect_stdout(io.StringIO()):
        ground = COCO(str(Path(data) / split / 'annotations.json'))
        ground.dataset.setdefault('info', {})
        if predictions:
            detected = ground.loadRes(predictions)
            evaluator = COCOeval(ground, detected, 'bbox')
            evaluator.params.imgIds = [image['id'] for image in dataset.images]
            evaluator.evaluate(); evaluator.accumulate(); evaluator.summarize()
            metrics = dict(map_50_95=round(float(evaluator.stats[0]), 4), map_50=round(float(evaluator.stats[1]), 4),
                           recall_100=round(float(evaluator.stats[8]), 4))
        else:
            metrics = dict(map_50_95=0.0, map_50=0.0, recall_100=0.0)
    report = dict(split=split, evaluated_images=len(dataset), limited_evaluation=limit is not None,
                  **metrics, mean_inference_ms=round(sum(latencies)/len(latencies)*1000, 1), device=device,
                  clean_sample_count=clean_count,
                  clean_false_positive_rate=round(clean_false_alarms/clean_count, 4) if clean_count else None,
                  limitations='No verified clean-car test set or vehicle-identity grouping. mAP on this source does not establish real-world accuracy, durability, or resale-price accuracy.')
    (checkpoint / f'evaluation-{split}.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    training_path = checkpoint / 'training.json'
    if training_path.exists():
        training = json.loads(training_path.read_text(encoding='utf-8'))
        training['evaluation_status'] = ('limited_' if limit else '') + 'evaluated_on_' + split
        training_path.write_text(json.dumps(training, indent=2), encoding='utf-8')
    print(json.dumps(report, indent=2), flush=True)
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--checkpoint', type=Path, default=Path('exterior_models/damage'))
    parser.add_argument('--data', type=Path, default=Path('exterior_data'))
    parser.add_argument('--split', choices=['validation', 'test'], default='test')
    parser.add_argument('--limit', type=int)
    parser.add_argument('--device', choices=['cpu', 'cuda'], default='cpu')
    args = parser.parse_args()
    evaluate(args.checkpoint, args.data, args.split, args.limit, args.device)
