# Changelog

> 发布说明：npm 上此前最新发布版为 **1.0.17**（2026-11-18）。1.0.18–1.0.25 是 2026-11-20～21 的连续内部迭代；1.0.26 / 1.0.27 / 1.0.28 三版为**未发布的内部迭代**，相关改动已在 1.0.25 中回退，对外最终以 **1.0.25** 发布。

## 1.0.25 回退说明 (2026-11-21)

### 锁定高度范围恢复 140–380 + 跟随来源不再要求滚动（v1.0.25g）
- 用户反馈两处不符合预期：①「锁定高度」的可选范围过小；②「跟随来源」应当自适应，不应需要滚动才能看到全部来源列表。
- 修复：
  1. **面板 max-height** 由写死的 `min(62vh,440px)` 改为 `calc(100vh - 40px)` —— 这才是「设 360/380 时设置行被遮盖」的真正原因（面板总高被硬卡在 440，列区 360 + 设置行约 110 必然溢出被 `overflow:hidden` 裁掉）。
  2. **可用高 cap** 不再乘 `0.56` 小系数，改为「视口高 − 40 边距 − 非列区占用 chrome」。跟随来源 = `min(来源列真实内容高, cap)`，来源列能一次全部显示、不需要滚动。
  3. **锁定高度范围**恢复 `H_MIN=140 ~ H_MAX=380`；`hIn.max` 同步改视口口径，只有屏幕极矮时才由 cap 兜底。
- 结果：锁定 360/380 时设置行仍在面板内；跟随来源时来源列完整可见、无多余空白、无滚动。

### 「跟随来源」= 来源列真实内容高，量法精确到行（v1.0.25f）
- 用户反馈：面板底部与内容之间仍有明显缝隙，要求继续收紧到刚好贴合。
- 双重根因：
  1. **量法虚高**：`col` 的直接子元素 `.dsh-mf-colbody` 是 `flex:1 1 auto`，会被列高撑满；量它的底边 = 列底 = 上一轮设的高度 → 自反馈，永远多一截。
  2. **口径偏离**：v1.0.25d 曾改成「三列取最大」，模型列更长时面板被撑高，左栏下方一大片空白。
- 修复：
  - 口径回归按钮本义 ——「跟随来源」高度 = **第一列（来源列）** 真实内容高；仅当来源列为空（搜索结果视图）才退回量其它列。
  - 量法改为 `headH`（列标题，`flex:0 0 auto` 不被拉伸）+ `bodyH`（colbody 内每一行 `getBoundingClientRect().bottom` 最大值 − colbody 顶部），二者相加 = 真实内容高，不含被拉伸空白。
  - `chrome`（面板非列区占用）改用实际计算值 `paddingTop+paddingBottom + rowGap×子元素数`，不再写死 `+16`（少算 gap 会让 cap 偏大）。
- 结果：跟随来源 = `min(来源列真实内容高, cap)`，面板底边贴住来源列最后一行。

### 「跟随来源」量高改真实包围盒，消除虚高缝隙（v1.0.25e）
- 用户报「跟随来源缝隙还是大」。
- 根因：`offsetHeight` 累加在「列体 flex 撑满 + 子项被拉伸」时会把空白算进去 → 测得虚高 → 面板比内容高、底部留缝。
- 修复：改为量「列内直接子元素 `getBoundingClientRect().bottom` 的最大值 − 列顶部」，得到真实内容底边；量不到才退回 offsetHeight/scrollHeight。三列取最大。

### 「跟随来源」改为三列最高者自适应（v1.0.25d）
- 用户反馈：「跟随来源」的效果不符合预期，疑问是否按来源文字完整自适应。
- 澄清+修正：「跟随来源」= 跟随**三列里内容最高的那一列**自适应，让最长列完整显示、短列自然留白。之前 v1.0.25a 只量来源列，若模型列更长会被裁、短时又空旷，故改为 `base = max(每列内容高)`，跟随来源 = `min(base, cap)`。

### 锁定高度加动态上限，防设置行被遮盖（v1.0.25c）
- 用户报：锁定高度设 360 时设置行（高度/跟随来源/…/刷新 那一排按钮）被遮盖。
- 根因：`hIn.max` 与 change 校验都写死 `H_MAX=380`，超过「面板可用高 cap」的值也能存，列区按它撑高后 + 设置行 > 面板 max-height，设置行被 `overflow:hidden` 裁掉。
- 修复：`syncCascadeHeight` 里算 `lockMax=max(H_MIN, min(cap, H_MAX))`，锁定模式用 `min(readHLock(), lockMax)`；`syncCascadeCfg` 每次刷新把 `hIn.max` 设为动态可用高；change 时按 `hIn.max` 收口输入值。

### 底部当前选择行加粗（v1.0.25b）
- 用户要求把底部状态行「Magpie · deepseekV4.1 · routing group · 默认」（`.dsh-mf-capcfg-cur`）加粗。
- 改：`.dsh-mf-capcfg-cur` 的 `opacity:.75` → `opacity:.9`，并加 `font-weight:600`（字号 10.5px 不变）。

### 「跟随来源」底部留大空隙修复（v1.0.25a）
- 根因：`syncCascadeHeight` 里 `var base = colEls[0].scrollHeight`。列区 `.dsh-mf-col` 在 `align-items:stretch` 下被撑满 wrap，`wrap.style.height="auto"` 时列高可能随面板整体被撑开，`scrollHeight` 大于「来源条目真实内容高」→ 面板高度按偏大的值设定，底部留一大片空白（用户报「跟随来源后还有很大间隙」）。
- 修复：改为累加 `colEls[0]` 各子元素 `offsetHeight` 得到「内容自然高」`inner`，仅当 `inner<=0` 才回退用 `scrollHeight`。跟随来源 = `min(inner, cap)`。

### 按用户要求把 client.js 回退到 1.0.25 状态
- 用户反馈 1.0.28「跟随来源」高度仍偏高（面板下方留大片空白），要求「回退到 1.0.25」。
- 处理：撤销 1.0.26 / 1.0.27 / 1.0.28 三版对 `syncCascadeHeight()` 与 `softRefreshCascade()` 的改动（含 v1.0.26 量高前置复位、v1.0.27 的 height:auto 内联与 availReal 收口、v1.0.28 的步骤 0 复位与 4b 二次定位），恢复 1.0.25 版 `syncCascadeHeight()`（panelMax 实测 + chrome + cap=min(innerHeight*0.56, avail)）与 `softRefreshCascade()`（一次重算 + 一次定位）。
- 保留：1.0.25 的「刷新」按钮 / softRefreshCascade、1.0.20~1.0.24 的按钮外观、括号计数、团队协作默认开启等全部修复。
- 版本号回到 1.0.25，client.js 212758 字节，node --check 通过。

## 1.0.28 (2026-11-21)

### 修「改高度 / 切换高度模式后面板高度不回到应有值」
- 缺陷：`mkH`(跟随来源/锁定高度) 与 `hIn`(高度输入框) 的处理顺序是 `applyCascadeHeight()` → `softRefreshCascade()`。`applyCascadeHeight()` 先按旧 DOM 设了一次列高，随后 `softRefreshCascade()` 里的 `syncCascadeHeight(true)` 再把列区放 auto 量高时，**量到的是刚被设过的值**（基线已被污染），于是「跟随来源」要么贴着旧高度、要么完全不贴合；改成具体数值时也一样偏。
- 改法：
  1. 高度按钮与输入框改为**只调 `softRefreshCascade()`**，不再先跑一次 `applyCascadeHeight()`（一次到位，避免两次量高互相污染）；
  2. `softRefreshCascade()` 开头新增「步骤 0 复位」：先把所有 `.dsh-mf-colbody`、`.dsh-mf-col`、列区外层和主容器的内联高度全部放成 `auto`，让接下来的 `syncCascadeHeight(true)` 从**内容自然高度**这个干净基线重算；
  3. 高度定稿后再补一次 `repositionCascade()`，避免首帧重建未完成导致定位偏移。

## 1.0.27 (2026-11-21)

### 紧急修：面板整体溢出屏幕、底部设置行整排消失（1.0.26/27 回归）
- 缺陷：1.0.26 把「跟随来源」的总高改成 `want = 来源列内容自然高 + chrome`，只受 `min(62vh,440)` 收口。当来源列内容多（如国内平台中转站 14 项 + Magpie 42 项）时 `want` 会远大于面板 `max-height:min(62vh,440px)`，而主容器是 `overflow:hidden` —— 结果是面板被内容顶穿，底部搜索行的设置区（高度/字号/识图+思考/测活/刷新/⟳）被整排推出可见区域，用户看到的就是"回退了"。
- 改法：
  1. 主容器强制 `height:auto` 内联，让 `max-height` 成为真正的硬上限；
  2. 实测 `panelMax = getBoundingClientRect().height`（max-height 生效时返回被压缩后的真实可见高），再兜底 `panelMax = min(panelMax, innerHeight - 24)`，绝不让面板越过视口；
  3. `availReal = panelMax - chrome`，`cap = max(140, min(availReal, innerHeight - 40))`；
  4. 「跟随来源」回到 `CASCADE_H = min(来源列内容自然高, cap)` —— 内容放得下就紧贴内容，放不下就由 cap 收口、列自己滚，**设置行永远留在面板内**。
- 教训：1.0.26 的 `want = base + chrome` 与面板 `max-height` 是两套互相打架的高度预算；只能有一个预算（用 `max(140, panelMax - chrome)`），不能让内容自然高直接当总高。

## 1.0.26 (2026-11-21)

### 修「跟随来源」高度不再紧贴来源列内容（凭空多出留白）
- 缺陷：`syncCascadeHeight()` 量 `panelMax = panel.getBoundingClientRect().height` 时，面板此刻还停在**上一轮的高度**（列区带着上一轮内联高度），量出来被污染；再加上 chrome 里固定写死的 `+16` 留白，导致「跟随来源」算出来的总高比来源列实际内容多一截，切换模式后更明显。
- 改法：
  1. **量之前先复位**：在取 `panel.getBoundingClientRect()` 之前，先把所有 `.dsh-mf-colbody` 的内联 `height/minHeight/overflowY` 与各 `.dsh-mf-col` 的高度、`wrap` 高度全部放成 `auto`，让面板反映「内容自然高度」；
  2. **chrome 精确计算**：不再固定 `+16`，改为 `getComputedStyle` 读 `paddingTop + paddingBottom + rowGap × (子元素数 - 1)`；
  3. **跟随来源的公式**：`want = 来源列内容自然高度(base) + chrome`，`CASCADE_H = min(want, 视口上限 min(62vh,440))` —— 面板恰好等于「来源列内容 + 自身 chrome」，不再有额外留白；内容超过视口时才收口并让列自己滚。

