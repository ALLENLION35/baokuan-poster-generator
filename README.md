# 爆款海报生成器

**星辰汇 · 星辰AI增长 开源项目**

爆款海报生成器（`baokuan-poster-generator`）是一个把活动文案和本地素材做成中文长图海报、单页海报和同源组图的 Agent Skill。它把内容组织交给 AI 助手，把排版源稿落成静态 HTML，再用本地 Playwright + Sharp 导出待复核的 JPG/PNG 和组图 ZIP。

当前版本：`1.0.0`。本项目按 MIT 许可证开源。

English: [README.en.md](README.en.md)

![六个预设主题的封面对比](examples/themes.png)

![三份虚构活动文案的实跑封面](examples/real-runs.png)

## 适合什么

- 公众号长图：宽 1080px，高度随内容增长，适合文章内嵌、私域转发。
- 朋友圈或群公告单页：固定比例的一张图，例如 3:4 或 9:16。
- 微信组图：从同一份 HTML 源稿拆出多张 1080x1440 编号小图，再打包 ZIP。
- 课程、沙龙、发布会、招募、促销、市集、展览、品牌介绍等中文营销物料。

它不是 Canva 式可视化编辑器，也不是自动 9 页叙事引擎。9 宫图可以通过明确分页方案制作，但页数、信息分组和视觉取舍仍需要 AI 或人工根据文案判断；项目也不做 3x3 母画布切格。

## 核心能力

- **同源交付**：长图、单页和组图都可以来自同一份可继续修改的 `poster.html`。
- **品牌色派生**：彩色 Logo 可通过 `scripts/palette.cjs` 派生整套主题；黑白 Logo 不驱动配色，按活动类型选预设。
- **六套预设主题**：`tech-violet`、`minimal-light`、`guochao-red-gold`、`warm-market`、`fresh-green`、`business-navy`。它们是颜色和气质预设，不是六套完全不同的版式系统。
- **程序化底图**：`scripts/backdrop.py` 用标准库生成无文字、无商标、可复现的 SVG 底图。
- **本地渲染验证**：渲染器会内嵌本地图片和字体、阻断远程资源、检查图片加载、文字裁切、画布宽度和组图缩放阈值。
- **可追溯输出**：每次导出包含 `validation.json` 文件清单，组图 ZIP 只打包清单里的已验证小图。

脚本验证不等于最终视觉验收。姓名和照片是否对应、二维码是否能扫、文案事实是否完整，发布前仍需要人工确认；清单中的 `qrScanTested: false` 就是在提醒这件事。

## 快速开始

环境要求：

- Node.js 22+
- Python 3
- npm
- Chromium for Playwright
- Linux 环境建议安装 Noto CJK 字体

首次安装依赖：

```sh
npm ci
npx playwright install chromium
```

运行测试：

```sh
npm test
```

渲染内置演示：

```sh
npm run demo
python3 scripts/pack.py outputs/demo
```

`npm run demo` 会生成 `outputs/demo`。如果该目录已经存在，换一个新的输出目录运行 `scripts/render.cjs`，或在确认要覆盖时加 `--overwrite`。

```sh
node scripts/render.cjs --input assets/template.html --plan examples/pages.json --out outputs/demo-v2
python3 scripts/pack.py outputs/demo-v2
```

生成六个主题的封面对比：

```sh
npm run demo:themes
```

## 作为 Agent Skill 使用

把整个仓库目录放进支持 Agent Skills 的宿主目录，例如：

| 宿主 | 目录 |
| --- | --- |
| Claude Code | `~/.claude/skills/baokuan-poster-generator/` |
| Codex | `~/.agents/skills/baokuan-poster-generator/` |
| 其他宿主 | 以宿主文档为准 |

然后把文案和素材交给 AI 助手，说清输出渠道即可：

```text
用爆款海报生成器，把这份活动文案做成公众号长图，再拆成微信组图。
```

```text
用附件里的文案和 Logo 做一张 3:4 朋友圈海报，整体跟 Logo 的颜色走，价格要显眼。
```

```text
做成 5 页微信组图，第一页封面，最后一页放二维码和报名信息。
```

建议提供：

