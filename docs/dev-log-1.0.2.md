# dsh-model-fold 1.0.2 开发日志

> 这是 dsh-model-fold 的**首份 dev-log**（此前两个目录 `*dev-log*` 均零命中，全部版本变更只写在 `CHANGELOG.md`），所以写得比常规版本详细，目标是脱离对话也能独立看懂。
> 写作时刻：2026-11-11（Asia/Shanghai）。代码仍在编辑中，**行号会漂移**，因此凡引用代码都同时给出函数名或标识符锚点，以锚点为准。

## 一、版本与范围

- 版本：`1.0.1` → `1.0.2`
- 本轮改动范围（宿主侧）：`probe` 取 key 的候选收集与选路（四来源 + env 来源降级）、候选链全空短路 `NO_CREDENTIAL`、401/403 与 400+关键字换 key 重试、`ERR_INVALID_CHAR` 跳候选、错误 message 脱敏与 300 字截断、响应新增 `keySource`；客户端只增加对该字段的消费（悬停显示来源）。代码终态 444 行，行号会漂移，以函数名／标识符锚定为准。
- 本轮**不改**：三级级联面板布局、识图／思考强度开关、测活结果持久化格式（仍是 `~/.dsh/model-fold-probe.json`，顶层 `version: 1`）、locale 文案内容（仅版本前缀跟着升）。

## 二、背景（当时看得见的现象）

- 打开模型面板点「测活」，当前来源下的模型**整屏全是红 ✕**，悬停文案统一是「所选 API Key 已失效」；不是个别模型失败，是同一来源全量失败。
- 探活走宿主侧路由 `POST /plugin/dsh-model-fold/probe`（见 `lib/index.js` 顶部注释与 `handleProbe`）。
- DSH 模型页保存的 key 落在托管凭据文件 `%USERPROFILE%\.dsh\.credentials.yaml`（实测 1920 B / 48 行 / 2026-11-11 12:56），结构是 `version:` + `refs:`（20 个以环境变量名命名的条目，其中含 `AGENT2API_API_KEY`）+ `records:`。
- 同一名字的环境变量在本机也确实存在：用户级 `AGENT2API_API_KEY` 实测长度 **39 字符**，是 2026-10-30 留下的旧值，网关侧已失效（`[Environment]::GetEnvironmentVariable(...,'User')` 实测；Process 作用域为空）。

## 三、根因（三层，缺一不可）

1. **旧实现只认环境变量**。1.0.1 的 `lib/index.js` 里取 key 的写法是
   `const envKey = input.apiKeyEnv ? process.env[String(input.apiKeyEnv)] : "";`
   `const apiKey = envKey || input.apiKey || "";`
   （该文件已被 1.0.2 重写覆盖，历史行号为 `lib/index.js:162-163`，请求头在 `lib/index.js:166` 的 `headersOf(api, apiKey)` 处组装 —— 仅作历史证据，勿在当前文件按此定位。）
2. **`||` 短路，把「有值但无效」当成「已经取到」**。只要 `process.env[apiKeyEnv]` 非空（哪怕是一把失效的旧 key），`input.apiKey` 就**永远不会被采用**；而 `input.apiKey` 本身也恒为空 —— 实测 profile 配置 `%USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml` 里 `^\s*apiKey\s*:` **0 命中**（20 个 provider 只写 `apiKeyEnv`，key 值全在托管文件里）。于是候选集合实际上只有「那把 39 字符旧 key」这一把。
3. **真正的 key 从来没进过进程环境**。DSH 模型页只写托管文件的 `refs:` 段，内核注释明确说明这些 ref **不会 materialize into the process environment**；插件按 `process.env[...]` 去问，问到的只能是历史遗留值 → 每个模型 HTTP 401 → 面板整屏「所选 API Key 已失效」。

一句话：**不是 key 错了，是插件问错了地方，而问到的旧值还被 `||` 锁死，后面正确的来源连尝试的机会都没有。**

## 四、四条互锁判据（怎么确认就是这条路，而不是别的原因）