### 团队协作标签字号恢复固定 11px（不随「字号」设置变化）
- 用户要求：调整字号时**不要动团队协作那一行的字体**。已把 `.dsh-mf-teamrow-lbl` 与 `.dsh-mf-teamrow-inline .dsh-mf-teamrow-lbl` 从 `font-size:var(--mf-fs,11px)` 改回固定 `font-size:11px`。模型行、表头、来源计数仍随字号变化。

## 1.0.25 (2026-11-21)

### 新增「刷新」按钮 + 设置项改动后自动刷新面板
- 新增按钮：设置行加了一个 `刷新` 按钮（`.dsh-mf-capcfg-refresh`，在「测活全部 / 显示测活」之后、`⟳ 检查更新` 之前），点一下等价于「关掉面板再打开」。
- 新增 `softRefreshCascade()`：不真关面板，但做与重开等价的完整重建 —— ①重新从 `modelDirectories` 读来源分组；②清空搜索框；③清空三列 `.dsh-mf-colbody` 并 `refreshCascadeCaps() → cascadeRenderProviders() → cascadeRenderModels(pid)` 重建；④`CASCADE_H=0; syncCascadeHeight(true)` 重算高度；⑤`repositionCascade()` 重新定位；⑥`syncCascadeCfg(panel)` 再同步设置行高亮态。
- 自动触发点（用户要求「更改按钮后自动刷新一下 ui 面板」）：高度模式按钮 `mkH`（跟随来源 / 锁定高度）、高度输入框 `hIn.change`、字号输入框 `fsIn2.change`、「识图+思考」`forceBtn` 与 `mkForce`、「显示测活」`vbtn` —— 全部改完即调 `softRefreshCascade()`。原来这些地方只有 `refreshCascadeContent()`（只重渲染、不重置列体高度），现在统一换成更完整的软刷新。

## 1.0.24 (2026-11-21)

### 修「锁定高度 → 跟随来源」仍要关掉面板重开才刷新高度
- 缺陷：`syncCascadeHeight(reset)` 量「跟随来源」的自然高度时只把外层 `.dsh-mf-col` 设成 `height:auto`，列体 `.dsh-mf-colbody` 还带着上一轮 `syncCascadeHeight` 写下的内联 `height`（以及 `overflow-y:auto`）。行还被滚动容器卡在旧高度里，`colEls[0].scrollHeight` 量出来的自然是旧值，于是高度不动；只有关掉面板重开（走首次渲染、内联样式被重建）才恢复。
- 改法：测量阶段先把所有 `.dsh-mf-colbody` 的内联 `height` / `minHeight` / `overflowY` 全部清成 auto，量完再清空内联（`""`）并让 CSS 的 `flex:1 1 auto;min-height:0;overflow-y:auto` 接管，最后统一按 `CASCADE_H` 设定列高。
- 效果：点「跟随来源」当场就按来源列实际内容重算高度，不需要关面板重开。

## 1.0.23 (2026-11-21)

### 修「面板底部设置行被挡住，高度/字号/识图+思考/测活那些按钮看不见」
- 缺陷：面板是 flex column，主容器有 `max-height:min(62vh,440px)` + `overflow:hidden`；而 `syncCascadeHeight()` 给列区的高度上限是**写死的 380px**。窗口不高时（62vh ≈ 380 或更小），「列区 380 + 搜索行 ~36 + 设置区 ~60 + 纵向 padding/gap ~20」远超面板 max-height，多出来的部分被 `overflow:hidden` 直接裁掉 —— 被裁的正是最底部的设置行，所以高度/字号/识图+思考/测活本页/测活全部/显示测活/⟳ 全看不见。
- 改法一（CSS）：顶部搜索行、设置区 `.dsh-mf-capcfg`、团队协作行 `.dsh-mf-teamrow`、底部行 `.dsh-mf-cacfoot` 统一 `flex:0 0 auto`（不许被 flex 压缩）。
- 改法二（JS）：`syncCascadeHeight()` 的列区上限改为**动态计算** —— `panelMax = 面板实测高度`（取不到时退回 `min(62vh,440)`），`chrome = 面板内除列区以外所有子元素的高度和 + 16px 余量`，`cap = max(140, min(56vh, panelMax - chrome))`。列区永远只占「剩下能用多少」，设置区一定在面板内部。
- 效果：任何窗口高度下，设置行都完整可见；列区不够时自身滚（`.dsh-mf-col` 本来就是 `overflow-y:auto`）。

### 字号设置同步覆盖 5 条写死的规则（见 1.0.22 补述）
- 已改为 `font-size:var(--mf-fs,11px)`：`.dsh-mf-crow`、`.dsh-mf-colhead`、`.dsh-mf-crowright`、`.dsh-mf-teamrow-lbl`、`.teamrow-inline .dsh-mf-teamrow-lbl`。

## 1.0.22 (2026-11-21)

### 修「锁定高度 → 跟随来源」切换后面板突然变很宽（要再点一次才恢复）
- 缺陷：1.0.20 为了修按钮被裁，在 `applyCascadeHeight()` 里加了 `PANEL_LOCK=false; cascadePinPanelWidth()` 重新钉宽。但 `cascadePinPanelWidth()` 是用 `c1.getBoundingClientRect().width` **实测当前渲染宽度**来算面板总宽——切模式的那一刻列宽还停在上一轮被拉伸的状态，测出来偏大，钉出的面板就更宽，反复切换会累积放大。
- 改法：撤掉 `applyCascadeHeight()` 里的重钉宽逻辑，只保留 `CASCADE_H=0; syncCascadeHeight(true); repositionCascade()`。按钮被裁的问题 1.0.20 已由 `flex-wrap:wrap` 独立解决，不需要靠重钉宽。
- 效果：切换高度模式时面板宽度保持稳定，不需要再点一次刷新。

### 新增团队协作「默认开启」
- 官方 `agentTeams` 状态按会话存储、且新会话默认关闭；本插件开关走官方 `remote.agentTeams.setEnabled(sid, enabled)`，与官方按钮完全一一对应、真实生效。
- 新增：`paint()` 读到当前会话 `enabled===false` 且该会话从未被自动开过 → 自动调 `setEnabled(sid, true)` 一次。
- 用 localStorage 键 `dsh-model-fold-team-auto` 按 sid 记「已自动开过」（上限 200 条，超出按插入顺序淘汰）。因此**用户手动关掉后不会再被强开**，只是默认开启。

### 修「字号」设置不生效
- 缺陷：字号设置写到 `document.documentElement` 的 `--mf-fs`，但级联面板里真正显示内容的几条规则把字号**写死**了：`.dsh-mf-crow`（模型行）`font-size:11.5px`、`.dsh-mf-colhead`（表头）`11px`、`.dsh-mf-crowright`（计数）`11px`、`.dsh-mf-teamrow-lbl` / `.dsh-mf-teamrow-inline .dsh-mf-teamrow-lbl`（团队协作标签）`11px`。它们定义在 `var(--mf-fs,11px)` 那条（L378）之后，同特异性后者胜 → 改字号看不出任何变化。
- 改法：上述 5 条全部改为 `font-size:var(--mf-fs,11px)`，跟随字号设置。设置行自身的控件（按钮 / 输入框 / 状态条）仍保留 10~12px 固定值，不随字号缩放。
- 效果：字号 8~15 调整后模型行、表头、计数、团队协作标签同步变化。

## 1.0.21 (2026-11-21)

### 修来源列括号计数被裁（`(14)` 只显示到半个括号）
- 缺陷：`.dsh-mf-crowright` 被写死 `flex:0 0 16px; width:16px; max-width:16px; overflow:hidden`。这个 16px 原本是给强度列 ✓ 槽位设计的，但来源列的计数 `(14)` 复用同一个 class，三个字符在 11px 字号下约 22px，超出即被 `overflow:hidden` 裁掉，看起来就是括号只显示一半。
- 改法：改 `flex:0 0 auto; min-width:16px; width:auto; max-width:none; overflow:visible` —— 计数按内容自然宽度完整显示，✓ 槽位仍保底 16px 保持对齐。
- 效果：来源列宽本来就按 max-content 自适应（`cascadePinPanelWidth()` 实测第 1 列宽度），括号不再被裁后左栏自动放宽到「最长来源名 + 计数」的完整宽度。

## 1.0.20 (2026-11-21)

### 修「锁定高度 → 跟随来源」切换后按钮行被裁 + 设置行按钮统一底色
- 缺陷：`.dsh-mf-cfgrow-actions` 是 `flex-wrap:nowrap` + `overflow-x:auto` + 隐藏滚动条，切回「跟随来源」后宽度重算、按钮行放不下就被静默裁掉（看不到右侧按钮），必须关掉面板再打开才恢复。
- 改法：改 `flex-wrap:wrap` + `overflow:visible`，放不下自动换行，任何面板宽度都能看全所有按钮。
- 缺陷：`applyCascadeHeight()` 只重算高度，不重钉宽度，切换后宽度停在旧值。
- 改法：切换时先重置 `PANEL_LOCK`，再 `cascadePinPanelWidth()` 按当前内容重钉宽度，最后 `repositionCascade()`。
- 改法：`.dsh-mf-capcfg-btn` 基础样式统一加 1px 边框 + 淡灰底 + 6px 圆角（原来只有「识图+思考」有框，其余是纯文字），所有可点按钮外观一致；选中态蓝底、「识图+思考」开绿关红仍按更高特异性覆盖。

## 1.0.19 (2026-11-21)

### 撤回 1.0.18 的「锁定宽度」功能
- 按用户要求删除面板宽度模式：`宽度 [输入框] 跟随来源 锁定宽度` 整行控件、`syncCascadeWidth()` / `applyCascadeWidth()`、localStorage 键 `dsh-model-fold-cascade-wmode` / `-wlock`、`readWMode/writeWMode/readWLock/writeWLock/cascadeCurWidth`、CSS `.dsh-mf-winput` 与 `.dsh-mf-capcfg-wmode`、`syncCascadeCfg()` 里的 wmode 同步循环，以及 `cascadePinPanelWidth()` 里的锁定宽度互斥判断。
- 面板宽度回到 1.0.15 起的纯自动钉宽行为（首次打开实测钉死，切页不再变宽）。
- 保留 1.0.18 的其余两项：设置行控件统一 24px 高度、「识图+思考」开启绿字 / 关闭红字。

