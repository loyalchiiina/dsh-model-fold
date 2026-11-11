# dsh-model-fold 1.0.3 开发日志

> 承接 `docs/dev-log-1.0.2.md` 的章节结构（版本与范围 / 背景 / 根因 / 判据 / 改动清单 / 验证 / 遗留 / 生效方式 / 可复用经验），只写这一版**实际改动与判据**，不重复 1.0.2 的取 key 复盘。
> 写作时刻：2026-11-11（Asia/Shanghai）。写作期间 `lib/index.js` 由另一路并行修改，**行号会漂移**，凡引用代码一律给函数名／标识符锚点。

## 一、版本与范围

- 版本：`1.0.2` → `1.0.3`。
- 本轮只做三件事：①测活判据从「只看状态码」改为「2xx 再看正文」，修掉 4 条假绿；②`~/.dsh/model-fold-probe.json` 的 `version` 由 1 升到 2，旧快照整体作废；③评估脱敏门槛（三处 `length >= 8`）是否需要跟着动，结论是**不动**。
- 本轮**不改**：三级级联面板布局、识图／思考强度开关、key 候选链与 401/403 换 key 重试、错误 message 脱敏语义（仍是候选值整体替换 `[redacted]`、`sk-` 前缀正则替换、截断 300 字）。
- 本轮**由另一路改代码**：`lib/index.js` 的判据实现（`handleProbe` / `classifyBody`）不在本日志的写入范围；本日志只记录设计口径与待跑验证用例。

## 二、背景（当时看得见的现象）

- 1.0.2 修好 key 来源之后，面板可用数从「整屏全红」恢复上来，但仍有 **4 条绿点是假的**：`qwen3.8-27b`、`glm5.3-flash`、`atomcode/qwen3.8-27b`、`atomcode/glm5.3-flash`。
- 这 4 条的实际响应是 **HTTP 200**，正文却是「请求负载过高」一类上游限流/过载文案 —— 网关把上游错误包了一层 200 返回，状态码看着成功，内容根本不是一次有效补全。
- 旧判据只看 `result.status`：`2xx` 即 `code: OK`、面板画绿 ●。于是「能过 HTTP、但答不出话」的模型被展示成「可用」，用户按绿点去选模型会直接撞空。

## 三、根因

1. **判据只消费状态码**：`handleProbe` 的成功路径拿到 `postJson` 的返回值后只看 `status`，从不读 `result.body` —— 正文里写着什么，代码根本没看。
2. **正文其实一直都在手上**：发送函数 `postJson` 早就把响应体截到 **2000 字**随结果一起返回。也就是说不是「拿不到证据」，而是「拿到了没人判」。
3. **200 不等于成功是网关的既有行为**：上游过载 / 限流 / 额度不足 / key 被拒等错误，网关都可能以 200 + 错误 JSON 的形式回传（`{"error":{...}}`、`{"code":429,"message":"..."}` 等）。只看状态码的判据在这种回传形态下必然产生假绿。

一句话：**不是请求失败被漏抓，是「请求成功」这个词被状态码单方面定义了，而正文早就在手里。**

## 四、判据改造（黑名单式，重点在「不误杀」）

- 判据顺序：先看状态码（非 2xx 走原有 `HTTP_*` 分支）→ 2xx 再解析正文 → 正文命中上游错误特征才判不可用，新增 `code: OK_BODY_ERROR`，按不可用计（红 ✕）。
- 特征集合（黑名单，示例而非穷举，以 `lib/index.js` 实现为准）：请求负载过高 / overloaded / rate limit / too many requests / quota / 额度不足 / insufficient balance / invalid api key / unauthorized 等上游错误语汇。
- **刻意不做的事**（避免把 1.0.2 的假绿修成 1.0.3 的假红）：
  - **不裸匹配 `error` 单词**：正常回复的 `content` 里完全可能出现 "no error detected"、"errors: 0" 这类文本，按单词匹配会把好模型判死。
  - **不要求 `choices` 非空**：不同协议（`openai-completions` / `openai-responses` / `anthropic-messages`）的成功结构不一样，强行要求 `choices` 会在 `responses` / `messages` 形态上制造假红；只有正文明确带错误语汇才判负。
  - 不改 1-token 探测本身（仍是一条极短请求），不引入额外请求次数，额度消耗与 1.0.2 相同。

## 五、改动清单（逐文件）

| 文件 | 改动 | 备注 |
|---|---|---|
| `package.json` | `version` `1.0.2` → `1.0.3` | 其余字段（`files` 9 项、`screenshots.json`、`exports`、`dsh`）一字未动 |
| `locale/en.json` | `description` 前缀 `v1.0.2 · ` → `v1.0.3 · ` | 文案正文未动 |
| `locale/zh.json` | 同上 | 文案正文未动 |
| `CHANGELOG.md` | 顶部新增 `## 1.0.3 — 2026-11-11` 一节 | 照 1.0.2 的「现象 / 根因 / 修复 / 快照 / 门槛」条目风格 |
| `README.md` | 「测活说明」里把「HTTP 2xx 视为可用」改写为「2xx 不等于可用，还要看正文」，并补 `OK_BODY_ERROR`；持久化一条补 `version: 2` 与旧快照作废 | 第 1–7 行中英双语功能描述块（含「适配 DSH 内核 0.2.2-rc.1。」/「Adapts DSH kernel 0.2.2-rc.1.」）一字未动 |
| `docs/modes.md` | probe 段补 `OK_BODY_ERROR` 判定与 `version: 2` 快照失效说明 | 英文文档，风格保持一致 |
| `docs/dev-log-1.0.3.md` | 本文件（新建） | **不在** `files` 白名单、不进 npm 包，与 1.0.2 的 dev-log 一致 |

