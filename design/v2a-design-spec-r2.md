# v2a 第二轮设计规格：图面即图表（设计交接，勿合并）

- 第一轮规格：`design/v2a-aesthetic-spec.md`（已实现并合并进 `main`）。本文件是第二轮，只做设计。
- 代码基线：`main` @ `eb3b8d3`。文件记号：`LH` = `drafts/v2a/lab/index.html`，`LJ` = `js/lab.js`，`LC` = `js/lab-chapters.js`，`E` = `js/wave-engine.js`，`H` = `drafts/v2a/index.html`，`HJ` = `js/hero.js`。
- 现状截图：`design/shots-r2/`（1440×900 暗 / 亮；`*@2x.png` 是数据面板与波场的 2 倍局部；`text/*.txt` 是各状态下的全部界面文字；清单见 `INDEX.md`）。
- 视觉样张：`design/mocks/r2-lab-tomo.html`（整页：层析做完后的样子）与 `design/mocks/r2-panels.html`（各数据图与说明栏片段），截图在同目录 `r2-*.png`；`r2-fig1…5-compare.png` 是“现状 / 样张”并排、带编号标注的对比图（由 `r2-compare.html` 生成）。样张是静态的，画面是程序化示意，不是求解器；它们由 Opus 子代理只读本规格做出来，用来检验规格能否照着执行，前后做了三遍，每一遍暴露出的缺口和标注碰撞都已改回本规格。
- 边界：求解器、数值方法、拾取与反演算法、现有交互一律不变。本轮只新增“输出”：标注、坐标、图例、读数、统计图，以及措辞。凡是新算出来的量都只读已有状态，不回写。

---

## 1. 现状诊断（第二轮，按影响排序）

| # | 问题 | 证据 | 为什么伤“科学逻辑” |
|---|---|---|---|
| D1 | **结论被埋在折叠线以下**。层析的 r = 0.96、时间反演的焦斑宽度都在说明栏最底部，要滚动才看得到；噪声的 SNR 藏在已折叠步骤的一行等宽字里。 | `tomo-done-dark.png`、`tr-focus-dark.png`、`noise-late-dark.png` | 实验做完了，答案不在图旁边。 |
| D2 | **画面没有尺度和量纲**。波场没有比例尺；图例只有 “slow / fast”，没有数值；模型多大、背景速度多少、震源主频多少，只写在折叠的 “What’s going on” 里。 | `play-section-dark-view@2x.png`、`arrays-seis-dark-view@2x.png` | 看的人无法把“这道波走了多远、多快”和任何数字对应起来。 |
| D3 | **观测与预测用同一种线**。发震时刻（已知事件）、±t_AB（理论预测）、“expected focus”（预测）、predicted P / S 全是珊瑚色或同款虚线。 | `noise-late-dark-data@2x.png`、`tr-focus-dark-data@2x.png`、`elastic-rayleigh-dark-data@2x.png` | 分不清哪条是“发生了的”，哪条是“应该发生的”。 |
| D4 | **一句话把斜率说反了**。Arrays 第 4 步写 “steep bands are slow waves”。这张图时间在横轴、距离在纵轴，越竖的条带视速度越**快**。 | `text/arrays-das.txt` | 直接的科学错误。 |
| D5 | **记录图读不出“谁是谁”**。Playground 放 6 个台，波场上只标了第一个和最后一个；道按放置顺序排，没有距离，看不出走时随距离增大。 | `play-section-dark.png` | 记录剖面的意义就是“距离—时间”，现在只是 6 条线。 |
| D6 | **标注压住了要看的东西**。时间反演的 “true source / focus” 两个标签叠在焦斑上；“origin” 被第一道穿过；“predicted S” 压在质点运动图标题上。 | `tr-focus-dark-view@2x.png`、`arrays-seis-dark-data@2x.png`、`elastic-ps-dark.png` | 结果本身被自己的说明挡住。 |
| D7 | **层析面板下半空着**，而“数据拟合得怎么样”没有图。 | `tomo-done-dark-data@2x.png` | 缺“数据 → 残差 → 模型”这一环，只剩“真值 / 结果”两张图并排。 |
| D8 | **图例和画面不一致**。时间反演的图例写 “peak p²”，实际画的是它的平方根（所以环外有一大片米色雾）；速度图例用饱和色块，画面上是暗色淡彩；主页说明里还写着 red / blue。 | `tr-focus-dark.png`、`HJ` 的 `info` 面板文字 | 图例必须和画面是同一把尺。 |
| D9 | **画布文字全是等宽大写**，并且 `JetBrains Mono` 只加载了 400 / 500，代码里却用 600，浏览器在做假粗体，结果卡数字和台站标签都发糊。 | `tr-focus-dark.png` 右下数字、`LH` 第 16 行字体链接 | 排版上的“终端味”和渲染缺陷。 |
| D10 | **噪声实验停在“看到了峰”**，没有把峰的位置变成一个量（台间速度），也看不到“叠得越多越清楚”的规律；下方那张图的说明是一句行话。 | `noise-late-dark-data@2x.png` | 缺“测量”和“统计规律”两步。 |
| D11 | **步骤是清单，不是流程**。看不出哪步是布置、哪步是观测、哪步是处理、哪步是解释；弹性波第 2 步的公式被两行折叠截断。 | `elastic-ps-dark.png` 右栏 | 实验的逻辑链不可见。 |
| D12 | 弹性波的 “S − P → 距离” 用的是**预测**到时，却没有说明，读起来像循环论证。 | `text/elastic-ps.txt` | 需要说清“这是预测值”，并在图上把它画出来。 |
| D13 | 时间反演的**两把尺不是同一个量**。页面量的是 p² 的半高宽（实测 0.40–0.42 λ），却拿它和“约 λ/2 的衍射极限”相比；λ/2 是压力振幅 J₀(kr) 的半高宽（0.48 λ），同一个理想焦斑按 p² 量是 0.36 λ。 | `text/tr-focus.txt` | 读数比“极限”还小，看起来像突破了衍射极限。必须用同一口径的参考值。 |

保留的部分：波场本身的光感、卡片版面、选中语言、暗 / 亮两套配色，全部不动。

---

## 2. 设计方向

**一句话：每一块画面都是一张能自己说清楚的图。**

三条规则，全站统一：

1. **量有名，轴有单位，色有标尺。** 图例先写物理量再给颜色；速度给出 km/s；波场有比例尺；每张数据图有标题、坐标和一句“怎么读”。
2. **实测为实，预测为虚。** 实线和实心符号 = 记录到的、拾取到的；虚线 `[4,3]` = 模型预测的。珊瑚色只表示震源和发震时刻；预测线用它所属震相的颜色（P 为青，S 为琥珀）。
3. **一条因果链，答案放在图旁边。** 每一步标明它在流程中的角色（Set up → Observe → Process → Interpret）；每个实验的关键数字出现在数据图标题右侧，而不是说明栏底部。

气质上延续第一轮的“会发光的地震仪”，这一轮加的是“刻度”：细、准、安静，不抢波场。

---

## 3. Token 增补

### 3.1 CSS 变量（`LH`、`H` 的 `:root` 与亮色各加三项）

```css
:root{ --field:#080b13; --vs:#421f40; --vf:#17316c; }
:root[data-theme="light"]{ --field:#f6f5f0; --vs:#d2c2c7; --vf:#bbc5d9; }
```

`--vs` / `--vf` 是波场上实际显示的慢 / 快淡彩（`PAL.vs` / `PAL.vf` 以 `tint` 混入 `PAL.bg` 的结果），图例用它们画色标，和画面同色。

### 3.2 `PAL`（`E`）各加两项

| 字段 | `PAL.dark` | `PAL.light` | 用途 |
|---|---|---|---|
| `sub` | `'#b3bfd0'` | `'#3a4658'` | 画布上的小图标题 |
| `axis` | `'rgba(148,170,214,.34)'` | `'rgba(28,36,52,.34)'` | 坐标轴线、零线 |

### 3.3 画布文字角色（`LJ` 新增 `L.fontS`，全部画布文字照此分工）

