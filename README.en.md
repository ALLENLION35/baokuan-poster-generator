# 爆款海报生成器 · Viral Poster Generator

**An open-source project associated with 星辰汇 and 星辰AI增长.**

Viral Poster Generator (`baokuan-poster-generator`) is an Agent Skill and local HTML rendering toolkit for Chinese event posters. It helps an AI assistant turn event copy and local assets into an editable static HTML source, then exports a long poster, a fixed-size poster, or a set of numbered social-media slides.

Current version: `1.0.0`. License: MIT.

中文说明: [README.md](README.md)

![Six preset themes](examples/themes.png)

![Three fictional event runs](examples/real-runs.png)

## What It Does

- Exports a 1080px-wide long poster for WeChat articles and private sharing.
- Exports a fixed-size single poster when the source `#poster` has a target canvas size.
- Exports slide sets from the same HTML source using a JSON page plan.
- Derives a full theme from a colourful logo, or falls back to six preset themes.
- Generates deterministic text-free SVG backdrops with Python standard library only.
- Renders locally with Playwright and Sharp.
- Inlines local assets, blocks remote requests, checks image loading and text clipping, and writes a `validation.json` manifest.

It is not a visual editor and not an automatic nine-page storytelling engine. A nine-card set can be produced with an explicit page plan, but page count, grouping, and visual judgement still depend on the AI assistant or the human operator.

## Requirements

- Node.js 22+
- Python 3
- npm
- Chromium for Playwright
- Noto CJK or another Chinese font on Linux

Install dependencies:

```sh
npm ci
npx playwright install chromium
```

Run tests:

```sh
npm test
```

Render the built-in demo:

```sh
npm run demo
python3 scripts/pack.py outputs/demo
```

If `outputs/demo` already exists, render to a new directory or pass `--overwrite` intentionally:

```sh
node scripts/render.cjs --input assets/template.html --plan examples/pages.json --out outputs/demo-v2
python3 scripts/pack.py outputs/demo-v2
```

## Use As An Agent Skill

Place the repository directory in your AI assistant's skill folder, for example:

| Host | Folder |
| --- | --- |
| Claude Code | `~/.claude/skills/baokuan-poster-generator/` |
| Codex | `~/.agents/skills/baokuan-poster-generator/` |
| Other Agent Skills hosts | Follow the host documentation |

Example prompts:

```text
Use baokuan-poster-generator to turn this event copy into a WeChat long poster and a slide set.
```

```text
Create a 3:4 single poster from the attached copy and logo. Follow the logo colours and make the price prominent.
```

Provide the event copy, logo, photos, QR code, and optional reference images. Reference images are used only for visual direction; their names, prices, testimonials, and facts are not copied into the poster.

The full skill instructions are in [SKILL.md](SKILL.md).

## CLI Workflow

Create local work directories first:

```sh
mkdir -p work outputs
```

Create a themed source file. Choose either the preset-theme route or the brand-theme route before writing the source file; `setup.py` refuses to overwrite an existing output by default.

```sh
python3 scripts/backdrop.py --style grid --bg "#08131c" --accent "#0b4f8a" --accent2 "#f1a300" --seed 4 --out work/backdrop.svg
python3 scripts/setup.py --theme business-navy --backdrop work/backdrop.svg --out work/poster.html
```

Optional alternative: derive a brand theme from a colourful logo. Put the user-provided logo at `work/assets/logo.png` first:

```sh
node scripts/palette.cjs work/assets/logo.png --base business-navy --theme-out work/brand.css
python3 scripts/setup.py --theme work/brand.css --backdrop none --out work/brand-poster.html
```

If the palette report says `isColorful: false`, the logo does not drive the theme. Pick a preset by event type instead. If you decide to use the brand theme, keep editing `work/brand-poster.html`, or change the output path to a `work/poster.html` that does not already exist. Later render commands should use the source path you actually edited.

Export a long poster:

```sh
node scripts/render.cjs --input work/poster.html --out outputs/long-v1
```

Export a long poster and slides:

```sh
cp examples/pages.json work/pages.json
node scripts/render.cjs --input work/poster.html --plan work/pages.json --out outputs/slides-v1
python3 scripts/pack.py outputs/slides-v1
```