## 1.0.18 (2026-11-20)

### 设置行控件统一高度 + 「识图+思考」开绿关红 + 新增「锁定宽度」
- 缺陷：同一设置行里按钮（`.dsh-mf-capcfg-btn` 20/21px、`.dsh-mf-capcfg-force` 20px）与输入框（`.dsh-mf-fsinput` / `.dsh-mf-hinput` 24px）高度不一致，下沿参差不齐。
- 改法：按钮统一 `box-sizing:border-box;height:24px;line-height:22px`，与两个输入框等高；「面板高度」标签缩短为「高度」，给新增控件让出宽度。
- 缺陷：「识图+思考」开关只有蓝底选中态，开/关语义不明显。
- 改法：新增 `data-force-state`（on/off），开启 = 绿字绿框（`--mf-ok`）、关闭 = 红字红框（`--mf-err`）；`paintForce()` 与 `syncCascadeCfg()` 双处同步，避免重绘后颜色丢失。
- 新增：面板宽度模式 —— `宽度 [px] 跟随来源 锁定宽度`，与既有高度模式同构。默认「跟随来源」= 1.0.15 起的实测钉宽行为；「锁定宽度」写死输入框值（localStorage `dsh-model-fold-cascade-wmode` / `-wlock`，范围 300–1400px）。首次切到「锁定宽度」时以当前实测宽度作为默认值（`cascadeCurWidth()`）。
- 兼容：`cascadePinPanelWidth()` 在锁定宽度模式下直接 return，避免钉宽逻辑与锁定值互相覆盖；切回「跟随来源」时重置 `PANEL_LOCK` 并重新钉一次实测宽。

## 1.0.17 (2026-11-18)

### 强度列宽度改按「全部模型真实档位标签」实测
- 缺陷：强度列宽测量探针挂在 `document.body` 下，而标签 span 的样式选择器是 `#dsh-mf-cascade .dsh-mf-crowname`（要求祖先为面板），选择器不匹配 → 用浏览器默认 16px 测量，结果被顶到 148px 上限；标签实际只需约 25px，强度列长期留大片空白。
- 缺陷：测量用的标签集合是硬编码的（7 档 fallback 中文 + High/Medium/Low/Max/Off），未覆盖各网关模型的自定义档位名（Minimal / Xhigh / Auto / None / 自定义中文等），不同模型档位集合不同时测不准。
- 改法：新增 `cascadeEffortLabelSet()` 遍历全部 provider 全部模型的 `reasoning.efforts` 真实名称并合并 fallback 去重；探针字号改为 11.5px / 字重 500，与面板内 `.dsh-mf-crow` 完全一致；宽度 = 最宽标签 + 行内 padding 14 + ✓ 槽位 16 + 富余 6，上限放宽到 180px。
- 防御：`cascadeEffortColumnWidth()` / `cascadeModelColWidth()` 在 provider 数据未就绪（groups 为空）时返回 0 且不缓存，避免把 fallback 宽度永久锁死。

## 1.0.16 (2026-11-18)

### 修正 1.0.15 钉宽导致内容横向溢出被裁切
- 缺陷：1.0.15 把面板宽钉死，但 `.dsh-mf-cols` 仍是 `width:max-content`；三列内容总和（来源列 + 实测模型列 + 强度列）超过钉死值时，列容器横向溢出，强度列被推出可视区并裁切。
- 缺陷：模型列基准宽度用 `36vw` 盲估，magpie 等长名页仍被省略号截断，与「来源完整显示」的口径不一致。
- 改法：① `.dsh-mf-cols` 改 `width:100%`，跟随面板宽，不再撑出可视区（`overflow-x:hidden`）；② 新增 `cascadeModelColWidth()`，实测全部 provider 下最长模型名的实际渲染宽（11.5px/500 字重），加 caps 图标 24 + ✓ 槽位 16 + 行内 padding 12 + 富余 16，上限随面板 94vw/880px 收敛；③ 钉宽后调 `repositionCascade()` 修正左侧定位，避免变宽后越出右边界。
- 效果：切换 provider 时面板宽度恒定不变，且最长模型名在 880px 上限内完整显示；只有在超长名 + 窄屏同时成立时才省略。
## 1.0.15 (2026-11-18)

### 面板总宽钉死：切换模型来源时面板不再左右变宽
- 根因：面板容器 `width:max-content` 且三列全 `flex:0 0 auto`，模型列宽度由当前 provider 最长模型名决定；magpie 等本地网关模型名很长（如「本地-质量(Q6/强推理/256K)」），切到该页整面板明显变宽。
- 改法：① 模型列改 `flex:1 1 auto;min-width:120px`（弹性填充，内容窄补白、宽省略，不再驱动总宽）；② 新增 `cascadePinPanelWidth()`，首次打开面板时实测「来源列宽 + 强度列固定宽 + 基准模型列宽（max(260px, 36vw)）」求和钉在面板上（clamp [320px, 94vw]），会话内只钉一次，切页/搜索不再改变。
- 兼容：默认档「跟随来源」高度语义不变；锁定高度档不变；强度列固定宽不变。
## 1.0.14 (2026-11-18)

### 修：中间「模型」列宽度随选中项抖动

- **根因（三条叠加）**：
  - `.dsh-mf-crow.on{font-weight:700}`：选中行文字变粗，粗体比常规体宽 3~5%，该行 max-content 变宽，整列宽度跟着变，面板左右抖动；
  - `.dsh-mf-crow.on .dsh-mf-crowright{font-size:14px}`：只有选中行的 ✓ 被放大，槽位几何与未选中行不一致；
  - 未选中行的 ✓ 槽位是空 `span`，选中行才有内容，行宽依赖选中态。
- **改法**：
  - 去掉选中态的 `font-weight:700` 与 ✓ 的 `font-size:14px`；选中仍用背景色 `rgba(79,124,255,.18)` + 品牌色文字 + ✓ 表达；
  - `cascadeRow()` 每行都写入 ✓，未选中时 `visibility:hidden` 保留占位，行宽与选中态完全无关；
  - ✓ 槽位锁死几何：`flex:0 0 16px; width/min-width/max-width:16px; overflow:hidden; line-height:16px`。
- 影响范围：来源列、模型列、强度列共用的 `.dsh-mf-crow`，三列选中态都不再改变行宽。
## 1.0.13 (2026-11-18)

### 级联面板底部控件与强度列宽修订

- **删「比对」按钮**：`testProviderModels()` 与 `.dsh-mf-capcfg-test` 样式一并移除（该按钮只做清单比对，不做逐模型测活，价值与「测活」重复）。
- **底部控件合并为一行、不拐行**：面板高度控件（`面板高度 [px] [跟随来源] [锁定高度]`）与字号/操作按钮合并到同一行；`.dsh-mf-capcfg-btn` 由 `flex:0 0 auto` 改为 `flex:0 1 auto; min-width:0`，标签保持 `flex:0 0 auto`，行内 `gap` 4px→3px、按钮内边距 6px→4px；面板过窄时该行横向滚动而不换行。
- **强度列宽度固定**：新增 `cascadeEffortColumnWidth()`，用隐藏探针实测全部档位标签（中文 关闭/极低/低/中/高/极高/最高 + 英文 Off/Low/Medium/High/Max）的渲染宽度，取最大值 + 34px（行内边距与 ✓ 槽位，上限 148px）作为第 3 列宽度，同时钉到 `.dsh-mf-colbody` 与其父 `.dsh-mf-col`。此前列宽随所选模型的档位集合变化，切换模型时面板宽度持续跳动。
- **切换高度模式后刷新面板**：新增 `refreshCascadeContent()`，在「跟随来源 / 锁定高度」按钮与高度输入框改值后重渲染来源列与模型列，并重算高度、重新定位。
## 1.0.12 (2026-11-18)

### 级联面板高度：新增「跟随来源 / 锁定高度」两档

- **保留原有语义（默认档）**：面板高度 = min(来源列完整高度, 视口上限 140~380px)。来源列永远完整显示，这条规则不改。
- **根因**：来源列只有 1~2 个 provider 时，`base = colEls[0].scrollHeight` 只有一两行高，模型列可视区被一起压低，几百个模型只剩一两行能看。
- **新增**：面板底部多一行「面板高度」，两个按钮 + 一个数字输入框：
  - `跟随来源`（默认，与原行为完全一致）
  - `锁定高度`：强制 `CASCADE_H = 输入值`（受视口上限约束，140~380px，默认 380），来源少时也能保证模型区够高
- 改高度后自动重新定位面板（`repositionCascade`），避免变高后顶部越界。
- 记忆：`localStorage` 键 `dsh-model-fold-cascade-hmode`（auto/lock）与 `dsh-model-fold-cascade-hlock`（px）。
- **注**：`MF_VERSION` 常量此前停留在 1.0.10（落后 package.json），本次一并改为 1.0.12。

> 早期草案（把高度基准改成 max(来源列, 模型行数×行高)）已被否定并回退：来源列必须完整显示，高度只允许用户通过「锁定高度」手动放大，不由代码擅自改基准。

### 验证

- `node --check lib/client.js` 通过；`readHMode/readHLock/applyCascadeHeight/repositionCascade` 均已落到文件。
- 「跟随来源」档的 `CASCADE_H = Math.min(base, cap)` 与原版逐字一致（回归安全）。


## 1.0.11 (2026-11-16)

### 图标配色：写死品牌色，深色主题下不再看不清

- 根因：原 `icon.svg` 用 `stroke="currentColor"`，而 DSH 以 `<img>` / CSS `background-image`（data-URI）方式渲染插件图标，SVG 作为独立文档时 `currentColor` 取初始值黑色 —— 深色主题深底上几乎不可见。
- 改法：`currentColor` → 写死品牌色 `#4C7DFF`；几何、`viewBox`、线宽一律不变；浅色（#F2F3F5）与深色（#212227）两种底色实测均清晰。
## 1.0.10 (2026-11-15) — 把官方「启用智能体团队协作」开关搬进自绘级联面板

