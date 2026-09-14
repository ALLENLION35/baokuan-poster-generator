# 命令行制作与开发指南

[返回项目首页](../README.md)

这里面向想直接运行脚本、修改 HTML 或参与开发的用户。日常使用可以把文案和素材交给 AI 助手，让它完成这些步骤。

## 准备环境

需要 Node.js 22+、npm、Python 3 和 Chromium；Linux 还需要可用的中文字体。下面命令适用于 macOS / Linux，在仓库根目录（有 `package.json` 的目录）执行。Windows 请按本机 Python 命令调整 `python3`，该平台尚未实测。

从源码开始：

```sh
git clone https://github.com/ALLENLION35/hot-poster-generator.git
cd hot-poster-generator
npm ci
npx playwright install chromium
```

已安装 Skill 的用户直接进入实际技能目录，准备缺失的依赖即可，无需再克隆一份。宿主有可复用运行环境时，参见[依赖与浏览器路径](../references/rendering.md)。

Linux 若提示缺少浏览器系统库，可运行 `npx playwright install --with-deps chromium`。Ubuntu 的中文字体可用 `sudo apt-get install fonts-noto-cjk` 安装；系统安装可能要求管理员权限。

## 先跑内置示例

```sh
npm run demo
python3 scripts/pack.py outputs/demo
```

完成后查看 `outputs/demo/poster.jpg`、`outputs/demo/overview.png` 和 `outputs/demo/slides.zip`。示例活动资料为虚构。

如果 `outputs/demo` 已存在，换一个新目录：

```sh
node scripts/render.cjs --input assets/template.html --plan examples/pages.json --out outputs/demo-v2
python3 scripts/pack.py outputs/demo-v2
```

测试与主题预览：

```sh
npm test
npm run demo:themes
```

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

导出目录非空会报错，这是为了避免误覆盖旧成品。确认覆盖同一个 hot-poster-generator 导出目录时可加 `--overwrite`。

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

- 变更记录：[CHANGELOG.md](../CHANGELOG.md)
- 发布说明：[RELEASE_NOTES.md](../RELEASE_NOTES.md)
- 路线图：[ROADMAP.md](../ROADMAP.md)
- 贡献指南：[CONTRIBUTING.md](../CONTRIBUTING.md)
- 安全政策：[SECURITY.md](../SECURITY.md)
- 第三方声明：[THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)

## 验证状态

`1.0.0` 发布文件的本地验证记录：

- macOS，Node 24.11.1，Playwright 1.62.1，Sharp 0.35.4，已有 Chromium 148。
- 35/35 项测试通过。
- 内置 demo 完成长图、5 页组图和 ZIP 打包。
- 黄色和绿色品牌分别完成取色、初始化、长图 + 5 页组图、ZIP 打包。

Windows 尚未实测。首次发布的 Ubuntu GitHub Actions 已通过 35 项测试：[运行记录](https://github.com/ALLENLION35/hot-poster-generator/actions/runs/34823128808)。

## 素材与许可证

示例素材来源见 [ASSET_SOURCES.md](../ASSET_SOURCES.md)。第三方运行依赖及其许可证以 `package-lock.json` 和各 npm 包为准。

代码与示例素材按 [MIT License](../LICENSE) 分发。作者：梁海龙 (allenlion)。
