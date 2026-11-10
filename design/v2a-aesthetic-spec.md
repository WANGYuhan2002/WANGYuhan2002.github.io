# v2a 波场互动 · 审美设计规格（设计交接，勿合并）

- 对象：`drafts/v2a/index.html` + `js/hero.js`（主页首屏），`drafts/v2a/lab/index.html` + `js/lab.js` + `js/lab-chapters.js`（Wave Lab），`js/wave-engine.js`（画布配色）。
- 基线分支：`claude/v2a-always-structure`。本文件只做设计；实现由另一会话按第 9 节清单执行。
- 约束：物理、数值方法、交互逻辑、功能一律不变；速度模型永远可见。
- 现状截图：`design/shots/`（1440×900，暗/亮两套；手机为 iPhone 13）。视觉样张：`design/mocks/lab-mock.html`（静态，只表达视觉）。

---

## 1. 现状诊断（按影响排序）

| # | 问题 | 在哪看 | 为什么伤审美 |
|---|---|---|---|
| D1 | **颜色语义撞车**：慢速 = 砖红、负压力 = 珊瑚红；快速 = 蓝、正压力 = 青。图例四个色块读起来像两对同义词。 | `shots/lab-play-dark.png` 图例；`lab-arrays-dark.png` 波前压在红层上 | 波（能量）和介质（物质）争同一条色轴，波前在慢速区里发脏、看不清；这是整套画面“浑”的根源。 |
| D2 | **结构着色像淤青**：暗色下砖红混进近黑的蓝底 → 棕/猪肝色；亮色下是粉红 + 婴儿蓝。 | `home-dark.png`、`lab-arrays-dark-late.png`、`home-light.png`、`lab-arrays-light.png` | 首屏最大面积的颜色是一块没有被设计过的混色。 |
| D3 | **界面线是锯齿阶梯**：网格分辨率的 1 格硬阈值线被放大 3–4 倍，灰色、0.45 不透明度，又粗又抖。 | `lab-arrays-dark.png`、`lab-arrays-light.png` | 画面里最“像 bug”的元素，直接拉低完成度。 |
| D4 | **选中态 = 一整块纯白/纯黑**，同屏出现 5 种按钮形状（圆角方块 `.opt`、胶囊 `.pbtn`、分段 `.seg`、图标方块、圆形 `.ibtn`）。主按钮还会在白与青之间变。 | `lab-play-dark.png` 右栏；`lab-tomo-dark.png` | 没有主次：工具、选项、主行动同样“响”；白块在暗底上刺眼，像线框稿。 |
| D5 | **实验室没有图底关系**：目录、波场、数据面板、说明栏只靠 1px 发丝线分隔，四块同底色。 | 所有 `lab-*-dark.png` | 看不出“这是一台仪器”，数据面板像波场的延伸，说明栏像一堵字墙。 |
| D6 | **等宽大写字过量**：kicker、目录标题、数据标题、HUD、图例、状态条全是 `JetBrains Mono` + 大写 + 0.16em 字距；画布文字只有 9–9.5px。 | `lab-noise-dark.png` 数据面板；`home-phone.png` | “终端 cosplay”感正是用户说的“学究味”；9px 在 1× 屏上读不动。 |
| D7 | **数据面板太素**：单道是一根白发丝线（主页上像一条分割线）；记录剖面的平直基线堆成条纹；层析三联图只占半高，下半空着；噪声面板两个框上下不齐。 | `home-dark.png` 底部；`lab-tomo-dark-late.png`；`lab-noise-dark.png` | 这是最“地震学”的部分，却最没有仪器感。 |
| D8 | **图例挤在工具栏里折行**（层析 7 项折两行），慢/快与 p>0/p<0 同形同大。 | `lab-tomo-dark.png` 右上 | 读图顺序被打乱。 |
| D9 | **叠加层靠黑色模糊晕影**（`shadowBlur 6`）托住白三角和 10px 标签，亮色主题里是一圈白雾。 | `lab-tr-dark.png`、`lab-arrays-light.png` | 糊、不精确。 |
| D10 | **说明栏所有步骤全文展开**，当前步与其它步对比不足。 | `lab-phone.png`（整页 6000px 高） | 手机上尤甚：波场看完要滚 4 屏字。 |
| D11 | 动效只有 hover 变色与震动；面板出现、选中、落台站都是瞬切。 | — | 参与感不足。 |

好的部分（保留）：主页大字排版与衬线副标题；点击即地震；弹性波章节里青/琥珀波前的发光感（`lab-elastic-dark.png`）——这就是要推广到全站的气质。

---

## 2. 设计方向

**一句话定位：一台会发光的地震仪——介质是安静的夜色地形，波是光。**

