#!/usr/bin/env node
'use strict';
// Render the template once per theme with a generated backdrop and stitch the six
// covers into outputs/themes/covers.png. Used to produce examples/themes.png and as a
// quick visual check that every theme still reads well after edits.
//
//   npm run demo:themes            (writes outputs/themes/)

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repo = path.resolve(__dirname, '..');
const out = path.join(repo, 'outputs', 'themes');
const python = process.env.PYTHON || 'python3';
const themes = [
  { name: 'tech-violet', style: 'mesh' },
  { name: 'minimal-light', style: 'geometric' },
  { name: 'guochao-red-gold', style: 'rings' },
  { name: 'warm-market', style: 'dots' },
  { name: 'fresh-green', style: 'waves' },
  { name: 'business-navy', style: 'grid' }
];

function run(cmd, args) {
  const result = spawnSync(cmd, args, { cwd: repo, encoding: 'utf8' });
  if (result.status !== 0) throw Error(`${cmd} ${args.join(' ')}\n${result.stderr}`);
  return result.stdout;
}

function readVars(theme) {
  const css = fs.readFileSync(path.join(repo, 'themes', theme + '.css'), 'utf8');
  const vars = {};
  for (const m of css.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) vars[m[1]] = m[2].trim();
  return vars;
}

async function main() {
  const sharp = require(process.env.POSTER_NODE_MODULES ? path.join(path.resolve(process.env.POSTER_NODE_MODULES), 'sharp') : 'sharp');
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const covers = [];
  for (const theme of themes) {
    const vars = readVars(theme.name);
    const dir = path.join(out, theme.name);
    fs.mkdirSync(dir, { recursive: true });
    run(python, [path.join(repo, 'scripts', 'backdrop.py'), '--style', theme.style, '--bg', vars.bg, '--accent', vars.accent,
      '--accent2', vars['accent-2'], '--seed', '4', '--out', path.join(dir, 'backdrop.svg')]);
    run(python, [path.join(repo, 'scripts', 'setup.py'), '--theme', theme.name, '--backdrop', path.join(dir, 'backdrop.svg'),
      '--out', path.join(dir, 'poster.html'), '--force']);
    const renderArgs = [path.join(repo, 'scripts', 'render.cjs'), '--input', path.join(dir, 'poster.html'), '--out', path.join(dir, 'export')];
    if (process.env.POSTER_NODE_MODULES) renderArgs.push('--modules', process.env.POSTER_NODE_MODULES);
    if (process.env.POSTER_BROWSER) renderArgs.push('--browser', process.env.POSTER_BROWSER);
    run(process.execPath, renderArgs);
    covers.push(path.join(dir, 'export', 'poster.png'));
    console.log(theme.name + ' ok');
  }
  const tw = 360, th = 480, gap = 10;
  const tiles = await Promise.all(covers.map(async (file, i) => ({
    input: await sharp(file).extract({ left: 0, top: 0, width: 1080, height: 1440 }).resize(tw, th).png().toBuffer(),
    left: gap + i * (tw + gap), top: gap
  })));
  await sharp({ create: { width: covers.length * (tw + gap) + gap, height: th + 2 * gap, channels: 3, background: '#e7e9ed' } })
    .composite(tiles).png().toFile(path.join(out, 'covers.png'));
  console.log('covers: ' + path.relative(repo, path.join(out, 'covers.png')));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