```js
L.fontS = function (ctx, px, w) { ctx.font = (w || 400) + ' ' + px + 'px "Inter", system-ui, sans-serif'; };
```

| 角色 | 字体 | 颜色 | 例 |
|---|---|---|---|
| 小图标题 | `L.fontS(ctx, 11, 600)`，句首大写，不再全大写 | `pal.sub` | `True model` |
| 数字、刻度、台站码 | `L.font(ctx, 10)`（JetBrains Mono 500） | `pal.label` | `−3 s`、`L07`、`4.2 km` |
| 坐标轴标题、占位提示 | `L.fontS(ctx, 10.5, 400)` | `pal.label` | `lag τ (s)` |
| 标注（发震时刻、预测到时） | `L.fontS(ctx, 10.5, 500)` | 标注自身的颜色 | `origin time` |
| 波场上的文字标签 | `'600 11px "Inter"'` + 3px `pal.halo` 描边 | `rgba(ink,.96)` | `true source` |
| 波场上的台站码 | `'500 10.5px "JetBrains Mono"'` + 3px `pal.halo` 描边 | `rgba(ink,.96)` | `YW01` |

**等宽字一律不超过 500**（600 没有加载）。

小图标题不得超出自己那张小图的宽度：`L.panelLabel(ctx, s, x, y, col, maxW)` 新增第 6 个参数，传了 `maxW` 且 `ctx.measureText(s).width > maxW` 时，从末尾起逐段去掉 `' · …'`，直到放得下。所有小图标题都把小图宽度作为 `maxW` 传入。

### 3.4 线型与符号（全站统一）

| 含义 | 画法 |
|---|---|
| 记录、拾取、测得的峰 | 实线；实心符号 |
| 模型预测（到时、聚焦时刻、±t_AB、√N 曲线、f₀） | 虚线 `setLineDash([4,3])`，线宽 1，震相色（P = `pal.pos`，S = `pal.sw`） |
| 震源 / 发震时刻 | 珊瑚色 `pal.neg`：波场上是实心星，数据图上是同一颗星 + 1px 实线 `rgba(origin,.5)` |
| 坐标轴 | 1px `pal.axis`；刻度 4px；网格 `pal.grid` |

---

## 4. 版面结构调整（三处，都很小）

### 4.1 波场下方加一条“图注条”，图例从工具栏搬下来

理由：图例的惯例位置是图的正下方；搬走后工具栏只剩“工具 · 状态 · 主按钮”；图注条右半边可以放模型尺度这类一直该看得见的事实。

`LH`：从 `.vbar` 里删掉 `<div class="legend" id="legend"></div>`，在 `.view` 之后、`.data` 之前加：

```html
<div class="fkey">
  <div class="legend" id="legend"></div>
  <div class="facts" id="facts"></div>
</div>
```

```css
.stage{grid-template-rows:auto minmax(0,1fr) auto clamp(212px,33vh,320px)}   /* 旧：auto minmax(0,1fr) clamp(200px,32vh,310px) */
.fkey{display:flex; align-items:center; justify-content:space-between; gap:16px; min-height:20px; margin:-4px 0 -2px; padding:0 4px; min-width:0; overflow:hidden}
.legend{flex:none; justify-content:flex-start; max-width:none; overflow:visible; gap:14px}     /* 旧：flex-end; max-width:48%; overflow:hidden */
.facts{display:flex; flex:none; gap:14px; white-space:nowrap; font:500 11.5px var(--mono); color:var(--muted)}
.cta{margin-left:auto}
```

- 删除 `@media (min-width:900px) and (max-width:1439px)` 里的 `.legend{max-width:40%}`；`900–1199px` 里的 `.legend{display:none}` 改为 `.facts{display:none}`。
- `LJ`：`fitLegend()` 改为对整条 `.fkey` 生效。两个子块都不收缩，所以要自己量：先把 `#legend` 与 `#facts` 的子项全部显示；只要 `legend.offsetWidth + facts.offsetWidth + 16 > fkey.clientWidth`，就隐藏 `#facts` 里最后一个还显示着的子项；`#facts` 全部隐藏后仍放不下，再从 `#legend` 的最后一项开始隐藏（第一项永远保留）。在 `L.updateLegend()`、`facts()` 与窗口 `resize` 之后各调用一次。
- `LJ` 新增 `facts()`，在 `L.build()` 末尾、`L.setBC()` 之后、以及 `onAct` 处理 `fmul` 之后调用。内容最多四项，按这个顺序（越靠后越先被隐藏）：

| 项 | 文本 | `title` |
|---|---|---|
| 尺寸 | `10 × 5.5 km`（`L.KM` × `L.fmt(L.km(L.ny), 1)`） | `Size of the model` |
| 边界 | `free` → `free surface on top`；`box` → `reflecting box`；`absorb` 时不输出这一项（和 5.1 一致：只有会反射的边界才标出来） | `Boundary condition` |
| 背景速度 | 声波 `v₀ 2.5 km/s`；弹性 `V<sub>P</sub> 2.5 · V<sub>S</sub> 1.44 km/s` | `Background velocity (v = 1)` |
| 震源 | `f₀ 7.6 Hz · λ 0.33 km`，`λ = 2.5 / f` km。`f` 的取法：play、arrays、elastic 用 `L.eng.fHz * S.fmul`（地震工具可以改主频）；tr、tomo 用 `L.eng.fHz`（它们的震源主频固定）；noise 也用 `L.eng.fHz`，但写成 `f₀ ≈ 7.6 Hz`（噪声源主频有 ±30 % 的随机变化）。弹性波章节把 `λ` 写成 `λ<sub>P</sub>` | `Peak frequency of the source wavelet and its wavelength at the background velocity` |

### 4.2 数据面板标题区：标题 + 关键数字 + 一句“怎么读”

`LH`，`.data-h` 改为：

```html
<div class="data-h">
  <h2 id="dataTitle"></h2>
  <div class="data-r">
    <div class="kpis" id="dataKpi"></div>
    <div class="data-ctl" id="dataCtl"></div>
  </div>
  <div class="data-c">
    <p class="data-cap" id="dataCap"></p>
    <span class="lkey" id="dataKey" hidden><i class="obs"></i>observed<i class="pre"></i>predicted</span>
  </div>
</div>
```

```css
.data-h{display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; column-gap:12px; row-gap:2px; padding:8px 14px 4px; min-height:0}
.data-r{display:flex; align-items:center; gap:10px}
.data-c{grid-column:1 / -1; display:flex; align-items:baseline; gap:12px; min-width:0}
.data-cap{flex:1 1 auto; min-width:0; margin:0; font:400 12px/1.4 var(--sans); color:var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
.kpis{display:flex; gap:6px}
.kpi{display:inline-flex; align-items:baseline; gap:6px; padding:3px 9px; border-radius:var(--r-md); background:var(--accent-soft); box-shadow:inset 0 0 0 1px var(--accent-line); font:400 12px/1.5 var(--sans); color:var(--ink2); white-space:nowrap}
.kpi b{font:500 13px var(--mono); color:var(--cyan)}
.kpi.dim{background:var(--panel); box-shadow:inset 0 0 0 1px var(--line)}
.kpi.dim b{color:var(--ink)}
.lkey{flex:none; display:inline-flex; align-items:center; gap:6px; font:400 11.5px var(--sans); color:var(--muted); white-space:nowrap}
.lkey[hidden]{display:none}
.lkey i{display:inline-block; width:16px; height:0; border-top:1.5px solid var(--ink2)}
.lkey i.pre{border-top:1.5px dashed var(--ink2); margin-left:6px}      /* 只表示线型：预测线的颜色随震相而变（P 青、S 琥珀、DAS 上是白） */
.data-cap svg{width:12px; height:12px; vertical-align:-1.5px}
```

`LJ`：章节对象新增三个可选成员 `cap()`（返回 HTML，内容全部是本规格给出的固定文案）、`kpi()`（返回 HTML）、`lineKey`（布尔）。在 `hud()` 里每帧取值，和上一次不同才写 DOM（照 `lastHud` 的写法）：`#dataCap` 与 `#dataKpi` 用 `innerHTML`，并把 `#dataCap` 的 `textContent` 写进它的 `title`（被省略号截断时悬停可读全文）；`#dataKey.hidden = !ch.lineKey`。文案见 6.1 与 6.2。