- 关键词：发光 · 安静 · 精确 · 可玩。
- 气质：暗色像深夜观测台的仪表玻璃；亮色像一张海图纸上的墨线与淡彩。
- 三条原则：
  1. **物质冷而深，能量暖而亮。** 介质只用低彩度的冷色（莓紫 = 慢，钴蓝 = 快，保留“暖 = 慢 / 冷 = 快”的地震学惯例，但暖端从砖红移到莓紫，让出珊瑚色给负压力）；波、震源、拾取用高彩度的青 / 珊瑚 / 琥珀。
  2. **一屏只有一个“最响”的元素。** 实心填充只给主行动按钮；其余一切选中态用“青色薄染 + 细描边”。
  3. **卡片化的仪器面板。** 波场、数据、说明各是一张圆角卡，浮在更暗的机箱底色上。
- 不做：不加新字体，不加图片资源，不引入依赖，不改文案。

---

## 3. 设计 token（两页的 `:root` 完全一致地替换）

### 3.1 颜色

```css
:root{
  --bg:#070a12;            /* 机箱底色 */
  --bg2:#0b1019;           /* 卡片表面：数据面板、说明栏、浮层 */
  --bg3:#111826;           /* 抬起/悬停表面 */
  --panel:rgba(148,170,214,.045); --panel2:rgba(148,170,214,.09);
  --line:rgba(148,170,214,.11);   --line2:rgba(148,170,214,.22);
  --ink:#eef2f8; --ink2:#b3bfd0; --muted:#7a879c;
  --cyan:#56e1f0;          /* 唯一强调色 = 正压力 = P 波 */
  --accent-ink:#04161a;    /* 实心青按钮上的字 */
  --accent-soft:color-mix(in srgb,var(--cyan) 14%,transparent);
  --accent-line:color-mix(in srgb,var(--cyan) 42%,transparent);
  --coral:#ff8058; --amber:#ffbe54; --slow:#d9569b; --fast:#4d86ff;
  --veil:7,10,18; --portrait1:#142231; --portrait2:#0a0f17;
  --sh-1:inset 0 1px 0 rgba(255,255,255,.04), 0 8px 24px -12px rgba(0,0,0,.6);
  --sh-2:inset 0 1px 0 rgba(255,255,255,.05), 0 24px 56px -20px rgba(0,0,0,.7);
  --glass-a:.68;
  color-scheme:dark;
}
:root[data-theme="light"]{
  --bg:#f4f3ee; --bg2:#fbfaf7; --bg3:#ffffff;
  --panel:rgba(28,36,52,.035); --panel2:rgba(28,36,52,.07);
  --line:rgba(28,36,52,.10);   --line2:rgba(28,36,52,.20);
  --ink:#131a26; --ink2:#3a4658; --muted:#667185;
  --cyan:#007c8f; --accent-ink:#ffffff;
  --coral:#d4472b; --amber:#a56800; --slow:#b53c7d; --fast:#2b61d4;
  --veil:244,243,238; --portrait1:#e4ece9; --portrait2:#f4f3ee;
  --sh-1:0 1px 2px rgba(28,36,52,.06), 0 8px 24px -14px rgba(28,36,52,.18);
  --sh-2:0 2px 4px rgba(28,36,52,.06), 0 24px 56px -24px rgba(28,36,52,.28);
  --glass-a:.80;
  color-scheme:light;
}
```

（`--accent-soft` / `--accent-line` 用 `color-mix`，随主题自动变，不必在亮色里重写。）

### 3.2 字体、字号、行高

字体族不变：`--display` Space Grotesk，`--sans` Inter，`--mono` JetBrains Mono，`--serif` Instrument Serif（仅主页）。

| token | 值 | 用途 |
|---|---|---|
| `--fs-micro` | 11px / 1.3，mono 500，`letter-spacing:.08em`，大写 | 小节标签（EXPERIMENTS、面板小标题）。**全站大写字距统一从 .16–.22em 降到 .08em** |
| `--fs-xs` | 12px / 1.45 | 辅助说明、图例、HUD |
| `--fs-sm` | 13px / 1.5 | 步骤正文、按钮 |
| `--fs-base` | 14px / 1.55 | 实验室正文（body） |
| `--fs-md` | 15px / 1.35，sans 600 | 步骤标题、目录条目 |
| `--fs-lg` | 20px / 1.2，display 700 | — |
| `--fs-xl` | 26px / 1.1，display 700，`letter-spacing:-.02em` | 说明栏实验标题 |
| 画布文字 | **最小 10px**；标签 600 10.5px mono；轴刻度 500 10px mono | 所有 canvas `font` |

规则：**等宽字只用于数字、台站代码、单位**；句子一律 sans。

### 3.3 间距、圆角、描边、模糊

