const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn} = require('node:child_process');

const repo = path.resolve(__dirname, '..');
const setupScript = path.join(repo, 'scripts', 'setup.py');
const childTimeoutMs = Number(process.env.POSTER_TEST_CHILD_TIMEOUT_MS || 60000);

function tmpdir(t, name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `long-poster-setup-${name}-`));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  return dir;
}

function writeSvg(file, fill) {
  fs.writeFileSync(file, `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="${fill}"/></svg>`);
}

function runSetup(args, options = {}) {
  return new Promise(resolve => {
    const child = spawn(process.env.PYTHON || 'python3', [setupScript, ...args], {
      cwd: repo,
      env: {...process.env, ...(options.env || {})}
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => stdout += d);
    child.stderr.on('data', d => stderr += d);
    const timer = setTimeout(() => child.kill('SIGKILL'), options.timeoutMs || childTimeoutMs);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({code, signal, stdout: stdout.trim(), stderr: stderr.trim()});
    });
  });
}

function heroNameFromHtml(file) {
  const html = fs.readFileSync(file, 'utf8');
  const match = html.match(/--hero:url\("([^"]+)"\);/);
  assert.ok(match, `expected --hero url in ${file}`);
  return match[1];
}

function hashedBackdropName(file) {
  const digest = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 12);
  return `backdrop-${digest}${path.extname(file).toLowerCase()}`;
}

test('setup keeps different backdrop versions isolated in one output folder', async t => {
  const dir = tmpdir(t, 'versions');
  const red = path.join(dir, 'red.svg');
  const blue = path.join(dir, 'blue.svg');
  const first = path.join(dir, 'poster-v1.html');
  const second = path.join(dir, 'poster-v2.html');
  writeSvg(red, 'red');
  writeSvg(blue, 'blue');

  const firstResult = await runSetup(['--theme', 'warm-market', '--backdrop', red, '--out', first]);
  assert.equal(firstResult.code, 0, firstResult.stderr);
  const firstHero = heroNameFromHtml(first);
  const firstHeroPath = path.join(dir, firstHero);
  const firstHeroContent = fs.readFileSync(firstHeroPath, 'utf8');

  const secondResult = await runSetup(['--theme', 'warm-market', '--backdrop', blue, '--out', second]);
  assert.equal(secondResult.code, 0, secondResult.stderr);
  const secondHero = heroNameFromHtml(second);

  assert.notEqual(secondHero, firstHero);
  assert.equal(fs.readFileSync(firstHeroPath, 'utf8'), firstHeroContent);
  assert.equal(fs.readFileSync(path.join(dir, firstHero), 'utf8'), fs.readFileSync(red, 'utf8'));
  assert.equal(fs.readFileSync(path.join(dir, secondHero), 'utf8'), fs.readFileSync(blue, 'utf8'));
});

test('setup reuses the same backdrop asset name for identical content', async t => {
  const dir = tmpdir(t, 'same-content');
  const firstSource = path.join(dir, 'first.svg');
  const secondSource = path.join(dir, 'second.svg');
  const first = path.join(dir, 'poster-a.html');
  const second = path.join(dir, 'poster-b.html');
  writeSvg(firstSource, '#123456');
  writeSvg(secondSource, '#123456');

  const firstResult = await runSetup(['--theme', 'minimal-light', '--backdrop', firstSource, '--out', first]);
  assert.equal(firstResult.code, 0, firstResult.stderr);
  const secondResult = await runSetup(['--theme', 'minimal-light', '--backdrop', secondSource, '--out', second]);
  assert.equal(secondResult.code, 0, secondResult.stderr);

  assert.equal(heroNameFromHtml(second), heroNameFromHtml(first));
});