| # | 判据 | 状态 | 证据 |
|---|---|---|---|
| J1 | 失败是**全量同质**失败，不是个别模型失败 | 现场观察（lead） | 同一来源 276 个模型一律红，悬停文案同一句 key 失效 → 指向共用凭据，不是模型能力差异 |
| J2 | **名字对得上、来源对不上** | 已实测 | profile 里 `apiKeyEnv: AGENT2API_API_KEY`（2026-11-11 实测 `cordis.patch.yml` 第 **3605** 行；**行号会漂移，按 `- id: agent2api` 锚定**——同刻 `agent2api:` 在 3603、`models:` 在 3611）；用户级同名变量长度 39（10-30 旧值）；托管文件 `refs:` 里同名条目存在（`%USERPROFILE%\.dsh\.credentials.yaml:20`） |
| J3 | 旧代码路径**必然**只回落到一把候选 | 读码可证 | `envKey \|\| input.apiKey` + profile 内 `apiKey:` 明文 0 命中 ⇒ 候选恒为旧 env 值；所有 provider 共用同一段逻辑，故必然全量失败 |
| J4 | 换成有效 key 后同一模型转为 2xx（反证：若仍 401，则另有 baseURL/网关问题，本结论不成立） | **已验证通过**（2026-11-11 17:36 重启后实测） | 宿主 PID 203208 于 17:00:22 启动，晚于代码 mtime 14:50:27，日志 `desktop-next-2026-11-11.0.jsonl` 记 `host.kernel.dsh-model-fold: started (... probe routes)`；活体 `POST http://127.0.0.1:56958/plugin/dsh-model-fold/probe` 对 agent2api 网关模型 `qwen3.8-27b` 与 `glm-5.2` 双双返回 `{"ok":true,"status":200,"code":"OK","keySource":"credentials/file"}`（2253 ms / 578 ms）⇒ 同一网关同一模型由 401 转为 2xx，反证路径不成立；回归 `regress-1.0.2.mjs` 8 条中 7 PASS，唯一 FAIL 是 CodeArts 账号授权到期（400「登录授权已到期」/ 复跑 429「候选账号限额」），属上游账号态而非代码缺陷；持久化文件里仍存的 55 条 401 时间戳全部落在修复前（13:49 那批）且无 `keySource` 字段 |

> 说明：J4 **已于 2026-11-11 17:36 闭环**（原稿写作时仍为待验证，因为宿主进程启动时刻早于本轮代码 mtime，实际跑的是旧模块）。闭环动作 = 彻底退出 DSH 重启（宿主 PID 203208 / 17:00:22）后再做一次测活：验收脚本 `E:\DSHskills-test\modelfold-probe\verify-1.0.2.ps1` 在 56958 端口确认 `keySource=credentials/file`，回归 `regress-1.0.2.mjs` 7/8 PASS，活体单点 probe 对 `qwen3.8-27b`、`glm-5.2` 均得 200/OK。**本稿据此宣布修复成立**。
> 遗留（不属本修复范围）：① 持久化文件 `~/.dsh/model-fold-probe.json` 里尚有 55 条修复前写入的 401 记录（无 `keySource` 字段），面板若仍显示旧红叉，点一次「重新测活」即被覆盖；② `agent2api` 下 `codearts/*` 通道上游账号授权已到期（400「CodeArts 登录授权已到期…请重新完成网页登录」），属账号态，需用户重新网页登录；③ `profiles\xiufu` 与 `profiles\web` 两个 profile 的实装副本仍是 1.0.0（7548 B / 2026-11-08 / SHA `F60C22DBDDB07DB5`，无 `keySource`），desktop 不加载它们，如需一致须单独升级。

## 五、修复设计（六个要点）

1. **凭据服务优先**：`resolveFromCredentialsService(ctx, ref)` 走 `ctx.get("credentials")` 取服务 → `await service.resolve(ref)`（终态 `lib/index.js:133-147`；行号会漂移，以函数名锚定），服务不存在或抛错时静默返回 `undefined`，不中断探活。
2. **直读托管文件兜底**：`resolveFromCredentialsDocument(ref)` 解析 `<DSH_HOME>/.credentials.yaml` 的 `refs:` 段，只取明文；`enc1:` / `${` / `{{` 前缀与空值一律跳过并返回 `undefined`（终态 `lib/index.js:151-186`，跳过逻辑在 `:177`），命中时返回 `source: credentials/file-raw`；读文件或解析异常整体 `catch` 返回 `undefined`（`:178-186`），绝不抛错。
3. **候选合并、去重、按权威排序**：`collectKeyCandidates`（终态 `lib/index.js:191-231`；行号会漂移，以函数名锚定）的实际顺序是
   `credentials service`（仅当 `resolved.source` **不含** `env`）→ `credentials/file-raw`（**仅当宿主凭据服务不存在**，`lib/index.js:215` 的 `if (!serviceAvailable)`）→ `request`（客户端显式传入的 `apiKey`，`:226`）→ `envSourced`（凭据服务返回且 `source` 含 `env` 的值，`:209` 暂存、`:227` 才加入）→ `process-env`（`:228`）→ 全空时的空候选（`value` 为空串、`source` 为 `none`，`:229`）；
   同一把 key 只保留首次出现（`seen` 集合去重），保证重试不会拿同一把 key 打两遍。
4. **401/403 自动换 key 重试**：`handleProbe` 内按候选顺序逐个尝试，只有 `attempt === 401 || attempt === 403`，以及 `attempt === 400` 且响应体命中 `/api[\s_-]?key|unauthoriz|invalid.{0,12}(key|token|api)/i`（终态 `lib/index.js:325-329`）才换下一把；候选凭据含 HTTP 头非法字符时 Node 抛 `ERR_INVALID_CHAR`，该候选按失败处理、还有下一把就 `continue`（`:317`）；其它状态码与网络错误（`status 0`）直接 break，**不换 key 空转**。
5. **响应新增 `keySource`**：成功 / HTTP 失败（终态 `lib/index.js:377-383`）、`NETWORK`（`:353`）、无候选的 `EXCEPTION`（`:333-339`）、异常兜底（`:395`）与 `NO_CREDENTIAL`（`:294`）都回传本次实际使用的来源；客户端在 `lib/client.js:1919`（`setProbeMark`）与 `:1926` 把它拼进悬停文案（` · key:<source>`，来源为 `none` 时不拼），`lib/client.js:1994` 仍照旧把 `apiKey` 传给宿主。
6. **环境变量降级**：`add(process.env[envName], 来源标记 process-env)`（终态 `lib/index.js:228`）排在最后，其前一层是 `envSourced`（`:227`，仅当凭据服务返回的来源标记含 `env` 时才存在），从结构上消灭「旧 env 挡住真 key」的短路。

