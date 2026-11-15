# dev-log 1.0.9（2026-11-15）

## 目标

彻底解决「点 composer 的模型按钮，第一次是插件自绘三级级联面板、第二次冒出官方旧菜单（搜索框 + 来源分组 + 底部工具条）」的双面板问题，且未选模型与已选模型两种状态下都必须是同一套新面板。

## 版本演进与各版为什么没修好

| 版本 | 改动 | 结果 |
|---|---|---|
| 1.0.7 | 新增 `isModelTriggerBtn(trg)` 三级判据（含 `[data-provider-id][data-model-id]` / composer 内唯一菜单钮 / 文案正则），`onDocModelTriggerDown` 与 `onDocCascadeClick` 改用它 | 解决「未选模型时拦截失效」；但出现「第二次点击冒旧菜单」 |
| 1.0.8 | 新增 `canOwnModelMenu(trg)`、`dismissOfficialModelMenu()`，在 `openCascade` / `closeCascade` 调用 | 实测仍未生效（用户：「重载后还是一样」） |
| 1.0.9 | 修 1.0.8 的两个漏洞 + 找到真凶 | 用户彻底退出重启后实测通过 |

## 1.0.9 根因

1. **真凶（兜底误伤）**：1.0.7 在 `onDocCascadeClick` 里写的是 `toggleCascade(trg)` 之后统一判断「面板没开 → 补点官方按钮」。而**第二次点击的正常语义就是收起面板**，被误判成「面板打不开」，兜底去点触发钮 → 官方旧菜单当场冒出来。
2. **漏洞①（时序）**：1.0.8 只在 `openCascade` 里同步调一次 `dismissOfficialModelMenu()`；官方菜单是 React 异步渲染，此刻 `aria-expanded` 仍为 `"false"`，判据不成立直接跳过。
3. **漏洞②（找错按钮）**：`dismissOfficialModelMenu` 内部用 `findModelTrigger()` 自己找按钮，未选模型时它返回 composer 里第一个 `button[aria-haspopup="menu"]`（可能是附件/工具钮），`click()` 点错对象。

## 1.0.9 改动（`lib/client.js`）

- `onDocCascadeClick`（L2660-2693）：先记 `_wasOpen`，`toggleCascade(trg)` 后记 `_opened`；只有 `!_wasOpen && !_opened && !canOwnModelMenu(trg)` 才回退官方菜单。
- `dismissOfficialModelMenu(trigger)`（L2419-2453）：优先使用调用方传入的真实触发按钮；`attempts = [0, 60, 160, 320, 600]` 多时间点复查，仅 `aria-expanded === "true"` 时摘监听 → `trg.click()` → 挂回（防重入）；撤 `data-mf-model-opening` 前检查级联是否仍开着。
- `onDocModelTriggerDown`：600ms / 1000ms 两处撤预隐藏前加 `cascadeEl.classList.contains("dsh-mf-open")` 守卫。
- `closeCascade(trigger)` / `toggleCascade(trigger)`：一路把真实按钮传下去。

## 验证

- `node --check lib/client.js` EXIT=0；`lib/client.js` 2865 行 / 184079 B / 无 BOM；SHA256 `860FFC258C9DE35895DD5D6C7BA754CF471609F75F6D3912966689D143A8BB78`。
- 页面实际执行 bundle（`/plugins/??dsh-model-fold/client.js&rev=055aa62d8337`）HTTP 200、184150 B，含 `_wasOpen` 守卫与 `MF_VERSION = "1.0.9"`。
- 用户彻底退出 DSH 重启后实测：第一次点开自绘面板、第二次收起，不再冒旧面板。

## 生效方式（重要更正）

桌面端**没有注册任何 reload / forceReload 加速键**（`app.asar!lib/main.js` 的 win32 分支 `Menu.setApplicationMenu(null)`），`Ctrl+Shift+R` 与 `Ctrl+R` 都不会重新读盘。客户端 bundle 由宿主 `dsh-client-hmr` 每 500ms `stat` 轮询 + `/plugins/events` SSE `rebuilt` 热替换；若 HMR 遗留旧模块的 document 监听，彻底退出客户端再启动最干净。

## 遗留

- 1.0.9 只在 desktop 实装与源码仓库；`profiles/xiufu`、`profiles/web` 的副本不参与（desktop 不加载它们）。
