const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const {spawn} = require('node:child_process');

const repo = path.resolve(__dirname, '..');
const renderScript = path.join(repo, 'scripts', 'render.cjs');
const templateHtml = path.join(repo, 'assets', 'template.html');
const templateHero = path.join(repo, 'assets', 'hero.png');
const packScript = path.join(repo, 'scripts', 'pack.py');
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

function onePixelPng() {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lK3pVwAAAABJRU5ErkJggg==',
    'base64'
  );
}

function writePng(file) {
  fs.writeFileSync(file, onePixelPng());
}

function writeHtml(file, body, styles = '') {
  fs.writeFileSync(file, `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><style>#poster{width:1080px;background:#fff;color:#111}${styles}</style></head>
<body>${body}</body>
</html>`);
}

function writePlan(file, pages, extra = {}) {
  fs.writeFileSync(file, JSON.stringify({
    width: 1080,
    height: 1440,
    title: 'Regression',
    footer: 'Local test',
    pages,
    ...extra
  }, null, 2));
}

function runRender(args, options = {}) {
  const fullArgs = [renderScript, ...args];
  if (process.env.POSTER_NODE_MODULES) fullArgs.push('--modules', process.env.POSTER_NODE_MODULES);
  if (process.env.POSTER_BROWSER) fullArgs.push('--browser', process.env.POSTER_BROWSER);
  return new Promise(resolve => {
    const child = spawn(process.execPath, fullArgs, {
      cwd: repo,
      env: {...process.env, ...(options.env || {})}
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => stdout += d);
    child.stderr.on('data', d => stderr += d);
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
    }, options.timeoutMs || childTimeoutMs);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      const timedOut = signal === 'SIGKILL';
      const details = [
        stderr.trim(),
        timedOut ? `render timed out after ${options.timeoutMs || childTimeoutMs}ms` : '',
        timedOut ? `args: ${fullArgs.map(JSON.stringify).join(' ')}` : '',
        stdout.trim() ? `stdout: ${stdout.trim()}` : ''
      ].filter(Boolean).join('\n');
      resolve({code: timedOut ? null : code, signal, timedOut, stdout: stdout.trim(), stderr: details});
    });
  });
}

function runPack(args, options = {}) {
  return new Promise(resolve => {
    const child = spawn(process.env.PYTHON || 'python3', [packScript, ...args], {cwd: repo});
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => stdout += d);
    child.stderr.on('data', d => stderr += d);
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
    }, options.timeoutMs || childTimeoutMs);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      const timedOut = signal === 'SIGKILL';
      const details = [
        stderr.trim(),
        timedOut ? `pack.py timed out after ${options.timeoutMs || childTimeoutMs}ms` : '',
        timedOut ? `args: ${[packScript, ...args].map(JSON.stringify).join(' ')}` : '',
        stdout.trim() ? `stdout: ${stdout.trim()}` : ''
      ].filter(Boolean).join('\n');
      resolve({code: timedOut ? null : code, signal, timedOut, stdout: stdout.trim(), stderr: details});
    });
  });
}

