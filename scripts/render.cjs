#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL, fileURLToPath } = require('node:url');

const GENERATOR = 'long-poster';
const MANIFEST = 'validation.json';
const args = { assetRoots: [] };
const help = 'node scripts/render.cjs --input poster.html --out export-dir [--plan pages.json] [--width px] [--asset-root dir] [--modules node_modules] [--browser chromium-path] [--overwrite]';

function parseArgs() {
  for (let i = 2; i < process.argv.length; i++) {
    const key = process.argv[i];
    if (key === '--help') { console.log(help); process.exit(0); }
    if (key === '--overwrite') { args.overwrite = true; continue; }
    if (!['--input', '--out', '--plan', '--width', '--modules', '--browser', '--asset-root'].includes(key) ||
        !process.argv[i + 1] || process.argv[i + 1].startsWith('--')) {
      throw Error('Unknown or missing argument: ' + key);
    }
    const value = process.argv[++i];
    if (key === '--asset-root') args.assetRoots.push(value);
    else args[key.slice(2)] = value;
  }
  if (!args.input || !args.out) throw Error('--input and --out are required.');
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

function safeExportPath(root, name) {
  if (typeof name !== 'string' || !name || name.includes('\\') || path.posix.isAbsolute(name) ||
      name.split('/').some(part => !part || part === '.' || part === '..')) {
    throw Error('Invalid path in export manifest.');
  }
  const destination = path.join(root, ...name.split('/'));
  let current = root;
  for (const part of name.split('/')) {
    current = path.join(current, part);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) {
      throw Error('Export paths must not traverse symlinks: ' + name);
    }
  }
  return destination;
}

function previousExport(out) {
  if (!fs.existsSync(out)) return [];
  if (fs.lstatSync(out).isSymbolicLink() || !fs.statSync(out).isDirectory()) {
    throw Error('Output must be a real directory.');
  }
  if (!fs.readdirSync(out).length) return [];
  if (!args.overwrite) throw Error('Output directory is not empty. Use a new version directory or --overwrite.');
  let previous;
  try { previous = JSON.parse(fs.readFileSync(path.join(out, MANIFEST), 'utf8')); }
  catch { throw Error('Overwrite requires a long-poster file manifest. Export old/untracked output to a new directory.'); }
  if (previous.generator !== GENERATOR || previous.schemaVersion !== 1 || !Array.isArray(previous.files) ||
      !previous.files.includes(MANIFEST) || new Set(previous.files).size !== previous.files.length) {
    throw Error('Unrecognized export manifest; use a new directory.');
  }
  for (const name of previous.files) {
    const p = safeExportPath(out, name);
    if (fs.existsSync(p) && !fs.statSync(p).isFile()) throw Error('Manifest entry is not a file: ' + name);
  }
  return previous.files;
}

function makeAssetInliner(input) {
  const roots = [path.dirname(input), ...args.assetRoots.map(p => fs.realpathSync(path.resolve(p)))];
  const mime = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
    '.gif': 'image/gif', '.avif': 'image/avif', '.svg': 'image/svg+xml',
    '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf'
  };
  function inlineURL(raw) {
    raw = raw.trim();
    if (!raw) throw Error('Empty asset URL.');
    if (/^data:/i.test(raw) || raw.startsWith('#')) return raw;
    // CSS-escaped URLs require a full CSS parser; reject rather than misread them.
    if (raw.includes('\\') && !path.isAbsolute(raw)) throw Error('Use unescaped asset paths or data URLs.');
    const url = path.isAbsolute(raw) ? pathToFileURL(raw) : new URL(raw, pathToFileURL(input));
    if (url.protocol !== 'file:') throw Error('Remote resources are not allowed. Save assets locally before export.');
    const asset = fs.realpathSync(fileURLToPath(url));
    if (!roots.some(root => inside(root, asset))) throw Error('Asset is outside allowed roots; add --asset-root explicitly.');
    const type = mime[path.extname(asset).toLowerCase()];
    if (!type) throw Error('Unsupported asset type: ' + path.extname(asset));
    return 'data:' + type + ';base64,' + fs.readFileSync(asset).toString('base64') + url.hash;
  }
  function inlineCSS(css) {
    if (/@import\b/i.test(css)) throw Error('Inline imported stylesheets before export.');
    return css.replace(/url\(\s*(?:"([^"\n]*)"|'([^'\n]*)'|([^)]*?))\s*\)/gi,
      (_, double, single, plain) => 'url("' + inlineURL(double ?? single ?? plain) + '")');
  }
  return { inlineURL, inlineCSS };
}

