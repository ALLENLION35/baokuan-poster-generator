# 定调：主题、品牌色与底图

模板把「结构」和「风格」拆开：`assets/template.html` 的结构 CSS 只引用 `:root` 里的变量，`themes/*.css` 各自提供一套变量值。换配色通常只需换变量和底图；需要不同构图时再调整区块布局，并重新渲染验证。

## work/style.json

动模板前先写这份文件，作为本次活动风格的唯一依据；后续修改（"换暖一点"、"用我们的品牌蓝"）先改它再改源稿。示例（格式说明，不含真实数据）：

```json
{
  "eventType": "市集 / 发布会 / 课程 / 招募 / 促销 …",
  "channel": "公众号长图 / 朋友圈单页 / 微信组图",
  "tone": "一句话描述用户想要的气质，引用用户原话",
  "theme": "work/brand.css",
  "themeBase": "warm-market",
  "overrides": {},
  "brand": {"source": "assets/logo.png", "isColorful": true, "primary": "#e63946", "secondary": null, "drivesPalette": true},
  "backdrop": {
    "source": "user-asset | imagegen | generated | template",
    "file": "assets/venue.jpg",
    "style": "dots",
    "seed": 4,
    "heroSize": "cover"
  },
  "typography": "标题用衬线 / 无衬线，按主题默认",
  "confirmedByUser": false
}
```

`source` 的四个值对应底图优先级：用户素材 > 图像生成 > `backdrop.py` 程序化生成 > 内置 `hero.png`。`brand.drivesPalette` 为 true 表示整套颜色由 Logo 派生（彩色 Logo 的默认），此时 `theme` 指向派生出的 `work/brand.css`，`themeBase` 记录形状来自哪个预设；黑白 Logo 或没有 Logo 时 `drivesPalette` 为 false，`theme` 直接是预设名。用户确认过风格后把 `confirmedByUser` 置为 true，后续轮次不再重新选主题。

## 主题变量

每个主题定义同一组变量，含义如下；新增主题时全部给值，缺的会回落到模板默认值（蓝紫）：

| 变量 | 用途 |
| --- | --- |
| `--bg` `--bg-glow-1` `--bg-glow-2` | 页面底色与两处柔光 |
| `--fg` `--fg-soft` `--fg-muted` | 正文三级文字色 |
| `--accent` `--accent-2` `--accent-3` | 强调色，标题渐变从 1 到 3 |
| `--line` | 分隔线 |
| `--card` `--card-2` `--card-border` `--card-fg` | 与底色同系的卡片 |
| `--panel` `--panel-2` `--panel-fg` `--panel-muted` `--panel-tag` | 与底色形成对比的面板（人物卡）：深色主题给浅面板，浅色主题给深面板 |
| `--panel-tag-fg` `--panel-accent` | 可选：品牌标签上的字色、面板内强调文字色；旧主题分别回退白色与 `--panel-tag` |
| `--cta` `--cta-border` `--cta-fg` `--cta-soft` | 行动区（报名 / 购买）卡片 |
| `--radius` `--radius-sm` | 圆角：科技 / 商务小，市集 / 亲子大 |
| `--font-display` `--font-body` | 标题与正文字体栈；不捆绑字体，只写系统与 Noto CJK 回退 |
| `--hero` `--hero-size` `--hero-fade` | 封面底图、尺寸模式、底部渐隐 |

自定义主题：复制最接近的 `themes/<name>.css`，改变量后传文件路径 `--theme path/to/custom.css`。校验对比度：正文 `--fg` 对 `--bg`、`--card-fg` 对 `--card`、`--panel-fg` 对 `--panel` 都应保持清晰可读；导出后看长图分段确认。

## 脚本

取品牌色并判断 Logo 是否彩色（依赖渲染器已有的 Sharp）：

```sh
node scripts/palette.cjs work/assets/logo.png
```

报告里的 `isColorful` 是关键分支：脚本把"饱和度 ≥ 0.25、占 Logo 不透明像素 ≥ 2%、不是近黑近白"的颜色视为品牌色，按占比 × 饱和度排序，第一个是 `brand.primary`，色相相差 25° 以上的第二个是 `brand.secondary`（没有就为 null，派生主题时自动补同色系次色）。黑、白、灰 Logo 没有任何颜色满足条件，`isColorful` 为 false——这种 Logo 不携带品牌色，按活动类型选预设即可，不要硬从抗锯齿边缘里抠颜色。

彩色 Logo 时，让品牌色主导整套配色：

```sh
node scripts/palette.cjs work/assets/logo.png --base business-navy --theme-out work/brand.css
```

`--base` 只借用预设的"形状"——深色还是浅色、圆角、字体、封面底图设置——所有颜色变量都从 `brand.primary/secondary` 派生：底色是品牌色相的极深或极浅调，卡片是同色相的中间调，人物面板取反差调，行动区优先保留品牌色渐变；没有共同可读字色时调整渐变色阶。标题与面板强调文字色也独立派生，不再直接把品牌装饰色用于所有文字。`--mode dark|light` 可以不依赖预设直接指定明暗。黑白 Logo 加了 `--theme-out` 也不会写文件（`themeWritten: false`）。派生出的 CSS 头部注释给出了生成底图该用的 `--bg/--accent/--accent2`。配色脚本按相对亮度检查派生文字与所支持表面的对比度，并采样行动区渐变；这不是对最终海报所有像素、照片、透明叠层或用户手改配色的检查，仍需放大目检。

程序化底图（仅标准库，输出 SVG，渲染器会内嵌）：

```sh
python3 scripts/backdrop.py --style dots --bg "#fff3e0" --accent "#f26b1d" --accent2 "#2e7d5b" --seed 4 --out work/backdrop.svg
```

`--bg` 用主题的 `--bg`，`--accent/--accent2` 用主题或品牌强调色；尺寸默认 1080×1440 与封面一致，单页海报按目标尺寸传 `--width --height`。六种构图的适用场景写在脚本头部；焦点图形默认避开顶部 34% 的标题区，封面标题行数多时用 `--title-zone 0.45` 之类把它们压得更低，而不是反复换 seed 碰运气。换 `--seed` 换构图，同一 seed 结果固定，便于复现。

套用主题生成源稿（`--theme` 可以是预设名，也可以是派生出的 `work/brand.css`）：

```sh
python3 scripts/setup.py --theme work/brand.css --backdrop work/backdrop.svg --out work/poster.html
python3 scripts/setup.py --theme warm-market --backdrop work/backdrop.svg --out work/poster.html
python3 scripts/setup.py --theme minimal-light --backdrop work/assets/venue.jpg --hero-size cover --out work/poster.html
python3 scripts/setup.py --theme business-navy --set accent=#e63946 --backdrop none --out work/poster.html
```

脚本把主题的 `:root` 块替换进模板，把底图复制到输出同目录并命名为 `backdrop-<SHA-256前12位>.<ext>`；相同内容复用，不同内容使用独立文件，不覆盖旧版本底图，`--set` 覆盖单个变量。输出已存在时拒绝覆盖（防止丢失后续编辑），确需重来加 `--force`。

## 照片做封面底图时

用 `--hero-size cover`，并检查标题区可读性：照片偏亮或杂乱时，在主题里把 `--hero-fade` 改成更强的压暗层，例如 `linear-gradient(180deg,rgba(0,0,0,.55),rgba(0,0,0,.25) 45%,var(--bg) 100%)`。不要把文字直接压在人脸或产品主体上；人物照片的主体尽量放在封面右侧或下半部分。