test('setup does not overwrite an unrelated existing backdrop file', async t => {
  const dir = tmpdir(t, 'existing');
  const source = path.join(dir, 'source.svg');
  const out = path.join(dir, 'poster.html');
  const existing = path.join(dir, 'backdrop.svg');
  writeSvg(source, 'green');
  writeSvg(existing, 'black');
  const existingContent = fs.readFileSync(existing, 'utf8');

  const result = await runSetup(['--theme', 'business-navy', '--backdrop', source, '--out', out]);
  assert.equal(result.code, 0, result.stderr);

  assert.equal(fs.readFileSync(existing, 'utf8'), existingContent);
  assert.notEqual(heroNameFromHtml(out), 'backdrop.svg');
});

test('setup succeeds when the backdrop source is already the hashed destination', async t => {
  const dir = tmpdir(t, 'source-destination');
  const source = path.join(dir, 'original.svg');
  writeSvg(source, '#abcdef');
  const hashed = path.join(dir, hashedBackdropName(source));
  fs.copyFileSync(source, hashed);

  const out = path.join(dir, 'poster.html');
  const result = await runSetup(['--theme', 'fresh-green', '--backdrop', hashed, '--out', out]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(heroNameFromHtml(out), path.basename(hashed));
  assert.equal(fs.readFileSync(hashed, 'utf8'), fs.readFileSync(source, 'utf8'));
});

test('setup rejects a colliding hashed backdrop asset and preserves it', async t => {
  const dir = tmpdir(t, 'collision');
  const source = path.join(dir, 'source.svg');
  writeSvg(source, '#00ff00');
  const destination = path.join(dir, hashedBackdropName(source));
  writeSvg(destination, '#ff00ff');
  const destinationContent = fs.readFileSync(destination, 'utf8');

  const result = await runSetup(['--theme', 'warm-market', '--backdrop', source, '--out', path.join(dir, 'poster.html')]);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Refusing to overwrite existing backdrop asset/);
  assert.equal(fs.readFileSync(destination, 'utf8'), destinationContent);
});

test('force rewriting an HTML file with a new backdrop preserves the old referenced asset', async t => {
  const dir = tmpdir(t, 'force-preserves-assets');
  const oldSource = path.join(dir, 'old.svg');
  const newSource = path.join(dir, 'new.svg');
  const out = path.join(dir, 'poster.html');
  writeSvg(oldSource, 'orange');
  writeSvg(newSource, 'purple');

  const oldResult = await runSetup(['--theme', 'minimal-light', '--backdrop', oldSource, '--out', out]);
  assert.equal(oldResult.code, 0, oldResult.stderr);
  const oldHero = heroNameFromHtml(out);
  const oldAsset = path.join(dir, oldHero);
  const oldAssetContent = fs.readFileSync(oldAsset, 'utf8');

  const newResult = await runSetup(['--theme', 'minimal-light', '--backdrop', newSource, '--out', out, '--force']);
  assert.equal(newResult.code, 0, newResult.stderr);
  const newHero = heroNameFromHtml(out);

  assert.notEqual(newHero, oldHero);
  assert.equal(fs.readFileSync(oldAsset, 'utf8'), oldAssetContent);
  assert.equal(fs.readFileSync(path.join(dir, newHero), 'utf8'), fs.readFileSync(newSource, 'utf8'));
});

test('setup treats variables used through var() as known theme variables', async t => {
  const dir = tmpdir(t, 'used-vars');
  const template = path.join(dir, 'template.html');
  const theme = path.join(dir, 'theme.css');
  const out = path.join(dir, 'poster.html');
  fs.writeFileSync(template, `<!doctype html><html><head><style>
:root{--fg:#111;--accent:#333;}
.badge{color:var(--panel-tag-fg,#fff);background:var(--accent);}
</style></head><body><main id="poster"><span class="badge">ok</span></main></body></html>`);
  fs.writeFileSync(theme, ':root{--fg:#222;--accent:#444;--panel-tag-fg:#eee;}');

  const result = await runSetup(['--theme', theme, '--template', template, '--backdrop', 'none', '--out', out]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.match(fs.readFileSync(out, 'utf8'), /--panel-tag-fg:#eee;/);
});