> 代码侧改动（不在本表）：`lib/index.js` 新增 `OK_BODY_ERROR` 分支与正文判定；`~/.dsh/model-fold-probe.json` 写出 `version: 2`、读取时版本不符即整体作废重建。

## 六、验证记录

### 6.1 classifyBody 对照用例（6 条，代码侧待跑）

| # | 输入（200 响应正文，示意） | 期望 `code` | 期望面板 |
|---|---|---|---|
| C1 | `{"choices":[{"message":{"content":"pong"}}]}` | `OK` | 绿 ● |
| C2 | `{"error":{"message":"请求负载过高，请稍后重试"}}` | `OK_BODY_ERROR` | 红 ✕ |
| C3 | `{"choices":null,"error":{"message":"overloaded"}}` | `OK_BODY_ERROR` | 红 ✕ |
| C4 | `{"code":429,"message":"rate limit exceeded"}` | `OK_BODY_ERROR` | 红 ✕ |
| C5 | `{"error":"quota exhausted（额度不足）"}` | `OK_BODY_ERROR` | 红 ✕ |
| C6 | `{"choices":[{"message":{"content":"no error detected, errors: 0"}}]}` | `OK` | 绿 ●（假红守卫：不裸匹配 `error` 单词） |

- C1 / C6 是**假红守卫**：只证明「不该判负的没判负」；C2–C5 是**假绿补齐**：只证明「该判负的判负了」。两组必须同时过，缺任一组都说明黑名单写歪了。
- 4 条实测假绿（`qwen3.8-27b`、`glm5.3-flash`、`atomcode/qwen3.8-27b`、`atomcode/glm5.3-flash`）复测应转红；可用数相比 1.0.2 减少 4 条属**预期**，不是能力倒退。

### 6.2 快照失效

- 升级后首次读取 `~/.dsh/model-fold-probe.json`，文件内 `version: 1` ≠ 期望 `2` → 整体作废并重建，面板不再残留旧的 4 个假绿点。
- 判据：不做「逐条迁移」，只做「整体作废」——旧快照里的每条结果都是按旧判据（只看状态码）写的，逐条保留等于把假绿原样带进新版。

### 6.3 文档侧（本轮已执行）

- `package.json`、`locale/en.json`、`locale/zh.json` 均可被 `JSON.parse` 解析；
- 6 个改动文件均为 UTF-8 **无 BOM**（前 3 字节不是 `239,187,191`）；
- README 顶部双语块未改动、版本号四处一致（`package.json` / 两个 locale / `CHANGELOG` 新节标题）。
- 发布前的挂载核验仍按 1.0.2 的口径：彻底退出 DSH 重启，日志出现 `host half mounted (v1.0.3)`。

## 七、遗留

1. `profiles\xiufu` 与 `profiles\web` 两个 profile 的实装副本仍是 **1.0.0** 旧版（无 `keySource`、也没有本版的正文判定）；desktop 不加载它们，如需一致须单独升级。
2. `agent2api` 下 `codearts/*` 通道上游账号授权已到期（400「CodeArts 登录授权已到期…请重新完成网页登录」；复跑可能转为 429「候选账号限额」），属**账号态**，不是本插件判据问题，需用户重新网页登录。
3. 本版只处理「200 + 正文错误」这一种假绿形态；「200 + 正文为空」目前仍按可用计 —— 1-token 请求本就不保证有内容，若后续发现空正文也成规模，再单列新 `code`，不要在本版顺手加，以免与既有状态码口径冲突。

## 八、生效方式（改完别只说「重启」）

- **宿主端改动**（`lib/index.js`、`package.json`、`locale/*.json`）→ **彻底退出 DSH 客户端再启动**（宿主是 Node 进程，没有热重载）。
- **客户端改动**（`lib/client.js`）→ **Ctrl+Shift+R 硬刷新**（Ctrl+R 只从内存缓存重载、不重读磁盘，容易误判「改了没用」）。
- **纯文档**（`README.md`、`docs/`、本 dev-log）→ 无需任何重启。
- 生效判据：宿主看启动日志 `host half mounted (v1.0.3)`；客户端看 bundle 内的 VERSION 常量。

## 九、可复用经验

1. 「成功」的判据必须落在**业务语义**上，而不是传输层的状态码；网关把上游错误包成 200 是常态，任何只判 `status` 的测活都会长假绿。
2. 判据写成**黑名单**（明确枚举已知错误语汇）比白名单（要求成功结构齐全）安全：白名单在多种协议并存时必然假红，而黑名单漏判只会回到旧状态，不会把可用模型判死。
3. 修判据时**同时写假红守卫用例**（如「正常文本里含 error 单词」）。只写「该红的红了」的用例，等于给下一次误杀留门。
4. 持久化结果一旦换了判据，就**升 `version` 整体作废**，不要逐条迁移 —— 旧记录是按旧判据写的，迁移等于把缺陷带进新版本。