- **新增**：级联面板底部新增「团队协作」开关（内联在「当前选择模型名」右侧同一行），等价官方模型菜单里的「启用智能体团队协作」——直接调 `remote.agentTeams.setEnabled(sessionId, enabled)`，状态从会话投影 `agentTeam` 读（`sessions.list → projectionsBySession[sid].values.agentTeam`，兜底 `binding(sid).session.projections.faceOf('agentTeam')`）。按会话保存；关闭前若本会话已用过模型会先弹确认（与官方一致）；子会话或能力不可用时该行自动隐藏。
- **布局**：面板底栏由单行 `nowrap` 改为两行堆叠（`.dsh-mf-capcfg` `flex-direction:column`）：第一行「当前选择模型名 + 团队开关」，第二行「字号 + 操作按钮」；模型名去掉 `routing group` 后缀截断、允许换行完整显示（`white-space:normal;word-break:break-word`），不再拥挤/显示不全。
- **注入**：`start(ctx)` 内新增两个非阻塞注入 `ctx.inject(["sessions"])` / `ctx.inject(["remote.agentTeams"])`（不进 `exports.inject`，缺依赖不影响主功能，规避 §7.32 类整插件静默不激活）；附诊断钩子 `window.__mfTeamDebug()`。
- **生效方式**：客户端 bundle，桌面端无刷新快捷键，改 `lib/client.js` 由 `dsh-client-hmr` 自动热替换（约 1–2 秒），`curl "http://127.0.0.1:<端口>/plugins/??dsh-model-fold/client.js"` 看 `MF_VERSION` 确认。

## 1.0.9 (2026-11-15) — 1.0.8 实测未生效：补「晚到的官方菜单」与「点错按钮」两个漏洞

- **现象**：1.0.8 装好后实测「重载后还是一样」——第一次点开自绘级联，第二次点仍然冒出官方旧面板。
- **已排除**：不是没加载。直接 `curl "http://127.0.0.1:<端口>/plugins/??dsh-model-fold/client.js&rev=…"` 取页面实际执行的 bundle，HTTP 200、182384 B、含 `dismissOfficialModelMenu` / `canOwnModelMenu` / `MF_VERSION=1.0.8` —— 新代码确实在跑，问题在逻辑。
- **漏洞①（时序）**：1.0.8 只在 `openCascade` 里**同步**调一次关闭，而官方菜单是 React 异步渲染 —— 此刻 `aria-expanded` 还是 `"false"`，判据不成立直接跳过；官方菜单随后才渲染出来，只剩 CSS 预隐藏，600/1000ms 一到期就显形。
- **漏洞②（找错按钮）**：`dismissOfficialModelMenu` 内部用 `findModelTrigger()` 自己找按钮，未选模型时它返回 composer 里第一个 `button[aria-haspopup="menu"]`（可能是附件/工具钮），`click()` 点错对象 → 官方菜单永远关不掉。现在改为优先使用调用方传进来的真实触发按钮（`trigger` 参数）。
- **漏洞③（真凶 · 兜底误伤）**：`onDocCascadeClick` 里 v1.0.7 留下的「防死点兜底」写法是 `toggleCascade(trg)` 之后统一判断「面板没开 → 补点官方按钮」。而**第二次点击的正常语义就是「收起面板」**，于是被误判成「面板打不开」，兜底去点触发钮 → **官方旧菜单当场冒出来**。修复：先记 `_wasOpen`，toggle 后记 `_opened`；只有 `!_wasOpen && !_opened && !canOwnModelMenu(trg)`（本来没开、点完也没开、且确实接管不了）才回退官方菜单，用户主动收起时什么都不做。
- **修复**：① `dismissOfficialModelMenu(trigger)` 在 0/60/160/320/600ms 五个时间点复查，只在 `aria-expanded === "true"`（确认开着）时才动手补点关闭（摘/挂本拦截监听防重入；不用合成 Escape，避免误伤本插件侧边面板的 keydown 关闭）；② 预隐藏属性 `data-mf-model-opening` 改为「级联开着就不撤」，`onDocModelTriggerDown` 里 600ms / 1000ms 两处撤除都加了 `cascadeEl.classList.contains("dsh-mf-open")` 守卫；③ `closeCascade(trigger)` / `toggleCascade(trigger)` 一路把真实按钮传下去。
- **生效方式更正**（重要）：桌面端**没有注册任何 reload / forceReload 加速键**（`app.asar!lib/main.js` win32 分支 `Menu.setApplicationMenu(null)`），所以 `Ctrl+Shift+R` 与 `Ctrl+R` 都**不会重新读盘**，不能用来判断插件是否更新。客户端 bundle 实际由宿主 `dsh-client-hmr` 每 500ms `stat` 轮询 + `/plugins/events` SSE `rebuilt` 事件自动热替换，改完 `lib/client.js` **什么都不用按**，等一两秒即生效；要确认是否生效，用 `curl` 取 `/plugins/??dsh-model-fold/client.js` 看 `MF_VERSION`。

## 1.0.8 (2026-11-15) — 修「第一次点开新面板、第二次点冒出旧面板」

- **现象**：1.0.7 之后第一次点 composer 模型按钮弹出的是自绘级联面板；同一会话第二次点，级联关闭的同时官方旧菜单（搜索框 + 来源分组 + 底部工具条）冒了出来。
- **根因**：**官方菜单是在「按钮按下」阶段就打开的**，不是点击之后。官方 ModelSelect 的 `rootRef onMouseDown` 一按下就 `setOpen(true)`；v0.6.1 起插件只能在按下瞬间给 `html` 打 `data-mf-model-opening`，靠 `html[data-mf-model-opening] div[role="menu"]{visibility:hidden !important}` 把它藏起来（600ms 条件移除 / 1000ms 无条件移除）。**藏起来 ≠ 没打开** —— 菜单一直在那儿，只是不可见；自绘级联一关闭、预隐藏一到期，它就显形了。所以问题不在「旧面板的代码没删」，而在「官方菜单每次都真的被打开了」。
- **修复①（源头掐断）**：新增 `canOwnModelMenu(trg)`（= `isModelTriggerBtn(trg)` 且模型目录 `groups` 非空，与 `openCascade` 的唯一 early-return 对齐，即「拦下来一定能弹出面板」）；`onDocModelTriggerDown` 在确定为自绘接管时 `ev.stopPropagation()`，让这次按下到不了官方 rootRef → 官方菜单**根本不打开**。只 stopPropagation，**不 preventDefault**（否则浏览器不再派发 click，自绘级联反而打不开）。
- **修复②（兜底按回去）**：新增 `dismissOfficialModelMenu()`：若 `findModelTrigger()` 的 `aria-expanded === "true"`（官方菜单正开着）就同步摘掉本拦截监听 → `trg.click()` 关掉 → `finally` 挂回（`click()` 派发同步事件，不摘会被自己再拦一次 → 菜单关不掉 → 死循环）；随后 400ms 再撤 `data-mf-model-opening`（官方关闭是 React 异步状态更新，立刻撤隐藏会看见菜单闪一下）。在 `openCascade` 末尾与 `closeCascade` 内各调一次 —— 即使修复①因官方注册顺序失效，级联打开的这一刻也一定把官方菜单按回去，**它再也没有机会躲在后面**。
- **生效方式**：只改客户端 bundle → 由宿主 `dsh-client-hmr` 自动热替换（**桌面端 Ctrl+Shift+R 并不会重新读盘**，详见 1.0.9 条目）。

## 1.0.7 (2026-11-15) — 修「未选模型点开是旧界面」：新旧两套面板统一为自绘三级级联

- **现象**：还没选过模型时，点 composer 的模型按钮弹出的是官方原始菜单（搜索框 + 来源分组列表 + 底部「悬浮 / 面板 / 列表」工具条）；一旦选过模型，同一个按钮弹出的却是插件自绘的三级级联面板（来源 / 模型 / 强度三列 + 测活）。两套界面并存，看起来就像「两种新旧模板」。
- **根因**：v0.6.4 起的「点击拦截 + 菜单预隐藏」判据写的是 `trg.querySelector("[data-provider-id][data-model-id]")`。这个数据元素是**官方按钮里当前选中的模型**渲染出来的 —— 没选过模型时按钮里没有它，判据不成立：`onDocCascadeClick` 直接 return（不拦截）、`onDocModelTriggerDown` 也直接 return（不预隐藏），官方菜单于是原样弹出；选过模型后判据成立，才拦截并弹自绘面板。**同一个按钮，行为取决于选没选过模型**。
- **修复**：抽出统一判据 `isModelTriggerBtn(trg)`，三级任一成立即认定：① 按钮内含模型数据元素（选过模型，即原判据）；② composer 内唯一一个 `button[aria-haspopup="menu"]`（未选模型时的真实形态，不误伤别的菜单钮）；③ 按钮文案命中「请选择模型 / Select a model / …」占位。`onDocModelTriggerDown` 与 `onDocCascadeClick` 都改用该判据，未选模型时同样预隐藏官方菜单、弹出自绘面板。
- **防死点兜底**：判据覆盖面变广，为防止「拦下来了但自绘面板没开成」（模型目录尚未加载、分组为空时 `openCascade` 会直接 return）导致「点了没反应」，拦截后补一条回退：面板确实没打开时，撤掉预隐藏并 `trg.click()` 把官方菜单补点开一次 —— 用户任何情况下都选得到模型。补点前先**同步摘掉本拦截监听**再挂回（`click()` 派发的是同步事件，不摘的话补点会被自己再拦一次 `preventDefault` → 菜单仍不开 → 又进兜底 → 无限递归，表现为点了没反应 + CPU 空转）。
- **死代码同步**：`onDocCapTrigger` 全文没有 `addEventListener` 注册点（只在 dispose 里被 remove），实际不生效；其判据一并同步为 `isModelTriggerBtn`，避免将来启用时把这个 bug 重新引进来（已加注释标注现状）。
- 纯客户端改动（lib/client.js）：**Ctrl+Shift+R 硬刷新**即生效，无需退出 DSH。

## 1.0.6 (2026-11-13) — 面板按内容自适应：强度列不再被拉宽，状态列对齐

