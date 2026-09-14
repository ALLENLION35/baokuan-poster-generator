# 示例素材来源

- `assets/template.html`：本项目编写的示例活动海报布局与样式。示例文字不代表真实活动；不含任何真实姓名、价格、地址或二维码。
- `assets/hero.png`：沿用项目原有抽象主视觉。原始素材说明将其记录为 2026-09-10 使用 AI 图像生成工具生成；提示词描述深海军蓝背景、蓝紫色发光无限环、光纤和玻璃质感、稀疏粒子与精细网格，无文字、人物或商标。仓库不附独立的生成日志，以上日期与提示词描述按原始素材说明归档。
- `examples/preview.png`：由 1.0.0 的 `npm run demo` 从内置模板导出的组图总览，保留用于演示与测试。
- `examples/themes.png`：同一模板分别套用 `themes/` 六个主题与 `scripts/backdrop.py` 生成的底图后导出的封面对比。
- `examples/real-runs.png`：用三份虚构活动文案（手作市集、出海峰会、瑜伽体验课）调用本 Skill 的实跑封面；其中的机构名、人名、Logo 均为测试用虚构内容。
- `examples/brand-themes.png`：历史示例：三个虚构的彩色 Logo（深蓝+琥珀、单一红、单一绿）经 `scripts/palette.cjs` 派生主题后的封面对比；Logo 为测试用几何图形，不指向任何真实企业。此图片早于 1.0 的配色修复，不作为当前算法的逐像素结果证明。
- `themes/*.css`：本项目编写的配色预设，不含第三方素材。
- `scripts/backdrop.py` 生成的 SVG 底图完全由程序绘制，不含任何外部图片。
- 中文字体：仓库不捆绑字体。模板使用系统字体回退；CI 安装系统提供的 Noto CJK 字体包。
- 第三方运行依赖：版本与来源见 `package-lock.json`；依赖的许可文件由各自的 npm 包提供。

内置模板、主题对比和历史测试图使用虚构资料。README 的活动案例由维护者提供，包含真实活动信息、品牌、人物照片和活动二维码；其用途与下方项目交流微信码分开记录。

项目代码与自有示例素材按仓库根目录 `LICENSE`（MIT）分发。下方真实活动展示图中的人物肖像、品牌标识和二维码仅作为活动案例展示，不因本项目开源而授予其独立复用权。

## 项目交流二维码

`assets/feedback-wechat-qr.jpg`：按维护者要求，原样复用 [GEO第一性原理项目的公开微信二维码](https://github.com/ALLENLION35/geo-first-principles/blob/9f8b4fbfea6a05f07834c5701267f9ac30687af1/assets/feedback-wechat-qr.jpg)。用于星辰汇、星辰AI增长的项目交流与入群申请，不是活动报名码；未经改绘或替换。参考项目署名为 allenlion，采用 MIT 许可。

文件 SHA-256：`72586ad775ce543d0eb6ccbe823d5a01a3900e163fd33225a266893441514287`。

## 维护者提供的活动案例

2026-09-14，维护者提供「GEO · A2A · FDE：看清 AI 商业的变化」公开课活动海报，并要求替换 README 效果示例。两份文件按原始字节收录，未裁切、重绘或修改活动信息；六种配色示例保持不变。

- `examples/event-geo-a2a-fde-grid.png`：九张组图总览。
- `examples/event-geo-a2a-fde-long.jpg`：完整活动长图。

这些图片是维护者提供的展示成品，不是本仓库 `npm run demo` 的默认输出；内置 demo 仍使用虚构活动模板。图片中的报名、付款或联系二维码属于该活动，不作为其他用户制作海报时的默认素材。

`examples/event-geo-a2a-fde-grid.png` SHA-256：`f694832044128e42477235b7dcfae060492b9b4c7701fa5a4bfb28dd7b5cd074`。

`examples/event-geo-a2a-fde-long.jpg` SHA-256：`fbb7b28b73221ee224bd387a76e85dc022752d59a214498677d5e3cf783adcc4`。