- 活动文案：时间、地点、价格、名额、报名方式、嘉宾身份等硬事实。
- Logo：彩色 Logo 会影响整套配色；黑白 Logo 只作为视觉资产使用。
- 照片：人物、产品、场地或品牌主视觉。
- 二维码：报名码、群码或客服码。没有二维码时说明缺失，不生成假码。
- 参考图：只参考风格，不复制其中的人名、价格、案例或评价。

Skill 的完整工作规则在 [SKILL.md](SKILL.md)，渲染接口在 [references/rendering.md](references/rendering.md)，定调规则在 [references/styling.md](references/styling.md)。

## 命令行流程

以下命令都在仓库根目录执行。工作稿建议放在 `work/`，成品放在 `outputs/`；这两个目录不会被提交。

```sh
mkdir -p work outputs
```

1. 从主题和底图生成 HTML 源稿。选择预设主题或品牌主题其中一种路线，不要连续写同一个 `work/poster.html`，因为 `setup.py` 默认拒绝覆盖已有源稿。

```sh
python3 scripts/backdrop.py --style grid --bg "#08131c" --accent "#0b4f8a" --accent2 "#f1a300" --seed 4 --out work/backdrop.svg
python3 scripts/setup.py --theme business-navy --backdrop work/backdrop.svg --out work/poster.html
```

如果有照片或场地图作为封面底图：

```sh
python3 scripts/setup.py --theme minimal-light --backdrop work/assets/venue.jpg --hero-size cover --out work/poster.html
```

如果不需要底图：

```sh
python3 scripts/setup.py --theme warm-market --backdrop none --out work/poster.html
```

2. 可选：从彩色 Logo 派生品牌主题，替代上面的预设主题路线。先把用户提供的 Logo 放到 `work/assets/logo.png`。

```sh
node scripts/palette.cjs work/assets/logo.png --base business-navy --theme-out work/brand.css
python3 scripts/setup.py --theme work/brand.css --backdrop none --out work/brand-poster.html
```

如果报告中 `isColorful` 为 `false`，脚本不会写出品牌主题；直接按活动类型选择预设主题。确定用品牌主题后，可以继续编辑 `work/brand-poster.html`，或把输出路径改回尚不存在的 `work/poster.html`。后续渲染命令也要把 `--input work/poster.html` 换成你实际编辑的品牌源稿路径。

3. 编辑 `work/poster.html`。

把示例文字替换成真实文案，放入 Logo、照片和二维码。常用区块 ID：

- `#cover`：封面
- `#overview`：概览
- `#highlights`：亮点
- `#people`：人物
- `#audience`：适合人群
- `#action`：报名或购买行动区

4. 导出长图。

```sh
node scripts/render.cjs --input work/poster.html --out outputs/long-v1
```

5. 导出长图和组图。

```sh
cp examples/pages.json work/pages.json
node scripts/render.cjs --input work/poster.html --plan work/pages.json --out outputs/slides-v1
python3 scripts/pack.py outputs/slides-v1
```

6. 导出固定宽度单页。

`--width` 只声明源稿实际宽度，不会自动把长图重排成单页。先把 `#poster` 写成目标画布尺寸，例如 1242x1660，再导出：

```sh
node scripts/render.cjs --input work/single.html --width 1242 --out outputs/single-v1
```

如果素材不在 HTML 同目录下，用 `--asset-root` 授权额外本地素材目录：

```sh
node scripts/render.cjs --input work/poster.html --plan work/pages.json --asset-root work/assets --out outputs/slides-v1
```

导出目录非空会报错，这是为了避免误覆盖旧成品。确认覆盖同一个 baokuan-poster-generator 导出目录时可加 `--overwrite`。

## 分页方案

组图由 JSON 分页方案控制。每页用 CSS 选择器从源稿抽取完整区块：

```json
{
  "width": 1080,
  "height": 1440,
  "minScale": 0.82,
  "title": "活动海报示例",
  "footer": "日期与地点以实际文案为准",
  "pages": [
    {"name": "封面", "selectors": ["#cover"], "cover": true},
    {"name": "活动概览", "selectors": ["#overview", "#audience"]},
    {"name": "活动亮点", "selectors": ["#highlights"], "wrap": true},
    {"name": "主讲与嘉宾", "selectors": ["#people"]},
    {"name": "报名与参与", "selectors": ["#action"]}
  ]
}
```