async function ready(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(async image => {
      await image.decode();
      if (!image.naturalWidth) throw Error('Image failed to load: ' + image.alt);
    }));
    const urls = new Set();
    for (const element of document.querySelectorAll('*')) {
      for (const match of getComputedStyle(element).backgroundImage.matchAll(/url\(["']?([^"')]+)["']?\)/g)) urls.add(match[1]);
    }
    await Promise.all([...urls].map(async src => {
      const image = new Image();
      image.src = src;
      try { await image.decode(); }
      catch { throw Error('Background image failed to load'); }
    }));
  });
}

async function checkText(page, selector) {
  return page.evaluate(selector => {
    const problems = [];
    for (const root of document.querySelectorAll(selector)) {
      const limit = root.getBoundingClientRect();
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (!node.textContent.trim() || node.parentElement.closest('style,script,[data-decorative]') ||
            getComputedStyle(node.parentElement).visibility === 'hidden') continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of range.getClientRects()) {
          if (!rect.width || !rect.height) continue;
          let clipped = rect.left < limit.left - 2 || rect.right > limit.right + 2 ||
            rect.top < limit.top - 2 || rect.bottom > limit.bottom + 2;
          for (let element = node.parentElement; element && element !== root; element = element.parentElement) {
            const style = getComputedStyle(element), box = element.getBoundingClientRect();
            // display:contents has no clipping box, even if its CSS says overflow:hidden.
            if (style.display === 'contents') continue;
            if (/hidden|clip/.test(style.overflowX) && (rect.left < box.left - 2 || rect.right > box.right + 2)) clipped = true;
            if (/hidden|clip/.test(style.overflowY) && (rect.top < box.top - 2 || rect.bottom > box.bottom + 2)) clipped = true;
          }
          if (clipped) { problems.push(node.textContent.trim().slice(0, 90)); break; }
        }
      }
    }
    return [...new Set(problems)];
  }, selector);
}

function commitExport(stage, out, files, oldFiles) {
  // The previous export stays intact until rendering succeeds. Backups permit rollback
  // on ordinary filesystem errors during installation; unrelated files are untouched.
  fs.mkdirSync(out, { recursive: true });
  const owned = new Set(oldFiles);
  for (const name of files) {
    const destination = safeExportPath(out, name);
    if (fs.existsSync(destination) && !owned.has(name)) throw Error('Refusing to replace an untracked file: ' + name);
  }
  const backup = fs.mkdtempSync(path.join(path.dirname(out), '.long-poster-backup-'));
  const moved = [], installed = [];
  try {
    for (const name of oldFiles) {
      const source = safeExportPath(out, name);
      if (!fs.existsSync(source)) continue;
      const dest = path.join(backup, name);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.renameSync(source, dest); moved.push(name);
    }
    // Manifest is installed last, after all the assets it describes.
    for (const name of [...files.filter(n => n !== MANIFEST), MANIFEST]) {
      const destination = safeExportPath(out, name);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.renameSync(path.join(stage, name), destination); installed.push(name);
    }
  } catch (error) {
    for (const name of installed.reverse()) fs.rmSync(path.join(out, name), { force: true });
    for (const name of moved) {
      const destination = path.join(out, name);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.renameSync(path.join(backup, name), destination);
    }
    throw error;
  } finally {
    fs.rmSync(backup, { recursive: true, force: true });
  }
  const slides = path.join(out, 'slides');
  if (fs.existsSync(slides) && fs.statSync(slides).isDirectory() && !fs.readdirSync(slides).length) fs.rmdirSync(slides);
}