第一行只放标题、关键数字和控件；“实线 = 实测、虚线 = 预测”的线型图例放在第二行右端，和那句“怎么读”是一回事。这样 1440px 宽时六个实验的标题都不会被省略号截断。

### 4.3 说明栏的步骤：加“角色”与连线，公式单独成块

`LJ` 的 `L.refresh()`：步骤对象新增可选字段 `k`（`'setup' | 'observe' | 'process' | 'interpret' | 'explore'`）和 `eq`（HTML）。在标题 `<p class="st-t">` 之前加一行 `<i class="st-k">Set up</i>`（角色写在标题上方，不和标题抢同一行的宽度，标题不会因此多折一行）；`eq` 渲染为 `<div class="eq">…</div>`，放在 `.st-d` 之后、`.st-c` 之前。显示名：`Set up`、`Observe`、`Process`、`Interpret`、`Explore`。各步的 `k` 见 6.4。

```css
.st{position:relative}
.st-k{display:block; margin:0 0 1px; font:500 10.5px/1.3 var(--mono); letter-spacing:.06em; text-transform:uppercase; color:var(--muted)}
.st.now .st-k{color:var(--cyan)}
.st:not(:last-child)::after{content:""; position:absolute; left:22.5px; top:38px; bottom:-14px; width:1px; background:var(--line2); pointer-events:none}
.st.done:not(:last-child)::after{background:var(--accent-line)}
.eq{margin:8px 0 2px; padding:7px 10px; border-radius:var(--r-md); background:var(--panel2); font:500 12.5px/1.5 var(--mono); color:var(--ink); white-space:nowrap; overflow-x:auto}
.explain code, .st-d code{font:500 12px var(--mono); color:var(--ink); background:var(--panel2); padding:1px 6px; border-radius:var(--r-sm); white-space:nowrap}   /* 旧：color:var(--cyan)，无底 */
```

（青色留给“选中”和“P 波 / 正压力”，公式不再用青色。）

---

## 5. 逐面板规格

### 5.1 波场叠加层（`LJ` 的 `drawOverlay`）

按这个顺序画：散射体 → **反射边界** → 震源标记 → 章节叠加层 → **比例尺** → 笔刷光标。

- **比例尺**（所有章节）：`pxkm = L.W / L.KM`；`km = pxkm >= 70 ? 1 : 2`；左下角 `x = 14, y = L.H − 14`。折线 `(x, y−5) → (x, y) → (x + km·pxkm, y) → (x + km·pxkm, y−5)`，先 `pal.halo` 3.5px 描边，再 `rgba(ink,.9)` 1.5px。在 `(x + km·pxkm + 6, y − 2)` 处写 `1 km` / `2 km`（`textAlign 'left'`、`textBaseline 'middle'`），用“台站码”字体角色。
- **反射边界**：`var B = L.BC[L.bc] || L.bc`；凡 `B.top === false`（或 bottom / left / right）的边，沿该边内侧 1px 处画一条 2px `rgba(ink,.5)` 的线。吸收边不画。（自由表面和反射箱由此可见。）
- **震源标记留到记录滚出窗口**：现在星形 2.5 s 后淡出，而数据图里的发震时刻线要 6 s 才滚出。淡出之后、且 `L.eng.n − m.n < L.TR` 期间，在原处画一颗空心星：半径 6，`pal.halo` 3.5px 描边垫底，`rgba(neg,.85)` 1.5px 描边，不填充。`L.star` 增加一个 `hollow` 参数实现。`ch.noMarks` 的章节照旧不画。
- **`L.label(ctx, s, x, y, align, col, mono)`**：新增第 7 个参数；`mono` 为真用“台站码”角色，否则用“文字标签”角色。`stations()` 里传 `true`，其余调用不传。
- **Playground 的台站全部标注**：`LC` 的 `stations(ctx, pts, o)` 里，标注条件加上 `o.labels === 'all'`；Playground 的 `overlay` 调用改为 `stations(ctx, this.rec.pts, { labels: 'all' })`。

### 5.2 记录剖面（`LJ` 的 `L.drawSection`，以及 `HJ` 的 `drawTrace` 里对应的部分）

新增选项，旧调用不传时行为不变：

| 选项 | 含义 | 画法 |
|---|---|---|
| `lane` | 顶部标注带高度；传了 `marks` 或 `pred` 时默认 14，否则 0 | 道区从 `Y + lane` 开始；发震时刻的星和文字只画在标注带里。标注带里的星和文字在所有道画完之后再画，文字下垫一块 `rgba(pn,.85)`：波峰可以伸进标注带，但盖不住文字 |
| `marks`（已有） | 发震时刻 | 每个标记：1px 实线 `rgba(origin,.5)`，从 `Y + lane − 2` 到 `Y + h`；顶上 `L.star(ctx, xm, Y + 7, 4.5, pal.neg, a)`，最新一个 `a = .95`，旧的 `.5`；最新一个右侧 `xm + 9, Y + 2` 写 `origin time`（标注角色，`rgba(origin,.95)`）；若右侧放不下（`xm + 80 > X + left + ww`）改为右对齐写在 `xm − 9` |
| `pred(tr)` | 返回第 `tr` 道的预测到时（与 `L.eng.n` 同一时钟的步数）或 `null` | 多道：把各道的预测到时按显示顺序连成一条虚线折线（节点在各道的基线上），在所有道之后画，`rgba(pos,.9)`。这就是走时曲线，道与道之间的空隙里始终看得见。单道：从 `Y + lane − 2` 到 `Y + h` 的整高虚线，并在标注带里、线的右侧 4px 处写 `predicted arrival`（`rgba(pos,.95)`，放不下时同样翻到左侧） |
| `right` + `rowText(tr)` | 右侧留 `right` px，逐道写一段文字 | 数字角色，右对齐于 `X + w`；`sp < 11` 时隔行写 |
| `order`（已有） | 道的排列顺序 | 不变 |
| `hi` | 高亮的道号 | 该道描边 `rgba(pos,1)`，线宽多道 1.4 / 单道 1.6；台站码用 `pal.sub` |
| `link` | 为真时把几何写进 `L.sec = { y, sp, nn, idx }`，供 5.9 的悬停联动用 | — |

另外三处固定改动：

- 道区底边画一条 1px `pal.axis` 的轴线；`L.timeAxis` 的短刻度从 6px 改为 4px。
- 滚动图的右边缘是“现在”：`L.timeAxis` 在传了 `gridTop` 时，在 `X + w` 处从 `gridTop` 到 `Y` 画一条 1px `rgba(pos,.45)` 的竖线。
- 单道时，在最新采样点画一个半径 3 的实心圆 `rgba(pos,1)`（记录笔的笔尖）。
- 本轮新增的各张小图都不单独放坐标轴标题（会和最后一个刻度数字相撞）：单位写在最后一个刻度数字上（`8 km`、`+3 s`、`40 windows`），量的名字写进小图标题。

返回值改为 `{ x, w, y: Y + lane, h: h − lane, sp }`。

`HJ` 的 `drawTrace`：发震时刻改为“实线 + 星 + `origin time`”（同上，标注带 14px 取自条带顶部），单道画笔尖圆点；其余不动。

### 5.3 Playground（`LC`，`id: 'play'`）

- `L.quake()`（`LJ`）在标记里多存一项 `fm: o.fmul || S.fmul`。预测到时 = `m.n + round(1.2 / (L.eng.f0 · m.fm)) + L.model.travelTime(m.x, m.y, p.x, p.y, L.rate) · L.rate`（直线射线穿过当前模型，和弹性波章节已有的 `predicted P` 同一算法），只对最新一次地震计算，每帧现算即可。
- `data()`：有地震时，`d[tr]` = 各台到最新震源的距离（格）。台数 > 1 时 `order` = 按 `d` 升序，`right: 46`，`rowText = L.fmt(L.km(d[tr]), 1) + ' km'`，`link: true`；始终传 `pred`、`marks`、`hi: L.hi`。
- `lineKey: true`。`cap()` 见 6.1。