- **强度列右侧大片空白根治**：`.dsh-mf-cols` 是 `#dsh-mf-cascade`（flex column）的子项，默认 `align-items:stretch` 把它横向拉到面板满宽，而三列都是 `flex:0 0 auto`，剩下的宽度全堆在第三列右边。加 `align-self:flex-start` 让列区只占内容宽；窗口窄到放不下时列区自身横向滚动（滚动条隐藏），不再留白也不再裁内容。
- **底部按钮与字号合并成一行**：原来「当前选择」一行（字号在其右）、按钮另起一行，共两行且会折行。改为同一行 `flex-wrap:nowrap`；按钮收紧到高度 21px / 字号 10px / 左右 6px；当前选择文本 `max-width:min(36vw,240px)` 加省略号，窄窗口时优先压缩它，按钮组自身横向滚动 —— 物理上不再换行。
- **面板宽度去写死**：原来 `#dsh-mf-cascade` 固定 `width:min(92vw,740px)`，内容少时右侧留白、第三列（强度）被强行撑开。改为 `width:max-content; max-width:min(94vw,880px)`，宽度由内容决定。
- **三列按内容分配**：原来「来源/模型/强度」按 `31% / 48% / 21%` 固定比例，强度列白占 21%。改为 `flex:0 0 auto`，各列只占自己内容需要的宽度。
- **行内对齐**：模型名 `flex:1 1 auto` 吃满剩余宽度；🖼（识图）/ 🧠（思考）图标固定为 24px 右对齐列；✅/❌ 固定为 16px 居中列 —— 有图标与无图标两种行，状态图标都落在同一条竖直线上。
- **去掉第一列 `max-width:42%`**：父容器改为 max-content 后，百分比上限会参与循环解析，改为 `max-width:none`。
- **版本号校准**：package.json 停在 1.0.4、client 内 MF_VERSION 停在 1.0.5，统一为 1.0.6。
- 纯客户端改动（lib/client.js）：**Ctrl+Shift+R 硬刷新**即生效，无需退出 DSH。

## 1.0.4 (2026-11-12) — 来源标题头右侧新增「⟳ 检查更新」

- 头部右侧加 ⟳：查 npm 最新版 → 有新版变蓝「更新到 vX」→ 再点一键安装到 desktop profile（装完提示彻底退出 DSH）。
- 复用技能浏览器全局更新委托（window.__dshUpdClick）。纯客户端改动：Ctrl+Shift+R 生效。

## 1.0.3 — 2026-11-11

### 修复：测活不再把「2xx 但正文是上游错误」判成可用（假绿 4 条）

- **现象**：`qwen3.8-27b`、`glm5.3-flash`、`atomcode/qwen3.8-27b`、`atomcode/glm5.3-flash` 这 4 条返回 HTTP 200，正文却是「请求负载过高」；旧版只看状态码就判绿，面板上因此多了 4 个假绿点。
- **根因**：`lib/index.js` 的 `handleProbe` 成功路径只取状态码，从不读 `result.body`；而发送函数 `postJson` 早已把响应体截到 2000 字一并返回——数据一直拿得到，只是没人看。
- **修复**：2xx 之后继续检查正文，命中上游错误特征（请求负载过高 / overloaded / rate limit / quota / 额度不足 / invalid api key 等）时不再判绿，新增 `code` 为 `OK_BODY_ERROR`；判定用黑名单式匹配，不裸匹配 `error` 单词、也不要求 `choices` 非空，避免把正常回复误判成失败（假红）。可用数会相应减少 4 条——那 4 条本来就是假绿，不是能力倒退。
- **旧快照失效**：`~/.dsh/model-fold-probe.json` 的 `version` 由 1 升到 2，读取时版本不匹配即整体作废并重建，避免升级后旧的 4 个假绿点继续挂在面板上。
- **脱敏门槛维持 8 不变**：评估过是否随判据一起调整，结论是不动——它只决定错误信息落盘的长度，与真假绿判定无关，改了只会让脱敏行为发生无必要漂移。

## 1.0.2 — 2026-11-11

### 修复：模型测活改用 DSH 凭据库的 key，不再被过期环境变量带偏

- **根因**：`lib/index.js` 取 key 只走 `process.env[apiKeyEnv]`，而 DSH 模型页把 key 写进托管文件 `~/.dsh/.credentials.yaml` 的 `refs` 段。内核注释明确该托管文档不会被写进进程环境，于是插件在宿主里读到的是 `HKCU\Environment` 残留的旧变量（网关已吊销），`envKey || input.apiKey` 又因 env 非空而恒短路，客户端传来的 key 永远轮不到 → 整片 401，面板全红。
- **修复**：key 来源改为按权威度排序的候选链 —— ① 凭据服务 `ctx.get("credentials").resolve(apiKeyEnv)`（托管文件优先于环境变量）；② 直读 `~/.dsh/.credentials.yaml` 的 `refs` 段（宿主凭据服务版本较老时的兜底）；③ 客户端显式传入的 `apiKey`；④ `process.env` 最后兜底。
- **401 / 403 自动换下一把候选 key 重试**；400 只有响应体命中 key 关键字（正则 `/api[\s_-]?key|unauthoriz|invalid.{0,12}(key|token|api)/i`）才算 key 被拒并换下一把；候选 key 含 HTTP 头不允许的字符（Node 抛 `ERR_INVALID_CHAR`，响应里 `code` 为 `INVALID_KEY_CHAR`）也按该候选失败处理，还有下一把就继续换；其它状态码（如上游 502）与网络错误不重试，避免把上游故障误判成 key 问题。
- **候选链全空时不发任何请求**：只有一项且值为空（凭据库、请求、环境变量都为空）时直接返回 HTTP 200 + `code` 为 `NO_CREDENTIAL`、`keySource` 为 `none`，不打匿名请求——否则网关回 401，面板会把「插件自己没拿到 key」显示成「你的 key 被拒绝」。
- probe 响应新增 `keySource` 字段，客户端悬停文案追加 `· key:<来源>`，可直接看出这次测活用的是凭据库（`credentials/*`，含直读托管文件的 `credentials/file-raw`）、客户端传入（`request`）还是环境变量（`process-env`）；一把都没取到时为 `none`（此时请求不带 key，悬停不显示该段）。四个出口（成功 / HTTP 失败 / NETWORK / 异常兜底）都带该字段；**本版异常兜底返回 HTTP 200 + `code` 为 `EXCEPTION`**（早期实现返回 500 且不带该字段），别把状态码当恒定契约。
- 面板上「所选 API Key 已失效」等文案一直是网关透传（宿主原样回传 `error.message`），不是本插件硬编码；本次照旧透传，只是不再由插件自己把旧 key 喂给网关。
- **`auto` 只作背景，不计入本版判断**：网关 `GET /v1/models` 返回 276 条，其中含 `auto`（`owned_by=accio`，稳定 502 `Accio 上游错误：[402] unauthorized`）；但 profile 的 `providers.agent2api.models` 只列 **224 条**（首项 `qwen3.8-27b`），**不含 `auto`** —— 测活遍历的是 profile 的 224 条，根本碰不到它。先前把 `auto` 单列成一条已知上游故障并列进本版说明，会让读者去面板里找一个永远不会出现的模型，现予纠正。
- **期望管理：修好 key 不等于全绿**。另一路独立实测（不是本插件自测结果，且是当下上限）显示：有效 key 下 desktop profile 的 agent2api 224 条里可用最多 **74 条（约 33%）**。仍红的 150 条拆开看 —— **22 条是模型本身不可用**（1 条 502「模型不可见或无访问权限」，21 条 45 s 复测无响应）；**128 条是网关账号池被限流**（115 条 503「所有启用中的账号都被限制器拦下」，13 条 429「所有候选账号对模型 X 均已限额或禁用」，均带恢复时间）。这 128 条既不是插件缺陷，也不该把模型从列表里删掉：额度恢复后它们会自己变绿。
- **xiufu / web 两个 profile 仍装 1.0.0**（与 npm 1.0.1 的代码逐字节相同），在那两处点测活仍会整屏红叉，**与本缺陷无关，勿据此判回归**；desktop profile 才是本版修复的验证环境。
- **文档一致性修正**：按 1.0.2 核对报告修了 `README.md` / `docs/modes.md` 的表述 —— 兼容声明改回 0.x 内核线、测活说明补写凭据库候选链与 401/403 换 key 重试（并标明同一模型最多 4 次额度）、补 `openai-responses` 方言的 `max_output_tokens`、面板宽度改为最宽 `min(92vw, 640px)`、补请求体 16 KB / 结果集 1 MB 上限、安装命令标注仅适用非 desktop profile、`docs/modes.md` 不再声称旧 hover/panel/inline 三模式已被移除（实为入口收敛 + 休眠但仍可双击来源标题切回）。
- 维护提醒：`locale/zh.json` / `locale/en.json` 的 `meta.description` 带 `vX.Y.Z · ` 前缀，**每升一版必须同步改这两处**（版本以 `package.json` 与本文件为准，漏改会让市场描述失实）。
- 生效方式：宿主端改动需**彻底退出 DSH 客户端再启动**（无热重载）；客户端 `lib/client.js` 改动用 Ctrl+Shift+R 硬刷新。

## 1.0.1 — 2026-11-09

### 插件市场元数据：新增 locale 显示名与描述

- 新增 `locale/en.json`、`locale/zh.json`：显示名（Model Fold / 模型折叠）与一句话功能描述。
- `package.json`：`exports` 增加 `./locale/*.json`；`files` 白名单增加 `locale/*.json`（缺这行 npm 包里就没有 locale 文件）。
- 运行代码（`lib/client.js`、`lib/index.js`）无改动，行为与 1.0.0 完全一致。

## 1.0.0 — 2026-11-08

### 大更新：三级级联面板 + 真实测活 + 结果持久化

- **三级级联面板**：来源 / 模型 / 强度三列并排，不再打开官方模型菜单；点强度即选中模型与档位。
- **识图 + 思考强度一键开关**：开启补全七档 `reasoningEfforts` 与 `image`；关闭移除 `image`、`reasoningEfforts=false`，无需逐个模型手点。
- **能力图标**：模型名后显示图片 / 大脑黑白图标，分别对应图片设置与思考强度设置；关闭后立即消失。
- **逐模型真实测活**：宿主 `POST /plugin/dsh-model-fold/probe`，每个模型发 1-token 请求；绿 ● 可用、红 ✕ 不可用、灰色 … 等待。
- **结果持久化**：`GET/POST /plugin/dsh-model-fold/probe-results` 原子写入 `~/.dsh/model-fold-probe.json`；localStorage 兜底；重测覆盖。
- **显示测活开关**：显示/隐藏已保存的测活结果，不删除记录。
- **紧凑布局**：640px 宽、三列 grid、两行 footer、字号 8–15 手动输入。
- README、功能描述与截图全部替换为新版界面。

## 0.7.2 — 2026-11-08

### 测活结果持久化 + 显示开关

