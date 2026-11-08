"""Download and prepare public COCO damage data without remote code execution."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import urllib.request
import zipfile
from PIL import Image

DATASET = 'JijoJS/car-damage-new1'
DATA_REVISION = '822ba322a726972cbe5be501bf15fb603d793eb3'
MODEL = 'PekingU/rtdetr_v2_r18vd'
MODEL_REVISION = '5650961749fa93567c0d46fc7f43ea4f9e914107'
CATEGORIES = [{'id': 0, 'name': 'dent'}, {'id': 1, 'name': 'scratch'}]


def local_path(path):
    """Preserve long dataset filenames on Windows without changing their COCO IDs."""
    path = Path(path).resolve()
    if os.name == 'nt' and not str(path).startswith('\\\\?\\'):
        return Path('//?/' + path.as_posix())
    return path


def safe_extract(archive, target):
    target = Path(target).resolve()
    with zipfile.ZipFile(archive) as source:
        if sum(item.file_size for item in source.infolist()) > 1000000000:
            raise ValueError('Archive is too large')
        for item in source.infolist():
            path = (target / item.filename).resolve()
            if not path.is_relative_to(target) or ':' in item.filename or '\\' in item.filename:
                raise ValueError('Unsafe archive path')
        source.extractall(local_path(target))


def normalize_coco(data):
    mapping = {category['id']: category['name'].lower() for category in data['categories']}
    images = {image['id']: image for image in data['images']}
    annotations = []
    for annotation in data['annotations']:
        image = images.get(annotation['image_id'])
        name = mapping.get(annotation['category_id'])
        if image is None or name not in ('dent', 'scratch'):
            continue
        x, y, w, h = annotation['bbox']
        x1, y1 = max(0, x), max(0, y)
        x2, y2 = min(image['width'], x + w), min(image['height'], y + h)
        if x2 <= x1 or y2 <= y1:
            continue
        bbox = [x1, y1, x2 - x1, y2 - y1]
        annotations.append(dict(id=len(annotations) + 1, image_id=image['id'],
                                category_id=('dent', 'scratch').index(name), bbox=bbox,
                                area=bbox[2] * bbox[3], iscrowd=0))
    annotated = {annotation['image_id'] for annotation in annotations}
    # Missing damage annotations must never be silently labeled "healthy".
    kept = [image for image in images.values() if image['id'] in annotated or image.get('verified_clean') is True]
    for image in kept:
        path = Path(image['file_name'])
        if path.is_absolute() or '..' in path.parts or ':' in image['file_name'] or '\\' in image['file_name']:
            raise ValueError('Unsafe image path')
    return dict(info=data.get('info', {}), images=kept, annotations=annotations, categories=CATEGORIES)


def image_signature(path):
    with Image.open(local_path(path)) as image:
        rgb = image.convert('RGB')
        digest = hashlib.sha256(rgb.tobytes()).hexdigest()
        small = rgb.convert('L').resize((9, 8))
        pixels = list(small.tobytes())
        dhash = sum((pixels[y * 9 + x] > pixels[y * 9 + x + 1]) << (y * 8 + x)
                    for y in range(8) for x in range(8))
        return digest, dhash


def remove_leakage(root):
    root = Path(root)
    hashes, perceptual, stats = set(), [], {}
    # Test takes priority, then validation; exclude duplicates from training.
    for split in ('test', 'validation', 'train'):
        path = root / split / 'annotations.json'
        data = json.loads(path.read_text(encoding='utf-8'))
        keep = []
        for image in data['images']:
            digest, dhash = image_signature(root / split / image['file_name'])
            if digest in hashes or any((dhash ^ previous).bit_count() <= 3 for previous in perceptual):
                continue
            hashes.add(digest); perceptual.append(dhash); keep.append(image)
        stats[split] = dict(original=len(data['images']), kept=len(keep), removed=len(data['images']) - len(keep))
        ids = {image['id'] for image in keep}
        data['images'] = keep
        data['annotations'] = [annotation for annotation in data['annotations'] if annotation['image_id'] in ids]
        path.write_text(json.dumps(data), encoding='utf-8')
    return stats


def prepare(root):
    root = Path(root)
    raw = root / 'raw'; raw.mkdir(parents=True, exist_ok=True)
    checksums = {}
    for remote, split in [('test', 'test'), ('valid', 'validation'), ('train', 'train')]:
        archive = raw / f'{remote}.zip'
        if not archive.exists():
            url = f'https://huggingface.co/datasets/{DATASET}/resolve/{DATA_REVISION}/data/{remote}.zip'
            print(f'Downloading {split}...', flush=True)
            temporary = archive.with_suffix('.partial')
            urllib.request.urlretrieve(url, temporary)
            temporary.replace(archive)
        checksums[remote] = hashlib.sha256(archive.read_bytes()).hexdigest()
        target = root / split; target.mkdir(exist_ok=True)
        safe_extract(archive, target)
        data = normalize_coco(json.loads((target / '_annotations.coco.json').read_text(encoding='utf-8')))
        (target / 'annotations.json').write_text(json.dumps(data), encoding='utf-8')
    stats = remove_leakage(root)
    manifest = dict(dataset=DATASET, revision=DATA_REVISION, license='CC BY 4.0',
                    attribution='JIJO, car-damage-new, Roboflow Universe, 2024',
                    source='https://huggingface.co/datasets/' + DATASET,
                    archive_sha256=checksums, split_hygiene=stats,
                    clean_negatives='Only explicitly human-verified empty annotations are allowed. Public base split excludes unlabeled images.',
                    limitations='No car identity metadata available; perceptual dedup reduces but cannot rule out same-vehicle leakage.')
    (root / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    print(json.dumps(manifest, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, default=Path('exterior_data'))
    prepare(parser.parse_args().out)
