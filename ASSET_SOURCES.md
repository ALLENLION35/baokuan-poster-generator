# 示例素材来源

- `assets/template.html`：本项目编写的示例活动海报布局与样式。示例文字不代表真实活动；不含任何真实姓名、价格、地址或二维码。
- `assets/hero.png`：沿用项目原有抽象主视觉。原始素材说明将其记录为 2026-09-10 使用 AI 图像生成工具生成；提示词描述深海军蓝背景、蓝紫色发光无限环、光纤和玻璃质感、稀疏粒子与精细网格，无文字、人物或商标。仓库不附独立的生成日志，以上日期与提示词描述按原始素材说明归档。
- `examples/preview.png`：由 1.0.0 的 `npm run demo` 从内置模板导出的组图总览，用于 README 展示。
- `examples/themes.png`：同一模板分别套用 `themes/` 六个主题与 `scripts/backdrop.py` 生成的底图后导出的封面对比。
- `examples/real-runs.png`：用三份虚构活动文案（手作市集、出海峰会、瑜伽体验课）调用本 Skill 的实跑封面；其中的机构名、人名、Logo 均为测试用虚构内容。
- `examples/brand-themes.png`：历史示例：三个虚构的彩色 Logo（深蓝+琥珀、单一红、单一绿）经 `scripts/palette.cjs` 派生主题后的封面对比；Logo 为测试用几何图形，不指向任何真实企业。此图片早于 1.0 的配色修复，不作为当前算法的逐像素结果证明。
- `themes/*.css`：本项目编写的配色预设，不含第三方素材。
- `scripts/backdrop.py` 生成的 SVG 底图完全由程序绘制，不含任何外部图片。
- 中文字体：仓库不捆绑字体。模板使用系统字体回退；CI 安装系统提供的 Noto CJK 字体包。
- 第三方运行依赖：版本与来源见 `package-lock.json`；依赖的许可文件由各自的 npm 包提供。

海报示例未打包真实客户活动的公司 Logo、人物照片、付款码或报名二维码。文档另包含维护者公开的项目交流微信码，用途如下；用户在自己的海报项目中加入的素材不属于示例包。

项目与示例素材按仓库根目录 `LICENSE`（MIT）分发；此文件仅记录来源。

## 项目交流二维码

`assets/feedback-wechat-qr.jpg`：按维护者要求，原样复用 [GEO第一性原理项目的公开微信二维码](https://github.com/ALLENLION35/geo-first-principles/blob/9f8b4fbfea6a05f07834c5701267f9ac30687af1/assets/feedback-wechat-qr.jpg)。用于星辰汇、星辰AI增长的项目交流与入群申请，不是活动报名码；未经改绘或替换。参考项目署名为 allenlion，采用 MIT 许可。

文件 SHA-256：`72586ad775ce543d0eb6ccbe823d5a01a3900e163fd33225a266893441514287`。
