# 爆款海报生成器 · Viral Poster Generator

**Give your AI assistant the copy and assets. Get long posters, single posters or slide sets you can keep editing.**

An open-source project by **星辰汇 · 星辰AI增长** · Author: allenlion · Version: 1.0 · [MIT](LICENSE) · [中文说明](README.md)

For course promotions, events, product introductions and community content. Install this skill in an AI assistant that can read and write files and run commands, then describe the result you want in ordinary language.

## What you get

| Your goal | Deliverables |
| --- | --- |
| A long event poster | A complete JPG / PNG image |
| A single social post | A poster at your chosen ratio, such as 3:4 or 9:16 |
| A multi-image post | Numbered images, an overview and a ZIP archive |
| Changes to a previous design | Updated images and an editable HTML source |

Nine-card posts require an explicit nine-page content plan. Cutting a single master image into a 3×3 grid is not supported.

## Quick install

Send this to Codex, Claude Code or another assistant that can manage files and execute commands:

```text
Install Viral Poster Generator (爆款海报生成器):
https://github.com/ALLENLION35/baokuan-poster-generator

Read the README and install the complete skill directory for this application.
Check and prepare the export environment: Node.js 22+, Python 3, npm dependencies,
Chromium and Chinese fonts. Reuse a suitable existing environment where available.
Confirm that baokuan-poster-generator is discoverable, run the built-in demo,
and show me the image preview and output file locations.
```

Installation is checked when the demo produces real poster and slide files. The first setup may download dependencies and a browser; time depends on your existing environment and network.

[Download the full 1.0 skill package](https://github.com/ALLENLION35/baokuan-poster-generator/releases/download/v1.0.0/baokuan-poster-generator-1.0.0.zip) · [Release page](https://github.com/ALLENLION35/baokuan-poster-generator/releases/tag/v1.0.0)

A text-only chat cannot run the image exporter. Uploading only `SKILL.md` does not install the complete toolkit.

## Start using it

Open a new conversation after installation, attach your copy and assets, then try one of these:

**Long poster**

```text
Use baokuan-poster-generator to make a Chinese long poster from the attached event copy.
The audience is business owners. Keep the design simple and refined.
Preserve the date, location, price and registration details. Deliver a JPG and editable source.
```

**Single poster**

```text
Make a 3:4 social poster using the attached copy, logo and product photo.
Follow the logo colours, highlight the selling points and price,
and place my supplied contact QR code at the bottom.
```

**Nine-card post**

```text
Use baokuan-poster-generator to organise this content into nine 1080×1440 cards.
Start with a cover, give each middle card one topic, and end with a summary and my call to action.
Keep the style consistent and preserve key facts. If the content is insufficient or too dense,
explain the adjustment needed. Deliver numbered images, an overview and a ZIP.
```

**Revise a design**

```text
Revise the last version: make the headline stronger, shorten the second section,
and use warmer colours. Keep the approved photos and event facts. Export the updated files.
```

When continuing in a new conversation, provide the latest `poster.html` so the assistant can edit the current version.

## What to provide

Start with your copy and intended channel. Add a logo, brand colours, people or product photos, a real QR code and reference images if available. Identify people in photos when multiple people are involved. References guide visual style; their names, prices and claims are not facts about your event.

No reference image is required. Describe the mood, audience and purpose instead.

## Examples

These examples use fictional event and person details. Results depend on the copy, assets, assistant and revisions.

![Three event cover examples](examples/real-runs.png)

<details>
<summary>View six preset colour styles</summary>

![Six preset themes](examples/themes.png)

The presets cover technology, minimal, festive, market, natural and business styles. They primarily control colours and visual tone. A colourful logo can supply the brand palette.

</details>

## Other installation methods

### With skills CLI

With Node.js 22+ and npm available, run:

```sh
npx skills add ALLENLION35/baokuan-poster-generator --skill baokuan-poster-generator
```

Choose your agent at the prompt. Installation is project-scoped by default; add `--global` for use across projects. See the [official skills CLI documentation](https://github.com/vercel-labs/skills).

This installs skill files, not the rendering dependencies. Ask the assistant to complete the environment and demo checks above, or use the manual steps below.

### From the ZIP

Extract the release package to obtain `baokuan-poster-generator/`. Ask your assistant to install that complete folder or follow your host's skill-directory instructions. Keep all scripts, assets, themes, references and dependency manifests.

If your application has a skill-import feature, follow its instructions. Importing the files does not guarantee that its environment can run the exporter; clients have not all been tested.

### Prepare the rendering environment manually

In the actual installed skill directory containing `package.json`, run:

```sh
npm ci
npx playwright install chromium
npm run demo
python3 scripts/pack.py outputs/demo
```

Node.js 22+, Python 3 and Chinese fonts are required. Open `outputs/demo/poster.jpg`, `outputs/demo/overview.png` and `outputs/demo/slides.zip` to inspect the result. For Linux system dependencies, repeated demo runs and Windows limitations, see the [CLI guide](docs/CLI.en.md).

## Common questions

**Do I need to code?** With a capable AI assistant, you can describe the work and let it install, design, export and revise the files.

**Why does export fail after installation?** Skill files and runtime dependencies are separate. Give the error to the assistant and ask it to check Node.js, Python, npm dependencies, Chromium and fonts.

**Do I need an image-generation API?** Basic layout and export do not require one. The toolkit can create programmatic backdrops without external image generation. Your AI application's own fees still apply.

**Why does an existing output directory cause an error?** Existing deliverables are preserved by default. Export the revision to a new directory; see the CLI guide for commands.

**Can I publish immediately?** Inspect the layout, dates, prices, photo/name matches and actual QR scanning first. Automated checks cover issues such as image loading and text clipping, not final factual or visual approval.

**Will my posters include the project's QR code?** The community QR is only for project documentation. Your posters use your supplied assets and contact information.

## Learn more and contribute

- [Command-line guide](docs/CLI.en.md): themes, brand colours, HTML editing, page plans and export commands.
- [Skill instructions](SKILL.md) · [Changelog](CHANGELOG.md) · [Roadmap](ROADMAP.md) · [Contributing](CONTRIBUTING.md) · [Report an issue](https://github.com/ALLENLION35/baokuan-poster-generator/issues)

Version 1.0 passed 35 tests locally on macOS and in [Ubuntu CI](https://github.com/ALLENLION35/baokuan-poster-generator/actions/runs/34823128808). This does not establish compatibility with every client or validate the visual quality of every input.

[MIT License](LICENSE) · [Asset sources](ASSET_SOURCES.md) · [Third-party notices](THIRD_PARTY_NOTICES.md) · [Security policy](SECURITY.md)

## Community and feedback

**星辰汇 · 星辰AI增长 — Poster creation and AI growth community**

Share your work, ask questions and suggest improvements. Scan the QR code to add the maintainer on WeChat and request a group invitation. Mention “爆款海报生成器” when adding the contact.

<img src="assets/feedback-wechat-qr.jpg" alt="星辰汇 and 星辰AI增长: add the maintainer on WeChat to request a group invitation" width="320" />

X: [allenlion · @ALLENLION35](https://x.com/ALLENLION35)
