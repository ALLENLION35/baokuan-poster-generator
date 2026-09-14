#!/usr/bin/env node
'use strict';
// Read the brand colours out of a logo / key visual and, when the logo is actually
// colourful, derive a complete theme from them so the whole poster follows the
// brand instead of a preset. Uses the Sharp dependency the renderer already needs.
//
//   node scripts/palette.cjs work/assets/logo.png                       # report only
//   node scripts/palette.cjs work/assets/logo.png --base business-navy \
//        --theme-out work/brand.css                                      # report + brand theme
//
// The report's `isColorful` says whether the logo carries usable brand hues. A
// black / white / grey logo gives isColorful=false and no theme is written: pick a
// preset by event type instead (the skill's rule: monochrome logos do not drive colour).
//
// --base names the preset whose *shape* is kept (light or dark mode, radii, fonts,
// hero settings); every colour variable is replaced by brand-derived values.

const path = require('node:path');
const fs = require('node:fs');

const repo = path.resolve(__dirname, '..');

function parseArgs() {
  const args = { count: 5, base: null, themeOut: null, mode: null };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--count') args.count = Number(argv[++i]);
    else if (argv[i] === '--modules') args.modules = argv[++i];
    else if (argv[i] === '--base') args.base = argv[++i];
    else if (argv[i] === '--theme-out') args.themeOut = argv[++i];
    else if (argv[i] === '--mode') args.mode = argv[++i];
    else if (argv[i].startsWith('--')) throw Error('Unknown argument: ' + argv[i]);
    else args.input = argv[i];
  }
  if (!args.input) throw Error('Usage: node scripts/palette.cjs image [--count N] [--base theme] [--theme-out file.css] [--mode dark|light] [--modules dir]');
  if (!Number.isInteger(args.count) || args.count < 1 || args.count > 12) throw Error('--count must be 1-12.');
  if (args.mode && !['dark', 'light'].includes(args.mode)) throw Error('--mode must be dark or light.');
  if (args.themeOut && !args.base && !args.mode) throw Error('--theme-out needs --base <preset> (or --mode dark|light).');
  return args;
}

