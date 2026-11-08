"""Fine-tune RT-DETRv2 on prepared COCO damage data. No API credentials needed."""
import argparse
import hashlib
from datetime import datetime, timezone
import json
from pathlib import Path
import random
import time
from PIL import Image

from .data import MODEL, MODEL_REVISION, local_path


class CocoImages:
    def __init__(self, root, split, limit=None, seed=26):
        self.root = Path(root) / split
        data = json.loads((self.root / 'annotations.json').read_text(encoding='utf-8'))
        self.images = data['images'].copy()
        random.Random(seed).shuffle(self.images)
        if limit:
            self.images = self.images[:limit]
        self.annotations = {}
        for annotation in data['annotations']:
            self.annotations.setdefault(annotation['image_id'], []).append(annotation)

    def __len__(self):
        return len(self.images)

    def __getitem__(self, index):
        record = self.images[index]
        with Image.open(local_path(self.root / record['file_name'])) as image:
            return image.convert('RGB'), dict(image_id=record['id'], annotations=self.annotations.get(record['id'], []))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data', type=Path, default=Path('exterior_data'))
    parser.add_argument('--out', type=Path, default=Path('exterior_models/damage'))
    parser.add_argument('--epochs', type=int, default=10)
    parser.add_argument('--batch-size', type=int, default=2)
    parser.add_argument('--size', type=int, default=416)
    parser.add_argument('--limit', type=int, help='Training subset for smoke testing; never called a high-accuracy model')
    parser.add_argument('--max-steps', type=int)
    parser.add_argument('--device', default='auto', choices=['auto', 'cpu', 'cuda'])
    parser.add_argument('--threads', type=int, default=6)
    parser.add_argument('--lr', type=float, default=0.0001)
    parser.add_argument('--unfreeze-backbone', action='store_true')
    parser.add_argument('--init-checkpoint', type=Path, help='Warm-start weights from a local damage checkpoint; optimizer state starts fresh')
    args = parser.parse_args()
    if args.epochs < 1 or args.batch_size < 1 or args.size < 128 or args.size % 32:
        parser.error('Use positive epochs/batch size, and image size >=128 divisible by 32 (e.g. 416)')
    if args.out.exists() and any(args.out.iterdir()):
        parser.error('Output directory is not empty. Use a new --out to preserve existing checkpoints.')
    import torch
    from torch.utils.data import DataLoader
    from transformers import RTDetrImageProcessor, RTDetrV2ForObjectDetection

    torch.set_num_threads(args.threads); torch.manual_seed(26); random.seed(26)
    device = ('cuda' if torch.cuda.is_available() else 'cpu') if args.device == 'auto' else args.device
    cache = '.cache-exterior/huggingface'
    source = str(args.init_checkpoint) if args.init_checkpoint else MODEL
    source_options = {'local_files_only': True} if args.init_checkpoint else {'revision': MODEL_REVISION, 'cache_dir': cache}
    processor = RTDetrImageProcessor.from_pretrained(source, **source_options,
                                                    size={'height': args.size, 'width': args.size})
    model = RTDetrV2ForObjectDetection.from_pretrained(
        source, **source_options, num_labels=2,
        id2label={0: 'dent', 1: 'scratch'}, label2id={'dent': 0, 'scratch': 1},
        ignore_mismatched_sizes=True, anchor_image_size=[args.size, args.size],
    ).to(device)
    if not args.unfreeze_backbone:
        for name, parameter in model.named_parameters():
            if 'backbone' in name:
                parameter.requires_grad = False
    dataset = CocoImages(args.data, 'train', args.limit)
    if not len(dataset):
        parser.error('No training images. Run python -m exterior_vision.data first.')

    def collate(batch):
        images, annotations = zip(*batch)
        return processor(images=list(images), annotations=list(annotations), return_tensors='pt')

    loader = DataLoader(dataset, batch_size=args.batch_size, shuffle=True, collate_fn=collate, num_workers=0)
    optimizer = torch.optim.AdamW([parameter for parameter in model.parameters() if parameter.requires_grad], lr=args.lr)
    steps, losses, started = 0, [], time.monotonic()
    model.train()
    for epoch in range(args.epochs):
        if not args.unfreeze_backbone:
            model.model.backbone.eval()  # keep frozen BN running statistics stable
        for batch in loader:
            inputs = {key: value.to(device) for key, value in batch.items() if key != 'labels'}
            labels = [{key: value.to(device) for key, value in target.items()} for target in batch['labels']]
            optimizer.zero_grad(set_to_none=True)
            loss = model(**inputs, labels=labels).loss
            if not torch.isfinite(loss):
                raise RuntimeError('Non-finite training loss; checkpoint not saved')
            loss.backward(); torch.nn.utils.clip_grad_norm_(model.parameters(), 1); optimizer.step()
            steps += 1; losses.append(float(loss.detach()))
            if steps == 1 or steps % 10 == 0:
                print(f'epoch={epoch+1} step={steps} loss={losses[-1]:.4f} elapsed={time.monotonic()-started:.1f}s', flush=True)
            if args.max_steps and steps >= args.max_steps:
                break
        if args.max_steps and steps >= args.max_steps:
            break
    args.out.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(args.out, safe_serialization=True); processor.save_pretrained(args.out)
    manifest = dict(base_model=MODEL, base_revision=MODEL_REVISION, init_checkpoint=str(args.init_checkpoint) if args.init_checkpoint else None,
                    dataset_manifest_sha256=hashlib.sha256((args.data/'manifest.json').read_bytes()).hexdigest() if (args.data/'manifest.json').exists() else None,
                    classes=['dent', 'scratch'],
                    train_images=len(dataset), optimizer_steps=steps, epochs_requested=args.epochs,
                    limited_run=bool(args.limit or args.max_steps), device=device, image_size=args.size,
                    training_seconds=round(time.monotonic()-started, 1), initial_loss=losses[0], final_loss=losses[-1],
                    created_at=datetime.now(timezone.utc).isoformat(), evaluation_status='not_evaluated',
                    backbone_frozen=not args.unfreeze_backbone,
                    warning='Experimental checkpoint. Requires held-out evaluation and verified clean negatives before real-world use.')
    (args.out / 'training.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    print(json.dumps(manifest, indent=2), flush=True)


if __name__ == '__main__':
    main()
