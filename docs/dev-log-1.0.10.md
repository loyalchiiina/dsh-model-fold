# dev-log 1.0.10（2026-11-15）

## 目标

官方模型入口（原生「模型与推理等级」菜单）自带一个「启用智能体团队协作」开关，但本插件用自绘三级级联面板**完全替代**并主动 `dismissOfficialModelMenu()` 关掉原生菜单，导致这个开关在插件面板里看不到。本版把该开关搬进级联面板，并顺带修掉底部「当前选择模型名显示不全 / 拥挤」的布局问题。

## 背景与根因

- 官方开关组件 `dsh-client-ui-agent-team/src/client/TeamModeToggle.tsx` 注册在 slot `conversation.input.model.options`，只在原生模型菜单第一层（`ModelSelect.tsx` 的 `pane==='root'` 分支）渲染。
- 本插件 `openCascade()` 会调 `dismissOfficialModelMenu(trigger)` 把原生菜单点关 → React 卸载 root pane → 官方 team switch DOM 消失。故必须在自绘面板里重建一个等价开关。
- 官方读状态只能靠会话投影 `agentTeam`（`{enabled}`），写状态只有 `remote.agentTeams.setEnabled(sessionId, enabled)`，没有 `getEnabled`。

## 1.0.10 改动（`lib/client.js`）

- **状态读取 `mfTeamInfo()`（L2225 起）**：多源兜底——
  1. 主路径 `sess.list.getSnapshot().projectionsBySession[sid]`，仅当 `pb.state==='ready' && pb.values` 时取 `pb.values.agentTeam` / `pb.values.modelSelection`（与官方 TeamBoard 同源）；
  2. 未就绪则去抖调用 `sess.refreshProjections(sid)`，等 list 变更触发 subscribe 重读；
  3. 兜底 `sess.binding(sid).session.projections.faceOf('agentTeam'/'modelSelection')`；
  4. 子会话（`byId[sid].origin==='subagent'` 或 `subagent` 非空）或 `agentTeam` 投影 `undefined` → 返回 null → 整行隐藏（与官方一致）。
- **写状态 `buildTeamRow(inline)`（L2270 起）**：开关点击 → `doSet(enabled)`；
  - 关闭且 `modelSelection.lastUsed !== null` 时先 `paintConfirm()` 弹确认（「关闭后本会话的团队协作将停用…」确认/取消），确认后才真正 `setEnabled(false)`；与官方 `requestDisableConfirmation` 语义一致。
  - 写接口 `MF_TEAM_REMOTE_API` → `getSvc('remote').agentTeams` → `PLUGIN_CTX.get('remote.agentTeams')` 依次兜底，`typeof setEnabled==='function'` 才用。
  - 开关 DOM 为自绘 `button.dsh-mf-switch` + `span.dsh-mf-knob`（非原生 `role=switch`），`aria-label="启用智能体团队协作"`，带 ⓘ 提示「通过共享任务板协调多个智能体的分工与进度…」。
- **布局**：`buildCascade()` 底栏 `.dsh-mf-capcfg` 由单行 `nowrap` 改为 `flex-direction:column` 两行：
  - 第一行 `cfgTop`：`curEl`（当前选择模型名，`flex:1 1 auto;min-width:0;white-space:normal;word-break:break-word`，允许换行完整显示）+ `buildTeamRow(true)`（`flex:0 0 auto` 固定右侧）同行分摊；
  - 第二行 `cfgBot`：字号 `lbl` + `fsIn2` + 操作按钮。
  - `cascadeCurrentText()`（L1961）去掉 `routing group` 后缀截断，显示完整来源·模型·强度。
- **注入**：`start(ctx)` 内两个**非阻塞**注入 `PLUGIN_CTX.inject(["sessions"], …)` / `PLUGIN_CTX.inject(["remote.agentTeams"], …)`（缺依赖回调不执行、不影响主功能；**绝不**加进 `exports.inject`，避免 §7.32 阻塞注入缺失致整插件静默不激活）；并注册 `window.__mfTeamDebug()` 诊断钩子。
- **模块变量**：`mfTeamUnsubs`、`MF_TEAM_SESSIONS`、`MF_TEAM_REMOTE_API`、`cascadeTeamEl`。

## 验证

- `node --check lib/client.js` EXIT=0，无 BOM（77 69 6E）。
- `package.json` / `locale/zh.json` / `locale/en.json` JSON 解析通过；六处版本号一致为 1.0.10。
- 用户实测：级联面板底部出现「团队协作」开关，可开/关；模型名完整显示不再截断。