async function main() {
  parseArgs();
  const moduleRoot = args.modules || process.env.POSTER_NODE_MODULES;
  const dependency = name => require(moduleRoot ? path.join(path.resolve(moduleRoot), name) : name);
  const { chromium } = dependency('playwright'), sharp = dependency('sharp');
  const input = fs.realpathSync(path.resolve(args.input)), out = path.resolve(args.out);
  const html = fs.readFileSync(input, 'utf8');
  if (/<(?:script|iframe|object|embed|base)\b/i.test(html) || /<meta\b[^>]*http-equiv/i.test(html)) {
    throw Error('Use static HTML without scripts, embedded documents, base tags, or meta navigation.');
  }
  const plan = args.plan ? JSON.parse(fs.readFileSync(path.resolve(args.plan), 'utf8')) : null;
  // Without a page plan the poster is a single image (long poster or fixed-size single
  // page); --width lets its #poster differ from the 1080 default.
  if (args.width !== undefined && !/^\d+$/.test(args.width)) throw Error('--width must be a positive integer.');
  const width = plan?.width ?? (args.width !== undefined ? Number(args.width) : 1080);
  const height = plan?.height ?? 1440, minScale = plan?.minScale ?? 0.82;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 320 || height < 320 ||
      !Number.isFinite(minScale) || minScale <= 0 || minScale > 1) throw Error('Invalid output size/minScale.');
  if (plan && (!Array.isArray(plan.pages) || !plan.pages.length)) throw Error('plan.pages must be a non-empty array.');
  const oldFiles = previousExport(out);
  const { inlineURL, inlineCSS } = makeAssetInliner(input);
  let browser, stage;
  try {
    const executablePath = args.browser || process.env.POSTER_BROWSER;
    browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath: path.resolve(executablePath) } : {}) });
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, javaScriptEnabled: false, serviceWorkers: 'block' });
    // Install this before parsing any supplied markup. No remote/file resource request
    // is needed: supported local assets are read below, checked, and embedded as data.
    await context.route('**/*', route => route.abort());
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    if (await page.locator('script,iframe,object,embed,base,link[rel="stylesheet"],meta[http-equiv]').count()) {
      throw Error('Use static HTML and inline stylesheets.');
    }
    await page.evaluate(() => {
      for (const element of document.querySelectorAll('*')) {
        for (const attribute of [...element.attributes]) {
          if (/^on/i.test(attribute.name)) element.removeAttribute(attribute.name);
          if (['href', 'action', 'formaction'].includes(attribute.name) && /^javascript:/i.test(attribute.value.trim())) element.removeAttribute(attribute.name);
        }
      }
    });
    const assets = await page.evaluate(() => ({
      images: [...document.images].map(image => ({ src: image.getAttribute('src'), srcset: image.getAttribute('srcset') })),
      styles: [...document.querySelectorAll('style')].map(e => e.textContent),
      inline: [...document.querySelectorAll('[style]')].map(e => e.getAttribute('style'))
    }));
    if (assets.images.some(image => image.srcset)) throw Error('Use one explicit image src, not srcset.');
    const embedded = {
      images: assets.images.map(image => inlineURL(image.src || '')),
      styles: assets.styles.map(inlineCSS), inline: assets.inline.map(inlineCSS)
    };
    await page.evaluate(data => {
      document.querySelectorAll('img').forEach((e, i) => e.src = data.images[i]);
      document.querySelectorAll('style').forEach((e, i) => e.textContent = data.styles[i]);
      document.querySelectorAll('[style]').forEach((e, i) => e.setAttribute('style', data.inline[i]));
    }, embedded);
    await ready(page);
    const root = page.locator('#poster');
    if (await root.count() !== 1) throw Error('Source must have one #poster root.');
    const bounds = await root.boundingBox();
    if (!bounds || Math.abs(bounds.width - width) > 1) throw Error('Source #poster width must match configured width.');
    const longErrors = await checkText(page, '#poster');
    if (longErrors.length) throw Error('Long poster clipped text: ' + JSON.stringify(longErrors));
    const source = await page.content(), longBuffer = await root.screenshot();
    const rendered = [];
    let pagesHTML = null;
    if (plan) {
      const inherited = await page.evaluate(() => {
        const poster = getComputedStyle(document.querySelector('#poster'));
        const body = getComputedStyle(document.body), html = getComputedStyle(document.documentElement);
        const transparent = color => color === 'rgba(0, 0, 0, 0)' || color === 'transparent';
        const surface = [poster, body, html].find(s => s.backgroundImage !== 'none' || !transparent(s.backgroundColor));
        return { background: surface ? surface.background : '#ffffff', color: poster.color,
          fontFamily: poster.fontFamily, border: poster.color };
      });
      const theme = { ...inherited, ...plan.theme };
      for (const property of ['background', 'color', 'border']) {
        if (typeof theme[property] !== 'string' || /[;{}<>]|url\s*\(/i.test(theme[property]) && property !== 'background') throw Error('Invalid theme ' + property);
      }
      // Background may include an already embedded source image; explicitly supplied
      // theme images must go through the same local asset policy.
      if (plan.theme?.background) theme.background = inlineCSS(plan.theme.background);
      const content = [];
      for (const [i, item] of plan.pages.entries()) {
        if (typeof item.name !== 'string' || !/^[\p{L}\p{N} _-]+$/u.test(item.name) ||
            !Array.isArray(item.selectors) || !item.selectors.length) throw Error('Each page needs a valid name and selectors.');
        const snippets = [];
        for (const selector of item.selectors) {
          const nodes = page.locator(selector);
          if (await nodes.count() !== 1) throw Error('Each selector must match exactly one element: ' + selector);
          snippets.push(await nodes.evaluate(e => e.outerHTML));
        }
        const selectedHTML = (item.wrap ? '<section>' : '') + snippets.join('') + (item.wrap ? '</section>' : '');
        // Keep #poster selectors, root attributes and inherited custom properties.
        // Its long-canvas box must not contribute height/padding to an extracted page.
        // As with repeated selected blocks, static pages may repeat source IDs.
        const selected = await root.evaluate((poster, { html, color }) => {
          const shell = poster.cloneNode(false);
          shell.style.setProperty('display', 'contents', 'important');
          if (color !== undefined) shell.style.setProperty('color', color);
          shell.innerHTML = html;
          return shell.outerHTML;
        }, { html: selectedHTML, color: plan.theme?.color });
        content.push({ name: item.name, html: `<div class="cp-page" id="cp-${i}">${item.cover ? selected : `<div class="cp-head">${escapeHTML(plan.title || '')}<span>${String(i + 1).padStart(2, '0')} / ${String(plan.pages.length).padStart(2, '0')}</span></div><div class="cp-slot"><div class="cp-content">${selected}</div></div><div class="cp-foot">${escapeHTML(plan.footer || '')}</div>`}</div>` });
      }
      const css = `html,body{margin:0;width:${width}px}.cp-page{position:relative;width:${width}px;height:${height}px;overflow:hidden}.cp-head{position:absolute;left:64px;right:64px;top:40px;height:62px;font-size:25px;border-bottom:1px solid;display:flex;justify-content:space-between}.cp-slot{position:absolute;top:125px;left:0;width:${width}px;height:${height - 220}px}.cp-content{position:absolute;width:${width}px;transform-origin:top left}.cp-foot{position:absolute;left:64px;right:64px;bottom:30px;font-size:23px;border-top:1px solid;padding-top:16px}.cp-content section{padding-top:20px;padding-bottom:20px}`;
      await page.setContent('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>' + embedded.styles.join('\n') + css + '</style></head><body>' + content.map(item => item.html).join('') + '</body></html>', { waitUntil: 'domcontentloaded' });
      await page.evaluate(theme => {
        for (const element of document.querySelectorAll('.cp-page')) {
          element.style.background = theme.background;
          element.style.color = theme.color;
          element.style.fontFamily = theme.fontFamily;
          if (!element.style.background || !element.style.color) throw Error('Invalid theme color/background.');
        }
        for (const element of document.querySelectorAll('.cp-head,.cp-foot')) element.style.borderColor = theme.border;
      }, theme);
      await ready(page);
      await page.locator('.cp-content').evaluateAll((elements, { width, space, minScale }) => {
        for (const element of elements) {
          const h = element.scrollHeight, scale = Math.min(1, space / h);
          if (scale < minScale) throw Error('Page too dense; regroup content: ' + element.closest('.cp-page').id + ' scale=' + scale.toFixed(3));
          element.style.transform = `scale(${scale})`;
          element.style.left = (width - width * scale) / 2 + 'px';
          element.style.top = Math.max(0, (space - h * scale) / 2) + 'px';
        }
      }, { width, space: height - 220, minScale });
      const errors = await checkText(page, '.cp-page');
      if (errors.length) throw Error('Slides clipped text: ' + JSON.stringify(errors));
      pagesHTML = await page.content();
      for (const [i, item] of content.entries()) rendered.push({ name: String(i + 1).padStart(2, '0') + '-' + item.name, buffer: await page.locator('#cp-' + i).screenshot() });
    }
    fs.mkdirSync(path.dirname(out), { recursive: true });
    stage = fs.mkdtempSync(path.join(path.dirname(out), '.long-poster-stage-'));
    const files = ['poster.html', 'poster.png', 'poster.jpg'];
    fs.writeFileSync(path.join(stage, 'poster.html'), source);
    await sharp(longBuffer).png().toFile(path.join(stage, 'poster.png'));
    await sharp(longBuffer).jpeg({ quality: 96, chromaSubsampling: '4:4:4' }).toFile(path.join(stage, 'poster.jpg'));
    if (pagesHTML) {
      fs.writeFileSync(path.join(stage, 'pages.html'), pagesHTML); files.push('pages.html');
      fs.mkdirSync(path.join(stage, 'slides'));
      for (const item of rendered) {
        const name = 'slides/' + item.name + '.jpg'; files.push(name);
        await sharp(item.buffer).jpeg({ quality: 96, chromaSubsampling: '4:4:4' }).toFile(path.join(stage, name));
      }
      const tw = 240, th = Math.round(height / width * tw), gap = 12;
      const cols = Math.min(3, rendered.length), rows = Math.ceil(rendered.length / cols);
      const thumbs = await Promise.all(rendered.map(async (item, i) => ({
        input: await sharp(item.buffer).resize(tw, th).png().toBuffer(),
        left: gap + i % cols * (tw + gap), top: gap + Math.floor(i / cols) * (th + gap)
      })));
      await sharp({ create: { width: cols * (tw + gap) + gap, height: rows * (th + gap) + gap, channels: 3, background: '#e7e9ed' } })
        .composite(thumbs).png().toFile(path.join(stage, 'overview.png'));
      files.push('overview.png');
    }
    files.push(MANIFEST);
    const report = { generator: GENERATOR, schemaVersion: 1, source: path.basename(input), width,
      longHeight: Math.round(bounds.height), pageSize: plan ? [width, height] : null, pageCount: rendered.length,
      imagesLoaded: true, clippedText: [], visualReviewRequired: true, qrScanTested: false, files };
    fs.writeFileSync(path.join(stage, MANIFEST), JSON.stringify(report, null, 2) + '\n');
    commitExport(stage, out, files, oldFiles);
    console.log(JSON.stringify(report));
  } finally {
    if (stage) fs.rmSync(stage, { recursive: true, force: true });
    if (browser) await browser.close();
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
