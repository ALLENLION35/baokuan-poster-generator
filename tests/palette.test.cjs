const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn} = require('node:child_process');

const repo = path.resolve(__dirname, '..');
const paletteScript = path.join(repo, 'scripts', 'palette.cjs');
const childTimeoutMs = Number(process.env.POSTER_TEST_CHILD_TIMEOUT_MS || 60000);

function dependency(name) {
  return require(process.env.POSTER_NODE_MODULES
    ? path.join(path.resolve(process.env.POSTER_NODE_MODULES), name)
    : name);
}

const sharp = dependency('sharp');

function tmpdir(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `long-poster-${name}-`));
}

function fromHex(value) {
  const hex = value.trim().replace(/^#/, '');
  return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
}

function relativeLuminance(rgb) {
  const channel = value => {
    const n = value / 255;
    return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = rgb.map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const l1 = relativeLuminance(fromHex(a));
  const l2 = relativeLuminance(fromHex(b));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function gradientSamples(value) {
  const stops = [...value.matchAll(/#[0-9a-f]{6}/ig)].map(match => match[0].toLowerCase());
  assert.ok(stops.length >= 2, `expected gradient stops in ${value}`);
  const samples = [...stops];
  for (let i = 0; i < stops.length - 1; i++) {
    const start = fromHex(stops[i]);
    const end = fromHex(stops[i + 1]);
    for (let step = 1; step < 10; step++) {
      samples.push('#' + start.map((value, channel) => Math.round(value + (end[channel] - value) * step / 10).toString(16).padStart(2, '0')).join(''));
    }
  }
  return samples;
}

function parseVars(css) {
  return Object.fromEntries([...css.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map(match => [match[1], match[2].trim()]));
}

function runPalette(args) {
  const fullArgs = [paletteScript, ...args];
  if (process.env.POSTER_NODE_MODULES) fullArgs.push('--modules', process.env.POSTER_NODE_MODULES);
  return new Promise(resolve => {
    const child = spawn(process.execPath, fullArgs, {cwd: repo});
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), childTimeoutMs);
    child.stdout.on('data', data => stdout += data);
    child.stderr.on('data', data => stderr += data);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({code: signal === 'SIGKILL' ? null : code, stdout, stderr, signal});
    });
  });
}

async function writeLogo(file, primary, secondary = primary) {
  await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="160">
    <rect width="400" height="160" fill="#ffffff"/>
    <rect x="20" y="28" width="240" height="104" rx="22" fill="${primary}"/>
    <circle cx="320" cy="80" r="52" fill="${secondary}"/>
  </svg>`)).png().toFile(file);
}

test('brand themes keep difficult brand colours readable across light and dark modes', async t => {
  const cases = [
    {name: 'yellow', primary: '#ffff00'},
    {name: 'green', primary: '#00ff00'},
    {name: 'red-tag-black-fallback', primary: '#f00000'},
    {name: 'blue-yellow', primary: '#0000ff', secondary: '#ffff00'},
    {name: 'cyan-red', primary: '#00ffff', secondary: '#ff0000'}
  ];
  const modes = [
    {base: 'minimal-light', expected: 'light'},
    {base: 'business-navy', expected: 'dark'}
  ];
  for (const item of cases) {
    for (const mode of modes) {
      await t.test(`${item.name} ${mode.expected}`, async () => {
        const dir = tmpdir('palette-contrast');
        t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
        const logo = path.join(dir, 'logo.png');
        const theme = path.join(dir, 'brand.css');
        await writeLogo(logo, item.primary, item.secondary);

        const result = await runPalette([logo, '--base', mode.base, '--theme-out', theme]);
        assert.equal(result.code, 0, result.stderr);
        assert.equal(JSON.parse(result.stdout).theme.mode, mode.expected);
        const vars = parseVars(fs.readFileSync(theme, 'utf8'));
        if (item.name === 'red-tag-black-fallback') {
          assert.ok(contrast('#ffffff', vars['panel-tag']) < 4.5, 'white is not readable enough on this red tag');
          assert.ok(contrast('#111111', vars['panel-tag']) < 4.5, '#111 is not readable enough on this red tag');
          assert.equal(vars['panel-tag-fg'], '#000000', 'red tag needs the black fallback foreground');
        } else {
          assert.equal(vars['panel-tag'], item.primary, 'brand primary remains available as a fill colour');
        }

        const textSurfaces = [vars.bg, vars.card, vars['card-2']];
        for (const name of ['accent', 'accent-2', 'accent-3']) {
          for (const surface of textSurfaces) {
            assert.ok(contrast(vars[name], surface) >= 4.5, `${name} ${vars[name]} must be readable on ${surface}`);
          }
        }

        assert.ok(vars['panel-tag-fg'], 'panel tag foreground is explicit for brand fills');
        assert.ok(contrast(vars['panel-tag-fg'], vars['panel-tag']) >= 4.5,
          `panel-tag-fg ${vars['panel-tag-fg']} must be readable on panel-tag ${vars['panel-tag']}`);
        assert.ok(vars['panel-accent'], 'panel text accent is separate from raw panel tag fill');
        for (const surface of [vars.panel, vars['panel-2']]) {
          assert.ok(contrast(vars['panel-accent'], surface) >= 4.5,
            `panel-accent ${vars['panel-accent']} must be readable on panel surface ${surface}`);
        }

        for (const sample of gradientSamples(vars.cta)) {
          assert.ok(contrast(vars['cta-fg'], sample) >= 4.5,
            `cta-fg ${vars['cta-fg']} must be readable on cta sample ${sample}`);
          assert.ok(contrast(vars['cta-soft'], sample) >= 4.5,
            `cta-soft ${vars['cta-soft']} must be readable on cta sample ${sample}`);
        }
      });
    }
  }
});
