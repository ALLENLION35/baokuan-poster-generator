#!/usr/bin/env python3
"""Package only validated, manifest-owned slides using Python's standard library."""
import argparse
import json
import os
from pathlib import Path, PurePosixPath
import tempfile
from zipfile import ZipFile, ZIP_DEFLATED


def safe_file(root, name):
    if not isinstance(name, str) or not name or '\\' in name:
        raise ValueError('Invalid manifest path')
    relative = PurePosixPath(name)
    if relative.is_absolute() or any(p in ('', '.', '..') for p in name.split('/')):
        raise ValueError('Invalid manifest path')
    result = root
    for part in relative.parts:
        result = result / part
        if result.is_symlink():
            raise ValueError('Manifest paths must not traverse symlinks')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('export_dir')
    args = parser.parse_args()
    root = Path(args.export_dir).absolute()
    if root.is_symlink():
        raise ValueError('Export directory must not be a symlink')
    manifest_path = safe_file(root, 'validation.json')
    manifest = json.loads(manifest_path.read_text())
    files = manifest.get('files')
    if (manifest.get('generator') != 'long-poster' or manifest.get('schemaVersion') != 1
            or not isinstance(files, list) or len(set(files)) != len(files)):
        raise ValueError('Requires a long-poster file manifest')
    for name in files:
        if not safe_file(root, name).is_file():
            raise ValueError('Manifest-owned file is missing: ' + name)
    slides = [name for name in files if name.startswith('slides/') and name.endswith('.jpg')]
    if not slides or len(slides) != manifest.get('pageCount'):
        raise ValueError('Manifest has no complete slide set')
    zip_path = safe_file(root, 'slides.zip')
    if zip_path.exists() and 'slides.zip' not in files:
        raise ValueError('Refusing to replace an untracked slides.zip')
    with tempfile.TemporaryDirectory(prefix='.long-poster-pack-', dir=root) as tmp:
        tmp = Path(tmp)
        archive = tmp / 'slides.zip'
        with ZipFile(archive, 'w', ZIP_DEFLATED) as z:
            for name in slides:
                z.write(safe_file(root, name), PurePosixPath(name).name)
        with ZipFile(archive) as z:
            if z.testzip() is not None or len(z.namelist()) != len(slides):
                raise ValueError('ZIP validation failed')
        updated = dict(manifest)
        updated['files'] = files if 'slides.zip' in files else files + ['slides.zip']
        manifest_tmp = tmp / 'validation.json'
        manifest_tmp.write_text(json.dumps(updated, ensure_ascii=False, indent=2) + '\n')
        # Back up any registered archive; restore it if manifest installation fails.
        backup = tmp / 'old.zip'
        if zip_path.exists():
            os.replace(zip_path, backup)
        try:
            os.replace(archive, zip_path)
            os.replace(manifest_tmp, manifest_path)
        except Exception:
            if zip_path.exists():
                zip_path.unlink()
            if backup.exists():
                os.replace(backup, zip_path)
            raise
    print(json.dumps({'archive': 'slides.zip', 'imageCount': len(slides)}, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, TypeError) as error:
        raise SystemExit(str(error))
