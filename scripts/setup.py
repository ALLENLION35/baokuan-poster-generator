#!/usr/bin/env python3
"""Start a poster source from the template with a theme and a cover backdrop.

Standard library only. It copies assets/template.html to --out, replaces the
template's :root variable block with the chosen theme (themes/<name>.css or any
CSS file that contains a :root{...} block), copies the backdrop image next to the
output and points --hero at it. Structure CSS is left untouched, so the result is
still one static HTML file the renderer accepts.

Examples:
  python3 scripts/setup.py --theme warm-market --backdrop work/backdrop.svg --out work/poster.html
  python3 scripts/setup.py --theme minimal-light --backdrop work/assets/venue.jpg --hero-size cover --out work/poster.html
  python3 scripts/setup.py --theme business-navy --backdrop none --out work/poster.html
  python3 scripts/setup.py --theme themes/tech-violet.css --set accent=#ff6b3d --set radius=8px --backdrop none --out work/poster.html
"""
import argparse
import hashlib
import json
import os
import re
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT_BLOCK = re.compile(r':root\s*\{(.*?)\}', re.S)
VAR = re.compile(r'--([\w-]+)\s*:\s*([^;]+);')
VAR_USE = re.compile(r'var\(\s*--([\w-]+)')
IMAGE_TYPES = {'.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif', '.avif'}


def parse_vars(css):
    match = ROOT_BLOCK.search(css)
    if not match:
        raise SystemExit('No :root{...} block found in theme CSS.')
    return {name: value.strip() for name, value in VAR.findall(match.group(1))}


def used_vars(css):
    return set(parse_vars(css)) | set(VAR_USE.findall(css))


def resolve_theme(spec):
    if os.path.isfile(spec):
        return spec
    candidate = os.path.join(ROOT, 'themes', spec + '.css')
    if os.path.isfile(candidate):
        return candidate
    available = sorted(f[:-4] for f in os.listdir(os.path.join(ROOT, 'themes')) if f.endswith('.css'))
    raise SystemExit('Unknown theme %r. Available: %s (or pass a CSS file path).' % (spec, ', '.join(available)))


def css_value_ok(value):
    # Values land inside a <style> block; keep them to plain CSS tokens.
    return value and not re.search(r'[<>{}]|</|url\s*\(|@import', value, re.I)


def hashed_backdrop_name(src):
    with open(src, 'rb') as f:
        digest = hashlib.sha256(f.read()).hexdigest()[:12]
    ext = os.path.splitext(src)[1].lower()
    return 'backdrop-%s%s' % (digest, ext)


def copy_backdrop(src, dest):
    if os.path.abspath(dest) == os.path.abspath(src):
        return
    if os.path.exists(dest):
        with open(src, 'rb') as src_file, open(dest, 'rb') as dest_file:
            if src_file.read() == dest_file.read():
                return
        raise SystemExit('Refusing to overwrite existing backdrop asset: ' + dest)
    shutil.copyfile(src, dest)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--theme', required=True, help='theme name under themes/ or a CSS file with a :root block')
    parser.add_argument('--backdrop', required=True, help='image file for the cover, or "none"')
    parser.add_argument('--hero-size', default=None, help='CSS background-size for the backdrop, e.g. "cover" for photos (default keeps the theme value)')
    parser.add_argument('--set', action='append', default=[], metavar='NAME=VALUE', help='override a variable, e.g. accent=#ff6b3d (repeatable)')
    parser.add_argument('--template', default=os.path.join(ROOT, 'assets', 'template.html'))
    parser.add_argument('--out', required=True, help='output HTML path; the backdrop is copied beside it')
    parser.add_argument('--force', action='store_true', help='overwrite an existing --out')
    args = parser.parse_args()

    out = os.path.abspath(args.out)
    if os.path.exists(out) and not args.force:
        raise SystemExit('Output exists; use --force to overwrite (you will lose edits made to it): ' + out)
    with open(args.template, encoding='utf-8') as f:
        html = f.read()
    template_vars = parse_vars(html)
    theme_path = resolve_theme(args.theme)
    with open(theme_path, encoding='utf-8') as f:
        theme_vars = parse_vars(f.read())
    unknown = sorted(set(theme_vars) - used_vars(html))
    if unknown:
        print('note: theme defines variables the template does not use: ' + ', '.join(unknown), file=sys.stderr)
    merged = dict(template_vars)
    merged.update(theme_vars)

    for item in args.set:
        if '=' not in item:
            raise SystemExit('--set expects NAME=VALUE: ' + item)
        name, value = item.split('=', 1)
        name = name.strip().lstrip('-')
        if name not in merged:
            raise SystemExit('Unknown variable for --set: ' + name)
        if not css_value_ok(value.strip()):
            raise SystemExit('Refusing unsafe value for --set ' + name)
        merged[name] = value.strip()

    os.makedirs(os.path.dirname(out) or '.', exist_ok=True)
    backdrop_name = None
    if args.backdrop.lower() == 'none':
        merged['hero'] = 'none'
    else:
        src = os.path.abspath(args.backdrop)
        ext = os.path.splitext(src)[1].lower()
        if not os.path.isfile(src):
            raise SystemExit('Backdrop file not found: ' + src)
        if ext not in IMAGE_TYPES:
            raise SystemExit('Backdrop must be an image file, got: ' + ext)
        backdrop_name = hashed_backdrop_name(src)
        dest = os.path.join(os.path.dirname(out), backdrop_name)
        copy_backdrop(src, dest)
        merged['hero'] = 'url("%s")' % backdrop_name
    if args.hero_size:
        if not css_value_ok(args.hero_size):
            raise SystemExit('Refusing unsafe --hero-size value')
        merged['hero-size'] = args.hero_size

    block = ':root{\n' + ''.join('  --%s:%s;\n' % (k, v) for k, v in merged.items()) + '}'
    html, count = ROOT_BLOCK.subn(lambda m: block, html, count=1)
    if count != 1:
        raise SystemExit('Template has no :root block to replace.')
    with open(out, 'w', encoding='utf-8') as f:
        f.write(html)
    print(json.dumps({'out': out, 'theme': os.path.relpath(theme_path, ROOT), 'backdrop': backdrop_name,
                      'overrides': args.set}, ensure_ascii=False))


if __name__ == '__main__':
    main()