Allow extra local asset folders:

```sh
node scripts/render.cjs --input work/poster.html --plan work/pages.json --asset-root work/assets --out outputs/slides-v1
```

The renderer refuses non-empty output directories by default. Use a new version directory for revisions, or pass `--overwrite` only when you mean to replace an existing baokuan-poster-generator export.

## Page Plan

Slides are built from a JSON plan. Each selector must match one complete content block in the source HTML:

```json
{
  "width": 1080,
  "height": 1440,
  "minScale": 0.82,
  "title": "Event poster sample",
  "footer": "Use the actual date and location from the copy",
  "pages": [
    {"name": "Cover", "selectors": ["#cover"], "cover": true},
    {"name": "Overview", "selectors": ["#overview", "#audience"]},
    {"name": "Highlights", "selectors": ["#highlights"], "wrap": true},
    {"name": "Speakers", "selectors": ["#people"]},
    {"name": "Registration", "selectors": ["#action"]}
  ]
}
```

Do not force dense content into one page by lowering `minScale`. Split the content, reduce nonessential decoration, or simplify the layout.

## Output

A baokuan-poster-generator export includes:

- `poster.html`
- `poster.png`
- `poster.jpg`
- `validation.json`

A slide export also includes:

- `pages.html`
- `slides/*.jpg`
- `overview.png`
- `slides.zip` after running `scripts/pack.py`

`validation.json` records the generator, schema version, owned files, canvas sizes, page count, and review flags. Script validation is not final editorial review: names, facts, photo matching, and QR scanning still need human confirmation.

For a fixed-size single poster, first edit the source `#poster` to the target canvas size, then declare that width at export time:

```sh
node scripts/render.cjs --input work/single.html --width 1242 --out outputs/single-v1
```

## Repository Layout

```text
SKILL.md                  Agent Skill entry point
references/styling.md     Themes, brand colours, and backdrops
references/workflow.md    Work files, asset mapping, and content rules
references/rendering.md   Renderer API, page plans, and validation
assets/template.html      Static HTML template
themes/*.css              Six preset themes
scripts/palette.cjs       Logo colour extraction and theme derivation
scripts/backdrop.py       Procedural SVG backdrop generator
scripts/setup.py          Theme + backdrop -> HTML source
scripts/render.cjs        Render, validate, and export
scripts/pack.py           Package slide JPGs into ZIP
examples/                 Example plans and images
tests/                    Node test regression suite
```

## Boundaries

- Works with local trusted HTML and user-provided local assets.
- Blocks scripts, iframes, external CSS, and remote resources during export.
- Does not claim to be a general-purpose HTML sandbox.
- Does not publish anywhere or connect to accounts.
- Does not redraw real people.
- Does not generate fake scannable QR codes.

## Verification

The `1.0.0` release files were validated locally on macOS with Node 24.11.1, Playwright 1.62.1, Sharp 0.35.4, and an existing Chromium 148 browser. The suite passed 35/35 tests, the built-in demo rendered a long poster plus five slides and ZIP packaging, and two brand-colour workflows were rendered through long poster, five slides, and ZIP packaging.

Linux and Windows were not rerun in that validation pass. Remote CI results should be treated as authoritative after the repository is published.

## License

MIT. See [LICENSE](LICENSE). Author: 梁海龙 (allenlion).

Project docs: [CHANGELOG.md](CHANGELOG.md), [RELEASE_NOTES.md](RELEASE_NOTES.md), [ROADMAP.md](ROADMAP.md), [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Community · 星辰汇 · 星辰AI增长

Join the 星辰汇 and 星辰AI增长 community to exchange AI poster workflows, content ideas, growth practices, and project feedback.

Scan the QR code to add the maintainer on WeChat and request an invitation to the discussion group. Mention “爆款海报生成器” when adding the contact.

<img src="assets/feedback-wechat-qr.jpg" alt="星辰汇 and 星辰AI增长 community: add WeChat contact and request a group invitation" width="320" />

X: [allenlion · @ALLENLION35](https://x.com/ALLENLION35)
