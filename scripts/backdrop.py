#!/usr/bin/env python3
"""Generate a deterministic, text-free SVG backdrop for a poster cover.

The top of the canvas (--title-zone, default 34%) is treated as the title zone:
crisp focal shapes are placed below it so the cover headline stays readable.

Standard library only. Styles are procedural so every event can get a backdrop
that matches its theme colours without image generation or stock photos:

  mesh       soft blurred colour blobs (tech, product launch)
  geometric  rotated translucent slabs and a thin frame (minimal, design, business)
  rings      concentric arcs radiating from a corner (celebration, guochao, festival)
  dots       halftone dot field with a colour wash (market, family, food)
  waves      stacked sine ribbons (health, outdoor, nature)
  grid       fine grid with a glow and diagonal accent (summit, training, finance)

Example:
  python3 scripts/backdrop.py --style rings --bg "#8a1616" --accent "#f6d38a" \
      --accent2 "#ffe7ad" --seed 3 --out work/backdrop.svg
"""
import argparse
import math
import random
import re
import sys

HEX = re.compile(r'^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$')


def color(value):
    value = value.strip()
    if not HEX.match(value):
        raise argparse.ArgumentTypeError('colours must be #rgb or #rrggbb: ' + value)
    if len(value) == 4:
        value = '#' + ''.join(c * 2 for c in value[1:])
    return value.lower()


def rgb(hex_color):
    return tuple(int(hex_color[i:i + 2], 16) for i in (1, 3, 5))


def luminance(hex_color):
    r, g, b = (c / 255 for c in rgb(hex_color))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def mix(a, b, t):
    ra, ga, ba = rgb(a)
    rb, gb, bb = rgb(b)
    return '#%02x%02x%02x' % (round(ra + (rb - ra) * t), round(ga + (gb - ga) * t), round(ba + (bb - ba) * t))



def style_mesh(w, h, bg, accent, accent2, rnd, tz):
    parts = []
    blobs = []
    for i in range(6):
        c = [accent, accent2, mix(accent, accent2, 0.5)][i % 3]
        cx, cy = rnd.uniform(-0.1, 1.1) * w, rnd.uniform(-0.1, 0.9) * h
        r = rnd.uniform(0.28, 0.5) * w
        blobs.append('<circle cx="%.0f" cy="%.0f" r="%.0f" fill="%s" opacity="%.2f"/>' % (cx, cy, r, c, rnd.uniform(0.35, 0.6)))
    parts.append('<g filter="url(#blur)">%s</g>' % ''.join(blobs))
    # A thin arc gives the eye something crisp to hold on to.
    cx, cy = w * rnd.uniform(0.5, 0.8), h * rnd.uniform(tz + 0.06, tz + 0.24)
    for k in range(3):
        parts.append('<ellipse cx="%.0f" cy="%.0f" rx="%.0f" ry="%.0f" fill="none" stroke="%s" stroke-width="%d" opacity="%.2f" transform="rotate(%d %.0f %.0f)"/>'
                     % (cx, cy, w * (0.42 + k * 0.08), w * (0.14 + k * 0.03), accent2 if k % 2 else accent, 3 - k, 0.55 - k * 0.15, -18, cx, cy))
    defs = '<filter id="blur" x="-50%%" y="-50%%" width="200%%" height="200%%"><feGaussianBlur stdDeviation="%.0f"/></filter>' % (w * 0.09)
    return defs, ''.join(parts)


def style_geometric(w, h, bg, accent, accent2, rnd, tz):
    parts = []
    light = luminance(bg) > 0.5
    ink = '#000000' if light else '#ffffff'
    for i in range(5):
        x, y = rnd.uniform(-0.2, 0.9) * w, rnd.uniform(-0.1, 0.8) * h
        sw, sh = rnd.uniform(0.35, 0.9) * w, rnd.uniform(0.05, 0.16) * h
        parts.append('<rect x="%.0f" y="%.0f" width="%.0f" height="%.0f" fill="%s" opacity="%.2f" transform="rotate(%d %.0f %.0f)"/>'
                     % (x, y, sw, sh, [accent, accent2, ink][i % 3], rnd.uniform(0.06, 0.16), rnd.choice([-32, -18, 18, 32]), x + sw / 2, y + sh / 2))
    m = w * 0.05
    parts.append('<rect x="%.0f" y="%.0f" width="%.0f" height="%.0f" fill="none" stroke="%s" stroke-width="2" opacity="0.35"/>' % (m, m, w - 2 * m, h - 2 * m, ink))
    cx, cy = w * rnd.uniform(0.62, 0.85), h * rnd.uniform(tz + 0.04, tz + 0.21)
    parts.append('<circle cx="%.0f" cy="%.0f" r="%.0f" fill="%s" opacity="0.9"/>' % (cx, cy, w * 0.11, accent))
    return '', ''.join(parts)


