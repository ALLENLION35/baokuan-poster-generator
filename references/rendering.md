# HTML 渲染接口

## 依赖与源文件

默认使用系统 Node.js 22+。普通 Node 环境锁定 Playwright 1.62.1 与 Sharp 0.35.4。在 Codex App 调用 `load_workspace_dependencies` 获取 Node 和 node_modules 路径；其他环境先用现有 Node 包。`render.cjs` 接受 `--modules`，也可使用 `POSTER_NODE_MODULES`。优先 Playwright 默认浏览器；如缓存版本不同，检查已存在的浏览器可执行文件后用 `--browser` 指定。报错不是安装授权。

HTML 必须静态、内联 CSS，且只有一个 `#poster` 根容器。容器宽度与配置宽度相同：有分页方案时取 `plan.width`，否则取 `--width`，都没有时为 1080。用稳定 ID 标识完整内容块；把宽幅卡片片段组合进小图时用 `wrap: true` 增加 `<section>` 外壳。

图片 src、CSS url 和 style 属性中的 url 可使用本地相对路径、file URL 或 data URL，导出时会内嵌为便携 HTML。默认素材 realpath 限制在输入源目录内；额外本地资源目录用 `--asset-root` 指定，可重复传入。已内嵌 data URL 不受本地路径限制。先把远程图片保存到当前项目再引用；渲染器应在页面加载前阻断远程网络，不处理远程下载、srcset、脚本、iframe、外部 CSS。不要把来源不明的网页当作海报源直接运行；这里只支持本地可信工作项目和用户明确授权使用的素材，不宣称提供任意 HTML 安全沙箱。

## 从内置模板起步

先按 [styling.md](styling.md) 定调，再用 `scripts/setup.py` 生成带主题和底图的源稿：

```sh
python3 "SKILL/scripts/setup.py" --theme warm-market --backdrop work/backdrop.svg --out work/poster.html
```

脚本会把底图按内容哈希命名为 `backdrop-<SHA-256前12位>.<ext>`，复制到源稿同目录并改好 CSS 路径。同目录生成不同版本时，各自引用的旧底图保持不变；相同内容复用同一文件。直接手工复制 `assets/template.html` 时，它引用同目录的 `hero.png`，必须一起复制或改路径，否则渲染时报图片缺失。

模板区块：`#cover` 封面、`#overview` 概览、`#highlights` 要点（内含 `#highlight-a`）、`#people` 人物（内含 `[data-person="person-a"]`）、`#audience` 适合人群、`#action` 行动区。按活动实际内容增删区块并改标题；ID 可以改，但要与分页方案一致。

若 Playwright 报浏览器版本目录不存在，枚举已安装缓存中的可执行文件，选定存在的 Chromium 后带 `--browser` 重试。macOS 常见缓存为 `~/Library/Caches/ms-playwright`，Linux 为 `~/.cache/ms-playwright`。只使用实际检查到的路径；没有可用浏览器时报告缺失，不虚构渲染完成。

## 运行

以下 `NODE`、`MODULES` 和 `SKILL` 表示本次实际发现的路径，命令中的路径需正确 shell 引号：

```sh
"NODE" "SKILL/scripts/render.cjs" \
  --input work/poster.html \
  --plan work/pages.json \
  --out outputs/海报-v2 \
  --modules "MODULES"
```

如源稿需要读取额外本地素材目录，可重复加入 `--asset-root`：

```sh
"NODE" "SKILL/scripts/render.cjs" \
  --input work/poster.html \
  --plan work/pages.json \
  --asset-root work/assets \
  --asset-root shared-assets \
  --out outputs/海报-v2 \
  --modules "MODULES"
```

省略 `--plan` 只导出长图或单页海报。单页海报的 `#poster` 宽度不是 1080 时用 `--width` 声明，例如 `--width 1242`。输出目录非空默认报错；有明确更新意图时可使用 `--overwrite`，推荐新版本目录。覆盖模式会清理该导出器旧的编号 JPG，避免页数减少后留下旧页。

分页方案：

```json
{
  "width": 1080,
  "height": 1440,
  "minScale": 0.82,
  "title": "活动名称",
  "footer": "来自当前文案的日期与地点",
  "theme": {
    "background": "#050817",
    "color": "#cbd8f2",
    "border": "#9fabe333"
  },
  "pages": [
    {"name": "封面", "selectors": ["#cover"], "cover": true},
    {"name": "概览", "selectors": ["#overview", "#audience"]},
    {"name": "要点", "selectors": ["#highlight-a"], "wrap": true},
    {"name": "行动", "selectors": ["#action"]}
  ]
}
```

每个选择器必须唯一匹配。`cover` 原尺寸展示，源封面需等于目标页面高度；其他页面在预留页头、页脚后等比缩放。`width`、`height` 决定小图尺寸，微信组图常用 1080×1440，其他平台按其推荐比例设置。`plan.theme` 可配置分页页面的 `background`、`color`、`border`；未配置时继承 `#poster` 与 `body` 的计算配色。`minScale` 是最后防线，不是可读性证明。导出过密页面失败时先拆页、减少空白或重新组织内容；不要盲目调低阈值。异常装饰可加 `data-decorative` 排除文字检查，仅用于非信息装饰。

分页保留源 `#poster` 的标签、属性、类名、内联变量及继承样式，因此 `#poster p` 等祖先选择器在封面和内容页继续生效。分页中的根容器使用 `display: contents`，不继承整幅长图的高度、背景盒或根级网格/弹性布局；背景仍由 `plan.theme` 或源稿配色决定。选取完整内容块，区块内部应自带布局；未选中的中间祖先、兄弟节点及其布局不会重建。`wrap: true` 会添加一层 section，使用直接子元素选择器时须考虑这层结构。`pages.html` 是静态派生成品，可能重复源区块ID及 `#poster`；在它上面定位元素需限定 `#cp-0` 等页容器，继续修改应使用 `poster.html` 源稿。

成品：`poster.html/png/jpg`、`pages.html`、`slides/01-名称.jpg` 等、`overview.png`、`validation.json`。`validation.json` 必须包含 `generator: "long-poster"`、`schemaVersion: 1` 与 `files` 清单；`source` 只记录文件名。覆盖模式只能根据该清单和导出器命名规则清理旧文件，保留目录中的无关文件。旧版导出没有清单时必须新版本目录导出。所有页面验证后才开始写成品。发布前仍需人工视觉检查；清单里 `qrScanTested: false` 表示没有实际扫码验证。

压缩完成的小图：

```sh
python3 scripts/pack.py outputs/海报-v2
```

`scripts/pack.py EXPORT_DIR` 读取 `validation.json.files` 中列出的 `slides/*.jpg`，生成 `slides.zip`，并把 `slides.zip` 登记回 `files`。也可通过项目脚本运行：`npm run pack -- outputs/demo`。

在当前工作区测试或临时截图用 `work/`；只有用户成品放 `outputs/`。