```css
:root{
  --sp-1:2px; --sp-2:4px; --sp-3:8px; --sp-4:12px; --sp-5:16px; --sp-6:24px; --sp-7:32px; --sp-8:48px;
  --r-sm:6px;   /* 色块、kbd */
  --r-md:10px;  /* 一切按钮、分段、输入 */
  --r-lg:14px;  /* 卡片、浮层、波场、数据面板 */
  --r-xl:20px;  /* 主页大卡片 */
  --r-pill:999px; /* 仅：主页两个 CTA、状态胶囊、toast */
  --bw:1px;
  --blur:16px;
  --ease:cubic-bezier(.2,.7,.2,1);
  --t-fast:120ms; --t-mid:180ms; --t-slow:260ms;
}
.glass{border:1px solid var(--line2); background:rgba(var(--veil),var(--glass-a));
  -webkit-backdrop-filter:blur(var(--blur)) saturate(1.4); backdrop-filter:blur(var(--blur)) saturate(1.4); box-shadow:var(--sh-1)}
```

---

## 4. 画布配色（`wave-engine.js` 的 `PAL`）

新增 5 个字段：`vs` / `vf`（结构淡彩的目标色，替代原来直接用 `slow` / `fast` 混色）、`edge` + `edgeA`（界面线颜色与最大不透明度）、`core`（强振幅白芯）、`pn`（数据面板底色的 RGB 数组）。`slow` / `fast` 只保留给图例、层析色标、笔刷光标。

| 字段 | `PAL.dark` 旧 → 新 | `PAL.light` 旧 → 新 |
|---|---|---|
| `bg` | `[7,10,16]` → `[8,11,19]` | `[243,245,247]` → `[246,245,240]` |
| `pos` | `[79,216,232]` → `[86,225,240]` | `[11,120,148]` → `[0,124,143]` |
| `neg` | `[255,122,92]` → `[255,128,88]` | `[217,71,47]` → `[212,71,43]` |
| `slow` | `[235,88,64]` → `[217,86,155]` | `[217,71,47]` → `[181,60,125]` |
| `fast` | `[64,132,255]` → `[77,134,255]` | `[47,111,214]` → `[43,97,212]` |
| `vs`（新） | `[124,50,108]` | `[132,84,112]` |
| `vf`（新） | `[38,86,196]` | `[62,96,168]` |
| `edge`（新） | `[170,190,230]` | `[40,52,80]` |
| `edgeA`（新） | `0.32` | `0.30` |
| `ink` | `[238,243,246]` → `[238,242,248]` | `[16,29,39]` → `[19,26,38]` |
| `sw` | `[255,186,72]` → `[255,190,84]` | `[180,110,0]` → `[165,104,0]` |
| `hot` | `[255,214,110]` → `[255,226,150]` | `[214,92,20]` → `[196,84,20]` |
| `halo` | `'rgba(0,0,0,.85)'` → `'rgba(4,6,12,.9)'` | 不变 `'rgba(255,255,255,.95)'` |
| `mix` | `0.9` → `0.92` | `0.92` → `0.94` |
| `core`（新） | `0.30` | `0` |
| `tint` | `0.42` → `0.50` | `0.34` → `0.26` |
| `faint` | 不变 `0.07` | 不变 `0.06` |
| `trace` | `'rgba(238,243,246,.88)'` → `'rgba(238,242,248,.86)'` | `'rgba(16,29,39,.85)'` → `'rgba(19,26,38,.84)'` |
| `fill` | `'rgba(79,216,232,.45)'` → `'rgba(86,225,240,.38)'` | `'rgba(11,120,148,.3)'` → `'rgba(0,124,143,.26)'` |
| `tick` | `'rgba(255,255,255,.08)'` → `'rgba(148,170,214,.18)'` | `'rgba(16,29,39,.14)'` → `'rgba(28,36,52,.18)'` |
| `grid` | `'rgba(255,255,255,.07)'` → `'rgba(148,170,214,.08)'` | `'rgba(16,29,39,.08)'` → `'rgba(28,36,52,.07)'` |
| `label` | `'#7c8a95'` → `'#8b97ab'` | `'#5d6f7b'` → `'#667185'` |
| `origin` | `'255,122,92'` → `'255,128,88'` | `'217,71,47'` → `'212,71,43'` |
| `panel` | `'#0b0f17'` → `'#0b1019'` | `'#eef1f4'` → `'#fbfaf7'` |
| `pn`（新） | `[11,16,25]` | `[251,250,247]` |

### 4.1 结构着色强度

- 公式不变：`t = min(1, |v−1|/0.4) · tint`，但混色目标改为 `dv<0 ? pal.vs : pal.vf`。
- **主页**：`tint` = 暗 0.50 / 亮 0.26（最大 |dv| 处：暗色慢 ≈ `rgb(66,30,63)`、快 ≈ `rgb(23,48,107)`；亮色慢 ≈ `rgb(216,203,207)`、快 ≈ `rgb(198,206,221)`）。
- **实验室**：`labPal()` 的乘数 `0.55` → `1.25`（即暗 0.625 / 亮 0.325；暗色慢 ≈ `rgb(80,35,75)`、快 ≈ `rgb(27,58,130)`）。理由：实验室里结构是被研究的对象，应比主页更清楚，而现在反而更淡。

### 4.2 界面线（去锯齿）