def style_rings(w, h, bg, accent, accent2, rnd, tz):
    parts = []
    cx, cy = w * rnd.uniform(0.88, 1.0), h * rnd.uniform(tz, tz + 0.16)
    for k in range(14):
        r = w * (0.08 + k * 0.075)
        c = accent if k % 2 == 0 else accent2
        parts.append('<circle cx="%.0f" cy="%.0f" r="%.0f" fill="none" stroke="%s" stroke-width="%.1f" opacity="%.2f"/>'
                     % (cx, cy, r, c, 2 + (k % 3), max(0.08, 0.5 - k * 0.032)))
    # Filled sun disc plus a soft glow behind the rings.
    parts.insert(0, '<circle cx="%.0f" cy="%.0f" r="%.0f" fill="%s" opacity="0.35" filter="url(#glow)"/>' % (cx, cy, w * 0.35, accent))
    parts.append('<circle cx="%.0f" cy="%.0f" r="%.0f" fill="%s" opacity="0.95"/>' % (cx, cy, w * 0.09, accent2))
    defs = '<filter id="glow" x="-50%%" y="-50%%" width="200%%" height="200%%"><feGaussianBlur stdDeviation="%.0f"/></filter>' % (w * 0.08)
    return defs, ''.join(parts)


def style_dots(w, h, bg, accent, accent2, rnd, tz):
    parts = ['<rect width="%d" height="%d" fill="url(#wash)"/>' % (w, h)]
    step = int(w / 22)
    ox, oy = rnd.uniform(0, step), rnd.uniform(0, step)
    fx, fy = w * rnd.uniform(0.6, 0.9), h * rnd.uniform(0.2, 0.5)
    dots = []
    for gx in range(-1, 24):
        for gy in range(-1, int(h / step) + 2):
            x, y = ox + gx * step, oy + gy * step
            d = math.hypot(x - fx, y - fy) / (w * 0.9)
            r = max(0, (1 - d)) * step * 0.34
            if r > 1.2:
                dots.append('<circle cx="%.0f" cy="%.0f" r="%.1f"/>' % (x, y, r))
    parts.append('<g fill="%s" opacity="0.55">%s</g>' % (accent, ''.join(dots)))
    for i in range(3):
        x, y = rnd.uniform(0.08, 0.85) * w, rnd.uniform(tz + 0.02, min(0.78, tz + 0.38)) * h
        parts.append('<circle cx="%.0f" cy="%.0f" r="%.0f" fill="%s" opacity="%.2f"/>' % (x, y, w * rnd.uniform(0.06, 0.13), accent2 if i % 2 else accent, 0.85))
    defs = ('<linearGradient id="wash" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="%s" stop-opacity="0.35"/>'
            '<stop offset="1" stop-color="%s" stop-opacity="0.25"/></linearGradient>' % (accent2, accent))
    return defs, ''.join(parts)


def style_waves(w, h, bg, accent, accent2, rnd, tz):
    parts = []
    for k in range(7):
        base = h * (0.35 + k * 0.1)
        amp = h * rnd.uniform(0.03, 0.06)
        freq = rnd.uniform(1.2, 2.2)
        phase = rnd.uniform(0, math.pi * 2)
        pts = []
        for i in range(0, w + 41, 40):
            pts.append('%d,%.0f' % (i, base + math.sin(i / w * math.pi * 2 * freq + phase) * amp))
        c = mix(accent, accent2, k / 6)
        parts.append('<path d="M%s L%d,%d L0,%d Z" fill="%s" opacity="%.2f"/>' % (' L'.join(pts), w, h, h, c, 0.16 + k * 0.05))
    parts.append('<circle cx="%.0f" cy="%.0f" r="%.0f" fill="%s" opacity="0.8"/>' % (w * rnd.uniform(0.65, 0.85), h * rnd.uniform(tz, tz + 0.12), w * 0.1, accent2))
    return '', ''.join(parts)