// ---- colour maths -------------------------------------------------------------
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const hex = ([r, g, b]) => '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
const fromHex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const luminance = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
const relativeLuminance = rgb => {
  const channel = value => {
    const n = value / 255;
    return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = rgb.map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrastRatio = (a, b) => {
  const l1 = relativeLuminance(typeof a === 'string' ? fromHex(a) : a);
  const l2 = relativeLuminance(typeof b === 'string' ? fromHex(b) : b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function toHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function fromHsl([h, s, l]) {
  h = ((h % 360) + 360) % 360 / 360; s = clamp(s, 0, 1); l = clamp(l, 0, 1);
  if (!s) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

// Shade of a hue: keep the hue, set saturation and lightness explicitly.
const shade = (rgb, s, l) => hex(fromHsl([toHsl(rgb)[0], s, l]));
const alpha = (h, a) => h + Math.round(clamp(a, 0, 1) * 255).toString(16).padStart(2, '0');
const hueGap = (a, b) => { const d = Math.abs(toHsl(a)[0] - toHsl(b)[0]); return Math.min(d, 360 - d); };

const TEXT_CONTRAST = 4.5;
const TEXT_CONTRAST_WITH_MARGIN = 4.65;

function mixRgb(a, b, t) {
  return a.map((value, channel) => value + (b[channel] - value) * t);
}

function gradientSamples(stops) {
  const samples = [...stops];
  for (let i = 0; i < stops.length - 1; i++) {
    for (let step = 1; step < 10; step++) samples.push(mixRgb(stops[i], stops[i + 1], step / 10));
  }
  return samples;
}

function roundedStops(stops) {
  return stops.map(stop => fromHex(hex(stop)));
}

function passesContrast(fg, backgrounds, ratio = TEXT_CONTRAST) {
  return backgrounds.every(bg => contrastRatio(fg, bg) >= ratio);
}

function readableHueOn(rgb, backgrounds, lightText, ratio = TEXT_CONTRAST) {
  const [h, s, l] = toHsl(rgb);
  const saturation = Math.max(s, 0.45);
  const target = lightText ? Math.max(l, 0.72) : Math.min(l, 0.34);
  let best = null;
  for (let i = 2; i <= 98; i++) {
    const candidate = hex(fromHsl([h, saturation, i / 100]));
    if (!passesContrast(candidate, backgrounds, ratio)) continue;
    const score = Math.abs(i / 100 - target);
    if (!best || score < best.score) best = {color: candidate, score};
  }
  if (best) return best.color;
  return readableNeutralOn(backgrounds, false, ratio);
}

function readableNeutralOn(backgrounds, soft = false, ratio = TEXT_CONTRAST) {
  const candidates = soft
    ? ['#000000', '#111111', '#202020', '#ffffff', '#f5f7fb']
    : ['#000000', '#111111', '#ffffff'];
  const ranked = candidates
    .map(color => ({color, min: Math.min(...backgrounds.map(bg => contrastRatio(color, bg)))}))
    .sort((a, b) => b.min - a.min);
  return ranked.find(item => item.min >= ratio)?.color || ranked[0].color;
}

function findReadableCompanionStop(anchor, companion, fg) {
  const [h, s, l] = toHsl(companion);
  const target = fg === '#ffffff' ? Math.min(l, 0.28) : Math.max(l, 0.72);
  let best = null;
  for (let i = 2; i <= 98; i++) {
    const candidate = fromHsl([h, Math.max(s, 0.45), i / 100]);
    const backgrounds = gradientSamples(roundedStops([anchor, candidate]));
    if (!passesContrast(fg, backgrounds, TEXT_CONTRAST_WITH_MARGIN)) continue;
    const score = Math.abs(i / 100 - target);
    if (!best || score < best.score) best = {rgb: candidate, score};
  }
  return best?.rgb ?? companion;
}

function buildReadableCta(a, b, dark, sat) {
  const rawStops = roundedStops([a, b]);
  const rawBackgrounds = gradientSamples(rawStops);
  const rawFg = readableNeutralOn(rawBackgrounds, false, TEXT_CONTRAST_WITH_MARGIN);
  if (passesContrast(rawFg, rawBackgrounds, TEXT_CONTRAST_WITH_MARGIN)) {
    const soft = readableHueOn(a, rawBackgrounds, rawFg === '#ffffff', TEXT_CONTRAST);
    return {stops: rawStops, fg: rawFg, soft};
  }

  const preferredFg = contrastRatio('#ffffff', a) >= TEXT_CONTRAST_WITH_MARGIN ? '#ffffff'
    : contrastRatio('#111111', a) >= TEXT_CONTRAST_WITH_MARGIN ? '#111111'
      : dark ? '#ffffff' : '#111111';
  let stops = roundedStops([a, findReadableCompanionStop(a, b, preferredFg)]);
  let backgrounds = gradientSamples(stops);
  if (!passesContrast(preferredFg, backgrounds, TEXT_CONTRAST_WITH_MARGIN)) {
    const lightText = preferredFg === '#ffffff';
    stops = roundedStops([
      fromHex(shade(a, sat, lightText ? 0.24 : 0.78)),
      fromHex(shade(b, sat, lightText ? 0.20 : 0.74))
    ]);
    backgrounds = gradientSamples(stops);
  }
  let fg = readableNeutralOn(backgrounds, false, TEXT_CONTRAST_WITH_MARGIN);
  if (!passesContrast(fg, backgrounds, TEXT_CONTRAST)) {
    stops = roundedStops([
      fromHex(shade(a, sat, dark ? 0.22 : 0.78)),
      fromHex(shade(b, sat, dark ? 0.18 : 0.74))
    ]);
    backgrounds = gradientSamples(stops);
    fg = readableNeutralOn(backgrounds, false, TEXT_CONTRAST);
  }
  let soft = readableHueOn(a, backgrounds, fg === '#ffffff', TEXT_CONTRAST);
  if (!passesContrast(soft, backgrounds, TEXT_CONTRAST)) soft = fg;
  return {stops, fg, soft};
}

// ---- theme derivation ---------------------------------------------------------
function deriveTheme(brand, brand2, dark) {
  const a = brand, b = brand2 || fromHex(shade(brand, toHsl(brand)[1], dark ? 0.75 : 0.35));
  const sat = clamp(toHsl(a)[1], 0.25, 0.7);
  if (dark) {
    const bg = shade(a, sat * 0.8, 0.07);
    const card = shade(a, sat * 0.7, 0.17), card2 = shade(a, sat * 0.7, 0.12);
    const panelTag = hex(a);
    const panel = shade(a, 0.35, 0.95), panel2 = shade(a, 0.4, 0.86);
    const panelAccentFg = readableNeutralOn([panel, panel2]) === '#ffffff';
    const panelAccent = readableHueOn(a, [panel, panel2], panelAccentFg);
    const cta = buildReadableCta(fromHex(shade(a, sat, 0.34)), fromHex(shade(b, sat, 0.26)), true, sat);
    const textSurfaces = [bg, card, card2];
    const accent = readableHueOn(a, textSurfaces, true), accent2 = readableHueOn(b, textSurfaces, true);
    const accent3 = readableHueOn(dark ? a : b, textSurfaces, true);
    return {
      bg, 'bg-glow-1': alpha(shade(a, sat, 0.28), 0.55), 'bg-glow-2': alpha(shade(b, sat, 0.22), 0.55),
      fg: '#ffffff', 'fg-soft': shade(a, 0.25, 0.84), 'fg-muted': shade(a, 0.2, 0.68),
      accent, 'accent-2': accent2, 'accent-3': accent3, line: alpha(shade(a, 0.3, 0.8), 0.3),
      card, 'card-2': card2, 'card-border': alpha(accent, 0.35), 'card-fg': shade(a, 0.2, 0.9),
      panel, 'panel-2': panel2, 'panel-fg': shade(a, 0.5, 0.14), 'panel-muted': shade(a, 0.25, 0.4), 'panel-tag': panelTag, 'panel-tag-fg': readableNeutralOn([panelTag]), 'panel-accent': panelAccent,
      cta: `linear-gradient(130deg,${hex(cta.stops[0])},${hex(cta.stops[1])})`, 'cta-border': alpha(accent, 0.6), 'cta-fg': cta.fg, 'cta-soft': cta.soft
    };
  }
  const bg = shade(a, 0.45, 0.965);
  const cta = buildReadableCta(a, b, false, sat);
  const panelTag = hex(a);
  const card = '#ffffff', card2 = shade(a, 0.5, 0.93);
  const panel = shade(a, 0.45, 0.16), panel2 = shade(a, 0.45, 0.25);
  const panelAccentFg = readableNeutralOn([panel, panel2]) === '#ffffff';
  const panelAccent = readableHueOn(a, [panel, panel2], panelAccentFg);
  const textSurfaces = [bg, card, card2];
  const accent = readableHueOn(a, textSurfaces, false), accent2 = readableHueOn(b, textSurfaces, false);
  const accent3 = readableHueOn(dark ? a : b, textSurfaces, false);
  return {
    bg, 'bg-glow-1': alpha(shade(a, 0.6, 0.86), 0.55), 'bg-glow-2': alpha(shade(b, 0.6, 0.88), 0.55),
    fg: shade(a, 0.45, 0.12), 'fg-soft': shade(a, 0.25, 0.32), 'fg-muted': shade(a, 0.18, 0.5),
    accent, 'accent-2': accent2, 'accent-3': accent3, line: alpha(shade(a, 0.4, 0.15), 0.15),
    card, 'card-2': card2, 'card-border': alpha(hex(a), 0.25), 'card-fg': shade(a, 0.3, 0.2),
    panel, 'panel-2': panel2, 'panel-fg': '#ffffff', 'panel-muted': shade(a, 0.25, 0.8), 'panel-tag': panelTag, 'panel-tag-fg': readableNeutralOn([panelTag]), 'panel-accent': panelAccent,
    cta: `linear-gradient(130deg,${hex(cta.stops[0])},${hex(cta.stops[1])})`, 'cta-border': hex(a), 'cta-fg': cta.fg, 'cta-soft': cta.soft
  };
}

function readBase(name) {
  const file = fs.existsSync(name) ? name : path.join(repo, 'themes', name + '.css');
  if (!fs.existsSync(file)) throw Error('Unknown base theme: ' + name);
  const css = fs.readFileSync(file, 'utf8');
  const vars = {};
  for (const m of css.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) vars[m[1]] = m[2].trim();
  return { file, vars };
}

// ---- main ----------------------------------------------------------------------
async function main() {
  const args = parseArgs();
  const moduleRoot = args.modules || process.env.POSTER_NODE_MODULES;
  const sharp = require(moduleRoot ? path.join(path.resolve(moduleRoot), 'sharp') : 'sharp');
  const input = path.resolve(args.input);
  if (!fs.existsSync(input)) throw Error('Image not found: ' + input);
  const { data, info } = await sharp(input).resize(96, 96, { fit: 'inside' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const bins = new Map();
  let opaque = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i + 3] < 128) continue;
    opaque++;
    // 5 bits per channel: coarse enough to merge anti-aliasing, fine enough to keep brand hues apart.
    const key = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
    const bin = bins.get(key) || { count: 0, sum: [0, 0, 0] };
    bin.count++; bin.sum[0] += data[i]; bin.sum[1] += data[i + 1]; bin.sum[2] += data[i + 2];
    bins.set(key, bin);
  }
  if (!opaque) throw Error('Image has no opaque pixels.');
  const ranked = [...bins.values()].sort((a, b) => b.count - a.count)
    .map(bin => ({ rgb: bin.sum.map(v => Math.round(v / bin.count)), count: bin.count }));
  const merged = [];
  for (const item of ranked) {
    const near = merged.find(m => distance(m.rgb, item.rgb) < 28);
    if (near) near.count += item.count; else merged.push({ ...item });
  }
  merged.sort((a, b) => b.count - a.count);
  const colors = merged.slice(0, args.count).map(item => ({
    hex: hex(item.rgb), rgb: item.rgb, share: Number((item.count / opaque).toFixed(3)),
    luminance: Number(luminance(item.rgb).toFixed(3)), saturation: Number(toHsl(item.rgb)[1].toFixed(3))
  }));

  // A colour counts as a brand hue when it is clearly saturated and covers enough of the
  // logo to be intentional (anti-aliasing fringes and tiny highlights are excluded).
  // Weighting by share * saturation puts a large brand blue above a small hot-pink dot.
  const vivid = merged.filter(item => toHsl(item.rgb)[1] >= 0.25 && item.count / opaque >= 0.02
    && luminance(item.rgb) > 0.04 && luminance(item.rgb) < 0.97)
    .map(item => ({ rgb: item.rgb, weight: item.count / opaque * toHsl(item.rgb)[1] }))
    .sort((a, b) => b.weight - a.weight);
  const brand = vivid[0]?.rgb ?? null;
  const brand2 = vivid.slice(1).find(v => hueGap(v.rgb, brand) >= 25)?.rgb ?? null;
  const isColorful = Boolean(brand);
  const report = {
    source: path.basename(input), opaquePixels: opaque, isColorful,
    colors: colors.map(({ rgb, ...rest }) => rest),
    brand: isColorful ? { primary: hex(brand), secondary: brand2 ? hex(brand2) : null } : null,
    suggestion: {
      accent: isColorful ? hex(brand) : null, accent2: brand2 ? hex(brand2) : null,
      darkBackground: [...colors].sort((a, b) => a.luminance - b.luminance)[0]?.hex ?? null,
      lightBackground: [...colors].sort((a, b) => b.luminance - a.luminance)[0]?.hex ?? null
    },
    advice: isColorful
      ? 'Colourful logo: build the whole palette from brand.primary / brand.secondary (use --base <preset> --theme-out to write the theme).'
      : 'Monochrome logo: it carries no brand hue, so pick a preset theme by event type and just place the logo.'
  };

  if (args.themeOut) {
    if (!isColorful) {
      report.themeWritten = false;
    } else {
      const base = args.base ? readBase(args.base) : { file: null, vars: {} };
      const dark = args.mode ? args.mode === 'dark' : luminance(fromHex(base.vars.bg || '#ffffff')) < 0.5;
      const derived = deriveTheme(brand, brand2, dark);
      const keep = ['radius', 'radius-sm', 'font-display', 'font-body', 'hero', 'hero-size', 'hero-fade'];
      const fallback = { radius: '24px', 'radius-sm': '16px',
        'font-display': '"PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif',
        'font-body': '"PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif',
        hero: 'none', 'hero-size': '100% 100%', 'hero-fade': 'linear-gradient(0deg,var(--bg) 0%,transparent 24%)' };
      const vars = { ...derived };
      for (const k of keep) vars[k] = base.vars[k] || fallback[k];
      const header = `/* theme: brand | 由 ${path.basename(input)} 派生（${dark ? 'dark' : 'light'} 模式${base.file ? '，形状沿用 ' + path.basename(base.file) : ''}）\n   brand: ${hex(brand)}${brand2 ? ' + ' + hex(brand2) : ''}\n   backdrop: 用 --bg ${vars.bg} --accent ${hex(brand)}${brand2 ? ' --accent2 ' + hex(brand2) : ''} 生成 */\n`;
      const css = header + ':root{\n' + Object.entries(vars).map(([k, v]) => `  --${k}:${v};`).join('\n') + '\n}\n';
      fs.mkdirSync(path.dirname(path.resolve(args.themeOut)), { recursive: true });
      fs.writeFileSync(path.resolve(args.themeOut), css);
      report.themeWritten = true;
      report.theme = { file: args.themeOut, mode: dark ? 'dark' : 'light', base: base.file ? path.basename(base.file) : null,
        backdropArgs: `--bg "${vars.bg}" --accent "${hex(brand)}"${brand2 ? ` --accent2 "${hex(brand2)}"` : ''}` };
    }
  }
  console.log(JSON.stringify(report, null, 2));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