`cpuBackground` 里把硬阈值线改成“平滑权重 + 一次 3×3 模糊”：

1. 对矩形 `R` 向外扩 1 格（夹在网格内）的每个格点算 `d = max(|v[i+1]−v[i]|, |v[i+nx]−v[i]|)`；
2. `w0 = clamp((d − 0.02)/0.08, 0, 1)`，再 `w0 = w0·w0·(3 − 2·w0)`（旧：`(d−0.04)/0.05`，线性）；
3. 用核 `[1,2,1]⊗[1,2,1]/16` 对 `w0` 模糊一次；
4. `w = w0_blur · pal.edgeA`（旧：`· 0.45`），向 `pal.edge` 混色（旧：向 `pal.ink`）。

效果：线宽约 2–3 格的柔边、颜色是带蓝的浅灰（暗）/ 墨蓝（亮），放大后不再有阶梯。平滑团块模型的 `d < 0.02`，不会出线。

### 4.3 振幅映射

- 阈值 `THRESH = 0.05`、幂 `0.75` **不变**（弱尾波保持不可见，这是对的）。
- 新增**白芯**：混完波色之后，`col = mix(col, white, core · a³)`，`a` 为映射后的振幅（0…1）。暗色 `core = 0.30`，亮色 `0`（纸上不发光）。
  - GPU（`FS.show`）：新增 `uniform float uCore;`，三个分支里每次 `col=col*(1.0-a*uMix)+C*a;` 之后加 `col=mix(col,vec3(1.0),uCore*a*a*a);`（弹性模式对 `a`、`b` 各做一次）。
  - CPU（`CA.render` / `CE.render`）：写入 `d[j..j+2]` 后，`h = pal.core*t*t*t; if (h) { d[j] += (255-d[j])*h; … }`。
- 这只改显示，不改波场数值。

---

## 5. 组件规格

### 5.1 选中语言（全站唯一规则）

| 状态 | 样式 |
|---|---|
| 默认 | 透明底，`color:var(--ink2)`，`border:1px solid var(--line2)`（图标按钮无边框） |
| 悬停 | `background:var(--panel2)`，`color:var(--ink)`，边框 `var(--line2)` 不变色 |
| **选中 / 按下**（`aria-pressed="true"`） | `background:var(--accent-soft)`，`color:var(--cyan)`（亮色主题同样用 `--cyan`），`box-shadow:inset 0 0 0 1px var(--accent-line)`，边框透明 |
| 主行动（每屏至多一个可见：`.pbtn.go`、`#ctaBtn`） | `background:var(--cyan)`，`color:var(--accent-ink)`，`border-color:var(--cyan)`，字重 600；悬停 `filter:brightness(1.08)`；按下 `transform:translateY(1px)` |
| 禁用 | `opacity:.38` |
| 焦点 | `outline:2px solid var(--cyan); outline-offset:2px` |

例外：慢/快笔刷选中时底色用各自的色，`background:color-mix(in srgb,var(--slow) 22%,transparent); color:var(--slow); box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--slow) 55%,transparent)`（快同理）。主页 “Open the Wave Lab” 保持实心 `--ink` 胶囊（它是首屏唯一的主行动）。

### 5.2 界面控件

- **工具条按钮**：主页 `.lab button` 40×40、实验室 `.tools button` 34×34；圆角 `--r-md`；图标 20px / 18px，SVG `stroke-width` 统一 **1.6**，`stroke-linecap:round; stroke-linejoin:round`；容器内距 4px、间距 2px、容器圆角 `--r-lg`。主页容器是 `.glass`；实验室容器 `background:var(--bg2); border:1px solid var(--line)`。
- **悬停提示**（主页工具条，仅 `@media (hover:hover)`）：`.lab button::after{content:attr(aria-label)}`，位于按钮左侧 `right:calc(100% + 10px); top:50%; transform:translateY(-50%)`；`font:500 12px var(--sans)`，`padding:5px 9px`，`border-radius:8px`，`background:var(--bg3)`，`color:var(--ink)`，`border:1px solid var(--line2)`，`white-space:nowrap`，`opacity:0 → 1`，延迟 350ms，时长 `--t-fast`；按钮 `aria-pressed="true"` 且浮层打开时不显示。
- **浮层面板**（`.lab-pop`、`.topt`、`.pop`、`.menu`）：`.glass` + `border-radius:var(--r-lg)` + `box-shadow:var(--sh-2)`；内距 14px 16px 16px；标题 `--fs-micro` 颜色 `--ink2`；正文 `--fs-sm` / 1.5；`input[type=range]` 的 `accent-color:var(--cyan)`，高度 18px。
- **分段按钮 `.seg`**：容器 `padding:3px; border:1px solid var(--line2); border-radius:var(--r-md); background:var(--panel)`；子按钮 `border-radius:7px; padding:5px 8px; font:500 12.5px var(--sans)`；选中态按 5.1。
- **选项按钮 `.opt` / 次按钮 `.pbtn`**：统一 `border-radius:var(--r-md); padding:7px 12px; font:500 12.5px/1.25 var(--sans); border:1px solid var(--line2)`。**实验室里不再出现胶囊形按钮。**
- **chip**：`border-radius:var(--r-md); padding:6px 10px; font:500 12px var(--sans); letter-spacing:0; text-transform:none`。
- **状态胶囊 `.status`**：保留胶囊；`font:500 11px var(--mono); letter-spacing:.02em; background:var(--panel)`。
- **步骤卡 `.st`**：
  - 默认：无底无框，`padding:12px`，序号圈 22px。
  - 当前 `.st.now`：`background:var(--bg3); border:1px solid var(--line2); border-radius:var(--r-lg); box-shadow:var(--sh-1)`；序号圈 `background:var(--cyan); color:var(--accent-ink); border-color:var(--cyan)`（去掉外发光环）。
  - 已完成 `.st.done`：标题 `color:var(--ink2)`；序号圈 `background:var(--accent-soft); color:var(--cyan)`。
  - **非当前步的正文折叠为 2 行**（纯 CSS，不改逻辑）：`.st:not(.now) .st-d{display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden}`；`.st:not(.now):hover .st-d, .st:not(.now):focus-within .st-d{-webkit-line-clamp:unset}`。控件 `.st-c` 始终可见、可用。