页数由内容决定。轻量活动常见 4 到 5 页；内容多就继续拆页。不要为了凑固定页数删关键事实，也不要靠调低 `minScale` 把过密内容硬塞进一页。

## 输出文件

长图导出目录通常包含：

- `poster.html`：内嵌本地资产后的可流转源稿
- `poster.png`
- `poster.jpg`
- `validation.json`

组图导出还会包含：

- `pages.html`
- `slides/*.jpg`
- `overview.png`
- `slides.zip`，运行 `scripts/pack.py` 后生成

`validation.json` 记录导出器、schema 版本、文件清单、尺寸、页数和人工复核提醒。继续修改时应改 `poster.html` 源稿，而不是改 `pages.html` 派生成品。

## 仓库结构

```text
SKILL.md                  Agent Skill 入口说明
references/styling.md     主题、品牌色和底图规则
references/workflow.md    工作文件、资产映射和内容压缩约定
references/rendering.md   渲染器接口、分页方案和验证清单
assets/template.html      静态 HTML 模板
assets/hero.png           示例主视觉
themes/*.css              六个预设主题
scripts/palette.cjs       Logo 取色和品牌主题派生
scripts/backdrop.py       程序化 SVG 底图
scripts/setup.py          主题 + 底图 -> HTML 源稿
scripts/render.cjs        渲染、验证和导出
scripts/pack.py           组图 ZIP 打包
scripts/demo-themes.cjs   六主题对比渲染
examples/                 示例分页方案和演示图
tests/                    Node test 回归测试
```

## 安全与隐私边界

- 本项目默认只处理本地可信 HTML 和用户明确提供的素材。
- 渲染器拒绝脚本、iframe、外部 CSS 和远程资源，并在页面加载前阻断网络请求。
- 它不是任意网页的通用安全沙箱。
- 不自动发布到任何平台，不连接账号。
- 不重绘真人照片，不生成可扫码外观的假二维码。
- 海报示例使用虚构活动资料；文档底部的微信码是项目交流入口，来源见素材说明。

## 开源协作

- 变更记录：[CHANGELOG.md](CHANGELOG.md)
- 发布说明：[RELEASE_NOTES.md](RELEASE_NOTES.md)
- 路线图：[ROADMAP.md](ROADMAP.md)
- 贡献指南：[CONTRIBUTING.md](CONTRIBUTING.md)
- 安全政策：[SECURITY.md](SECURITY.md)
- 第三方声明：[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)

## 验证状态

`1.0.0` 发布文件的本地验证记录：

- macOS，Node 24.11.1，Playwright 1.62.1，Sharp 0.35.4，已有 Chromium 148。
- 35/35 项测试通过。
- 内置 demo 完成长图、5 页组图和 ZIP 打包。
- 黄色和绿色品牌分别完成取色、初始化、长图 + 5 页组图、ZIP 打包。

本轮未重跑 Linux 或 Windows。GitHub Actions 配置会安装 Chromium 和 Noto CJK 后执行 `npm test`，但远端 CI 结果以你上传 GitHub 后的实际运行为准。

## 素材与许可证

示例素材来源见 [ASSET_SOURCES.md](ASSET_SOURCES.md)。第三方运行依赖及其许可证以 `package-lock.json` 和各 npm 包为准。

代码与示例素材按 [MIT License](LICENSE) 分发。作者：梁海龙 (allenlion)。

## 星辰汇 · 星辰AI增长｜海报与 AI 增长交流群

欢迎加入星辰汇、星辰AI增长的项目交流与反馈群，一起交流 AI 海报制作、内容创作与增长实践。

**扫码添加微信，申请入群。** 添加时可备注「爆款海报生成器」，方便交流使用问题、提交作品和反馈建议。

<img src="assets/feedback-wechat-qr.jpg" alt="星辰汇、星辰AI增长交流群：扫码添加微信，申请入群" width="320" />

X 主页：[allenlion · @ALLENLION35](https://x.com/ALLENLION35)