- 宿主新增 `GET/POST /plugin/dsh-model-fold/probe-results`，把结果原子写入 `~/.dsh/model-fold-probe.json`（`DSH_HOME` 可覆盖）。
- 客户端每次测活结果实时写入（防抖 500ms），同时写 localStorage 兜底；重测同一 `provider::model` 直接覆盖。
- 底部新增 **「显示测活」** 开关：开=显示已保存的绿 ●/红 ✕；关=只隐藏标记，不删数据；偏好持久化。
- 打开面板自动加载保存结果并应用；宿主不可用时回退 localStorage。
- 状态栏提示：`已显示测活结果（N 条）` / `暂无测活结果` / `已隐藏测活结果`。

## 0.7.1 — 2026-11-08

### 修测活无标记 + 图标不随开关刷新

- `probeProviderModels` 只创建/ensure 一个 `configForms` face（此前第二次 `describe()` 拿到未加载的新 face，直接返回“无 baseURL”，所以没有任何标记）。
- 测活开始先给当前来源所有模型行标 **pending（灰色 …）**，逐个变 **绿色 ●** / **红色 ✕ + 删除线**；完成显示 `测活完成：可用 a/n（失败 b）`。
- 宿主 probe 路由未加载时显示「宿主 probe 未加载，需彻底重启 DSH」，不伪装成测活结果。
- 新增 `refreshCascadeCaps()`：一键开/关完成后重新读配置并**原地刷新图标**，不再等重新打开面板；打开面板也走同一刷新路径。

## 0.7.0 — 2026-11-08

### 新增「测活」：逐模型真实可用性

- 宿主半 `lib/index.js` 新增 `POST /plugin/dsh-model-fold/probe`：按 provider 的 `baseURL/api/apiKeyEnv` 给单个模型发 1-token chat 请求，判断真实可用性。
- 客户端新增「测活」按钮：按当前来源逐模型并发 4 个请求（12s 超时），行内显示：
  - **绿色 ●** = 真实请求成功；
  - **红色 ✕ + 删除线 + 浅红底** = 请求失败；
  - 状态栏实时显示 `测活 x/n（可用 a）`。
- 支持 `openai-completions` / `openai-responses` / `anthropic-messages` 三种协议。
- ⚠️ 宿主代码改动需**彻底重启 DSH** 才生效（客户端 bundle 只需 Ctrl+Shift+R）。

## 0.6.30 — 2026-11-08

### 图标回到「设置开关」语义 + 思考强度补全七档

- 图片图标 = 当前模型配置的 `input` 是否含 `image`（图片设置已打开）；关闭后图标消失。
- 大脑图标 = 当前模型配置的 `reasoningEfforts` 是否非空（思考强度已打开）；关闭后消失。
- 配置里查不到的模型不再用目录能力兜底，避免“关闭了图标还在”。
- 开启思考时补全 **off/minimal/low/medium/high/xhigh/max 七档**（已有档位做合并，不覆盖原值）。

## 0.6.29 — 2026-11-08

### 图标改为「模型能力」语义

- 图标不再代表开关状态：图片图标 = 模型目录声明 `input` 含 `image`；大脑图标 = 目录声明有 `reasoning.efforts`。
- 因此关闭识图/思考后图标仍会保留（它表示“模型本身支持”），tooltip 明确写「不代表当前开关已开，也不是实测结果」。
- 不改变开关按钮逻辑。

## 0.6.28 — 2026-11-08

### 三级面板紧凑重排

- 面板固定 `min(92vw, 640px)`，三列改为 grid `176px / minmax(160px,1fr) / 108px`，右边界落在「强度」列。
- 搜索框与状态胶囊同一行；状态空闲隐藏，只显示 `应用中 x/x` / `已关闭 x/x` / 短错误。
- 底部两行：当前选择（单行省略）+ 字号输入；`开启识图+思考` / `关闭识图+思考` / `比对` 三个紧凑按钮。
- 删除可见备注句，图标说明只保留在 tooltip；模型行改为「名称 + 能力图标 + ✓」三段结构。
- 新增 DOM 探针断言，探针总计 44/44 + 14/14。

## 0.6.27 — 2026-11-08

### 面板宽度收紧，右边界到「强度」列

- 面板固定 `width:min(92vw,740px)`，三列按 31% / 48% / 21% 分配，不再被底部按钮撑出大片右侧空白。
- 顶部搜索/状态、列区、底部设置条统一 `width:100%`，边距紧贴内容。

## 0.6.26 — 2026-11-08

### 底部紧凑布局 + 修 responses 兼容报错

- 底部改为**自动换行**：当前模型信息独占一行，两个「一键…」按钮等宽并排、文字可折行；字号/清单比对/备注按剩余空间自动排列。
- `compat.supportsReasoningEffort` 只在 `api === "openai-completions"` 时下发；`openai-responses` 等协议不再写该字段，消除 `settings/rejected`。

## 0.6.25 — 2026-11-08

### 图标与设置开关严格一致 + 备注

- 图标改为**完全按当前设置配置**判定：pi-ai 按 provider/模型，deepseek 按模型 `inputModalities`；找不到才退回目录能力。
- 每次打开面板都会 `ensure()` 后重新读取配置并重绘，避免用旧快照导致图标与开关不一致。
- 图标 tooltip 明确写「仅表示设置，不代表模型真实能力」；底部增加常驻备注「图标=设置已开启，不代表模型真实能力」。

## 0.6.24 — 2026-11-08

### 按钮改为「一键打开 / 一键取消」

- 删除「当前模型」按钮。
- 「全部模型」改名为 **「一键打开模型识图开关、思考强度」**。
- 新增 **「一键取消打开模型识图开关、思考强度」**：移除 `input` 里的 `image`、把 `reasoningEfforts` 置为 `false`、provider `compat.supportsReasoningEffort` 置为 `false`；deepseek 侧移除 `inputModalities` 的 `image`。
- 关闭模式状态显示 `已关闭 x/x`。

## 0.6.23 — 2026-11-07

### 模型名后显示识图/思考图标

- 模型列每行名称后追加两个**黑白 SVG 图标**：图片（识图已开）、大脑（思考强度已开）；未开启则不显示。
- 判定以**当前配置**为准（`input` 含 `image`、`reasoningEfforts` 非空），配置尚未加载时先用目录能力兜底，加载后自动重绘。
- 图标继承文字颜色（深色主题白、浅色主题黑），不引入彩色 emoji。

## 0.6.22 — 2026-11-07

### 单搜索框 + 状态限长 + 修 settings/rejected

- 顶部恢复**一个**模型搜索框（左），右侧同一行显示状态；状态最多 56 字，超出省略号，完整内容在悬停 title。
- **取消所有桌面 toast 弹窗**，状态只在面板内显示。
- 修 `settings/rejected`：`magpie-responses` 这类路由没有任何模型支持推理时，不再下发 `compat.supportsReasoningEffort=true`（只在至少一个模型有 `reasoningEfforts` 时才写）。
- 字号输入框固定宽度，避免被挤到看不见。

## 0.6.21 — 2026-11-07

### 面板瘦身 + 思考档位改用官方可用三档

- 删除三级面板顶部搜索框，改为**状态栏**（只在这一处显示进度/结果）。
- 字号由 4 个按钮改为**数字输入框（8–15）**，菜单设置条与三级面板同步。
- 去掉「识图+思考强度」冗余标签，底部不再重复状态文字。
- `reasoningEfforts` 由七档改为官方实际使用的 **low/medium/high** 三档，并对已有档位做合并补齐（避免 `minimal/xhigh/max` 触发 `settings/rejected`）。
- 失败状态显示 `settings/xxx:具体消息`（最多 160 字）。

## 0.6.20 — 2026-11-07

### 修「完成 0/2，失败 2」并显示错误码

- 写入时先带 revision；若返回 `settings/conflict` 自动回退为**不带 revision** 重试一次。
- 失败时状态/toast 显示错误码：`完成 0/2，失败 2（settings/xxx）`，便于定位。
- 确认「全部」覆盖所有 pi-ai provider 的所有模型（补 `reasoningEfforts` 七档 + `compat.supportsReasoningEffort=true`）；deepseek 的 schema 只有 `inputModalities`，无法通过设置强开推理档位。

## 0.6.19 — 2026-11-07

### 可见提醒 + 测试按钮明确“清单比对”

- 新增底部 **toast 浮层提醒**：一键打开/比对开始、进度、完成、失败都会弹一条，2.8s 后淡出（之前只有面板底部小字，容易看不见）。
- 测试按钮改名为 **「清单比对(非测活)」**，明确它比对的是来源返回的模型清单，**不是逐个模型发请求测活**。
- 失败提示同时弹 toast 并显示错误码。

## 0.6.18 — 2026-11-07

### 修复「全部模型」不生效 + 应用进度

- 「全部模型」改为**逐条 op 应用**（每个 provider 的 models / compat 单独 mutate，单条失败不影响其它），不再整批被拒就全失败。
- 底部新增**状态文字**：`准备中… → 应用中 3/34 → 完成 32/34，失败 2`。
- 逐条前重新 describe 取最新 revision，避免批量 revision 过期。

## 0.6.17 — 2026-11-07

### 「识图+思考强度」按钮可选中；测试可用性写清楚并修失败

- 底部标签改为 **「识图+思考强度」**，后面两个按钮 **「当前模型」「全部模型」**；点哪个就记哪个，选中项有品牌色背景（不再看不出开关含义）。
- 「测试本来源可用性」：先读该来源的 `baseURL/api` 再调 `discoverModels`（之前只传 provider，常被判失败）；结果显示 **「可用 x/y」**，失败显示 **「失败:错误码」** 并把详细信息放进 tooltip；删除线 = 该模型不在来源返回的清单里。

## 0.6.16 — 2026-11-07

### 一键打开拆分为「当前 / 全部」

- 底部改为「一键打开」+ **「当前」「全部」** 两个按钮：
  - **当前**：只给当前选中的 provider/模型补 `image` 与 `reasoningEfforts`（pi-ai）/ `inputModalities`（deepseek），provider compat 也只改该来源；
  - **全部**：沿用原行为，遍历所有 provider 的所有模型。
- 两个按钮共用开关状态，激活时带品牌色背景。

## 0.6.15 — 2026-11-07

### 新增「测试本来源」模型可用性按钮

- 面板底部新增 **「测试本来源」**：调用官方 `remote.llm.discoverModels` 拉取当前来源的可用模型列表，逐一比对；
- **不可用的模型在列表中加删除线并降透明度**；按钮显示「可用 x/y」。
- 说明：这是“来源声明的模型清单”比对（不是逐个发推理请求），速度快、无额外费用。

## 0.6.14 — 2026-11-07

### 修复「一键打开思考强度/识图」未生效