- **结果卡 `.res`**：`background:var(--bg3); border:1px solid var(--line); border-left:2px solid var(--cyan); border-radius:var(--r-md); padding:12px 14px`；`dt` `--fs-xs` `--muted`；`dd` `600 13px var(--mono)` `--ink`。
- **toast**：`.glass` 胶囊，`padding:9px 16px; font:500 13px var(--sans)`；出现 `translate(-50%,-6px) → (−50%,0)` + 透明度，`--t-slow var(--ease)`。
- **进度条 `.prog`**：高 2px（旧 3px），`background:linear-gradient(90deg, transparent, var(--cyan))`，右端加 `box-shadow:0 0 10px var(--cyan)`（亮色主题去掉阴影）。
- **图例**：两类形状区分。
  - 波：8px 圆点（`.sw{border-radius:50%; width:8px; height:8px}`）。
  - 结构：一条 28×8px 的渐变条，圆角 4px，`background:linear-gradient(90deg, var(--slow), color-mix(in srgb,var(--slow) 25%,var(--bg2)) 46%, color-mix(in srgb,var(--fast) 25%,var(--bg2)) 54%, var(--fast))`，两侧文字 `slow` / `fast`。主页 `.vlegend` 与实验室 `L.legendVel()` 用同一结构。
  - 实验室 `.legend`：`flex-wrap:nowrap; overflow:hidden; max-width:48%; gap:12px; font-size:12px`。

### 5.3 实验室版面（图底关系）

```
┌ bar 52px ────────────────────────────────────────────────┐
│ rail 200px │ stage（padding 10px, gap 10px）   │ insp 348px │
│            │  vbar  (无边框, 高 40px)          │  (卡片)    │
│            │  ┌ view 卡 r14, line2, sh-1 ┐    │            │
│            │  └──────────────────────────┘    │            │
│            │  ┌ data 卡 r14, bg2, line   ┐    │            │
└────────────┴──┴──────────────────────────┴────┴────────────┘
```

- `.app` 底色 `--bg`；`.view`、`.data`、`.insp` 是三张卡（`--bg2` 表面，`.view` 用画布自身底色）。
- `.rail a[aria-current="page"]`：`background:var(--accent-soft); box-shadow:inset 2px 0 0 var(--cyan)`；序号块选中按 5.1 主行动色。条目标题 `--fs-md`，副标题 `--fs-xs --muted`。
- `.data-h h2`：改为 `font:600 12.5px/1.3 var(--sans); letter-spacing:0; text-transform:none; color:var(--ink2)`，其中 `<b>`（数字、台站码）`font-family:var(--mono); color:var(--cyan)`。

### 5.4 数据面板（canvas）

通用：字号最小 10px（`L.font(ctx, 9|9.5)` → `10`；`panelLabel` 用 600 10px）；所有外框 `strokeRect` 用 `pal.tick`、1px；面板内底色用 `pal.pn`。

- **地震道 `L.drawSection` 与主页 `drawTrace`**
  - 单道：线宽 `1.25` → **`1.6`**；**单道也画变面积填充**（正半周，`pal.fill`，`globalAlpha 0.7`）；中线画一条 `pal.grid` 1px 基线。
  - 多道：线宽 `1`（不变），颜色 `pal.trace`；填充 `pal.fill`；台站码 500 10px `pal.label`，左栏宽 `38` → `42`。
  - 时间网格：每 1 s 一条竖线，`pal.grid`，1px，贯穿整个道区高度（现在只有底部 5–6px 短刻度）；短刻度保留，色 `pal.tick`。
  - 时间轴标签：500 10px；`now` 用 `rgba(pos, .95)`，其余 `pal.label`。
  - 原点标记：虚线 `[3,3]` → `[2,3]`，1px，`rgba(origin,.8)`；标签 600 10px `rgba(origin,.95)`。
