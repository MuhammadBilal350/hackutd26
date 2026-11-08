import json
from pathlib import Path
import tempfile
import unittest
import zipfile
from PIL import Image


class DataTests(unittest.TestCase):
    def test_training_images_can_be_read_from_long_windows_paths(self):
        from exterior_vision.data import local_path, image_signature
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory) / ('long-folder-' * 14)
            local_path(folder).mkdir()
            image = folder / ('vehicle-' * 10 + '.jpg')
            Image.new('RGB', (64, 64), (120, 90, 50)).save(local_path(image))
            digest, _ = image_signature(image)
            self.assertEqual(len(digest), 64)
            local_path(image).unlink()
            local_path(folder).rmdir()

    def test_zip_traversal_is_rejected(self):
        from exterior_vision.data import safe_extract
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / 'bad.zip'
            with zipfile.ZipFile(archive, 'w') as z:
                z.writestr('../escape.txt', 'bad')
            with self.assertRaises(ValueError):
                safe_extract(archive, Path(directory) / 'output')

    def test_annotation_normalization_clips_boxes_and_drops_unreviewed_empty_images(self):
        from exterior_vision.data import normalize_coco
        data = {'images': [{'id': 1, 'file_name': 'car.jpg', 'width': 100, 'height': 100},
                           {'id': 2, 'file_name': 'unlabeled.jpg', 'width': 100, 'height': 100}],
                'categories': [{'id': 7, 'name': 'dent'}, {'id': 8, 'name': 'scratch'}],
                'annotations': [{'id': 1, 'image_id': 1, 'category_id': 7, 'bbox': [-5, 10, 25, 20]}]}
        normalized = normalize_coco(data)
        self.assertEqual(len(normalized['images']), 1)
        self.assertEqual(normalized['annotations'][0]['bbox'], [0, 10, 20, 20])
        self.assertEqual(normalized['annotations'][0]['category_id'], 0)

    def test_identical_photos_do_not_leak_from_test_into_training(self):
        from exterior_vision.data import remove_leakage
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for split in ['train', 'validation', 'test']:
                (root / split).mkdir()
                Image.new('RGB', (64, 64), (120, 90, 50)).save(root / split / 'same.jpg')
                data = dict(images=[dict(id=1, file_name='same.jpg', width=64, height=64)], annotations=[], categories=[])
                (root / split / 'annotations.json').write_text(json.dumps(data))
            counts = remove_leakage(root)
            self.assertEqual(counts['train']['kept'], 0)
            self.assertEqual(counts['test']['kept'], 1)