### 5.4 Arrays & DAS（`LC`，`id: 'arrays'`）

地震计：

- `pred` 同 5.3。线阵时 `right: 46`，`rowText` = 沿阵列到第一个台的距离（km，一位小数）；环阵不传。`link: true`。
- **视速度量角器**（仅线阵，新函数 `L.slopeFan(ctx, x, y, pxPerSec, pxPerKm)`）：三条从同一顶点 `(x, y)` 向右下的参考线，分别对应 1.5、2.5、3.5 km/s，**水平跨度相同、下降高度不同**。`Hx = 44 · pxPerSec / (3.5 · pxPerKm)`；速度为 `v` 的那条线的终点是 `(x + Hx, y + v · Hx / pxPerSec · pxPerKm)`，所以 3.5 km/s 那条正好下降 44px：越快越陡，和“越竖越快”的读法一致。线宽 1，`pal.label`。三条线的终点右侧 4px 处用数字角色写 `1.5`、`2.5`、`3.5 km/s`（竖直方向各差约 12px，不会相叠）；顶点上方 6px 处用坐标轴标题角色写 `apparent velocity`。先在外接矩形（含文字，四周各扩 6px）下垫一块 `rgba(pn,.92)`、圆角 6、带 1px `pal.tick` 描边的底：它是一块有边框的小图例，不是把记录擦掉了一块。顶点放在 `(g.x + 12, g.y + g.h − 62)`，底块不得盖住底边轴线。`Hx > 0.3 · g.w` 时把 44 换成 30 重算；`Hx < 24` 时不画。`pxPerSec = g.w / 6`；`pxPerKm = g.sp / 台间距(km)`。

DAS：

- 顶部留 14px 标注带（瀑布图从 `y = 18` 开始），发震时刻用“实线 + 星 + `origin time`”。瀑布图右边缘直接画一条 1px `rgba(pos,.45)` 的“现在”竖线（这里不给 `L.timeAxis` 传 `gridTop`，免得网格线压在图像上）。
- 纵轴：每 1 km 一个 4px 刻度，每 2 km 写数字（`0`、`2`、`4`…，数字角色）；旋转标题由 `along cable` 改为 `distance along the cable (km)`（坐标轴标题角色）。波场上光缆每公里一个点，和这里的刻度一一对应。
- 预测到时：对每个通道 `c`（光缆点 `das.pts[das.ch[c]]`）算预测到时，连成一条虚线折线，只画落在窗口内的部分。条带本身就是青色和珊瑚色，所以这条预测线改用 `rgba(ink,.9)`（仍是虚线 `[4,3]`、线宽 1），压在条带上也分得清。
- 同样画视速度量角器，`pxPerKm = H / L.km(das.np − 1)`。

两种传感器都 `lineKey: true`。第 4 步的文案改正见 6.5。

### 5.5 Time reversal（`LC`，`id: 'tr'`）

波场：

- **`max` 显示改为线性的 p²**（`E`）。理由：图例写的是 “peak p²”，现在画的是它的平方根，所以环外有一大片米色雾；改成 p² 后，低于聚焦能量约 5 % 的部分自然消失，焦斑更干净。CPU（`CA.render` 的 `max` 分支）：`var a = Math.sqrt(X[i]) * gm` → `var a = X[i] * gm * gm`。GPU（`FS.show` 的第三个分支）：`float a=ramp(sqrt(max(f.r,0.0))*uGain)` → `float s=sqrt(max(f.r,0.0))*uGain; float a=ramp(s*s)`。半高宽本来就是按 p² 算的，数值不变。
- **标签不再压住焦斑**（`overlay`，仅 `phase === 'done'`）：`true source` 改到左上，引线从 `(X−7, Y−7)` 到 `(X−22, Y−22)`，文字右对齐于 `(X−25, Y−24)`；`focus` 改到右下，引线从 `(fx+7, fy+7)` 到 `(fx+22, fy+22)`，文字左对齐于 `(fx+25, fy+30)`。引线 1px `rgba(ink,.6)`。录制阶段的 `true source` 标签位置不变。
- 图例（`max` 模式）：`peak pressure² (1 = at the focus)`，`○ true source`，`✕ focus`。

数据面板（`data()`，`w ≥ 640`）：

- 记录图（各阶段都一样）：上方加小图标题，录制 / 已录制阶段写 `Recordings at the mirror`，回放 / 完成阶段写 `Recordings · re-emitted last sample first`；第一道从 `y = 18` 开始（原来是 4），`sp = (H − 14) / show.length`。底部刻度每 0.5 s 一个，数字 `0`、`0.5`、`1.0`…，最后一个数字带单位（`1.5 s`）；轴下不再写居中的那句话（它会和刻度数字相撞，意思已经在标题里）。
- 录制 / 已录制：记录图占整宽。
- 回放 / 完成：三栏。
  - 左栏宽 `wl = round(w · (this.img ? 0.56 : 0.68))`，画记录与回放指针（现状）。
  - 中栏：标题 `Pressure² at the source`；预测聚焦时刻的竖线改为虚线 `[4,3]` `rgba(pos,.9)`，下方文字 `predicted focus`（标注角色，`rgba(pos,.95)`，以虚线为中心，超出绘图区时贴边）；曲线仍用 `pal.hot` 实线。有 `this.img` 时中栏宽 `round(w · 0.20)`，否则占满余下宽度。
  - 右栏（仅有 `this.img` 时）：**焦斑放大图**。`finish()` 里多存一块裁剪：`R = max(5, round(lam))`（焦点四周各一个波长），`this.img.crop` = 以焦点为中心 `(2R+1)²` 格的 `mx / best`（越界填 0），`this.img.R = R`。画法：正方形左上角 `(xi, 18)`，边长 `S = min(w − 14 − xi, H − 14)`，`xi` = 中栏右边 + 16，`S < 90` 时不画；每格颜色 = `pal.pn` 向 `pal.hot` 按 `t = pow(max(0, (a − .05)/.95), .75)` 混合；外框 `pal.tick`。标题 `Focal spot · ×N`，`N = round((S / (2R + 1)) / (L.W / L.nx))`，即相对波场上一格的屏幕大小放大了几倍。中心画 `✕`（焦点），真实震源按偏移画 6px 虚线圆。左下角叠两根横条，都从 `xi + 8` 起，分别位于正方形底边上方 24px 与 10px：上面一根长度 = x 方向半高宽，`rgba(ink,.95)` 2px 带端帽，右侧写 `FWHM 0.42 λ`；下面一根长度 = 0.36 λ，`pal.label` 2px 带端帽，右侧写 `theory 0.36 λ`。两根横条一长一短，焦斑离理论值多远一眼可比。
  - **参考值为什么是 0.36 λ**（D13）：完整圆环、单一频率时，时间反演的焦斑是 J₀(kr)。页面量的是 p² 的半高宽，即 J₀² 的半高宽：J₀(x) = 1/√2 → x = 1.126 → 2x / 2π = 0.36 λ。常说的“约 λ/2”是同一个焦斑按压力振幅量的宽度（J₀(x) = 1/2 → 0.48 λ）。本轮所有“实测对理论”的比较都用 0.36 λ，文字里两个数都交代（见 6.5）。
- `lineKey`：回放与完成阶段为真。`kpi()`、`cap()`、结果卡见第 6 节。

### 5.6 Tomography（`LC`，`id: 'tomo'`）

`solve()` 的返回值多带两个数组（只读已有变量）：

```js
var res0 = new Float32Array(nr), res1 = new Float32Array(nr);
for (k = 0; k < nr; k++) { res0[k] = b[k] / L.rate * 1000; res1[k] = (b[k] - Ax[k]) / L.rate * 1000; }   // ms
```

`res0` = 相对起始模型的走时残差，和结果卡里的 `rmsPre` 同一口径（散点图与那个数字说的是同一批数）；`res1` = 反演后的残差，和 `rmsPost` 同一口径。画图时“反演前”取 `this.invStraight.res0`，“反演后”取 `this.inv.res1`，距离取 `this.rays[k].d`。

`data()` 版面（`w ≥ 640`；记画布高 `h`）：