- **DAS 瀑布图 `drawWaterfall` + `L.div`**：`L.div` 的底色 `pal.bg` → `pal.pn`，幂 `0.8` → `0.7`（弱到达更可见）；外框 `pal.tick`。
- **互相关图（Ambient noise）**：叠加曲线线宽 `1.3` → `1.5`；两个框（原始噪声 / 相关叠加）**顶边对齐到 y=16、底边对齐到同一 y**；±t_AB 竖线同原点标记规格。
- **层析三联图（Tomography）**：让三张图吃满面板高度：`mw = min((w·0.66 − 28 − 24)/3, (h − 62)·gx/gz)`（旧 `(h − 58)` 配 `gap 8`），图间距 `8` → `12`，`y0 = 20`；色标条高 `7` → `8`，置于图下 10px；“RAY COVERAGE” 的强度色 `pal.ink` → `pal.pos`（青色覆盖度，与红蓝速度图区分）；左侧炮集道线宽 `0.8` → `0.9`，颜色 `rgba(ink,.55)`，拾取点保持珊瑚色、半径 1.8。
- **质点运动图（Elastic）**：轨迹线宽 `1.2` → `1.5`，颜色由 `ink` 改为 `pos`（`alpha 0.12 + 0.85·a`）；最新一点画实心圆 r=3 `rgba(pos,1)`；十字轴 `pal.grid`。Z 道 `pal.trace`、X 道 `rgba(sw,.95)`，线宽 `1.2` → `1.4`。

### 5.5 波场叠加层（canvas）

- **台站三角**：`s` = 单个 6.5、多个 5；填充 `rgba(ink,.96)`；改“清晰描边”代替模糊晕影：`shadowBlur 6` → `0`，另加 `lineWidth 1.5; strokeStyle = pal.halo; stroke()` 先于 `fill()`（描边在下）。拖动中的台站：填充 `rgba(pos,1)`、`s×1.3`。
- **标签**：`'600 10.5px "JetBrains Mono"'`；`shadowBlur 4` → `0`，改为 `lineWidth 3; strokeStyle = pal.halo; strokeText()` 后 `fillText()`（文字描边，锐利）。
- **震源**：星形不变（r=7，`pal.neg`，淡出 2.5 s），外加一圈扩散环：半径 `7 + 30·age`，`lineWidth 1.2`，`rgba(neg, .55·(1−age))`，只在 `age < 0.5` 时画；`prefers-reduced-motion` 下不画环。
- **散射体**：实心圆 `rgba(ink,.9)`，半径不变；描边 `pal.halo` → `rgba(edge,.6)`，1px。
- **射线（Tomography）**：`lineWidth 1` → `0.8`；颜色 `ink` → `edge`，不透明度 `min(0.14, 6/n + 0.03)`。
- **光缆（DAS）**：晕线 `5` → `4.5`、芯线 `2.2` → `2`，`rgba(pos,.95)`；公里点半径 `2.4` → `2`；起点圆 r=4 不变。
- **笔刷光标 / 布阵预览虚线**：虚线 `[5,5]` / `[4,4]` → 统一 `[3,4]`；线宽 `1.4` / `1.2` → 统一 `1.25`。

---

## 6. 动效

| 什么动 | 属性 | 时长 | 缓动 |
|---|---|---|---|
| 按钮悬停 / 选中 | background, color, box-shadow | 120ms | `var(--ease)` |
| 主按钮按下 | transform translateY(1px) | 80ms | linear |
| 浮层出现（`.lab-pop`、`.topt`、`.pop`、`.menu`） | opacity 0→1，transform `translateY(4px) scale(.98)` → none | 180ms | `var(--ease)` |
| toast | 见 5.2 | 260ms | `var(--ease)` |
| 步骤卡切换当前步 | background, border-color, box-shadow | 260ms | `var(--ease)` |
| 主题切换 | background-color, color | 300ms（现状保留） | ease |
| 震源扩散环（canvas） | 半径、透明度 | 1.25 s（= age 0→0.5） | 线性 |
| 进度条 | width | 150ms linear（现状保留） | — |

浮层出现的实现（不动 JS）：`@keyframes pop-in{from{opacity:0; transform:translateY(4px) scale(.98)}}`，给上述选择器加 `animation:pop-in var(--t-mid) var(--ease)`。注意主页 `.lab-pop` 自带 `transform:translateY(-50%)`：其关键帧写成 `from{opacity:0; transform:translateY(calc(-50% + 4px)) scale(.98)}`，单独命名 `pop-in-mid`。

`@media (prefers-reduced-motion:reduce)`：以上 animation / transition 全部 `none`；canvas 扩散环不画；现有 shake、pulse、blink 的关闭规则保留。

---

## 7. 手机端