async function withServer(fn) {
  const hits = [];
  const server = http.createServer((req, res) => {
    hits.push(req.url);
    if (req.url.endsWith('.css')) {
      res.writeHead(200, {'content-type': 'text/css'});
      res.end('body{outline:0}');
    } else {
      res.writeHead(200, {'content-type': 'image/png'});
      res.end(onePixelPng());
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`, hits);
  } finally {
    server.close();
  }
}

test('normal template exports a long poster and selector slides', async () => {
  const dir = tmpdir('template');
  fs.copyFileSync(templateHtml, path.join(dir, 'poster.html'));
  fs.copyFileSync(templateHero, path.join(dir, 'hero.png'));
  const plan = path.join(dir, 'pages.json');
  writePlan(plan, [
    {name: 'cover', selectors: ['#cover'], cover: true},
    {name: 'overview', selectors: ['#overview']},
    {name: 'action', selectors: ['#action']}
  ]);

  const out = path.join(dir, 'out');
  const result = await runRender(['--input', path.join(dir, 'poster.html'), '--plan', plan, '--out', out]);
  assert.equal(result.code, 0, result.stderr);
  assert.ok(fs.existsSync(path.join(out, 'poster.html')));
  assert.ok(fs.existsSync(path.join(out, 'poster.png')));
  assert.ok(fs.existsSync(path.join(out, 'poster.jpg')));
  assert.ok(fs.existsSync(path.join(out, 'pages.html')));
  assert.deepEqual(fs.readdirSync(path.join(out, 'slides')).sort(), [
    '01-cover.jpg',
    '02-overview.jpg',
    '03-action.jpg'
  ]);
    const validation = JSON.parse(fs.readFileSync(path.join(out, 'validation.json'), 'utf8'));
  assert.equal(validation.generator, 'long-poster');
  assert.equal(validation.schemaVersion, 1);
  assert.equal(validation.source, 'poster.html');
  assert.ok(Array.isArray(validation.files));
  assert.ok(validation.files.includes('poster.html'));
  assert.ok(validation.files.includes('slides/01-cover.jpg'));
  assert.equal(validation.width, 1080);
  assert.equal(validation.pageCount, 3);
  assert.equal(validation.imagesLoaded, true);
  assert.deepEqual(validation.clippedText, []);
});

test('inline event handlers are stripped and never executed', async () => {
  await withServer(async (origin, hits) => {
    const dir = tmpdir('events');
    const input = path.join(dir, 'poster.html');
    fs.writeFileSync(input, `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><style>#poster{width:1080px;background:#fff;color:#111}</style></head>
<body onload="fetch('${origin}/load')"><main id="poster" onmouseover="fetch('${origin}/hover')"><section id="a">ok</section></main></body>
</html>`);

    const out = path.join(dir, 'out');
    const result = await runRender(['--input', input, '--out', out]);
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(hits, []);
    const exported = fs.readFileSync(path.join(out, 'poster.html'), 'utf8');
    assert.doesNotMatch(exported, /\son[a-z]+\s*=/i);
  });
});

test('remote resources are rejected before any network request is made', async () => {
  await withServer(async (origin, hits) => {
    const dir = tmpdir('remote');
    const input = path.join(dir, 'poster.html');
    fs.writeFileSync(input, `<!doctype html>
<html><head>
<link rel="stylesheet" href="${origin}/remote.css">
<style>#poster{width:1080px;background-image:url("${origin}/remote-bg.png")}</style>
</head><body><main id="poster"><img alt="remote" src="${origin}/remote.png"></main></body></html>`);

    const result = await runRender(['--input', input, '--out', path.join(dir, 'out')]);
    assert.notEqual(result.code, 0);
    assert.deepEqual(hits, []);
  });
});

test('style attribute background URLs are embedded in exported HTML', async () => {
  const dir = tmpdir('style-url');
  writePng(path.join(dir, 'bg.png'));
  const input = path.join(dir, 'poster.html');
  writeHtml(input, '<main id="poster"><section id="a" style="height:300px;background-image:url(bg.png)">ok</section></main>');

  const out = path.join(dir, 'out');
  const result = await runRender(['--input', input, '--out', out]);
  assert.equal(result.code, 0, result.stderr);
  const exported = fs.readFileSync(path.join(out, 'poster.html'), 'utf8');
  assert.doesNotMatch(exported, /url\(["']?bg\.png["']?\)/);
  assert.match(exported, /data:image\/png;base64,/);
});

function runPython(script, args, options = {}) {
  return new Promise(resolve => {
    const child = spawn(process.env.PYTHON || 'python3', [path.join(repo, 'scripts', script), ...args], {cwd: repo});
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => stdout += d);
    child.stderr.on('data', d => stderr += d);
    const timer = setTimeout(() => child.kill('SIGKILL'), options.timeoutMs || childTimeoutMs);
    child.on('close', code => { clearTimeout(timer); resolve({code, stdout: stdout.trim(), stderr: stderr.trim()}); });
  });
}

test('every theme renders with a generated backdrop and no clipped text', async () => {
  const themesDir = path.join(repo, 'themes');
  const themes = fs.readdirSync(themesDir).filter(f => f.endsWith('.css')).map(f => f.slice(0, -4)).sort();
  assert.ok(themes.length >= 6, 'expected the bundled theme presets');
  const styles = ['mesh', 'geometric', 'rings', 'dots', 'waves', 'grid'];
  const templateVars = Object.fromEntries([...fs.readFileSync(templateHtml, 'utf8').matchAll(/--([\w-]+)\s*:\s*[^;]+;/g)].map(m => [m[1], true]));
  for (const [i, theme] of themes.entries()) {
    const css = fs.readFileSync(path.join(themesDir, theme + '.css'), 'utf8');
    const vars = Object.fromEntries([...css.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
    for (const name of Object.keys(templateVars)) assert.ok(vars[name], `${theme} is missing --${name}`);
    assert.match(css, /backdrop:\s*(mesh|geometric|rings|dots|waves|grid)/, theme + ' should recommend a backdrop style');

    const dir = tmpdir('theme-' + theme);
    const backdrop = path.join(dir, 'backdrop.svg');
    const generated = await runPython('backdrop.py', ['--style', styles[i % styles.length], '--bg', vars.bg, '--accent', vars.accent,
      '--accent2', vars['accent-2'], '--seed', '7', '--out', backdrop]);
    assert.equal(generated.code, 0, generated.stderr);
    const svg = fs.readFileSync(backdrop, 'utf8');
    assert.match(svg, /^<svg /);
    assert.doesNotMatch(svg, /<text|<image|href=/i, 'backdrops carry no text or external references');

    const html = path.join(dir, 'poster.html');
    const setup = await runPython('setup.py', ['--theme', theme, '--backdrop', backdrop, '--set', 'accent=#ff6b3d', '--out', html]);
    assert.equal(setup.code, 0, setup.stderr);
    const source = fs.readFileSync(html, 'utf8');
    assert.match(source, /--accent:#ff6b3d;/);
    const backdropName = JSON.parse(setup.stdout).backdrop;
    assert.match(backdropName, /^backdrop-[a-f0-9]+\.svg$/);
    assert.ok(source.includes(`--hero:url("${backdropName}");`));
    assert.match(source, new RegExp('--bg:' + vars.bg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ';'));
    assert.equal(fs.readFileSync(path.join(dir, backdropName), 'utf8'), svg);
    const refused = await runPython('setup.py', ['--theme', theme, '--backdrop', backdrop, '--out', html]);
    assert.notEqual(refused.code, 0, 'setup must not overwrite an existing source without --force');

    const out = path.join(dir, 'out');
    const result = await runRender(['--input', html, '--out', out]);
    assert.equal(result.code, 0, result.stderr);
    const validation = JSON.parse(fs.readFileSync(path.join(out, 'validation.json'), 'utf8'));
    assert.deepEqual(validation.clippedText, []);
    assert.equal(validation.imagesLoaded, true);
    assert.match(fs.readFileSync(path.join(out, 'poster.html'), 'utf8'), /data:image\/svg\+xml;base64,/);
  }
});

test('backdrop.py and setup.py reject unsafe input', async () => {
  const dir = tmpdir('unsafe');
  const badColor = await runPython('backdrop.py', ['--style', 'mesh', '--bg', 'red', '--accent', '#fff', '--out', path.join(dir, 'a.svg')]);
  assert.notEqual(badColor.code, 0);
  const badSet = await runPython('setup.py', ['--theme', 'tech-violet', '--backdrop', 'none', '--set', 'accent=</style><script>', '--out', path.join(dir, 'p.html')]);
  assert.notEqual(badSet.code, 0);
  assert.equal(fs.existsSync(path.join(dir, 'p.html')), false);
  const badBackdrop = await runPython('setup.py', ['--theme', 'tech-violet', '--backdrop', path.join(repo, 'package.json'), '--out', path.join(dir, 'q.html')]);
  assert.notEqual(badBackdrop.code, 0);
  const noHero = await runPython('setup.py', ['--theme', 'tech-violet', '--backdrop', 'none', '--out', path.join(dir, 'r.html')]);
  assert.equal(noHero.code, 0, noHero.stderr);
  assert.match(fs.readFileSync(path.join(dir, 'r.html'), 'utf8'), /--hero:none;/);
});

function runPalette(args) {
  const full = [path.join(repo, 'scripts', 'palette.cjs'), ...args];
  if (process.env.POSTER_NODE_MODULES) full.push('--modules', process.env.POSTER_NODE_MODULES);
  return new Promise(resolve => {
    const child = spawn(process.execPath, full, {cwd: repo});
    let stdout = '', stderr = '';
    child.stdout.on('data', d => stdout += d);
    child.stderr.on('data', d => stderr += d);
    child.on('close', code => resolve({code, stdout, stderr}));
  });
}

async function writeLogo(file, svg) {
  await sharp(Buffer.from(svg)).png().toFile(file);
}

test('palette.cjs: a colourful logo drives a complete brand theme, a monochrome logo does not', async () => {
  const dir = tmpdir('palette');
  const colourful = path.join(dir, 'logo.png');
  await writeLogo(colourful, '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="160"><rect width="400" height="160" fill="#ffffff"/>' +
    '<circle cx="80" cy="80" r="56" fill="#0b4f8a"/><rect x="150" y="52" width="200" height="56" rx="12" fill="#0b4f8a"/><rect x="150" y="116" width="120" height="14" rx="7" fill="#f2a900"/></svg>');
  const mono = path.join(dir, 'mono.png');
  await writeLogo(mono, '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="160"><rect width="400" height="160" fill="#ffffff"/>' +
    '<circle cx="80" cy="80" r="56" fill="#111111"/><rect x="150" y="52" width="200" height="56" rx="12" fill="#444444"/><rect x="150" y="116" width="120" height="14" rx="7" fill="#999999"/></svg>');

  const report = await runPalette([colourful, '--count', '4']);
  assert.equal(report.code, 0, report.stderr);
  const parsed = JSON.parse(report.stdout);
  assert.equal(parsed.isColorful, true);
  assert.equal(parsed.brand.primary, '#0b4f8a');
  assert.match(parsed.brand.secondary, /^#f[0-3]a[0-9a-f]0[0-9a-f]$/, 'secondary is the amber bar (resampling may shift it by a step)');
  assert.equal(parsed.suggestion.lightBackground, '#ffffff');

  const monoReport = await runPalette([mono, '--base', 'business-navy', '--theme-out', path.join(dir, 'mono.css')]);
  assert.equal(monoReport.code, 0, monoReport.stderr);
  const monoParsed = JSON.parse(monoReport.stdout);
  assert.equal(monoParsed.isColorful, false);
  assert.equal(monoParsed.brand, null);
  assert.equal(monoParsed.themeWritten, false);
  assert.equal(fs.existsSync(path.join(dir, 'mono.css')), false, 'no brand theme for a monochrome logo');

  const templateVars = [...fs.readFileSync(templateHtml, 'utf8').matchAll(/--([\w-]+)\s*:\s*[^;]+;/g)].map(m => m[1]);
  for (const [base, mode] of [['business-navy', 'dark'], ['minimal-light', 'light']]) {
    const themeFile = path.join(dir, `brand-${mode}.css`);
    const themed = await runPalette([colourful, '--base', base, '--theme-out', themeFile]);
    assert.equal(themed.code, 0, themed.stderr);
    const themedParsed = JSON.parse(themed.stdout);
    assert.equal(themedParsed.themeWritten, true);
    assert.equal(themedParsed.theme.mode, mode);
    const css = fs.readFileSync(themeFile, 'utf8');
    const vars = Object.fromEntries([...css.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
    for (const name of templateVars) assert.ok(vars[name], `brand theme (${mode}) is missing --${name}`);
    assert.equal(vars['panel-tag'], '#0b4f8a', 'brand primary is used verbatim where it is a fill');
    assert.match(vars.cta, /^linear-gradient\(/, 'cta is a gradient of brand-derived shades');
    if (mode === 'light') assert.match(vars.cta, /#0b4f8a/, 'light mode uses the brand primary verbatim in the cta');
    const baseVars = Object.fromEntries([...fs.readFileSync(path.join(repo, 'themes', base + '.css'), 'utf8').matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
    assert.equal(vars.radius, baseVars.radius, 'shape comes from the base preset');
    assert.notEqual(vars.bg, baseVars.bg, 'colours do not come from the base preset');

    const html = path.join(dir, `poster-${mode}.html`);
    const setup = await runPython('setup.py', ['--theme', themeFile, '--backdrop', 'none', '--out', html]);
    assert.equal(setup.code, 0, setup.stderr);
    const out = path.join(dir, `out-${mode}`);
    const result = await runRender(['--input', html, '--out', out]);
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(out, 'validation.json'), 'utf8')).clippedText, []);
  }
});

test('--width exports a fixed-size single page poster without a plan', async () => {
  const dir = tmpdir('single-page');
  const input = path.join(dir, 'poster.html');
  fs.writeFileSync(input, `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><style>#poster{width:1242px;height:1660px;background:#fff;color:#111;font-size:40px}</style></head>
<body><main id="poster"><section id="a">单页海报</section></main></body>
</html>`);

  const out = path.join(dir, 'out');
  const result = await runRender(['--input', input, '--out', out, '--width', '1242']);
  assert.equal(result.code, 0, result.stderr);
  const validation = JSON.parse(fs.readFileSync(path.join(out, 'validation.json'), 'utf8'));
  assert.equal(validation.width, 1242);
  assert.equal(validation.longHeight, 1660);
  assert.equal(validation.pageSize, null);
  const meta = await sharp(path.join(out, 'poster.png')).metadata();
  assert.equal(meta.width, 1242);
  assert.equal(meta.height, 1660);

  const mismatch = await runRender(['--input', input, '--out', path.join(dir, 'out-mismatch')]);
  assert.notEqual(mismatch.code, 0);
  assert.match(mismatch.stderr, /width must match/i);
  const bad = await runRender(['--input', input, '--out', path.join(dir, 'out-bad'), '--width', '12x']);
  assert.notEqual(bad.code, 0);
  assert.match(bad.stderr, /--width/);
});

test('overwrite removes prior tool-owned slide files, preserves unrelated files, and records files manifest', async () => {
  const dir = tmpdir('overwrite');
  const input = path.join(dir, 'poster.html');
  writeHtml(input, '<main id="poster"><section id="a">A</section><section id="b">B</section><section id="c">C</section></main>', 'section{height:240px;font-size:40px}');
  const firstPlan = path.join(dir, 'first-pages.json');
  const secondPlan = path.join(dir, 'second-pages.json');
  writePlan(firstPlan, [
    {name: 'a', selectors: ['#a']},
    {name: 'b', selectors: ['#b']},
    {name: 'c', selectors: ['#c']}
  ]);
  writePlan(secondPlan, [{name: 'a', selectors: ['#a']}]);

  const out = path.join(dir, 'out');
  let result = await runRender(['--input', input, '--plan', firstPlan, '--out', out]);
  assert.equal(result.code, 0, result.stderr);
  fs.writeFileSync(path.join(out, 'keep.txt'), 'not owned by renderer');

  result = await runRender(['--input', input, '--plan', secondPlan, '--out', out, '--overwrite']);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(fs.readdirSync(path.join(out, 'slides')).sort(), ['01-a.jpg']);
  assert.equal(fs.readFileSync(path.join(out, 'keep.txt'), 'utf8'), 'not owned by renderer');
  const validation = JSON.parse(fs.readFileSync(path.join(out, 'validation.json'), 'utf8'));
  assert.equal(validation.generator, 'long-poster');
  assert.equal(validation.schemaVersion, 1);
  assert.equal(validation.source, 'poster.html');
  assert.ok(Array.isArray(validation.files), 'validation.json must include an explicit files manifest');
  assert.ok(validation.files.includes('slides/01-a.jpg'));
  assert.ok(!validation.files.includes('slides/02-b.jpg'));
});

test('overwrite rollback preserves the previous export if a new owned path becomes a directory', async () => {
  const dir = tmpdir('overwrite-rollback');
  const input = path.join(dir, 'poster.html');
  writeHtml(input, '<main id="poster"><section id="a">A</section><section id="b">B</section></main>', 'section{height:240px;font-size:40px}');
  const firstPlan = path.join(dir, 'first-pages.json');
  const secondPlan = path.join(dir, 'second-pages.json');
  writePlan(firstPlan, [{name: 'a', selectors: ['#a']}]);
  writePlan(secondPlan, [
    {name: 'a', selectors: ['#a']},
    {name: 'b', selectors: ['#b']}
  ]);

  const out = path.join(dir, 'out');
  let result = await runRender(['--input', input, '--plan', firstPlan, '--out', out]);
  assert.equal(result.code, 0, result.stderr);
  const before = {
    manifest: fs.readFileSync(path.join(out, 'validation.json'), 'utf8'),
    slides: fs.readdirSync(path.join(out, 'slides')).sort()
  };

  fs.mkdirSync(path.join(out, 'slides', '02-b.jpg'));
  result = await runRender(['--input', input, '--plan', secondPlan, '--out', out, '--overwrite']);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Refusing to replace an untracked file|EISDIR|directory/i);
  assert.equal(fs.readFileSync(path.join(out, 'validation.json'), 'utf8'), before.manifest);
  assert.deepEqual(fs.readdirSync(path.join(out, 'slides')).sort(), [...before.slides, '02-b.jpg']);
  assert.equal(fs.statSync(path.join(out, 'slides', '02-b.jpg')).isDirectory(), true);
});

test('pack.py creates a manifest-registered slides zip that overwrite without a plan cleans up', async () => {
  const dir = tmpdir('pack-overwrite');
  const input = path.join(dir, 'poster.html');
  const plan = path.join(dir, 'pages.json');
  writeHtml(input, '<main id="poster"><section id="a">A</section><section id="b">B</section></main>', 'section{height:240px;font-size:40px}');
  writePlan(plan, [
    {name: 'a', selectors: ['#a']},
    {name: 'b', selectors: ['#b']}
  ]);

  const out = path.join(dir, 'out');
  let result = await runRender(['--input', input, '--plan', plan, '--out', out]);
  assert.equal(result.code, 0, result.stderr);
  result = await runPack([out]);
  assert.equal(result.code, 0, result.stderr);
  let validation = JSON.parse(fs.readFileSync(path.join(out, 'validation.json'), 'utf8'));
  assert.ok(validation.files.includes('slides.zip'));
  assert.ok(fs.existsSync(path.join(out, 'slides.zip')));

  result = await runRender(['--input', input, '--out', out, '--overwrite']);
  assert.equal(result.code, 0, result.stderr);
  validation = JSON.parse(fs.readFileSync(path.join(out, 'validation.json'), 'utf8'));
  assert.equal(validation.pageCount, 0);
  assert.ok(!validation.files.includes('slides.zip'));
  assert.equal(fs.existsSync(path.join(out, 'slides.zip')), false);
  assert.equal(fs.existsSync(path.join(out, 'slides', '01-a.jpg')), false);
});

test('light themed posters keep light slide backgrounds', async () => {
  const dir = tmpdir('light-theme');
  const input = path.join(dir, 'poster.html');
  const plan = path.join(dir, 'pages.json');
  writeHtml(input, '<main id="poster"><section id="a"><h1>Black text on white</h1></section></main>', 'section{height:600px;background:#fff;color:#111;font-size:64px}');
  writePlan(plan, [{name: 'light', selectors: ['#a']}]);

  const out = path.join(dir, 'out');
  const result = await runRender(['--input', input, '--plan', plan, '--out', out]);
  assert.equal(result.code, 0, result.stderr);
  const {data} = await sharp(path.join(out, 'slides', '01-light.jpg')).raw().toBuffer({resolveWithObject: true});
  assert.ok(data[0] > 220 && data[1] > 220 && data[2] > 220, `top-left pixel should be light, got rgb(${data[0]}, ${data[1]}, ${data[2]})`);
});

test('invalid inputs are rejected without writing partial exports', async t => {
  await t.test('missing local image', async () => {
    const dir = tmpdir('missing-image');
    const input = path.join(dir, 'poster.html');
    writeHtml(input, '<main id="poster"><img alt="missing" src="missing.png"></main>');
    const out = path.join(dir, 'out');
    const result = await runRender(['--input', input, '--out', out]);
    assert.notEqual(result.code, 0);
    assert.equal(fs.existsSync(path.join(out, 'poster.html')), false);
  });

  await t.test('clipped text', async () => {
    const dir = tmpdir('clipped-text');
    const input = path.join(dir, 'poster.html');
    writeHtml(input, '<main id="poster"><section id="a"><p>this text is clipped</p></section></main>', 'section{width:100px;height:40px;overflow:hidden}p{font-size:80px;white-space:nowrap;margin:0}');
    const out = path.join(dir, 'out');
    const result = await runRender(['--input', input, '--out', out]);
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /clipped text/i);
    assert.equal(fs.existsSync(path.join(out, 'poster.html')), false);
  });

  await t.test('page too dense', async () => {
    const dir = tmpdir('dense');
    const input = path.join(dir, 'poster.html');
    const plan = path.join(dir, 'pages.json');
    writeHtml(input, '<main id="poster"><section id="a">dense</section></main>', 'section{height:2600px;font-size:48px}');
    writePlan(plan, [{name: 'dense', selectors: ['#a']}], {minScale: 0.82});
    const out = path.join(dir, 'out');
    const result = await runRender(['--input', input, '--plan', plan, '--out', out]);
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /too dense/i);
    assert.equal(fs.existsSync(path.join(out, 'poster.html')), false);
  });
});

test('cover and content slides preserve poster ancestor selectors and inherited variables', async t => {
  const dir = tmpdir('ancestor-style');
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const input = path.join(dir, 'poster.html'), plan = path.join(dir, 'pages.json');
  fs.writeFileSync(input, `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0}p{margin:0;font-size:36px}
    #poster{width:1080px;min-height:2400px;background:#fff;color:#111;font-family:serif}
    #poster > section p{font-size:48px;background:#eee}
    main.brand[data-brand="workshop"] p{color:var(--copy-color);letter-spacing:2px}
    section{height:200px;padding:24px}
  </style></head><body><main id="poster" class="brand" data-brand="workshop" style="--copy-color:#174b39;line-height:1.5">
    <section id="a"><p>日期与报名信息</p></section><section id="b"><p>活动内容</p></section>
  </main></body></html>`);
  writePlan(plan, [{name:'cover',selectors:['#a'],cover:true},{name:'content',selectors:['#b']}]);
  const out = path.join(dir,'out');
  const result = await runRender(['--input',input,'--plan',plan,'--out',out]);
  assert.equal(result.code,0,result.stderr);
  const {chromium} = dependency('playwright');
  const browser = await chromium.launch({headless:true,...(process.env.POSTER_BROWSER ? {executablePath:process.env.POSTER_BROWSER} : {})});
  t.after(() => browser.close());
  const page = await browser.newPage({viewport:{width:1080,height:1440}});
  const {pathToFileURL} = require('node:url');
  const measure = element => {
    const css=getComputedStyle(element);
    return Object.fromEntries(['fontSize','backgroundColor','color','fontFamily','lineHeight','letterSpacing'].map(key=>[key,css[key]]));
  };
  await page.goto(pathToFileURL(path.join(out,'poster.html')).href);
  const expected = await page.locator('#a p').evaluate(measure);
  assert.equal(expected.fontSize,'48px');
  assert.equal(expected.color,'rgb(23, 75, 57)');
  await page.goto(pathToFileURL(path.join(out,'pages.html')).href);
  for (const id of ['cp-0','cp-1']) {
    assert.deepEqual(await page.locator('#'+id+' p').evaluate(measure),expected,id+' must retain source text styling');
  }
  assert.equal(JSON.parse(fs.readFileSync(path.join(out,'validation.json'))).pageCount,2);
});