- 插件显式声明服务依赖 `remote / remote.settings / configForms / modelDirectories`，保证 settings 写入链路可用（此前惰性取服务可能取不到，导致静默失败）。
- 按钮点击行为改为**总是开启并立即执行**（原来默认就是开，点一下反而变成关闭）。
- 每次打开自绘面板时，若开关为开，会自动再执行一次（幂等，无变化不发请求），确保设置页看到「图片」勾选与推理等级开启。

## 0.6.13 — 2026-11-07

### 字体回官方 / 按钮改名 / 激活态可见

- 字体格式恢复**与官方一致**（移除 Times New Roman，改为 `font-family:inherit`）；字号选项仍是 `10 / 11 / 12 / 13`。
- 「强制图片+强度」按钮改名为 **「一键打开思考强度/识图」**。
- 该按钮**激活时带品牌色背景**（`rgba(79,124,255,.20)`），一眼能看出已开启。

## 0.6.12 — 2026-11-07

### 修复浅色模式下自绘面板不可读

- 主题色改为按 `pageIsDark()` 取**明/暗兜底色**（深色：深底浅字；浅色：浅底深字），不再依赖可能缺失/取值异常的 `--dsw-*` 变量。
- 每次打开面板都会重算主题，切换深浅色后再打开也正确。
- 边框同步使用 `--mf-border`。

## 0.6.11 — 2026-11-07

### 自绘面板颜色跟随系统深/浅色

- 背景/文字/边框不再自算颜色，改为直接使用 DSH 主题变量（`--dsw-alias-bg-l1/l2`、`--dsw-alias-label-primary`、`--dsw-alias-border-l2`），**深色模式自动深底浅字、浅色模式自动浅底深字**。
- 修复深色模式下自绘面板变成浅色、文字几乎看不清的问题。

## 0.6.10 — 2026-11-07

### 自绘面板细节：可读性 / 字体 / 强制按钮 / 悬停与路径高亮

- 表头「来源 / 模型 / 强度」与底部文字**不再透明**（原来半透明，滚动时看不清）。
- 数字与英文使用 **Times New Roman**（中文回落微软雅黑）。
- 底部新增 **「强制图片+强度」** 按钮（此前该开关在官方菜单底部，官方菜单不再打开后缺失）；点击开启/关闭强制能力，开启即执行一次。
- 行 **hover 有背景**；**当前选中**行有品牌色背景 + ✓。
- **子级悬停时所有上级行也高亮**（悬停模型 → 来源高亮；悬停强度 → 来源+模型都高亮），层级路径一眼可见。

## 0.6.9 — 2026-11-07

### 面板底部显示「来源 / 模型 / 强度」全部

- 底部左侧当前信息改为完整三段：`来源 / 模型 · 强度`（如 `Magpie / deepseekV4.1flash-group · routing group · High`），过长省略号。

## 0.6.8 — 2026-11-07

### 面板底部显示当前模型

- 面板底部条最左侧显示**当前模型（含当前思考强度）**，过长省略号；右侧仍是「字号 10/11/12/13」。

## 0.6.7 — 2026-11-07

### 自绘面板支持调节字号 + 随字号自适应

- 面板行字号改用全局 `--mf-fs`（默认 11px，比之前 13px 小，跟“之前一样”）。
- 面板底部新增**字号 10/11/12/13** 按钮（原来在官方菜单底部，官方菜单不再打开，故挪到自绘面板内）；点一下即时生效并记忆。
- 列宽/行高/搜索框高度都用 `em` 或 `calc(var(--mf-fs))` 跟随字号自适应，字号变大面板整体变大、不变形。

## 0.6.6 — 2026-11-07

### 自绘面板补「对勾」与「来源模型数量」

- 每个来源行右侧显示该来源的**模型数量** `(N)`（与官方一致）。
- 当前选中的**来源 / 模型 / 强度**行右侧显示 **✓**，一眼看出当前选择。
- 行改用 flex，名称过长省略号，右侧数量/对勾固定不被截断。

## 0.6.5 — 2026-11-07

### 自绘三级面板补齐「搜索 / 选择 / 与官方一致的观感」

- 顶部新增**搜索框**（占位「搜索模型…」），按模型名或来源过滤，结果显示在中间列，悬停仍可看强度、点击即选。
- 三列（来源 / 模型 / 强度）**合并在同一个浮层内并排**，不再分三个窗口；背景取官方菜单表面色、行字号 13px/500、行高 32px，尽量与官方一致。
- 选择行为：点来源填充模型列、悬停模型填充强度列；点模型用默认强度选中、点强度用该档位选中，均通过 `directory.select` 写回并关闭。

## 0.6.4 — 2026-11-07

### 改为插件自绘三级级联面板（不再依赖官方菜单，彻底消除闪屏）

- 拦截模型触发器的点击，**官方模型菜单不再打开**；插件直接从 `ctx.modelDirectories` 的目录数据绘制「来源 / 模型 / 强度」三列级联面板（同一浮层内并排，互不遮盖）。
- 悬停来源列 → 填模型列；悬停模型列 → 填强度列；点强度（或点模型用默认强度）通过 `directory.select` 写回；点触发器开合，点外部/再次点击关闭。
- 因为完全不经过官方菜单，所以不再出现官方默认面板或白色面板的闪现，也就更丝滑。

## 0.6.3 — 2026-11-07

### 修复：官方默认面板仍会闪（进一步）

- 预隐藏时机提前到 **pointerdown + mousedown** 双保险（部分控件在 pointerdown 就展开，早于 mousedown）。
- 解除预隐藏的时机从 `quickHideRoot`（可能过早，会露出官方默认样式一帧）改到 `enhance()` **处理完分组、套用完插件样式之后**，才让菜单可见。
- 结果：按下模型按钮 → 官方菜单全程不可见 → 整理成三级面板后一次性显示，不再出现“官方默认面板闪一下”。

## 0.6.2 — 2026-11-07

### 修复：点模型按钮瞬间官方默认面板仍会「闪一下」

- 在 `mousedown`（按下模型触发器的第一时间）给 `<html>` 加 `data-mf-model-opening`；CSS 让 `div[role="menu"]` 在插件整理完成前 `visibility:hidden`，因此官方默认面板**一帧都不显示**。
- `quickHideRoot()` 检测到模型菜单已出现分组（整理完成）立即撤销该属性；另有 1s 兜底撤销，避免卡死隐藏。
- 仅作用于「含 provider 标识的模型触发器」按下时，不影响左侧会话「⋯」等其它菜单。

## 0.6.1 — 2026-11-07

### 修复：左侧会话「⋯」菜单被误自动点击（高，功能性回归）

- `autoDrillRoot()` 不再「找不到模型项就点第一项」——`target` 为空直接 `return`，绝不会点会话菜单的置顶/重命名/归档/删除。
- 新增 `isModelMenu()` 总闸：`enhance()` 只处理模型选择菜单（含 `section[role="group"]`，或含以「模型 / Model / 推理 / Effort」开头的 `button[role="menuitem"]`）；会话「⋯」等其它菜单完全跳过（不注入主题、不渲染设置条、不自动下钻）。
- 回归探针：会话菜单 **0 点击**、不被标记 `data-mf-drilled`；模型菜单正常下钻 **1 次**；全部探针 37/37 通过。

## 0.6.0 — 2026-11-07

### 三级三面板（模型来源 / 模型列表 / 思考强度）+ 强制图片/思考强度

- **三级三面板**：点触发器 → **模型来源**（provider 列表，官方菜单、根摘要已屏蔽）→ 悬停来源弹出**模型列表**子面板 → 悬停模型行弹出**思考强度**面板（全部档位，行格式与上两级一致，点一项即选中该模型+档位）。三个面板并排、互不遮盖。
- **过程中多余弹层屏蔽**：官方的「模型 / 推理等级」根摘要面板在打开瞬间同步隐藏，不闪；除上述三个面板外不额外弹别的面板。
- **强制图片输入 + 强制思考强度**：加载时自动把 `llm-pi-ai` 全部模型的 `input` 补上 `image`、补七档 `reasoningEfforts` 并把 provider 的 `compat.supportsReasoningEffort` 置真；把 `llm-deepseek` 全部模型的 `inputModalities` 补上 `image`，写入 DSH settings 持久化。菜单设置条保留「强制图片+强度」开关（默认开，可随时关）。
- **强度写入**：选档通过官方目录 `ctx.modelDirectories.directoryFor(sessionId).select({provider, model, reasoningEffort})` 写回，可靠带上思考强度，官方触发器不再停在 `Default`。
- **已删除**：大脑图标胶囊、滑杆特效。
- 健壮性：服务一律惰性获取，缺失时降级；监听 / 定时器在 dispose 中清理，保持热重载单例。

### 影响面

- 仅客户端 bundle（`lib/client.js`）有行为改动，宿主 `lib/index.js` 未改。改完用 **Ctrl+Shift+R** 硬刷新生效。

## 0.5.1 — 2026-10-19

### 文档与代码对齐（无功能改动）

逐条核对 README / docs/modes.md / package.json 与 `lib/client.js` 的真实行为，修正 6 处不符。

| # | 位置 | 原写法 | 实际行为 | 取证 |
|---|---|---|---|---|
| 1 | README 功能亮点 · 三模式循环（中英） | `悬浮 → 面板 → 列表` / `hover → panel → inline` | **`悬浮 → 列表 → 面板`**（`hover → inline → panel`） | `lib/client.js` `toggleTitleMode()`：`var next = cur === "panel" ? "hover" : (cur === "hover" ? "inline" : "panel");` |
| 2 | README 功能亮点 · 用法提示（中英） | 「菜单**顶部**有一行小字」 | 提示条 **append 在菜单末尾**，且设置条 `position: sticky; bottom: 0`，故它在**底部（设置条上方）** | `lib/client.js` `menuEl.appendChild(hint)`（同函数后段 `bar` 也 appendChild）；CSS `.dsh-mf-configbar{...position:sticky;bottom:0;}` |
| 3 | README 适配内核表 | 内核 `2.0.15-next`、组件 `0.1.7-rc.2`、`engines.dsh: >=2.0.15-next` | 三项全错。本机 asar 实测 `dsh-desktop-next` = **2.0.18-next**、`dsh-client-ui-model-selection` = **0.2.1-alpha.2**；本包 `engines.dsh` 实为 **`>=0.1.7-rc.1`** | `app.asar` 读 `/package.json` 与 `/node_modules/@deepseek-ai/dsh-client-ui-model-selection/package.json`；本包 `package.json` `engines.dsh` |
| 4 | README「回滚 / 模式说明」 | 「v0.3.0 起为**双模式**：默认 **panel**…可切换为 **inline**」 | v0.5.0 起是**三模式、默认 hover**（`getMode()` 无存储时返回 `"hover"`；老 `panel` 一次性迁移到 hover） | `lib/client.js` `getMode()` + `MODE_CHOICES = [['hover','悬浮'],['panel','面板'],['inline','列表']]` |
| 5 | README「更新日志」 | 只列 v0.4.7、v0.4.2 | CHANGELOG 另有 v0.5.0、v0.4.8 两条未进 README | `grep -n '^## ' CHANGELOG.md` |
| 6 | `docs/modes.md` | 标题「Modes: **panel vs inline**」，`## panel (default)`，全文只有两种模式 | 缺 v0.5.0 新增且现为默认的 **hover**，`panel` 也不再是默认 | 同 #4 取证 |