- 左栏炮集：`x = 14`，宽 `gw = round(w · 0.22)`。标题 `Shot 12 · seismograms and picks`。道线不变。新增一条虚线：均匀模型的预测初至 `t = n0 + d / C`，把参与拾取的各道连起来（遇到未用的道断开），`rgba(pos,.9)`。底部 `0` 与 `5.2 s`，中间写 `time after the shot`。
- 右块起点 `x0 = 14 + gw + 30`，宽 `wR = w − 14 − x0`。
  - 三张图：`mw = min((wR − 24) / 3, (h − 140) · gx / gz)`，`mh = mw · gz / gx`，间距 12，标题行 `y = 2`，图顶 `y0 = 18`。标题：`True model`、`Recovered · bent rays`（或 `straight rays`）、`Ray coverage`。
  - 色标一（横跨前两张图，宽 `2·mw + 12`，高 6，位于图底 + 8）：下方左 `−30 %`、中 `velocity anomaly · 0 = 2.5 km/s`、右 `+30 %`。
  - 色标二（第三张图正下方，宽 `mw`）：`pal.pn` 到“`pal.pn` 向 `pal.pos` 混 50 %”的渐变；左 `few rays`，右 `many`。
  - **走时残差图**（新）：标题 `Travel-time residuals against distance · before (colour) and after (grey) the inversion`，位于图底 + 34；绘图区 `x` 从 `x0 + 44` 到 `x0 + wR`，`y` 从标题下 16 到 `h − 18`。
    - 横轴：炮检距，0 到 `ceil(最大炮检距 km)`，每 2 km 一个刻度和数字，最后一个数字带单位（`8 km`）。
    - 纵轴上下不对称，各按数据取整：`hi0 = max(50, ceil(max(res0) / 50) · 50)`，`lo0 = max(50, ceil(max(−res0) / 50) · 50)`，`hi = max(hi0, lo0 / 4)`，`lo = max(lo0, hi0 / 4)`，范围 `−lo … +hi` ms（任一侧至少占另一侧的四分之一，零线的数字不会和端点数字相撞）。零线 `pal.axis`；左侧数字 `+800 ms`（顶）、`0`（零线）、`−200`（底）。
    - 在 `main` 上实测（CPU 400 × 220，弯曲射线）供核对：默认随机模型 `res0` 为 −69 … +781 ms，均值 +215 ms，97 % 的拾取晚到（模型中部是一大块低速区），统一时移 τ 只有 28 ms；棋盘模型为 −196 … +108 ms，28 % 晚到。所以默认模型下几乎全是粉点、随距离向上散开，这是对的；棋盘模型下蓝粉各半。
    - 点：每条射线一个。反演前：半径 1.5，`res0 > 0`（到得晚，路径偏慢）用 `rgba(slow,.85)`，`res0 < 0` 用 `rgba(fast,.85)`；反演后：半径 1.2，`rgba(ink,.5)`，画在上层。
    - 没有反演结果时，绘图区中央写 `run the survey: every pick becomes a dot here`（占位提示角色）。
    - 勘测过程中每放完一炮就会重画，点会一批批长出来。
- `w < 640`：只画三张图和色标一（现状）。
- `lineKey: true`。`kpi()`、`cap()`、结果卡见第 6 节。

### 5.7 Ambient noise（`LC`，`id: 'noise'`）

新增只读量：

- `resetCC()` 里 `this.snrH = []`；`window()` 里 `this.nWin++` 之后 `this.snrH.push(this.snr())`（最多保留 400 个）。
- `peak(sign)`：在 `±t_AB` 附近 `±0.2 s` 内找叠加曲线的最大值，用三点抛物线细化，返回滞后时间（秒）或 `null`。
- `vEst()`：`snr() ≥ 4` 时返回 `台间距(km) / 滞后`，两侧都有峰取两侧滞后绝对值的平均，单侧噪声只用峰更高的一侧；否则返回 `null`。真值 `= 台间距(km) / this.tAB`。
- `snr()`、`peak()`、`vEst()` 只在 `window()` 里各算一次，存进 `this.now = { snr, lagP, lagN, v }`；`kpi()`、`data()`、结果卡都读这份缓存，不在每一帧重算。`resetCC()` 里清空。

`data()` 版面（`w ≥ 640`）：

- 左栏（宽 `lw = round(w · 0.3)`）上下两块：
  - 上：标题 `Raw noise at A and B · last 6 s`；两道，道区高 `Hraw = round((h − 60) · 0.45)`，下接时间轴。
  - 下：标题 `Signal-to-noise ratio of the stack`（位于上块时间轴下 6px）。绘图区：`x` 从 `14 + 22` 到 `14 + lw`，`y` 从标题下 20 到 `h − 20`。横轴 0 到 `Nmax = max(20, ceil(nWin / 20) · 20)`，刻度数字 `0`、`Nmax/2`、`Nmax windows`（单位写在最后一个上）；纵轴 0 到 `max(4, ceil(max SNR))`，两端数字右对齐于 `x − 4`、`textBaseline 'middle'`，分别对准绘图区的顶和底。实线：`snrH`，`pal.trace` 1.5px，末点画半径 3 的 `rgba(pos,1)` 实心圆。虚线：`a·√N`，`a = Σ(sᵢ·√i) / Σ i`，`rgba(pos,.9)`；在 `N = 0.6 · Nmax` 处、虚线上方 8px 写 `∝ √N`（标注角色，`rgba(pos,.95)`）。坐标轴 `pal.axis`。
- 右栏结构不变，改五处：
  - 标题 `Cross-correlation C_AB(τ) against lag τ · stack of 40 windows`，其中 `AB` 画成下标（基线下移 3px，字号 8.5）。
  - 叠加曲线的纵向幅度从 `H1/2 − 4` 改为 `H1/2 − 16`，图框内上方留出 16px 给文字和三角。
  - `±t_AB` 两条预测线改为虚线 `[4,3]` `rgba(pos,.9)`；文字 `−t_AB · B → A` 与 `+t_AB · A → B` 用标注角色、`rgba(pos,.95)`，下标同上。
  - `vEst()` 不为空时，在测得的峰顶上方 6px 画一个尖朝下的实心三角（边长 6，`rgba(ink,.95)`）：实测的峰和预测的虚线是否重合，一眼可见。
  - 横轴每 1 s 一个刻度和数字（`−3`…`0`…`+2`、`+3 s`，单位写在最后一个上）；删掉底部那句 `lag τ · rows: stack envelope / RMS after each window, newest last`。下方“浮现图”左上角内侧加一行小字 `stack after each window · newest at the bottom`（坐标轴标题角色，垫一块 `rgba(pn,.8)`）。
- `lineKey: true`。第 3 步里的 `<p class="live" id="nLive">` 保留。新增结果卡（见 6.3）：`results()` 返回 `<div class="res" id="nRes">…</div>`；之后每个窗口在 `window()` 里用 `L.html('nRes', …)` 只换卡片内部，不调用 `L.refresh()`（整栏重建会打断悬停和滚动）。

### 5.8 Elastic waves（`LC`，`id: 'elastic'`）

- 道区起点从 `x = 28` 改为 `x = 44`（代码里 `28` → `44`，`Wt − 14` → `Wt − 30`）。行标签：`Z` / `X` 用小图标题角色，各自下方 12px 处用坐标轴标题角色写 `up` / `right`。
- 顶部 14px 标注带：发震时刻用“实线 + 星 + `origin time`”；`predicted P`、`predicted S` 改为虚线 `[4,3]`，文字用标注角色，写在线的右侧 4px 处；文字若会越过道区右边界，改为右对齐写在线的左侧 4px 处。
- **S − P 括线**：`predicted P` 与 `predicted S` 两条线都在窗口内时，在两行道之间（`y = 4 + lane + (H − lane)/2`）画一条从 `xP` 到 `xS` 的水平线，1px `pal.sub`，两端 6px 端帽；正上方居中写 `S − P = 1.06 s`（标注角色，`pal.sub`，垫 `rgba(pn,.85)`）。
- 质点运动图标题 `Particle motion · last 1.2 s`；轴标 `X →`、`Z ↑` 改用坐标轴标题角色。
- `lineKey: true`。第 2 步的读数改写见 6.3。