断点沿用：`≤899px`（实验室单列）、`≤640px`（主页）。

- **实验室 ≤899px**：`.stage{padding:8px; gap:8px}`；`.view{height:min(62svh,118vw); border-radius:12px}`；`.data{height:230px; border-radius:12px}`；`.insp{margin:0 8px 8px; border-radius:12px; padding:16px 14px 40px}`；`.tools button{width:40px; height:40px}`；`.legend{font-size:11.5px; gap:10px}`；5.2 的步骤折叠在手机上同样生效（这是把整页从约 6000px 压短的主要手段）。
- **主页 ≤640px**：`.lab button{width:40px; height:40px}`（现 38）；悬停提示不出现（`hover:none`）；`.vlegend` 只留渐变条 + `slow` / `fast`；`.kicker{letter-spacing:.12em}`。
- 触控：所有可点目标 ≥ 40×40px。

---

## 8. 验收要点（实现后回传截图时我会看这些）

1. 暗色任一章节：图例里“波”是圆点、“结构”是渐变条；慢速区是莓紫而非砖红；波前压在慢速区上依然干净。
2. `lab/#arrays` 的层状模型：界面线无阶梯、比现在淡。
3. 同一屏内实心填充的按钮 ≤ 1 个。
4. 波场、数据面板、说明栏是三张圆角卡。
5. 画布上找不到小于 10px 的字。
6. 层析三联图占满数据面板高度。
7. 亮色主题：纸底偏暖，结构是灰紫 / 灰蓝淡彩，没有粉红 + 婴儿蓝。

---

## 9. 可执行改动清单

记号：`H` = `drafts/v2a/index.html`，`LH` = `drafts/v2a/lab/index.html`，`E` = `js/wave-engine.js`，`LJ` = `js/lab.js`，`LC` = `js/lab-chapters.js`，`HJ` = `js/hero.js`。

### P0（必须做，共 14 条）

| # | 文件 · 选择器 / 函数 | 旧 → 新 |
|---|---|---|
| P0-1 | `E` · `PAL.dark` / `PAL.light` | 按第 4 节表格逐字段替换，并新增 `vs` `vf` `edge` `edgeA` `core` `pn` |
| P0-2 | `E` · `cpuBackground` | `col = dv < 0 ? pal.slow : pal.fast` → `dv < 0 ? pal.vs : pal.vf` |
| P0-3 | `E` · `cpuBackground` 界面线 | 按 4.2 的四步重写（平滑权重 + 3×3 模糊 + `edge` / `edgeA`） |
| P0-4 | `LJ` · `labPal()` | `o.tint = b.tint * 0.55` → `b.tint * 1.25` |
| P0-5 | `H`、`LH` · `:root` 与 `:root[data-theme="light"]` | 整段替换为 3.1 + 3.3 的变量（保留 `--display/--serif/--sans/--mono/--pad`）；`.glass` 换成 3.3 的定义 |
| P0-6 | `H`、`LH` · 所有 `[aria-pressed="true"]` 规则（`.lab button`、`.tools button`、`.seg button`、`.grid2 button`、`.opt`、`.chip`） | `background:var(--ink); color:var(--bg); border-color:var(--ink)` → 5.1 的选中态；慢/快笔刷按 5.1 例外 |
| P0-7 | `H`、`LH` · `.pbtn.go`（含 `#ctaBtn`） | `background:var(--ink); color:var(--bg); border-color:var(--ink)`；hover 变青 → 5.1 主行动样式（常态即青） |
| P0-8 | `H`、`LH` · `.pbtn`、`.opt`、`.seg`、`.seg button`、`.chip`、`.grid2 button` | 圆角 `999px` / `10px` 混用 → 按 5.2 统一 `--r-md`（`.seg button` 7px）；字号按 5.2 |
| P0-9 | `LH` · `.app` | `grid-template-columns:212px minmax(0,1fr) 340px; grid-template-rows:54px …` → `200px minmax(0,1fr) 348px; 52px …` |
| P0-10 | `LH` · `.stage` / `.vbar` / `.view` / `.data` / `.insp` / `.rail` | `.stage` 加 `padding:10px; gap:10px`，行高 `clamp(190px,31vh,300px)` → `clamp(200px,32vh,310px)`；`.vbar{border-bottom:0; padding:0 2px; min-height:40px}`；`.view{border:1px solid var(--line2); border-radius:var(--r-lg); box-shadow:var(--sh-1)}`；`.data{border:1px solid var(--line); border-radius:var(--r-lg); overflow:hidden}`（去掉 `border-top`）；`.insp{margin:10px 10px 10px 0; border:1px solid var(--line); border-radius:var(--r-lg); background:var(--bg2)}`（去掉 `border-left`）；`.rail{border-right:0}` |
| P0-11 | `LJ` · `L.legendVel()`；`H` · `.vlegend` 标记与样式；`LH` · `.sw`、`.legend` | 两个色块 → 5.2 的渐变条结构：`<span class="vramp">slow<i></i>fast</span>`，`.vramp i` 用 5.2 的渐变；`.sw` 改圆点；`.legend` 改单行 |
| P0-12 | `LJ` · `L.font` 调用、`L.panelLabel`、`L.label`；`HJ` · `octx.font` / `tctx.font`；`LC` · 所有 `L.font(ctx, 9)` | `9` / `9.5` → `10`；标签 `'500 10px'` → `'600 10.5px'` |
| P0-13 | `LJ` · `L.drawSection`；`HJ` · `drawTrace` | 单道线宽 `1.25` → `1.6`；去掉填充外层的 `if (many)` 限制（单道也填充，`globalAlpha 0.7`，画完恢复 1）；多道左栏 `38` / `40` → `42` |
| P0-14 | `LC` · Tomography `data()` | `mw = Math.min((w*0.66 - 28)/3, (h - 58)*gx/gz)` → `Math.min((w*0.66 - 52)/3, (h - 62)*gx/gz)`；`y0 = 18` → `20`；三处 `mw + 8` → `mw + 12`（含 `x0 = w - 14 - 3*mw - 16` → `- 24`）；色标 `y0 + mh + 8, …, 7` → `y0 + mh + 10, …, 8`；覆盖度颜色 `c = pal.ink` → `pal.pos` |

