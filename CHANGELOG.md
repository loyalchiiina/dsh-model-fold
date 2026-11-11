# Changelog

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