安全边界：响应只回传来源**名称**；错误 message 在回传与落盘前主动脱敏 —— 候选值整体替换为 `[redacted]`（`:347-352`、`:370-375`、`:389-394`）、`sk-` 前缀长串按正则替换、并截断到 300 字，因此 key 值不会进 `~/.dsh/model-fold-probe.json`。托管文件里 `enc1:` 等占位值视为不可用，不尝试解码（超出本轮范围）。

## 六、验证计划（发版前逐项过，全绿才算完成）

- **V1 挂载与版本**：`node --check lib/index.js` + `node --check lib/client.js`；彻底退出 DSH 客户端再启动；启动日志出现 `host half mounted (v1.0.2)`。
- **V2 `keySource` 真实性**：同一 provider 连续两次测活，`keySource` 应稳定为凭据服务来源；临时让凭据服务不可用后才降级为 `credentials/file-raw`；例外：凭据服务存在但 `resolve` 返回空（如托管值是 `enc1:` 占位）时不读托管文件、直接落到 `request`，只有服务整体不可用才走文件兜底。
- **V3 核心回归（本次缺陷的靶心）**：**不动**用户级 `AGENT2API_API_KEY`（保持 39 字符旧值），直接测活 —— `keySource` 不得为 `process-env`，结果应为绿。这一条不过，等于缺陷没修。
- **V4 全量与抽样**：agent2api 全量 276 模型跑一遍，统计绿/红；另抽至少 3 个此前为红的模型单独复测。**统计时把 `auto` 路由组模型单列**（见第七节），不能算进本次失败的分子。
- **V5 换 key 重试**：仅在本机临时把一把无效 key 排在候选最前（不入库），确认 401 后自动换下一把、最终返回绿且 `keySource` 指向真 key 来源。
- **V6 发布一致性**：`package.json` version、`locale/zh.json:5`、`locale/en.json:5`、`CHANGELOG.md` 新增段四处版本号一致；`npm pack --dry-run --json` 白名单须含 `docs/images/**`、`locale/*.json`、`screenshots.json`。

## 七、未解决项 / 与本次修复无关的既有现象

- `auto` 路由组模型（`id` 形如 `auto/auto`，`name: Auto · routing group`）**即使带正确 key 也必然 502**，响应体为 `Accio 上游错误：[402] unauthorized`；对照组 `deepseek-v4.1-flash-1017` 正常。
- 该现象属**上游网关/通道问题**，与插件取 key 逻辑无关：本次不修，也不计入 V4 的失败数。
- ⚠ 锚点提醒：`%USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml` **会被 DSH 设置页反向改写**，本次会话内实测总行数从 8143 漂到 8756、`auto/auto` 从第 565 行漂到第 587 行；早期清单里写的「第 3628 行」在写作时刻已指向 agent2api 块的首个模型 `- id: qwen3.8-27b`，**不再是 auto**。引用该文件一律按 `id:` 锚定，禁止按行号。

## 八、生效方式（改完别只说「重启」）

- **宿主端改动**（`lib/index.js`、`package.json`、`cordis.patch.yml`、`locale/*.json`）→ **彻底退出 DSH 客户端再启动**（宿主是 Node 进程，没有热重载）。
- **客户端改动**（`lib/client.js`）→ **Ctrl+Shift+R 硬刷新**（Ctrl+R 只从内存缓存重载，不重读磁盘，容易误判「改了没用」）。
- **纯文档**（README、`docs/`、本 dev-log）→ 无需任何重启。
- 生效判据：宿主看启动日志 `host half mounted (vX.Y.Z)`；客户端看 bundle 内 VERSION 常量。

## 九、可复用经验

1. 取 key 这类「外部真相」一律写成**候选列表 + 按权威排序 + 去重 + 逐个试**，禁止 `a || b`：`||` 会把「有值但无效」当成「成功取到」，错误被推迟到 401 才暴露，且现场完全看不出用错了来源。
2. 每个失败响应都应带上「我用了哪个来源」（`keySource`），否则只能靠猜。
3. 文档只写接口契约、不写凭据来源，会导致取路逻辑改了以后**没有任何文档能证明行为**（1.0.2 的 README 曾是这个状态，已在发布前按核对报告补写候选链、重试、额度与上限、`keySource`）。
4. 写文档引用 `cordis.patch.yml` 时不要记行号 —— 它会被设置页重写，锚点必须是 `id:`。