def style_grid(w, h, bg, accent, accent2, rnd, tz):
    light = luminance(bg) > 0.5
    ink = '#000000' if light else '#ffffff'
    step = int(w / 12)
    lines = []
    for x in range(0, w + 1, step):
        lines.append('<line x1="%d" y1="0" x2="%d" y2="%d"/>' % (x, x, h))
    for y in range(0, h + 1, step):
        lines.append('<line x1="0" y1="%d" x2="%d" y2="%d"/>' % (y, w, y))
    parts = ['<g stroke="%s" stroke-width="1" opacity="0.12">%s</g>' % (ink, ''.join(lines))]
    gx, gy = w * rnd.uniform(0.55, 0.85), h * rnd.uniform(tz, tz + 0.2)
    parts.insert(0, '<circle cx="%.0f" cy="%.0f" r="%.0f" fill="%s" opacity="0.45" filter="url(#soft)"/>' % (gx, gy, w * 0.32, accent))
    x0 = w * rnd.uniform(0.3, 0.6)
    parts.append('<polygon points="%.0f,0 %.0f,0 %.0f,%d %.0f,%d" fill="%s" opacity="0.14"/>' % (x0, x0 + w * 0.18, x0 - w * 0.35, h, x0 - w * 0.53, h, accent2))
    parts.append('<line x1="%.0f" y1="0" x2="%.0f" y2="%d" stroke="%s" stroke-width="3" opacity="0.7"/>' % (x0 + w * 0.18, x0 - w * 0.35, h, accent2))
    defs = '<filter id="soft" x="-50%%" y="-50%%" width="200%%" height="200%%"><feGaussianBlur stdDeviation="%.0f"/></filter>' % (w * 0.1)
    return defs, ''.join(parts)


STYLES = {'mesh': style_mesh, 'geometric': style_geometric, 'rings': style_rings,
          'dots': style_dots, 'waves': style_waves, 'grid': style_grid}


def build(style, width, height, bg, accent, accent2, seed, title_zone=0.34):
    rnd = random.Random(seed)
    defs, body = STYLES[style](width, height, bg, accent, accent2, rnd, title_zone)
    return ('<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d">'
            '<defs>%s</defs><rect width="%d" height="%d" fill="%s"/>%s</svg>\n'
            % (width, height, width, height, defs, width, height, bg, body))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--style', choices=sorted(STYLES), required=True)
    parser.add_argument('--bg', type=color, required=True, help='page background colour, usually the theme --bg')
    parser.add_argument('--accent', type=color, required=True)
    parser.add_argument('--accent2', type=color, help='second accent; defaults to a lighter/darker mix of --accent')
    parser.add_argument('--width', type=int, default=1080)
    parser.add_argument('--height', type=int, default=1440)
    parser.add_argument('--seed', type=int, default=1, help='change to get a different composition with the same colours')
    parser.add_argument('--title-zone', type=float, default=0.34, help='fraction of the height (from the top) kept free of focal shapes; raise it when the cover headline runs long')
    parser.add_argument('--out', required=True)
    args = parser.parse_args()
    if args.width < 320 or args.height < 320 or args.width > 8000 or args.height > 8000:
        sys.exit('width/height must be between 320 and 8000')
    accent2 = args.accent2 or mix(args.accent, '#ffffff' if luminance(args.bg) < 0.5 else '#000000', 0.35)
    if not 0.1 <= args.title_zone <= 0.7:
        sys.exit('--title-zone must be between 0.1 and 0.7')
    svg = build(args.style, args.width, args.height, args.bg, args.accent, accent2, args.seed, args.title_zone)
    with open(args.out, 'w', encoding='utf-8') as f:
        f.write(svg)
    print('{"style": "%s", "out": "%s", "size": [%d, %d], "seed": %d, "titleZone": %.2f}' % (args.style, args.out, args.width, args.height, args.seed, args.title_zone))


if __name__ == '__main__':
    main()