### P1（明显加分，共 12 条）

| # | 文件 · 位置 | 改动 |
|---|---|---|
| P1-1 | `E` · `FS.show`、`gl.uniform1f(... 'uMix' ...)` 处、`CA.render`、`CE.render` | 加白芯：4.3 |
| P1-2 | `LJ` · `L.timeAxis`；`HJ` · `drawTrace` 刻度段 | 每秒竖网格线贯穿道区（`pal.grid`）；`now` 标签用 `rgba(pos,.95)`。`L.timeAxis` 增加可选第 8 参 `gridTop`，各章节调用处传入道区顶 y |
| P1-3 | `LJ` · `L.tri`、`L.label`、`L.star`；`HJ` · `tri` 与标签段 | 5.5：去 `shadowBlur`，改描边；拖动中台站用 `pos` 色 |
| P1-4 | `LJ` · `drawOverlay` 震源段；`HJ` 无（主页不画星） | 加扩散环：5.5 |
| P1-5 | `LJ` · `L.div` / `L.velCol` | 底色 `pal.bg` → `pal.pn`；`L.div` 幂 `0.8` → `0.7` |
| P1-6 | `LH` · `.st`、`.st.now`、`.st.done`、`.st-d`、`.res` | 5.2 的步骤卡 / 结果卡样式与 2 行折叠 |
| P1-7 | `LH` · `.rail a`、`.rail a[aria-current="page"]`、`.data-h h2` | 5.3 |
| P1-8 | `H` · `.lab button`、`.lab`、新增 `.lab button::after` | 40px、圆角、图标描边 1.6、悬停提示：5.2 |
| P1-9 | `H`、`LH` · 浮层与 toast | `pop-in` / `pop-in-mid` 关键帧与 reduced-motion：第 6 节 |
| P1-10 | `H`、`LH` · 所有 `letter-spacing:.16em/.18em/.2em/.22em` 的大写标签 | → `.08em`（主页 `.kicker` 保留 `.16em`，它是版式元素） |
| P1-11 | `LC` · Elastic `data()`、Ambient noise `data()` | 质点运动与互相关的线宽 / 颜色 / 对齐：5.4 |
| P1-12 | `LC` · Tomography `overlay` 射线、Arrays 光缆、各虚线 | 5.5 的线宽 / 颜色 / 虚线 |

### P2（收尾，共 6 条）

| # | 文件 · 位置 | 改动 |
|---|---|---|
| P2-1 | `LH`、`H` · `@media (max-width:899px)` / `(max-width:640px)` | 第 7 节 |
| P2-2 | `LH` · `.prog i`、`.status`、`.res` 等细节 | 5.2 进度条渐变、状态胶囊底色 |
| P2-3 | `LJ` · 导出 PNG（约第 534–540 行） | 回退色 `'#070a10'` / `'#0b0f17'` → `'#070a12'` / `'#0b1019'` |
| P2-4 | `H` · `.hero::after` | 两处 `.55` → `.45`（结构变干净后，蒙版可以更薄）；底部 `.9` 不变 |
| P2-5 | `H` · `.mark i`、`LH` · `.back i` | 发光圈颜色随 `--cyan`：`rgba(79,216,232,.14)` → `color-mix(in srgb,var(--cyan) 16%,transparent)` |
| P2-6 | `H` · `.pulse` 关键帧 | `rgba(255,122,92,…)` → `rgba(255,128,88,…)` |

实现后请回传：`home-{dark,light}.png`、`lab-{play,arrays,tomo,noise,elastic}-{dark,light}.png`、`lab-phone.png`，用 `design/shots.js` 同参数重拍到 `design/shots-after/`。