### 同步内容

- `package.json` `version` 0.5.0 → **0.5.1**；`description` 重写（明确「默认悬停」+「三模式 + 字号」），中英双语
- `files` 补 `CHANGELOG.md` 与 `docs/modes.md`（此前 `docs/modes.md` 不在包内，但 README 有链接 → npm 用户点开 404）
- `docs/modes.md` 重写为三模式（hover / panel / inline）+ 设置条一节，45 行 → 77 行
- README 功能亮点、适配内核表、回滚说明、更新日志共 6 处修正

### 教训

「双击循环」这类状态机描述必须以代码里的三元表达式为准，不能凭 CHANGELOG 的措辞反推——v0.5.0 的 CHANGELOG 写的是 `悬浮 → 面板 → 列表`，而代码实际是 `panel → hover → inline → panel`。两者从 `hover` 出发的方向恰好相反。

## 0.5.0 - 新增悬浮模式、面板内设置条与字号调节；修复来源标题样式长期失效

### 新增 / Added

- **悬浮模式（新默认）**：鼠标划过来源标题即从右侧滑出该来源的模型，移开自动收起（延迟 260ms，避免掠过间隙时闪烁）。无需点击即可选模型。
  - 同一产品线此前需单击来源才滑出；现在「悬停」成为默认交互。
  - 三模式循环：`悬浮 → 面板 → 列表`，双击任意来源标题切换。
- **菜单内设置条**：菜单底部新增一行按钮，可直接切模式（悬浮 / 面板 / 列表）与调字号（`10 / 11 / 12 / 13`）。
  - `position:sticky;bottom:0` —— 菜单滚动时始终可见。
  - 字号写入 `documentElement` 的 `--mf-fs`，菜单与侧边面板同步生效，选择持久化。
  - 按钮的 `mousedown` / `click` 均 `stopPropagation`，不会触发宿主的「点击外部关闭」。
- **用法提示行**：菜单顶部显示小字 `双击来源标题可切换展开方式（当前：悬浮展开）`，降低新用户上手门槛。
- **模式默认值迁移**：老用户 `localStorage` 里若存着旧默认值 `panel`（非主动选择），一次性迁移到 `hover`；迁移后若用户再次显式选择 `panel`，则尊重其选择（迁移标记保证只做一次）。

### 修复 / Fixed

- **🔴 来源标题（分组标题）的全部自定义样式从未生效。**
  - 根因：内核 `MenuGroup` 渲染的 `section[role="group"]` 第一个子元素是 `span[data-menu-group-start]`，而插件 CSS 一直用 `section[role="group"] > div:first-child`（要求首个子元素是 `div`）定位标题 —— **选择器永不匹配**。
  - 影响面：折叠箭头 ▾/▸、悬停高亮、「当前来源」品牌色高亮与徽标（`当前·模型名`）等 **10 条 CSS 规则**全部失效；用户因此长期看不到「当前用的是哪个来源下的哪个模型」。
  - 修法：改用内核**显式提供**的属性钩子 `[data-menu-group-heading]`（CSS 10 处 + JS 兜底查找 4 处），比任何位置选择器都稳定。
- **字号切换「时好时坏」**
  - 根因：`paneSignature()` 把菜单每个子节点的 `index + tagName + className` 拼进签名，用于判断菜单视图是否切换。设置的按钮每次重建会改变签名 → 被误判为「pane 切换」→ `resetView()` 清掉自建 DOM → 按钮事件与状态丢失。
  - 修法三条：① 签名计算排除插件自建节点（提示条 / 设置条）；② 设置条改为**幂等更新**，只在首次创建按钮，之后仅刷新高亮，不再增删节点；③ 字号点击只调 `syncConfigBar()`（只改 `data-on`），不再触发 `resetMenuGroups` / `enhance`。
- **字号整体调小**：正文 15px → 11px、行高 22px → 16px、条目高 38px → 32px → 28px、箭头 12px → 10px（并接入 `--mf-fs` 变量，由设置条控制）。

### 文档 / Docs

- README 重写「三种模式」章节，配 `docs/images/mode-hover.png`（悬浮模式）与 `docs/images/mode-list.png`（列表模式）两张效果图。
- `package.json` 描述同步更新为「悬停滑出 + 面板内切换模式与字号」。


All notable changes to this project are documented in this file.

## 0.4.8 (2026-10-08)

Declare official DSH peer requirements and kernel version range.

- **Official DSH compatibility declaration**: the kernel checks
  `peerDependencies` for `@deepseek-ai/dsh` / `@deepseek-ai/dsh-*` ranges and
  does **not** read `engines.dsh`. Both `peerDependencies` and
  `devDependencies` now declare the same range:
  `@deepseek-ai/cordis` `^4.0.2`, `@deepseek-ai/dsh` `>=0.1.7-rc.1`.
- **Engine field now uses the kernel version**: previously `engines` only set
  `node`; added `engines.dsh = >=0.1.7-rc.1` (kernel version, not client/shell).
- Note: `^0.1.7` does **not** match prerelease kernels such as `0.1.7-rc.2`,
  hence the explicit prerelease lower bound.

No functional change.

## 0.4.7 (2026-09-27)

Fixes three defects that all stem from coupling with the host component's own
behaviour. Documented in README's "How it works" for anyone enhancing official
React UI from the outside.

- **Fixed: the side panel flickered and vanished.** Collapsing a provider hides
  its real model buttons with `display:none`, but the host focuses the *currently
  selected* model button when the model list opens. Hiding the focused element
  forces a blur whose `relatedTarget` is `null`; the host's root `onBlur` then
  treats focus as having left the menu and calls `close()`, taking the menu and
  the freshly opened panel with it. The plugin now moves focus back to the menu
  trigger **before** hiding anything (the trigger lives inside the host's
  `rootRef`, so `onBlur` returns early).
- **Fixed: clicking a provider did nothing.** Click/mousedown handlers were bound
  to the provider heading — a React-managed node that React replaces on re-render
  — so the handler sat on a detached node and never fired. All interaction is now
  handled by a single capture-phase delegate on `document`, resolving the target
  by walking up from the event target; no node references are held.
- **Fixed: the panel was transparent and its text unreadable.** The host menu's
  `background-color` is `transparent`; the real colour comes from
  `--dsw-specific-menu`, whose value is an **8-digit hex** such as `#43454a73`
  (alpha ≈ 45%). Only parsing `rgb()/rgba()` missed it, so the panel fell back to
  the ancestor colour and looked darker than the menu. `parseColor` now handles
  `#rgb/#rgba/#rrggbb/#rrggbbaa`, and the translucent menu surface colour is
  composited over the ancestor colour to yield an equivalent **opaque** colour.
- Changed: the provider list and the model subset now share identical typography
  and metrics (15px / 600 / 22px line-height, 38px rows, 8px 10px padding) and the
  same colour tokens. The same theme variables are injected onto the menu element
  (not only the panel) so both levels resolve to one colour.
- Changed: the selection ✓ is larger (16px, bold, brand colour) and the selected
  row gains a brand-coloured left bar.
- Fixed: hot-reload could leave multiple live instances (each with its own
  listeners), so two instances fought over the same click. `dispose()` now removes
  every listener and timer, and a singleton guard tears down the previous
  instance before a new one starts.
- Removed: all temporary diagnostic instrumentation (trace channel, four extra
  document listeners, two timers, and the host-side loopback route).

## 0.4.0 (2026-09-15)

- Changed: the provider group that contains the currently selected model is
  now labeled directly in the source list (总集). Its badge reads
  `(当前·N) <selected model name>` instead of `(N ✓)`, so you can tell at a
  glance which source and which model are active without opening the panel.
  The selected group's title is bolded and its badge tinted with the brand
  color. Side-panel items keep their per-model ✓ unchanged.
- Probe: DOM-stub regression added (`probe-badge.mjs`, 12/12): asserts the
  当前 badge content, plain `(N)` badges on other groups, CURRENT_ATTR
  placement, and the panel-side ✓ on the selected model.

## 0.3.1 (2026-09-12)

- Fixed: clicking a model in the side panel could never select it. The
  ModelSelect component closes its menu on outside `mousedown` and on focus
  leaving the menu root (`onBlur`); both fired before the programmatic click
  reached the real button, leaving the cached button detached from the
  document so React never received the event ("cannot switch models").
  - The panel now stops propagation and prevents default on `mousedown`,
    keeping the menu open while the panel is being clicked.
  - Group titles prevent the default focus shift on `mousedown` so the menu
    is not closed before the side panel opens.

## 0.3.0 (2026-09-12)

- New: panel mode (default) — the menu lists sources only; clicking a source
  slides in a side panel with that provider's models. Selecting an item clicks
  the real menu button programmatically, so the original React state stays intact.
- New: double-click any group title to switch between panel and inline modes
  (persisted in localStorage).
- New: the group containing the currently selected model is marked with a ✓
  badge and auto-expanded in inline mode.
- New: theme-aware side panel — background, text color, border radius and the
  selected-item highlight are read from the real menu's computed styles.
- Fixed: mode switching no longer re-attaches click/dblclick listeners on group
  titles (the processed marker is preserved across mode re-computation).
- Positioning: the side panel aligns to the clicked source and falls back to
  the left side of the menu when there is no room on the right.

## 0.2.0

- New: default-folded — the menu shows a source list first; clicking a source
  expands its models below the title (inline behavior).
- The selected model's group auto-expands on first paint of each menu.
- Fold state persists across menu opens via localStorage.

## 0.1.0

- Initial release: clickable group titles with a ▸/▾ arrow and a model-count
  badge on the model selection menu; fold state stored in localStorage.