### 5.9 悬停联动：道 ↔ 台站（`LJ` + `LC` 的 `stations()`）

- `LJ`：`L.hiD = −1; L.hiV = −1;`，`L.hi` 取 `L.hiD >= 0 ? L.hiD : L.hiV`。`drawData()` 开头置 `L.sec = null`。
- `#datac` 的 `pointermove`：有 `L.sec` 时，`row = floor((y − L.sec.y) / L.sec.sp)`，在范围内则 `L.hiD = L.sec.idx ? L.sec.idx[row] : row`，否则 −1；`pointerleave` 置 −1。
- `#view` 的 `pointermove`（未拖动时）：`hitHandle(e)` 命中则 `L.hiV = h.id`，否则 −1。
- `stations()`：`k === L.hi` 时按拖动中的样式画（`pal.pos`，1.3 倍），并且无论原规则如何都写出台站码。
- 传 `link: true` 的章节：Playground（多台时）、Arrays 的地震计。只在有指针悬停的设备上生效，不改任何点击与拖动逻辑。

### 5.10 主页（`H`、`HJ`）

- `HJ` 的 `info` 面板第二段：`red is slower than the background velocity (v < 1), blue is faster` → `berry pink is slower than the background velocity (v < 1), cobalt blue is faster`。
- `.vramp i`（`H`）：`width:28px; height:8px; border-radius:4px; background:…饱和渐变…` → `width:44px; height:10px; border-radius:3px; border:1px solid var(--line2); background:linear-gradient(90deg,var(--vs),var(--field) 50%,var(--vf))`。文字仍是 `slow` / `fast`（主页的坐标是装饰性的，不标 km/s）。
- `HJ` 的台站码字体：`'600 10.5px "JetBrains Mono"'` → `'500 10.5px "JetBrains Mono"'`。
- `drawTrace` 的发震时刻与笔尖：见 5.2。

---

## 6. 文案（全部给出原文，照抄）

### 6.1 “怎么读”一句话（`cap()`）

| 章节 · 状态 | 文本 |
|---|---|
| play · 还没有地震 | `Time runs left to right and ends at “now”. Click the wavefield to make a quake.` |
| play · 1 个台 | `★ is the quake’s origin time; the dashed line is the arrival predicted for a straight ray.`（其中 `★` 用 `L.glyph('star')` 的珊瑚色星代替文字符号） |
| play · 多个台 | `One row per station, nearest to the quake on top. Dashed curve: arrivals predicted for straight rays.` |
| arrays · 地震计 · 线阵 | `One row per station along the array. An upright band is fast (all stations at once); a leaning band is slow.` |
| arrays · 地震计 · 环阵 | `One row per station around the ring. The wave reaches the nearest stations first.` |
| arrays · DAS | `Rows are positions along the cable, colour is strain rate. Broadside waves leave almost no trace.` |
| tr · idle | `Fire a source inside the mirror: each row will be one sensor’s recording.` |
| tr · record / recorded | `One row per sensor. Sensors far from the source record the pulse later.` |
| tr · reverse / done | `Recordings played backwards · pressure² at the source, peaking on the dashed line · the focal spot, magnified.` |
| tomo · idle | `Left: one shot’s seismograms and first-arrival picks. Right: the true model, the result and the ray coverage.` |
| tomo · survey / done | `Late picks (pink dots) crossed slow rock, early picks (blue) fast rock: the inversion maps these residuals.` |
| noise · 还没有窗口 | `Left: raw noise at A and B. Right: their cross-correlation, stacked window by window.` |
| noise · 已有窗口 | `Peaks grow at lag ±t<sub>AB</sub>, the A–B travel time. Positive lag: waves going A → B; negative lag: B → A.` |
| elastic | `Z and X ground velocity with the predicted P and S arrivals. Right: the path the ground traces.` |

每句不超过约 105 个字符：1440px 宽时和右端的线型图例能排在同一行而不被截断。

### 6.2 标题右侧的关键数字（`kpi()`）

| 章节 · 条件 | HTML |
|---|---|
| tr · 有 `img` | `<span class="kpi"><b>0.41 λ</b>focal spot</span><span class="kpi dim" title="Half-maximum width of J₀(kr)², the focus of a perfect ring at one frequency"><b>0.36 λ</b>theory</span>`（第一个数 = x、z 半高宽的平均） |
| tomo · 有 `inv` | `<span class="kpi"><b>r = 0.96</b>vs truth</span><span class="kpi dim"><b>255 → 42 ms</b>misfit</span>` |
| noise · `nWin > 0` | `<span class="kpi dim"><b>SNR 5.5</b>40 windows</span>`；`vEst()` 不为空时前面再加 `<span class="kpi"><b>2.52 km/s</b>from the lag</span>` |
| elastic · 有 `last` | `<span class="kpi dim"><b>1.06 s</b>S − P</span><span class="kpi"><b>3.6 km</b>distance</span>` |
| play、arrays | 不显示 |

### 6.3 结果卡：先给一个大数字

`.res` 内，`<h3>` 之后、`<dl class="kv">` 之前插一行：

```html
<p class="res-big"><b>0.41 λ</b><span>focal spot width, FWHM of p² · theory for a perfect ring: 0.36 λ</span></p>
```

```css
.res-big{margin:0 0 10px}
.res-big b{display:block; font:700 28px/1 var(--display); letter-spacing:-.02em; color:var(--ink)}
.res-big span{display:block; margin-top:5px; font:400 12px/1.35 var(--sans); color:var(--ink2)}     /* 说明写在大数字下面一行，不并排 */
.kv dd{font:500 13px var(--mono); white-space:nowrap}                 /* 旧：600，且会折行 */
.bar2{display:grid; grid-template-columns:1fr auto; align-items:center; gap:4px 10px; margin:10px 0 2px; font:400 12px var(--sans); color:var(--muted)}
.bar2 i{display:block; height:6px; border-radius:3px; background:var(--line2); width:var(--w)}
.bar2 i.on{background:var(--cyan)}
.bar2 em{font:500 12px var(--mono); font-style:normal; color:var(--ink); white-space:nowrap}
```

| 章节 | 大数字 | 旁注 | 其余 |
|---|---|---|---|
| tr | x、z 半高宽的平均，`0.41 λ` | `focal spot width, FWHM of p² · theory for a perfect ring: 0.36 λ` | 原有四行 `kv` 不变；结论句按 6.5 改 |
| tomo | `r = 0.96` | `correlation between the recovered and the true model` | `kv` 之前加一组对比条：`<div class="bar2"><i style="--w:100%"></i><em>255 ms · uniform start</em><i class="on" style="--w:16%"></i><em>42 ms · recovered</em></div>`，第二条宽度 = `rmsPost / rmsPre`；`kv` 里删去两行残差和 `Correlation with the truth`（它已经是大数字），只留 `Picked rays` 与 `Straight rays alone` 两行；结论句不变 |
| noise（新卡，`<div class="res" id="nRes">`，标题 `Interferometry`） | `vEst()` 不为空：`2.52 km/s`；否则 `SNR 2.1` | 前者：`velocity between A and B from the peak lag · true 2.50 km/s`；后者：`not above the noise yet: keep stacking` | `kv`：`Windows stacked` `40 (120 s of noise)`；`Predicted t_AB` `0.96 s`；`Measured lag`（有值时）`+0.95 s · −0.96 s`；`Signal-to-noise ratio` `5.5` |
| elastic（第 2 步的 `#spLive`，不是 `.res`） | `3.6 km` | `distance from the predicted S − P time · check that P and S arrive on the dashed lines` | `kv` 改为三行：`S − P time, predicted` `1.06 s`；`× V_P / (√3 − 1)` `3.42 km/s`；`Mean V_P on the path` `2.50 km/s` |

结果卡第一次出现时（时间反演 `finish()` 之后、层析勘测完成并反演之后），在 `L.refresh()` 之后调用一次 `insp.querySelector('.res').scrollIntoView({ block: 'nearest', behavior: L.reduceMotion ? 'auto' : 'smooth' })`。同一次运行只滚一次。

### 6.4 步骤角色（`k`）

| 章节 | 各步依次 |
|---|---|
| play | setup · setup · setup · observe · explore |
| arrays | setup · setup · observe · interpret |
| tr | setup · observe · process · interpret |
| tomo | setup · observe · process · interpret |
| noise | setup · observe · process · interpret |
| elastic | observe · interpret · explore · explore |

### 6.5 措辞改正

| 位置 | 旧 | 新 |
|---|---|---|
| arrays 第 4 步 `d` | `Each arrival is a band across the record; its slope is the apparent slowness 1/v<sub>app</sub>, so steep bands are slow waves.` | `Each arrival is a band across the record. Time runs across and distance runs down, so the tilt of a band is the apparent velocity along the array: an upright band reaches every sensor almost at once (fast, or arriving broadside), a band that leans over is slow.` |
| elastic 第 2 步 | 公式写在 `d` 里（会被折叠截断） | `d` 改为 `<b>P</b> arrives first, <b>S</b> later; the gap grows with distance.`（两行以内，折叠时不被截断）；公式移到 `eq`：`d ≈ Δt<sub>S−P</sub> · V<sub>P</sub>V<sub>S</sub> / (V<sub>P</sub> − V<sub>S</sub>)` |
| tr 结论句（圆环） | `A full ring focuses to about half a wavelength, the diffraction limit.` | `A full ring reaches the diffraction limit: a spot about λ/2 wide in pressure, 0.36 λ at half maximum of p².` |
| tr `explain()` 的 Diffraction limit 段，第一句 | `The focal spot cannot be smaller than about λ/2.` | `The focal spot cannot be smaller than about λ/2: a perfect ring refocuses to J<sub>0</sub>(kr), 0.48 λ wide at half amplitude and 0.36 λ at half of p², the quantity measured here.` |
| arrays 标题 | `… · pressure · last 6 s` | `… · pressure p(t) · last 6 s` |
| tr 标题 | `… · pressure` | `… · pressure p(t)` |
| 所有数据图 | `origin` | `origin time` |
| tr 小图标题 | `p² AT THE TRUE SOURCE`；`expected focus` | `Pressure² at the source`；`predicted focus` |
| tomo 小图标题 | `SHOT 12 · GATHER AND PICKS`；`TRUE MODEL`；`RECOVERED · BENT RAYS`；`RAY COVERAGE`；`velocity vs. v = 1` | `Shot 12 · seismograms and picks`；`True model`；`Recovered · bent rays`；`Ray coverage`；`velocity anomaly · 0 = 2.5 km/s` |
| noise 小图标题 | `RAW NOISE · LAST 6 S`；`CORRELATION STACK C_AB(τ) · 40 WINDOWS` | `Raw noise at A and B · last 6 s`；`Cross-correlation C_AB(τ) against lag τ · stack of 40 windows` |
| elastic 小图标题 | `PARTICLE MOTION · LAST 1.2 S` | `Particle motion · last 1.2 s` |
| 图例（声波） | `● p > 0`、`● p < 0`、`slow ▬ fast` | `pressure ● − ● +`、`velocity 1.5 ▬ 3.5 km/s`（见下） |

图例 HTML（`LJ`）：

```js
L.legendAcoustic = function () {
  return '<span class="lg"><em>pressure</em><i class="sw" style="background:var(--coral)"></i>−<i class="sw" style="background:var(--cyan)"></i>+</span>' + L.legendVel();
};
L.legendVel = function (name) {
  return '<span class="lg vkey" title="Velocity model under the waves. The colour saturates 40 % below and above the background velocity of 2.5 km/s."><em>' + (name || 'velocity') + '</em><b>1.5</b><i></i><b>3.5 km/s</b></span>';
};
```

```css
.legend .lg{gap:5px}
.legend em{font-style:normal; color:var(--muted)}
.legend b{font:500 11.5px var(--mono); color:var(--ink2)}
.vkey i{display:block; width:64px; height:12px; border-radius:3px; flex:none; border:1px solid var(--line2);
  background:linear-gradient(90deg,transparent calc(50% - .5px),var(--line2) 0,var(--line2) calc(50% + .5px),transparent 0),linear-gradient(90deg,var(--vs),var(--field) 50%,var(--vf))}   /* 中间一条细线 = 背景速度 2.5 km/s */
.legend svg{width:12px; height:12px; flex:none}
```

弹性波章节：`● P wave · |∇·v|`、`● S wave · |∇×v|`，速度项调用 `L.legendVel('V<sub>P</sub>')`。图例里的 `★ shot`、`▼ receiver`、`— ray`、`▼ mirror sensors`、`○ true source`、`✕ focus`、`○ noise source`、光缆，改用和画布同形同色的内联 SVG 代替文字符号。新增 `L.glyph(name)`，返回 `<svg viewBox="0 0 12 12" aria-hidden="true">…</svg>`，内容如下（`currentColor` 即图例文字色）：

| `name` | SVG 内容 |
|---|---|
| `star` | `<path d="M6 .8l1.5 3.3 3.6.4-2.7 2.4.8 3.5L6 8.6 2.8 10.4l.8-3.5L.9 4.5l3.6-.4z" fill="var(--coral)"/>` |
| `tri` | `<path d="M1.5 2.5h9L6 10z" fill="currentColor"/>` |
| `sensor` | `<path d="M1.5 2.5h9L6 10z" fill="var(--cyan)"/>` |
| `ray` | `<path d="M1 9.5 11 2.5" stroke="currentColor" stroke-width="1" opacity=".6"/>` |
| `ring` | `<circle cx="6" cy="6" r="4.2" fill="none" stroke="currentColor" stroke-width="1.3" stroke-dasharray="2 1.6"/>` |
| `cross` | `<path d="M2.5 2.5l7 7M9.5 2.5l-7 7" fill="none" stroke="currentColor" stroke-width="1.5"/>` |
| `noise` | `<circle cx="6" cy="6" r="3.6" fill="none" stroke="currentColor" stroke-width="1" opacity=".6"/>` |
| `fibre` | `<path d="M1 6h10" stroke="var(--cyan)" stroke-width="2"/><circle cx="6" cy="6" r="1.6" fill="currentColor"/>` |

---

## 7. 动效与手机端

- 动效只加一处：关键数字**出现**时闪一下。`hud()` 写 `#dataKpi` 时，若 `.kpi` 的个数和上一次不同，就给 `#dataKpi` 加上类 `in`，`animationend` 后去掉；`.kpis.in .kpi{animation:kpi-in 600ms var(--ease)}`，`@keyframes kpi-in{from{background:color-mix(in srgb,var(--cyan) 30%,transparent)}}`。只是数值变化不闪（噪声实验每 0.75 s 就更新一次）。`prefers-reduced-motion` 下关闭。结果卡滚入视野见 6.3。
- 手机端（`≤ 899px`）：
  - `.fkey{flex-wrap:wrap; margin:0}`；`.facts{display:none}`；删除原来给 `.legend` 的 `order:4; flex-basis:100%; max-width:none`。
  - `.data-h{grid-template-columns:minmax(0,1fr)}`；`.data-r{flex-wrap:wrap; justify-content:flex-start}`；`.data-cap{white-space:normal; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical}`；`.lkey{display:none}`。
  - `.data{height:260px}`（旧 230px，补上标题区增加的高度）。
  - 层析、噪声、时间反演、弹性波的数据图在 `w < 640` 时沿用各自现有的窄版逻辑；新增的残差图、SNR 图、焦斑放大图只在 `w ≥ 640` 画。

---

## 8. 验收要点（实现后回传截图，我按这些看）

1. 任一章节，波场左下角有比例尺；波场正下方一行是图例与 `10 × 5.5 km · v₀ 2.5 km/s · f₀ … Hz · λ … km`，没有被切掉一半的项；速度图例是 `1.5 ▬ 3.5 km/s`，色标颜色与波场上的淡彩相同。任一实验的数据图标题都没有省略号（1440px 宽）。
2. 任一张数据图里，虚线只出现在“预测”上；发震时刻是实线加星，文字不被任何一道穿过。
3. 层析完成后，不滚动就能在数据图标题右侧看到 `r = …` 与 `… → … ms`；面板下半是残差散点图，反演后的灰点明显比彩色点更贴近零线；默认随机模型下彩色点几乎全是粉色（晚到），棋盘模型下蓝粉都有。
4. 时间反演完成后，焦斑上没有文字压着；数据图右侧有焦斑放大图和两根对比横条（实测半高宽对理论 0.36 λ）；环外没有大片米色雾；页面上不再把 p² 的半高宽和 λ/2 直接相比。
5. Playground 放 6 个台并发一次震：波场上 6 个台都有台站码；记录图按距离从近到远排列，右侧有每道的 km 数，一条虚线走时曲线穿过各道、随距离变晚。
6. Arrays 第 4 步不再出现 “steep bands are slow waves”；线阵记录图左下有 1.5 / 2.5 / 3.5 km/s 的量角器。
7. 噪声叠到 40 个窗口：左下有 SNR 随窗口数增长的曲线和 `∝ √N` 虚线；SNR ≥ 4 后标题右侧出现 `… km/s`，与真值相差在百分之几以内。
8. 弹性波：两条预测线之间有 `S − P = … s` 的括线；`predicted S` 的文字不压到右侧小图。
9. 说明栏每一步标题上方有角色小标，步骤序号之间有连线；弹性波第 2 步的公式完整可见。
10. 画布上没有全大写的小图标题；结果卡的数字不再发糊（等宽字 500）。
11. 亮色主题下以上各项同样成立。

---

## 9. 可执行改动清单

实现顺序建议：先做 P0-1 至 P0-4（地基），再按章节做其余各条。每条做完都应不影响现有回归测试。

### P0（14 条）

| # | 文件 · 位置 | 改动 |
|---|---|---|
| P0-1 | `LH` `.kv dd`；`LJ` `L.label`；`HJ` 台站码字体；`LJ` `L.panelLabel` | 等宽字 600 → 500（D9）；`L.panelLabel` 改用 `L.fontS(ctx, 11, 600)` 与 `pal.sub` |
| P0-2 | `E` `PAL`；`LJ` 新增 `L.fontS`；`LC` 全部画布文字 | 3.2、3.3：加 `sub` / `axis`；按角色表改字体与大小写（小图标题新文案见 6.5） |
| P0-3 | `LH`、`H` `:root`；`LJ` `L.legendAcoustic` / `L.legendVel` / 新增 `L.glyph`；`LC` 各章 `legend()` | 3.1 与 6.5 的图例 |
| P0-4 | `LH` `.vbar` / 新增 `.fkey`；`LJ` `fitLegend` / 新增 `facts()` | 4.1 图注条 |
| P0-5 | `LH` `.data-h`；`LJ` `hud()`；`LC` 各章新增 `cap()`、`kpi()`、`lineKey` | 4.2 与 6.1、6.2 |
| P0-6 | `LJ` `drawOverlay`、`L.star`、`L.label`；`LC` `stations()` 与 play 的 `overlay` | 5.1：比例尺、反射边界、震源空心星、Playground 台站全标注 |
| P0-7 | `LJ` `L.drawSection`、`L.timeAxis`；`HJ` `drawTrace`；`LC` DAS / elastic / noise / tr 里各自画发震时刻与预测线的地方 | 5.2 的 `lane` 与 `marks` 新画法；3.4 的线型统一（发震时刻实线加星；预测一律虚线 `[4,3]` 震相色） |
| P0-8 | `LC` arrays 第 4 步、tr 的结论句与 `explain()`；`HJ` `info` 面板；6.5 表内其余各行 | 措辞改正（D4、D8、D13） |
| P0-9 | `E` `CA.render` 的 `max` 分支与 `FS.show` 第三分支；`LC` tr 的 `overlay`、`legend()` | 5.5：线性 p²；标签加引线移开 |
| P0-10 | `LC` tomo 的 `solve()`、`data()` | 5.6：返回 `res0` / `res1`；新版面与走时残差图 |
| P0-11 | `LH` 新增 `.res-big`、`.bar2`；`LC` tr / tomo 的 `results()`，elastic 的 `liveSP()` | 6.3 的大数字与对比条；结果卡首次出现时滚入视野 |
| P0-12 | `LH` `.st-k` / `.st::after` / `.eq` / `code`；`LJ` `L.refresh()`；`LC` 各章 `steps()` | 4.3 与 6.4：步骤角色、连线、公式块 |
| P0-13 | `LC` noise 的 `resetCC()`、`window()`、新增 `peak()` / `vEst()`、`data()`、新增 `results()` | 5.7 与 6.3：SNR 曲线、实测峰、速度估计、结果卡 |
| P0-14 | `LC` elastic 的 `data()` | 5.8：行标签、标注带、S − P 括线、标题 |

### P1（8 条）

| # | 文件 · 位置 | 改动 |
|---|---|---|
| P1-1 | `LJ` `L.quake`（标记加 `fm`）、`L.drawSection`（`pred`）；`LC` play / arrays 的 `data()` | 5.3、5.4：预测到时 |
| P1-2 | `LJ` `L.drawSection`（`right` / `rowText`）；`LC` play / arrays 的 `data()` | 5.3、5.4：按距离排序与每道的 km 数 |
| P1-3 | `LJ` 新增 `L.slopeFan`；`LC` arrays 的 `data()`（线阵与 DAS） | 5.4：视速度量角器 |
| P1-4 | `LC` arrays 的 DAS 分支 | 5.4：km 刻度、轴标题、预测到时折线 |
| P1-5 | `LC` tr 的 `finish()`、`data()` | 5.5：三栏版面与焦斑放大图 |
| P1-6 | `LJ` 新增 `L.hiD` / `L.hiV` / `L.sec` 与两个 `pointermove`；`LC` `stations()` | 5.9：悬停联动 |
| P1-7 | `LJ` `L.drawSection`、`L.timeAxis`；`HJ` `drawTrace` | 5.2：轴线、“现在”竖线、单道笔尖圆点 |
| P1-8 | `H` `.vramp i`；`HJ` `drawTrace` | 5.10：主页色标与发震时刻 |

### P2（5 条）

| # | 文件 · 位置 | 改动 |
|---|---|---|
| P2-1 | `LH` 手机端媒体查询 | 第 7 节 |
| P2-2 | `LH` `.kpi` | 第 7 节的 `kpi-in` 动效 |
| P2-3 | `LJ` `exportPNG()` | 导出的 PNG 里，数据图标题改用 Inter 600 12px 原大小写，其下加一行 `#dataCap` 的文字（Inter 400 11px，`--muted`），底部信息行末尾加上 `#facts` 的文本 |
| P2-4 | `LC` play 的 `data()`（仅单台、`w ≥ 640`） | 右侧 180px 加一张 `Amplitude spectrum` 小图：对 6 s 记录加 Hann 窗，在 0 到 3·f₀ 之间取 48 个频点做 DFT，每 15 帧算一次；实线 `pal.trace` 加 `pal.fill` 面积；在 f₀ 处画一条预测虚线 `rgba(pos,.9)`，下方写 `f₀`；横轴写 `0`、`3 f₀`，右端写 `frequency` |
| P2-5 | `LC` elastic 的 `data()` | 质点运动图下方加一行读数：取最近 1.2 s 的 (X, Z)，协方差矩阵两个特征值 `l1 ≥ l2`，`1 − l2/l1 ≥ 0.9` 写 `linear · body wave (P or S)`；否则按带符号面积 `Σ(xᵢ·zᵢ₊₁ − xᵢ₊₁·zᵢ)` 的正负和震源在台站哪一侧，写 `elliptical · retrograde (Rayleigh)` 或 `elliptical · prograde`；振幅低于峰值 6 % 时不写 |

实现后请用 `design/shots-r2.js` 同参数重拍到 `design/shots-r2-after/`，并回传：`play-section`、`arrays-seis`、`arrays-das`、`tr-focus`、`tomo-done`、`noise-late`、`elastic-ps` 的暗 / 亮整页图与数据面板 2 倍图。
