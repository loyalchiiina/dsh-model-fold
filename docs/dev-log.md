# dsh-model-fold 插件开发日志（2026-09-11~09-12 · asar 探测 / React DOM 增强 / mousedown 血案 / 双渠道同步）

> plugin: dsh-model-fold
> last-version: 1.0.0（2026-11-08 发布；GitHub main / tag v1.0.0 / npm latest 均为 1.0.0）

> 本文件是 `dsh-config/references/plugin-development/SKILL.md` §7.10 的完整实战记录。插件：模型选择菜单按来源（provider）展开分类，右侧滑出子面板选模型。GitHub `loyalchiiina/dsh-model-fold` + npm `dsh-model-fold`（当前版本见文件头 `last-version`）。

---

## 一、需求演进（用户三轮反馈的真实轨迹）

1. **初始**："把模型按总来源展开分类，选模型不用一直下滑，同一级的在一块展示" → 理解成折叠/展开（v0.1.0）。
2. **澄清**："bankofai 提供的模型放在一起，deepseek web 提供的放在一起这种感觉" → 官方菜单其实已有 provider 分组（组标题小字），但全部摊开显得长；升级为「默认只列来源列表，点开谁展开谁」+ 选中组自动展开（v0.2.0）。
3. **再升级**："能弄成子集从右侧展开的效果吗，这个效果备份保留" → panel 模式：菜单只列来源，点击来源右侧滑出子面板列模型；双击标题在两种模式间切换；旧版快照留备份（v0.3.0）。
4. **教训**：需求词"展开分类"≠"折叠"。**动手前先拿真实 DOM 截图/结构给用户对齐一次预期**，比做完返工省得多轮。

## 二、asar 解包探测法（无调试端口时拿真实 DOM 的唯一正道）

DSH Desktop 的客户端 UI 打包在 `resources\app.asar`（本机 168MB）。没有 CDP/DevTools 时，与其猜 DOM 或临时装探针插件，不如直接解包读官方组件源码：

```js
// asar header 解析（node，实测可用）
const buf = fs.readFileSync(ASAR);
const pickleSize = buf.readUInt32LE(4);          // bytes 4-7 = header pickle 总大小
const headerBuf = buf.slice(8, 8 + pickleSize);
const jsonSize = headerBuf.readUInt32LE(4);      // pickle 内 JSON 长度
const header = JSON.parse(headerBuf.slice(8, 8 + jsonSize).toString("utf8"));
// 文件内容区起点：dataOffset = 8 + pickleSize；每个文件的 offset 相对数据区
// walk(header.files) 收集 {path,size,offset}，按 offset/size slice(buf) 即提取任意文件
```

坑：第一次把 JSON 偏移算成 8（漏了 pickle 头 8 字节）→ JSON.parse 报 `Unexpected token`。正确：**JSON 在 offset 16**。

### 官方模型选择器结构（`@deepseek-ai/dsh-client-ui-model-selection`，portal 到 body）

```
div[role="menu"]                      ← composer 菜单（root/model/effort 三 pane）
  div.groups.scrollable               ← model pane
    section[role="group"][aria-labelledby]   ← 每个 provider 一组
      div（首子）                      ← 分组标题 = provider displayName
      button[role="menuitemradio"][aria-checked] × N   ← 模型项
```

- **稳定定位键 = role/aria-\*，不是 CSS module hash 类名**（`.ModelSelect_module_css_xxx` 升级即失效）。
- 该包 README.zh.md 明确写了两个入口共用一份按提供方分组的目录（`/model` popupSelect 与 composer 具名 slot `conversation.input.model`）——popupSelect 是另一套 UI，DOM 增强类插件要**声明清楚作用范围**（本插件只管 composer 菜单）。
- 键盘导航 `items[i]?.focus()`：focus 到 display:none 元素是无操作不抛错 → 折叠隐藏按钮不会崩原组件。

## 三、React DOM 增强铁律（组合优先的可执行细则）

1. **绝不移动/删除/重排 React 管理的节点**（会炸协调器）。只做两件事：
   - 给目标元素加**自定义 data-\* 属性** + `addEventListener`（React 不认识这些，diff 时不动它们）；
   - 用 CSS 选择器按 data 属性控制显隐：`section[role="group"]:has(> div[data-msc-folded]) > button[role="menuitemradio"]{display:none!important}`。`:has()` Electron/Chromium ≥105 支持。
2. **className 受控 ≠ 安全**：不要往 React 元素的 className 上追加 class——重渲染会被抹掉；data-* 属性不会被抹（React 不清理它不知道的属性），但**元素重建时会消失** → MutationObserver 防抖后重跑 enhance 恢复即可。
3. **「已处理」标记语义要分清（真 bug）**：`data-msc-done` 代表"**监听器已挂**"，用于防重复 addEventListener。模式切换/状态重算时**只清折叠属性、绝不清 done**——清了就会给同一节点叠加第二组 click/dblclick 监听，之后单击触发两次 toggle、行为错乱（v0.3.0 初版实锤踩坑，探针 H6b 断言锁死）。
4. **程序化完成选择 = dispatchEvent 真实按钮**：`realBtn.dispatchEvent(new MouseEvent("click", {bubbles:true}))`，React 委托监听收到 → 走原组件 select 逻辑，状态绝对一致。**别自己调内部函数、别复制它的行为**。
5. **🔴 mousedown 双拦（0.3.1 血案，最重要一条）**：DSH ModelSelect 有两道关闭闸门——document 级 `mousedown`（closeOutside：目标不在 root/menu 内即关）+ 焦点离开菜单根触发 `onBlur → close()`。后果链：点自建浮层/点菜单内不可聚焦标题 → mousedown 先关菜单 → React 卸载菜单 → 缓存的 realBtn 变**游离节点** → dispatchEvent 冒泡不到 React root → **永远选不上模型（"切换不了模型"）**。修复：
   - 浮层自身：`panel.addEventListener("mousedown", e => { e.stopPropagation(); e.preventDefault(); })`（阻断 closeOutside + 焦点转移）；
   - 菜单内交互元素（标题）：`title.addEventListener("mousedown", e => e.preventDefault())`（只防焦点转移，click 照常派发）。
   - **通用结论：凡在 DSH 菜单/弹层外面做浮层交互，或给其菜单内非聚焦元素挂点击，必须考虑宿主组件的 mousedown/blur 关闭机制。**
6. **视觉镜像面板的主题自适应**：从真实 menu/selected 按钮 `getComputedStyle` 拷 backgroundColor/color/borderRadius 给自建面板——主题深浅色零配置跟随。
7. **面板测量-定位-动画时序**：先 appendChild + visibility:hidden → 测 offsetWidth/Height → 算 left/top（右侧放不下换左侧、超视口 clamp）→ 设位 → 去 hidden → remove/add open class 重播 transition。

## 四、DOM-stub 探针方法论（客户端逻辑的回归测试，无浏览器也能跑）

- 插件 client.js 是纯 bundle，Node 里 stub `window.__ModuleLoader__.load` 捕获 factory → 执行 factory(require) 得 exports → 手写 ctx.effect 直调 → 拿到 apply/dispose 全流程。
- stub 要点（每条都是踩过的坑）：`querySelectorAll/querySelector` **必须递归实现且覆盖代码用到的每种选择器**（`:scope > div:first-child`、`section[role=...]`、`button[role=...]`、`button[aria-checked="true"]`）；El 要有 `style/classList/appendChild/remove/contains/getBoundingClientRect/offsetWidth/dispatchEvent/innerHTML setter`；`MutationObserver` 空壳即可。
- 模拟"页面重载"= 重置 DOM 节点上的 done/folded 属性 + `delete require.cache` 重新 require（新闭包重读 localStorage）；模拟"同节点重渲染"= 保留 done 再 apply 一次，断言监听器数不变。
- 断言场景矩阵（v0.3.1 共 9 组）：默认折叠/徽标/选中组自动展开/记忆优先级/点击持久化/模式切换不叠监听/mousedown 双拦存在/CSS 规则存在。
- **探针的价值实证**：监听器叠加 bug（§三.3）就是探针 H6b 抓出来的——node --check 和人工读码都容易放过这种运行时错误。

## 五、发布与多会话协作同步

1. **多会话改同一插件**：以**实际安装的文件**为准，不信对话记忆。识别方法：看 `lib/client.js` 的 LastWriteTime/大小 + 目录里的 `.bak-*` 命名风格（本次发现另一会话 12:55 的 mousedown 修复 + `client.js.bak-modelswitch-20260912` 备份）。修复方向正确就采纳并升版本（0.3.1）、CHANGELOG 如实记录归因。
2. **三方字节级一致性核验**（本地 vs GitHub vs npm）：
   - GitHub：`gh api repos/<o>/<r>/contents/<path> --jq .content` base64 解码落盘 → SHA-256 前 16 位比对；
   - npm：`tar -xzf <pkg>.tgz` 解包（**不要用 ZipFile.OpenRead，tgz 是 tar.gz 不是 zip**，否则报"找不到中央目录结尾记录"）→ 逐文件哈希比对；
   - registry 权威核验：`Invoke-RestMethod https://registry.npmjs.org/<pkg>` 查 dist-tags.latest（npmjs.com 网页 403 是反爬不是失败）。
3. **Contents API 更新已有文件必须先 GET sha**；新文件 GET 404 属正常——PowerShell `$ErrorActionPreference="Stop"` 会把 native stderr 当异常终止脚本（gh 404 场景直接崩），**去掉 Stop、用 `$LASTEXITCODE` 判断** + PUT 后校验返回 sha 非空。
4. **凑提交数（awesome ≥10）只用真实增量**：CHANGELOG / docs 模式详解 / README FAQ / gitignore 完善——每文件一 commit，内容对得上 commit message，不造假。
5. **「仓库满 1 天」从 GitHub API `created_at` 算**，不是用户记忆里的时间（用户以为昨天建的，API 实证当天上午 10:40）；年龄不够提 PR 会被 CI 拒，提前备料（条目 yml + 上游查重）到点一键提。
6. **npm publish exit code 1 但输出 `+ pkg@ver` = 成功**（notice 走 stderr + 管道截断误报），以 registry API 为准。

## 六、隐私审计（发布红线扫描的可复用做法）

- 矩阵：API key 类（api[_-]?key/sk-/Bearer/secret/password/credential）+ 本机路径（C:\Users/项目名/盘符）+ 用户名 + 内网地址/端口 + 邮箱 regex + 本机相关账号名 + 网关环境变量名 + **网络出口**（fetch/XHR/WebSocket/sendBeacon/new Image/.src=/http(s)://）+ console.* 残留 + 客户端混入 Node API。
- 白名单判定：package.json `repository` 字段含 GitHub 用户名 = 发布元数据非泄露；`homedir()/LOCALAPPDATA` 动态取目录 = 代码逻辑非泄露。
- **扫描脚本自身的坑（本次 OOM）**：非全局正则配 `while ((m=re.exec(text)))` 死循环——命中时 lastIndex 不前进，report 无限 push 撑爆堆。改为**每模式每文件 `text.match(re)` 记首个命中**（审计目的是发现，不是计数）。首轮 0 命中所以没暴露，改动引入命中后才炸——**测试也要测"有命中"路径**。
- 交付形态：脚本落盘可复用（temp-msc/privacy-audit.cjs），报告表格化（命中项/结果/结论）。

## 七、部署形态补充（link 直通源码目录）

- `profile/package.json` dependencies 写 `"dsh-model-fold": "link:C:/.../plugins/dsh-model-fold"` + `node_modules\dsh-model-fold` 建 **Junction 指向源码目录本身**（dsh-ds-attach 形态）：改源码即生效于下次加载，无需拷贝同步；比 local-plugins 中转少一步。
- profile bundles 数组加包名（无 scope 短名即可，如 `dsh-model-fold`）。
- **renderer bundle 实时重载边界**（skill-master 2026-09-12 结论）：profile `patchReload:"live"` 时 client.js 改完不用重启；宿主 index.js / bundles / cordis 配置仍需重启。本插件纯 client 侧，日常迭代可免重启（首次装载仍需）。
- 涉及停 DSH/装卸一律先征求批准（dsh-restart-approval-law）。

---

# 附录 A：v0.4.7「一闪而过」总清算（2026-09-27 · 三根因 + 诊断通道方法论）

> 这一天从「右上角浮层关不掉」一路查到「子面板闪一下就没」，最终定位到 **三个互相独立、但症状高度相似的根因**。记录完整，因为每一个都值得别的 DOM 增强插件复用。

## A1. 诊断通道：先解决「拿不到证据」的问题

**症状**：客户端 bundle 跑在 renderer 里，`console.log` 进不了 `~/.dsh/logs/desktop-next.log`，排查全靠猜。

**根因链**（两个都踩了）：
1. DSH 主进程 `main.js` 的 `console-message` 监听**只转发白名单关键词**：`[next-ui-diagnostic]` / `slot entry crashed` / `client-modules:` / `slot factory occurrence crashed`。自定义前缀（如 `[mf-diag]`）**整条被丢弃**。
2. 该监听在**启动后就不再写**（诊断只在 startup 阶段收集）。

**最终可用的双通道**（任一即可取证，互为备份）：
- **通道 A — console 白名单**：`console.log("[next-ui-diagnostic] [mf-diag] " + line)` → 落 `~/.dsh/logs/desktop-next.log`。
- **通道 B — 宿主回环路由**：宿主侧 `ctx.inject(["webServer"], ...)` 注册 `{kind:"exact", path:"/plugins/<name>/trace", handler}`，handler 把 body 追加写盘到 `~/.dsh/logs/<name>-trace.log`；客户端 `fetch` 相对路径即可。

**通道 B 的坑**：客户端 `fetch("/plugins/.../trace")` 是**相对路径**，会丢掉 `window.location` 上的 `?token=`，被全局鉴权 **403**。修法：从 `window.location.search` 提取 token 拼进 URL。
**更稳的做法（本次最终采用）**：让插件把「**实际渲染值**」自己上报——`getComputedStyle(panel).backgroundColor/.color` 等，直接拿到 ground truth，不必靠肉眼看截图。这条在配色排查中起决定性作用（见 A3）。

**⚠️ 上线前必须删除**：回环路由 + `trace()` + 全部上报代码。本次清理后 `client.js` 从 70867 → 58175 字节（见 A5 的清理方法论）。

## A2. 根因一：事件挂在 React 管理的节点上 → 点击永不触发

**症状**：点来源标题「没反应 / 闪一下」。

**根因链**：点击监听挂在来源标题 `div` 上，但标题是 **React 管理**的节点；pane 切换或任何重渲染都会**换新节点**，监听器留在旧节点上，用户点的是新节点 → **处理器永不执行**。
**实测铁证**：日志显示 `onTitleClick` 触发 **0 次**、`openPanel()` **0 次**——面板从未打开过，不是"被关闭"。

**修复**：改为 **`document` 捕获期事件委托**，按落点反查所属分组，**不持有任何节点引用**：
```js
function titleContext(target){                       // 每次从 event.target 现算
  const section = target.closest('section[role="group"]');
  if (!section) return null;
  const menu = section.closest('div[role="menu"]');
  const id = section.getAttribute("aria-labelledby");
  const title = (id && document.getElementById(id)) || section.querySelector(":scope > div:first-child");
  if (!title || (title !== target && !title.contains(target))) return null;
  return { title, section, menu, key: ... };
}
document.addEventListener("click", onDocTitleClick, true);
```
**通用结论**：给 React 管理的 DOM 挂监听 = 定时炸弹。**一律用 document 级委托 + 落点反查**，与官方「思考等级」面板稳定的原理同源（它的事件由 React 自己管）。

**单双击的时序坑**：不能用 `dblclick`（它必然在两次 `click` 之后才到，panel 模式会先闪开一次再切模式）。改为「220ms 内第二次 click = 双击」，单击动作延迟到窗口结束才执行。

## A3. 根因二：折叠隐藏了「官方刚聚焦的按钮」→ 官方 onBlur 关掉整个菜单

**这是「一闪而过」的真凶。**

**根因链**（真实点击日志逐帧对应，`05:01:37`）：
```
37.496  官方把焦点放到「当前选中」的模型按钮上（paneFocus 效果）
37.623  插件 processGroup 折叠 9 个来源 → 该按钮 display:none
37.691  focusout related=null activeEl=BODY      ← 聚焦元素被隐藏 = 强制失焦
37.751  菜单关闭                                  ← 官方 rootRef 的 onBlur
```
官方 `onBlur` 判定：`if (relatedTarget instanceof Node && (rootRef.contains(rt) || menuRef.contains(rt))) return; close();`
被隐藏元素强制失焦时 **`relatedTarget = null`** → `null instanceof Node` 为 false → 两个 `contains` 都救不了 → **`close()`**。

**为什么官方「思考等级」面板没事**：`pane="effort"` 里**没有 `section[role="group"]`**（是一串扁平按钮），插件完全不介入 → 不会隐藏任何被聚焦的按钮。**这个对照是解题的关键线索**（用户提供的观察）。

**修复**：隐藏前先把焦点移回菜单 trigger：
```js
function preserveFocusBeforeHide(section){
  const active = document.activeElement;
  if (!active || active === document.body || !section.contains(active)) return;   // 只在该分组内才动手
  const trigger = triggerOf(section.closest('div[role="menu"]'));
  if (trigger) trigger.focus({ preventScroll: true });   // trigger 在 rootRef 内 → onBlur 会 return
}
```
**通用结论**：**任何用 `display:none` 隐藏宿主元素的 DOM 增强，都必须先检查焦点是否落在被隐藏的元素里**——否则会凭空制造一次 `focusout`，撞上宿主的 onBlur 关闭逻辑。

## A4. 根因三：8 位 hex + 半透明表面色 → 面板透明 / 颜色不一致

**症状演进**：先是「子集背景黑乎乎看不清」→ 修完变「透明」→ 再修变「比菜单暗」。

**根因链**（靠 A1 的 THEME 上报拿到实测值）：
```
panel bg      = rgb(21,21,23)        ← 我抄的是祖先底色
official menu bg = rgba(0,0,0,0)      ← 官方菜单自身是 transparent
--dsw-specific-menu = #43454a73       ← 真正的菜单表面色！
```
**关键**：`#43454a73` 结尾 `73` 是 **alpha = 0x73/255 ≈ 45%**。
- 旧 `parseColor` **只认 `rgb()/rgba()`** → 8 位 hex 解析失败 → 拿不到菜单真色 → 退到祖先底色 → **比菜单暗**；
- 若直接照抄 `transparent` → **面板全透明**（文字糊在背景里）。

**修复三步**：
1. `parseColor` 支持 `#rgb/#rgba/#rrggbb/#rrggbbaa`；
2. 把半透明表面色**按 alpha 合成到祖先底色上**，得到「看起来一致、但完全不透明」的等价色：
   ```js
   blended = top*a + bottom*(1-a)     // 各通道
   ```
3. 文字色**按底色亮度推算**（深底给浅字），不再盲抄菜单文字色。

**另一处独立 bug**：主题变量只写在**面板**上，而**来源清单在官方菜单子树内**，读不到面板的 `--mf-bg` → 上一级一直没颜色（必须先点开子集才有效果）。修法：新增 `applyMenuTheme(menu)`，在每次 `enhance()` 扫描时就把同一套变量写到**菜单节点**（CSS 变量沿 DOM 继承，覆盖整棵子树）。

**通用结论**：
- 抄宿主颜色前，**先确认拿到的不是 `transparent` 或半透明值**；CSS 变量的值可能是 8 位 hex。
- 自建浮层的背景**必须强制不透明**，否则透出下层内容会造成文字不可读。
- CSS 变量要写在**宿主的容器节点**上才能覆盖宿主子树；只写在自建浮层上，浮层外的元素拿不到。

## A5. 单例守卫：热重载会堆叠实例

**症状**：日志每行打印 **3 遍** = 渲染进程里堆了 3 个插件实例，它们同时处理同一次点击、互相 `openPanel`/`closePanel` → 本身就足以造成「闪一下」。

**根因**：`dispose()` 没摘净新增的监听器（漏了 `onDocTitleClick`、4 个 recorder 监听、2 个定时器），旧实例继续活着。

**修复**：
- `dispose()` **逐个摘净**所有 `addEventListener` 与 `setInterval/setTimeout`；
- **单例守卫**：`apply` 启动新实例前，先调用上一次存在 `window` 上的 dispose：
  ```js
  if (typeof window.__dshModelFoldDispose === "function") window.__dshModelFoldDispose();
  const dispose = start();
  window.__dshModelFoldDispose = dispose;
  ```
**注意**：修复前加载的旧实例**无法被新代码拆掉**（它没有这段逻辑）→ 必须**完全重启 DSH** 清场。热重载只能清掉"有守卫之后的"实例。

## A6. 清洗诊断代码的方法论（正则差点毁掉文件）

诊断代码散落在 25 处，清理时踩了两个坑：

1. **❌ 危险做法**：用 `text.replace(/^\s*trace\([^\n]*\n(?:\s{2,}[^\n]*\n)*/gm, "")` 这类**全局多行正则**——贪婪匹配把 `client.js` 从 55931 字符**砍到 1807 字符**（功能代码全没了）。
2. **❌ 行区间推断**：按"前后行"推断区块边界并合并区间，会**误删真实功能代码**（`enhance` / `exports.apply` 消失）。

**✅ 最终可用做法**：
- **只删有明确标记的行/块**：块的首行必须含诊断标记（如 `🔬`），结束用**显式谓词**（如 `trim() === "}, 80);"`）；单行按标记字符串匹配。
- **删完必须双向断言**：
  - 残留诊断符号**全为 0**（本次查 16 个符号）；
  - **核心功能符号全在**（查 25 个函数名/常量），任一缺失就 **ABORT 不写盘**。
- **锚点必须先从文件里读出来核对**：本次多次 MISS 都是因为锚点假设的**缩进 tab 数不对**（`\t\t` vs `\t\t\t`）、**CRLF vs LF**（文件是 CRLF，锚点写了 `\n`）、**分隔线等宽字符个数**与假设不符。**先 `read` 实际内容再写锚点**。
- 修换行：读入时 `replace(/\r\n/g,"\n")` 归一化，写回时 `replace(/\n/g,"\r\n")` 还原，**保持原文件风格**。

## A7. 自动化驱动 UI 的两个环境陷阱（干扰验证，非插件问题）

1. **窗口被其他程序遮挡**：模型选择器位置被一个全屏窗口（微信，标题 `habit`）盖住，`WindowFromPoint` 显示落点是别人 → 所有模拟点击都点到别的程序上。**点击前必须先 `SetForegroundWindow` 并校验 `GetForegroundWindow() === 目标`**，且用 `WindowFromPoint` 确认落点归属。
2. **DPI 缩放 / 虚拟显示适配器**：存在虚拟显示（网易UU远程 GameViewer 3840×2160）时，未声明 DPI-aware 的进程拿到的是**虚拟化坐标**（1960×1231），而截图是另一个尺度，OCR 报的 y 甚至超出截图高度。
   **修法**：进程启动即 `SetProcessDPIAware()`，然后**截图与点击全部用同一物理坐标系**（`GetClientRect` + `ClientToScreen`，客户区坐标 ↔ 屏幕坐标互转），不再手工换算缩放。

3. **合成事件测不出焦点问题**：`el.dispatchEvent(new MouseEvent(...))` 是 `isTrusted=false`，**不会移动焦点**，因此无法复现「折叠隐藏了官方刚聚焦的按钮 → 强制失焦」这条链。**A3 的根因只能靠真实点击的被动记录器抓到**（记录 `mousedown/click/focusin/focusout` + 轮询 `aria-expanded` 变化）。
   **结论：涉及焦点的 bug，必须用真实交互取证；主动驱动脚本只适合验证"点击能否打开"，不适合验证焦点链。**

## A8. 上行原则（本轮沉淀）

1. **宿主 UI 增强的三大对接面**：`事件（谁挂、挂哪）` + `焦点（谁动、何时动）` + `颜色（真值是几、可不可透）`。三处都必须按**宿主组件的真实行为**设计，不能按"看起来对"设计。
2. **原生对照是最高效的解题线索**：用户指出「官方思考等级稳定、插件模型列表闪」→ 直接对比两者 DOM 结构差异（有无 `section[role="group"]`）→ 一步锁定「插件只在有分组时介入」。
3. **先建通道再排查**：花在诊断通道上的时间，会在后面每一次猜测上赚回来。**没有证据不要改代码**（本轮前半天就是因为拿不到日志而在盲改）。



---

# 【从主 SKILL.md §7.10 下沉 · 2026-10-11】


> 完整演进见同目录 `references/plugins/dsh-model-fold/dev-log.md`（2026-09-11~09-27 dsh-model-fold 从零到 npm 0.4.7）。以下是跨界可复用的硬结论（不限于模型菜单，凡给 DSH 官方 UI 做 DOM 增强的插件都适用）。
>
> **7.10.7~7.10.9 是 2026-09-27 的总清算**：三个互相独立、症状却高度相似（都表现为"点了没反应 / 一闪而过"）的根因。**任何给官方 UI 挂事件、改显隐、抄颜色的插件都会撞上这三类。**

### 7.10.1 asar 解包探测法（无调试端口时拿真实 DOM 的唯一正道）
- 客户端 UI 打包在 `resources\app.asar`。node 解析 header：bytes 4-7 = pickle 大小，**JSON 在 offset 16**；文件内容区起点 `dataOffset = 8 + pickleSize`，每个文件 offset 相对数据区 → slice 即提取任意官方 bundle。
- 先定位目标官方包（如 `@deepseek-ai/dsh-client-ui-model-selection/lib/client.js`），读其渲染代码确认结构，**不猜 DOM**。composer 模型菜单：`div[role="menu"] > section[role="group"][aria-labelledby] > div(标题) + button[role="menuitemradio"]`。
- **稳定定位键 = role/aria-\*，不是 CSS module hash 类名**（升级即失效）。
- **官方源码里的规格要照抄，别自己编**：需要"和官方长得一样"时，直接从官方 bundle 的内联 CSS 抄 `font-size/line-height/padding/border-radius` 与 `var(--dsw-*)` 令牌名（本次把子面板字号/行高/内距/圆角逐项对齐官方 `.option`/`.modelName`/`.groupTitle`）。**自己算颜色、自己挑字号，必然与宿主不一致。**

### 7.10.2 React 共存三原则（组合优先的可执行细则）
- 不移动/删除/重排 React 节点；只加自定义 data-* 属性（React 不管这些），显隐用 CSS `:has()` 按 data 属性驱动（Chromium ≥105）。
- className 受控——别往 React 元素 className 追加 class（重渲染被抹掉）；data-* 不会，但元素重建会消失 → observer 防抖重跑恢复。
- **「已处理」标记语义分清**：done 标记代表"监听器已挂"，状态重算时只清折叠属性、**绝不清 done**（清了=重复叠加监听器→单击触发两次 toggle 错乱，真 bug 实证）。**但 v0.4.7 后这条已升级为"干脆不挂节点监听"，见 7.10.7。**

### 7.10.3 🔴 mousedown 双拦（"切换不了模型"血案，最重要一条）
- DSH ModelSelect 有两道关闭闸门：document 级 `mousedown`（closeOutside：目标不在 root/menu 内即关）+ 焦点离开菜单根触发 `onBlur → close()`。点自建浮层/点菜单内不可聚焦元素 → 菜单先被卸载 → 缓存按钮变游离节点 → dispatchEvent 冒泡不到 React root → **永远选不上模型**。
- 修复：浮层自身 `mousedown` 上 `stopPropagation()+preventDefault()`；菜单内交互元素 `mousedown` 上 `preventDefault()`（只防焦点转移）。**通用结论：凡在 DSH 弹层外做浮层交互或给其菜单内非聚焦元素挂点击，必须考虑宿主组件的 mousedown/blur 关闭机制。**
- 程序化完成选择 = `realBtn.dispatchEvent(new MouseEvent("click",{bubbles:true}))`，走原组件逻辑，绝不复制内部行为。

### 7.10.4 DOM-stub 探针（客户端逻辑回归测试，无浏览器也能跑）
- stub `window.__ModuleLoader__.load` 捕获 factory → Node 直跑 apply/dispose；断言矩阵覆盖默认态/点击持久化/模式切换/mousedown 拦截存在性/CSS 规则。监听器叠加 bug 就是探针抓的——**node --check 和人工读码都会放过这类运行时错误**。
- 模拟页面重载 = 重置节点属性 + delete require.cache 重 require；模拟同节点重渲染 = 保留 done 再 apply，断言监听器数不变。
- **CSS 断言探针的正解是"真求值"**：直接从源码里截出 `var CSS = [...]` 数组字面量，用 `new Function(...)` 求值后再断言，**别用正则去拼字符串**（本次正则版探针漏掉 `""` 拼接与换行，误报 13 项 FAIL）。

### 7.10.5 多会话协作与发布同步
- 以**实际安装文件**为准（看 client.js LastWriteTime + `.bak-*` 命名识别其他会话改动），正确修复就采纳并升版本如实记录归因。
- 三方字节核验：GitHub contents base64 解码哈希 / npm `tar -xzf` 解包哈希（**tgz 不是 zip，ZipFile.OpenRead 必炸**）/ registry API dist-tags.latest。
- Contents API 更新已有文件必须先 GET sha；新文件 404 正常——PS `$ErrorActionPreference="Stop"` 会把 native stderr 当异常终止，去掉 Stop 用 `$LASTEXITCODE` 判断。
- 「仓库满 1 天」从 GitHub API `created_at` 算（用户记忆常错；**本机系统时钟也常与 GitHub 不同步**——2026-09-23 实证本机比 GitHub 快 7 小时，必须用 GitHub 侧时间算年龄，见 §6.8）。npm publish exit 1 但输出 `+ pkg@ver` = 成功（notice 走 stderr）。
- **npm registry 有同步延迟**：publish 成功后 `npm view` / registry API 可能仍显示旧版本，等 30~90 秒再查（本次 12 秒查不到、60 秒后正常）。

### 7.10.6 隐私审计脚本自身的坑
- 非全局正则配 `while(re.exec())` 死循环 OOM（命中时 lastIndex 不前进）→ 每模式每文件 `text.match(re)` 记首个命中即可；**测试要测"有命中"路径**（首轮 0 命中会掩盖 bug）。
- repository 字段的 GitHub URL 含用户名 = 发布元数据非泄露；homedir()/LOCALAPPDATA 动态取目录 = 代码逻辑非泄露。

### 7.10.7 🔴 根因一：事件绝不能挂在 React 管理的节点上（"点了没反应"）
- **症状**：点宿主菜单里的目标元素毫无反应；日志显示处理器**触发 0 次**（不是"执行了但被回滚"）。
- **根因**：把 `click`/`mousedown` 挂在宿主的节点上，而该节点是 **React 管理**的；pane 切换或任何重渲染都会**换新节点**，监听器留在旧节点上，用户点的是新节点 → 处理器永不执行。
- **修复**：改用 **`document` 捕获期事件委托**，按 `event.target` 反查归属，**不持有任何节点引用**：
  ```js
  function ctxOf(target){
    const section = target.closest('section[role="group"]');      // 按语义选择器反查
    if (!section) return null;
    const menu = section.closest('div[role="menu"]');
    const id = section.getAttribute("aria-labelledby");
    const title = (id && document.getElementById(id)) || section.querySelector(":scope > div:first-child");
    if (!title || (title !== target && !title.contains(target))) return null;
    return { title, section, menu, key: ... };
  }
  document.addEventListener("click", onDocClick, true);           // 捕获期
  ```
- **单双击时序**：别用 `dblclick`（必然在两次 `click` 之后才到，会让"单击开面板"先闪一次再切模式）。改为「220ms 内第二次 click = 双击」，单击动作延迟到窗口结束才执行。
- **这份修复的副作用**：不再需要 done 标记与 `attachGroupHandlers/detachGroupHandlers` 那套句柄表（7.10.2 的 done 语义问题随之消失）。

### 7.10.8 🔴 根因二：用 `display:none` 隐藏宿主元素前，必须先救焦点（"一闪而过"真凶）
- **症状**：面板/浮层打开后约 200~400ms 内**连同宿主菜单一起消失**。
- **根因链**（真实点击日志逐帧）：
  ```
  37.496  宿主把焦点放到「当前选中」的按钮上（paneFocus 效果）
  37.623  插件折叠 → 该按钮 display:none
  37.691  focusout related=null activeEl=BODY      ← 聚焦元素被隐藏 = 浏览器强制失焦
  37.751  宿主菜单关闭                              ← 宿主 rootRef 的 onBlur
  ```
  宿主 `onBlur` 判定：`if (relatedTarget instanceof Node && (rootRef.contains(rt) || menuRef.contains(rt))) return; close();`
  被隐藏元素强制失焦时 **`relatedTarget = null`** → `null instanceof Node === false` → 两个 `contains` 都救不了 → **`close()`**。
- **为什么"官方同类面板"没事**：另一条 pane（如"推理等级"）里**没有分组结构**、插件完全不介入，也就不会隐藏任何被聚焦的按钮。**「官方稳定、插件闪」这个对照，就是解题的最强线索。**
- **修复**：隐藏前先检查焦点是否落在将被隐藏的子树内，是则移回宿主 trigger（trigger 通常在该容器的 ref 之内，`onBlur` 会因此放行）：
  ```js
  function preserveFocusBeforeHide(section){
    const active = document.activeElement;
    if (!active || active === document.body || !section.contains(active)) return;  // 只在该子树内才动手
    const trigger = triggerOf(section.closest('div[role="menu"]'));
    if (trigger) trigger.focus({ preventScroll: true });
  }
  ```
- **通用结论**：**任何用 `display:none`(或卸载) 隐藏宿主元素的 DOM 增强，都必须先救走焦点**——否则凭空造出一次 `focusout`，撞上宿主的 onBlur 关闭逻辑。
- **推论**：自建浮层也**不要主动 `focus()`**。浮层挂在 `body`、不在宿主 ref 内，焦点一进去就等于"离开宿主菜单"→ 同样触发 `close()`。焦点问题一律靠 `preventDefault()` 阻止转移来解决，而不是"把焦点拿过来"。

### 7.10.9 🔴 根因三：宿主颜色可能是「8 位 hex + 半透明」（透明/看不清/颜色不一致）
- **症状三连**：先"背景黑乎乎看不清" → 修完变"全透明" → 再修变"比宿主暗"。**三种症状同一个根因的不同阶段。**
- **根因**（靠插件自报 `getComputedStyle` 实测值定位）：
  ```
  panel bg         = rgb(21,21,23)      ← 抄的是祖先底色
  official menu bg = rgba(0,0,0,0)      ← 宿主菜单自身是 transparent
  --dsw-specific-menu = #43454a73       ← 真正的宿主表面色
  ```
  **关键**：`#43454a73` 结尾 `73` 是 **alpha = 0x73/255 ≈ 45%**。
  - `parseColor` **只认 `rgb()/rgba()`** → 8 位 hex 解析失败 → 拿不到真色 → 退到祖先底色 → **比宿主暗**；
  - 若直接照抄 `transparent` → **浮层全透明**。
- **修复三步**：
  1. 颜色解析**必须同时支持 `#rgb/#rgba/#rrggbb/#rrggbbaa`**；
  2. 把半透明表面色**按 alpha 合成到祖先底色**上 → 得"看起来一致、但完全不透明"的等价色：`out = top*a + bottom*(1-a)`（各通道）；
  3. 文字色**按底色亮度推算**（深底给浅字），**不要盲抄宿主文字色**（宿主的字色是给它的底色配的，不一定是给你的）。
- **另一处独立 bug**：主题变量只写在**自建浮层**上，而**宿主子树内的元素读不到**（CSS 变量沿 DOM 继承，浮层是兄弟节点）→ 表现为"下一级有颜色、上一级没颜色"。修法：**把同一套变量也写到宿主容器节点上**。
- **通用结论**：
  - 抄宿主颜色前，**先确认拿到的不是 `transparent`/半透明**；CSS 变量的值可能是 8 位 hex。
  - 自建浮层背景**强制不透明**，否则透出下层内容 = 文字不可读。
  - **CSS 变量要写在宿主的容器节点上**才能覆盖宿主子树。

### 7.10.10 🔴 单例守卫：热重载会堆叠实例（症状伪装成"闪一下"）
- **症状**：日志**每行打印 N 遍**（N = 存活的实例数）；多个实例同时处理同一次点击、互相 open/close → 本身就足以造成"闪一下"。
- **根因**：`dispose()` 没摘净**新增**的监听器/定时器（漏一个，旧实例就继续活着）。
- **修复**：
  - `dispose()` **逐个摘净**所有 `addEventListener` 与 `setTimeout/setInterval`（含后加的）；
  - **单例守卫**：启动新实例前先拆掉上一个：
    ```js
    if (typeof window.__dshXxxDispose === "function") window.__dshXxxDispose();
    const dispose = start();
    window.__dshXxxDispose = dispose;
    ```
- **⚠️ 关键限制**：**守卫只能拆"有守卫之后"的实例**。修复前加载的旧实例没有这段逻辑，**清不掉** → 必须**完全重启 DSH** 清场。热重载 ≠ 重启；`Ctrl+R` 刷新页面也不会重载客户端 bundle（宿主在启动时快照 bundle）。
- **判断实例数的快手法**：在关键路径打一行日志，看是否**成倍重复**。

### 7.10.11 诊断通道：先解决"拿不到证据"，再谈改代码
- **DSH 日志只转发白名单关键词**：主进程 `console-message` 监听仅放行 `[next-ui-diagnostic]` / `slot entry crashed` / `client-modules:` / `slot factory occurrence crashed`；**自定义前缀整条被丢弃**，且该监听**启动后就不再写**。→ 客户端要打日志，必须带 `[next-ui-diagnostic]` 前缀。
- **宿主回环路由**（更强的取证手段）：宿主 `ctx.inject(["webServer"], ...)` 注册 `{kind:"exact", path:"/plugins/<pkg>/trace", handler}` 追加写盘；客户端 `fetch` 上报。
  **坑**：客户端 `fetch("/plugins/.../trace")` 是相对路径，会**丢掉 `window.location` 上的 `?token=`** → 全局鉴权 **403**。修法：从 `window.location.search` 提取 token 拼进 URL。
- **最好的取证：让插件自报"实际渲染值"**。`getComputedStyle(el).backgroundColor/.color/fontSize` + 元素结构 + `document.activeElement`，一次上报就拿到 ground truth，**不必靠肉眼看截图**。本次配色三连 bug 全靠这条定位。
- **焦点类 bug 必须用真实交互取证**：`el.dispatchEvent(new MouseEvent(...))` 是 `isTrusted=false`，**不会移动焦点**，因此**复现不了** 7.10.8 那条链。主动驱动脚本只能验证"点击能否打开"，验证焦点链要用**被动记录器**（记录 `mousedown/click/focusin/focusout` + 轮询 `aria-expanded` 变化）。
- **上线前必须删除全部诊断代码**，清理方法论见 7.10.12。

### 7.10.12 清洗诊断代码：正则差点毁掉整个文件
- **❌ 危险做法一**：全局多行正则（如 `/^\s*trace\([^\n]*\n(?:\s{2,}[^\n]*\n)*/gm`）**贪婪匹配**会把文件从 55931 字符砍到 **1807 字符**。
- **❌ 危险做法二**：按"前后行"推断区块边界并合并区间 → **误删真实功能代码**（`enhance`/`exports.apply` 直接消失）。
- **✅ 正解**：
  1. **只删有明确标记的行/块**：块首行必须含诊断标记（如 `🔬`），结束用**显式谓词**（如 `line.trim() === "}, 80);"`）；单行按标记字符串匹配。
  2. **删完必须双向断言，任一失败就 ABORT 不写盘**：
     - 残留诊断符号**全为 0**（本次查 16 个符号）；
     - **核心功能符号全在**（本次查 25 个函数名/常量）。
  3. **锚点必须先从文件里读出来核对**——本次多次 MISS 全因假设与实况不符：**缩进 tab 数**（`\t\t` vs `\t\t\t`）、**CRLF vs LF**（文件是 CRLF，锚点写了 `\n`）、**分隔线等宽字符 `═` 的个数**。**先 `read` 实际内容，再写锚点。**
  4. 换行：读入 `replace(/\r\n/g,"\n")` 归一化，写回 `replace(/\n/g,"\r\n")` 还原，**保持原文件风格**。
  5. 干跑（`--dry`）确认命中数与双向断言都过，再正式写盘。

### 7.10.13 自动化驱动 UI 的环境陷阱（干扰验证，非插件问题）
- **窗口被遮挡**：模拟点击可能落到别的程序上（本次是微信全屏窗口）。**点击前先 `SetForegroundWindow` 并校验 `GetForegroundWindow() === 目标 hwnd`**，再用 `WindowFromPoint` 确认落点归属。
- **DPI 缩放 / 虚拟显示适配器**：存在虚拟显示（网易UU远程 GameViewer 等）时，未声明 DPI-aware 的进程拿到的是**虚拟化坐标**，与截图尺度不符（本次 1960×1231 vs 物理 2940×1846，OCR 的 y 甚至超出截图高度）。
  **修法**：进程启动即 `SetProcessDPIAware()`；**截图与点击全部用同一物理坐标系**（`GetClientRect` + `ClientToScreen` 做客户区↔屏幕互转），不要手工换算缩放系数。
- **OCR 定位要按区域过滤**：全屏 OCR 会把聊天正文里出现的同类词也匹配进来（本次误把"模型用时"当成菜单项）。**按 y 坐标限制在弹层区域**内再匹配。

### 7.10.14 🔴 ui-primitives 图标名改过一轮：`…Outline16` → `…OutlineRegular`（2026-10-08 实证 · DOM 增强插件必看）

**凡是给官方 UI 挂图标（`jsx(IconXxx, {})`）的插件，升级内核后必崩**，症状是
`slot entry crashed ... Minified React error #130`（`undefined` 元素类型）——
因为拿到的是 `undefined` 组件。

**改名分界（实测 31 个版本）**：

| 版本区间 | 图标名形态 |
|---|---|
| `0.0.1-rc.1` ~ `0.1.6-alpha.2`（**24 个版本**） | `IconSendOutline14`（**数字 = 像素尺寸**） |
| **`0.1.7-alpha.1` 起**（含 `0.2.0-rc.2`） | `IconSendOutlineRegular` / `IconSendOutlineMedium`（**后缀 = 描边粗细**） |

新版语义：`ICON_REGULAR_STROKE = 1`、`ICON_MEDIUM_STROKE = 1.3` —— **尺寸不再进名字**，
而由 props 的 `size` 控制（`jsx(IconCloseOutlineRegular, { size: 18 })`）。

**🔴 修法（两条都错不得）**：

```js
// ❌ 错法一：只去掉数字后缀 —— 这个名字依然不存在！
IconRefreshOutline16  →  IconRefreshOutline        // 它只是 …OutlineRegular 的前缀子串

// ✅ 正法：补齐 Regular / Medium 后缀，尺寸继续用 props
IconRefreshOutline16  →  IconRefreshOutlineRegular
IconQueueOutline14    →  IconQueueOutlineRegular
```

**选 Regular 还是 Medium**：宿主自身在 5+ 个包（`dsh-client-ui-chat` / `-attachment` /
`-locale` / `-agent-preset` 等）里**一律用 `Regular` + `{ size: N }`**，与旧代码
`IconXxxOutline16` + `{ size: 14 }` 的风格同源 → **映射到 Regular 最贴近原意**。

**批量排查命令**（找出仍引用已改名图标的插件）：

```powershell
# 1) 从 ui-primitives 提取真实导出名
$uip = 'C:\Users\Administrator\AppData\Local\Programs\DSH NEXT\resources\app\node_modules\@deepseek-ai\dsh-client-ui-primitives\lib\index.js'
$t = [IO.File]::ReadAllText($uip,[Text.UTF8Encoding]::new($false))
$real = @{}
foreach ($m in [regex]::Matches($t,'export\s*\{([^}]*)\}')) {
  foreach ($n in ($m.Groups[1].Value -split ',')) { $c=($n -replace '\s+as\s+.*$','').Trim(); if ($c) { $real[$c]=$true } }
}
# 2) 扫插件：真实引用形态是 `X.IconFooOutline16`（属性访问 = build 后的 ESM 互操作）
#    只用字符串计数会误报（注释/局部定义也会命中）
```

**⚠️ 两个误导点**：
1. **字符串计数会误报** —— 有的插件只是把图标名写在 CSS 选择器或注释里（实测
   `dsh-font-enhancer` 的 `conversation.input.dock` 只是 CSS 选择器，**并不注册插槽**）。
   必须区分「属性访问真实引用」与「普通字符串」。
2. **升级插件版本不一定能修** —— 实测 npm 上的新版与本地旧版**同样读错字段**，
   先 diff 两版再决定升级还是打补丁。

**🔴 错法实证：把 `…Outline16` 改成 `…Outline` = 没修（2026-10-09）**

本机 `dsh-deepseek-web/lib/client.js` 曾被改成：
```js
// ❌ 错误修法（数字去掉了，但名字依然不存在）
_deepseek_ai_dsh_client_ui_primitives.IconRefreshOutline, {}
// ✅ 真实导出名是
_deepseek_ai_dsh_client_ui_primitives.IconRefreshOutlineRegular, {}
```
`IconRefreshOutline` **只是 `IconRefreshOutlineRegular` 的前缀子串**，`ui-primitives` 里**没有这个导出**
→ 仍然拿到 `undefined` 组件 → **React #130 照旧每次启动报**。
**所以"改过了"≠"修好了"，必须回查真实导出名清单核对**（用 §7.10.14 的三步判别）。

**🔴 修完必须复验，别以为一次修完就没了（2026-10-09 实测）**：

修了 `dsh-queue-plus`(11 处) + `dshmarket`(138 处) 共 **149 处**后，
`conversation.chat.assistant-actions` 与 `sidebar.footer.action` **仍在每次启动时崩**（React #130 ×5~6）：

```
[warn] slot entry crashed in 'conversation.chat.assistant-actions': Minified React error #130
[warn] slot entry crashed in 'sidebar.footer.action': Minified React error #130
```

**结论**：这几类 slot 的图标引用**分散在多个插件**里，修一个不等于修完。
**每次内核升级后都要全库重扫一遍**（不能只看上次修过的那几个），判别三步：
① 从 `ui-primitives` 提取真实导出名；② 扫各插件里「属性访问形态」的旧图标引用；
③ 逐个替换 + `node --check`。

**另有非图标类崩溃**（同一 slot，别混）：`conversation.input.right` 报
`TypeError: Cannot read properties of null (reading 'provider')` —— 这是**数据为 null**（不是 undefined 组件），
排查方向完全不同（见下方 7.10.15）。

### 7.10.15 🔴 `=== void 0` 挡不住 `null`：`useSyncExternalStore` 快照判空坑（2026-10-09 实证）

**症状**：某插槽每次启动崩一次，报
```
TypeError: Cannot read properties of null (reading 'provider')
```
**关键**：报错词是 **`null`** 而不是 `undefined` —— 这个区别直接指向根因。

**反例代码**（`dsh-workbuddy-connect` 实测）：
```js
const selection = useSyncExternalStore(subscribe, snapshot, snapshot).current;
const card = selection === void 0 ? void 0 : cardVariantFor(selection.provider);
//             ^^^^^^^^^^^^^^^^^ 只挡 undefined；null 会穿过去
```

**为什么会是 null**：`modelDirectories` 这类 **snapshot 的 `current` 字段在「未选模型 /
目录未就绪 / 用户刚清空选择」时是 `null`**，不是 `undefined`。压缩产物里的
`x === void 0` 形态**只覆盖 undefined**。

**修法**（最小改动，一行）：
```js
const card = selection == null ? void 0 : cardVariantFor(selection.provider);
//                        ^^ 宽松相等，同时覆盖 null 与 undefined
```
同理，同一表达式里后续的判空也要一起改（本例还有一行拼 key 的 `selection === void 0`）。

**通用戒律**：
1. **凡是 `useSyncExternalStore` / 外部 store 的 snapshot 字段，一律用 `== null` 判空**，
   不要用 `=== void 0`（除非能证明该 store 绝不产生 `null`）。
2. **看报错词定方向**：`reading 'X' of undefined` → 找 undefined 组件/字段；
   **`of null` → 找返回 null 的数据源**（往往是"未初始化"的合法状态，不是 bug 的组件）。
3. **修完要验证"引用的东西真实存在"**（见 7.10.14 的两个误导点）——
   本机曾出现"把 `IconRefreshOutline16` 改成 `IconRefreshOutline`"的**错误修法**，
   那个名字**并不存在**（真实名是 `IconRefreshOutlineRegular`），所以崩溃照旧。

### 7.10.16 🔴🔴 改第三方插件时**禁用「删行区间」**：一次误删 73% 文件（2026-10-09 实证）

**事故**：给 `dsh-model-fold` 移除一条不再需要的 CSS 规则时，脚本用「找到锚点行 → 向后找到 `},` → `del lines[start:end+1]`」的做法。
锚点定位偏了一处，结果：

```
64168 bytes  ->  17384 bytes     （删掉 73%）
node --check  ->  SyntaxError: Unexpected token '}'
```

**为什么危险**：`},` 这种「闭合符号」在压缩/打包产物里**遍地都是**（对象字面量、数组、函数、CSS 拼接串……）。
`while end < len and '},' not in lines[end]` 会**停在第一个无关的 `},`**，把中间所有代码一起删掉。

**铁律（改任何第三方插件都适用）**：

| # | 规则 |
|---|---|
| 1 | **优先「等长/近等长字符串替换」**，绝不按行区间删除；确实要删，也只删**明确标记过的整段**（如带 `// BEGIN` / `// END` 注释） |
| 2 | **写盘前做体积断言**：`abs(new-old) > 阈值` 一律 ABORT 不写盘（本机阈值取 500 字节；纯替换通常只差几十字节） |
| 3 | **改写前先备份到带时间戳的目录**，并在**每次成功改动后**再备份一次「可用状态」（本次正是靠 `mfold-side-20261009-010133` 一次 `Copy-Item` 回滚救回） |
| 4 | **`node --check` 必须跑**，但它只查语法 —— 体积断言才是这次的真正刹车 |
| 5 | **压缩产物的多行匹配必先探测行尾**：同一仓库里 desktop 版是 **CRLF**、脚本若用 `\n` 拼多行字符串会**匹配 0 处**（本次连撞两次），一律改用 `readlines + 行级操作` 或先 `newline=''` 读入 |

**回滚动作（照抄）**：
```powershell
Copy-Item "$env:USERPROFILE\.dsh\backups\<备份目录>\client.js.bak" `
          "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\<插件>\lib\client.js" -Force
node --check <目标>    # 必须回 0
```

**🔴 追加铁律 6（2026-10-09 同一个插件连撞两次后固化）：写盘前先在临时文件上 `node --check`**

前两条（体积断言、`node --check`）都是**事后**检查 —— 坏文件已经写进插件目录了，只能回滚重来。
本轮一小时内连撞两次失败：

| 失败 | 原因 | 后果 |
|---|---|---|
| 第一次 | **先插新 CSS、再全局正则改字号** → 新插入的 `font-size:10px` 也被替换，破坏了 CSS 数组的字符串拼接（少了 `+,`） | SyntaxError，回滚重做 |
| 第二次 | **CSS 插入锚点选错**（用了已回滚的 `span.dsh-mf-src`，实际不存在）→ 插到非字符串上下文 | SyntaxError，**被第 6 条铁律拦下**（没写盘） |

**正确姿势（Python 脚本模板）**：

```python
import subprocess, tempfile, os, io
# 1) 先在内存里算出 out
# 2) 写临时文件并校验 —— 通过才覆盖目标
tf = os.path.join(tempfile.gettempdir(), "_check.js")
with io.open(tf, "w", encoding="utf-8") as fh:
    fh.write(out)
r = subprocess.run(["node", "--check", tf], capture_output=True)
if r.returncode != 0:
    print("[ABORT] 写盘前语法校验失败:", r.stderr.decode("utf-8", "replace")[:400])
    return 1          # ← 目标文件保持原样，零风险
with io.open(target, "w", encoding="utf-8", newline="") as fh:
    fh.write(out)
```

**推论（同类改动的通用顺序）**：
- **先做「会命中已有代码」的批量替换，再插入新增代码块** —— 反过来的话，新代码会被批量替换误伤（本轮第一次失败就是顺序错了）。
- **插入锚点必须是「确认存在于当前文件」的字符串**；用一个刚被自己回滚过的锚点 = 必然插错位置。

### 7.10.17 🔴 给插件加「自建 DOM」时，先查宿主有没有**视图签名**机制（2026-10-09 实证 · 症状是"时好时坏"）

**症状**：插件自建的 UI（按钮/工具条/提示）**点击时好时坏** —— 有时生效、有时没反应，且**没有报错**。
最容易被误判成"事件没绑上""React 抢了事件""防抖问题"，其实根因往往在宿主的**视图签名**。

**机制**：DSH 的模型选择菜单是**两级下钻**（`pane="root"` / `"model"`），React 就地复用同一个
`div[role="menu"]` 节点、只换 children。因此宿主侧（以及照抄该模式的插件）用一个**签名**判断
"视图是否切换了"，典型实现：

```js
function paneSignature(menu) {
  var parts = [];
  var kids = menu.children;
  for (var i = 0; i < kids.length; i++) {
    var kid = kids[i];
    if (kid.id === PANEL_ID) continue;      // ← 只排除了"已知的自建节点"
    parts.push(i + ":" + kid.tagName + ":" + kid.className);   // ← 每个子节点都进签名
  }
  return parts.join("|") + "#" + cells + "#" + groups;
}
```

**触发链（本机实测）**：

```
点击自建按钮
  -> 处理函数重建了工具条（textContent='' + appendChild）
  -> menu.children 结构变化
  -> paneSignature 变化  -> 被判定为"视图切换"
  -> resetView() 清掉自建 DOM 并重挂
  -> 按钮事件/状态丢失  -> 用户视角 = "点了没反应 / 时好时坏"
```

**三条修法（缺一不可）**：

| # | 做法 | 要点 |
|---|---|---|
| 1 | **签名计算里排除自己的节点** | 与宿主排除 `PANEL_ID` 同源；用稳定的 class 判据，别用 index |
| 2 | **自建 UI 改为幂等更新** | **只在首次创建节点**，之后只改文本/属性（`data-on`、`textContent`），**绝不重建** |
| 3 | **状态变更不要触发"重增强"** | 点击后只调「刷新自身状态」的小函数，**不要**调 `resetView` / `enhance` / `resetMenuGroups` |

**验证手段（关键）**：写一个**幂等性探针** —— 造最小 DOM，**连续调 N 次**渲染函数，
断言「设置条节点是同一个对象」「首个按钮是同一个对象」「按钮数不变」。
本机连调 11 次全部同一对象 → 判定修好；若对象变了，就是还在重建。

```javascript
api.renderMenuExtras(menu)
const bar1 = menu.querySelector(':scope > .dsh-mf-configbar')
const btn1 = bar1.children[0]
for (let i = 0; i < 10; i++) api.renderMenuExtras(menu)
const bar2 = menu.querySelector(':scope > .dsh-mf-configbar')
console.assert(bar1 === bar2 && btn1 === bar2.children[0], '仍在重建节点 -> 会丢点击')
```

**通用推论**：
- **任何往宿主容器里 append 自建节点**的做法，都要先问一句：**宿主有没有"子节点变化 = 视图变化"的判定？**
  有的话，你的节点必须被**显式排除**，且**内容变化不能改变节点结构**。
- 「时好时坏」类 bug 的**第一怀疑对象是"状态被反复重建"**，而不是事件绑定 ——
  事件丢了会**稳定**不触发；时好时坏说明是**竞态/重建**。

### 7.10.18 本机发布流程实操（git 直连被墙时怎么推 GitHub）

> 本机 `git clone/push https://github.com/...` 会 `Recv failure: Connection was reset`，
> **只有 `gh api`（api.github.com）通**。以下是跑通过的完整流程。

**① 拉取远程源码（不能用 clone，tarball 也不认）**

`gh api repos/<o>/<r>/tarball/main` 返回的东西本机 `tar` 报 `Unrecognized archive format`
→ 改用 **Git Blobs API 逐文件拉**（保留原始字节，可校验尺寸）：

```python
tree = gh_api("repos/%s/git/trees/main?recursive=1" % REPO)
for b in [t for t in tree["tree"] if t["type"] == "blob"]:
    b64 = gh("api", "repos/%s/git/blobs/%s" % (REPO, b["sha"]), "--jq", ".content").stdout
    data = base64.b64decode(b64.decode().replace("\n", ""))
    assert len(data) == b["size"]          # ← 尺寸断言，防截断
```

**② 推送（用 Git Data API 做单提交，别逐文件 PUT）**

逐文件 `PUT contents` = **每个文件一个 commit**（6 文件=6 提交），仓库历史变脏且可能影响
上游 CI 的资格判定。用 Git Data API 一次成形：

```
GET  git/ref/heads/main              -> head sha
GET  git/commits/<head>              -> base_tree sha
POST git/blobs       (每个文件)       -> blob sha
POST git/trees   {base_tree, tree[]} -> new tree sha
POST git/commits {message, tree, parents:[head]}
PATCH git/refs/heads/main {sha, force:false}
```

**③ 发布后核验（三端 + 四维）**

**🔧 一键脚本（已实体落盘，实测跑通）**：

```powershell
python 'dsh-config\references\plugin-development\scripts\verify-plugin-release.py' `
    <owner/repo> <包名> <本地源码目录>
# 例：
python ...\verify-plugin-release.py loyalchiiina/dsh-model-fold dsh-model-fold `
    C:\Users\Administrator\Documents\deepseekharness\_release-model-fold\repo
# 输出 RESULT: [OK] release verified
```

**🔧 推送脚本（Git Data API 单提交）**：

```powershell
# dry-run（只建 blob+tree，不动分支）
python ...\push-plugin-gitdata.py <owner/repo> <本地源码目录> "<commit message>"
# 正式推送
python ...\push-plugin-gitdata.py <owner/repo> <本地源码目录> "<commit message>" --apply
```

| 维度 | 判据 |
|---|---|
| 版本号 | 本地 `package.json` == GitHub `contents/package.json` == `npm view <pkg> version` |
| 关键文件字节 | 本地 `lib/client.js` SHA256 == GitHub blob **== npm tarball 内的同名文件** |
| **tarball 可下载** | `HEAD https://registry.npmjs.org/<pkg>/-/<pkg>-<v>.tgz` → **必须 200**（防"元数据可见但 tarball 404"的半成品） |
| 图片在不在 | **解包 tarball 数 `docs/images/*`** —— 这是 `files` 白名单陷阱的唯一可靠检查 |

**⚠️ 三个本机陷阱**（都实际踩到）：

1. **`gh api` 的 `--jq` 表达式会被 PowerShell 拆参数**（报 `accepts 1 arg(s), received N`）
   → **复杂请求写成 JSON 文件 + `--input`**，或把逻辑放进 `.py`/`.ps1` 文件执行。
2. **Python 脚本里 `print` 带 emoji（✅❌⚠）在 GBK 控制台直接崩**（`UnicodeEncodeError`）
   → 脚本输出一律用 ASCII 标记 `[OK]/[FAIL]/[!]`。
3. **`npm publish` 后 `latest` 有延迟**（实测 30 秒左右才可见）
   → **别据此判失败**；查 `npm view <pkg>@<ver> version` 与 `versions --json` 才准。

---

### 7.10.19 🔴🔴 `querySelectorAll('div[role="menu"]')` 无差别处理 = 误伤所有弹出菜单（2026-11-07 实证 · 点会话「⋯」→ 整个会话列表上下跳动）

**症状**：DSH 桌面端左侧会话列表，点任意会话行尾部的「⋯」（弹出操作菜单）时，整个列表上下跳动/往上跳；升级到 0.6.0 后必现，0.5.1 无。

**根因**：`enhance()` 遍历 `document.querySelectorAll('div[role="menu"]')`，`isMenuAlive(menu)` 只判 `document.body.contains(menu)`，**完全不区分是不是模型选择菜单**；随后 `autoDrillRoot(menu)` 对「无 `section[role="group"]`、但有 `button[role="menuitem"]`」的**任意**菜单执行：

```js
if (!target) target = cells[0];                    // 🔴 找不到"模型"项就兜底取第一项
target.dispatchEvent(new MouseEvent("click", …));  // 🔴 自动点击了会话「⋯」菜单第一项（置顶/重命名/归档）
```

会话「⋯」菜单正是 `div[role=menu] + button[role=menuitem]` 且无分组 → 被当成"官方模型根面板" → 自动点了第一项 → 会话被置顶/归档 → 列表跳动。

**为什么 0.5.1 没有**：`autoDrillRoot` / `data-mf-drilled` 是 0.6.0 新增（0.5.1 的 client.js 中 `autoDrillRoot` 出现 **0** 次；相关逻辑 0.5.1 仅 3 处、0.6.0 有 **59** 处）。判据：`Select-String -Path lib/client.js -Pattern autoDrillRoot` 有命中即含此逻辑的版本。

**修法（0.6.4~0.6.7 实测，两层限定缺一不可）**：
1. **总闸**：`enhance()` 循环开头加 `if (!isModelMenu(menu)) return;` —— 用强判据（菜单含 `section[role="group"]`，或任一 `button[role=menuitem]` 文本以 `模型/Model/モデル/推理/Effort` 开头）限定只处理模型选择菜单，非模型菜单一律 return（不 applyMenuTheme / 不 renderMenuExtras / 不下钻）。
2. **去兜底**：把 `if (!target) target = cells[0];` 改成 `if (!target) return;` —— 只有真正含「模型：xxx ›」开头项的模型 root pane 才自动下钻，其它菜单 `target` 为 null 直接返回。

**可执行判据 / 回归断言**：
- 危险代码特征：`Select-String -Path lib/client.js -Pattern 'div\[role="menu"\]'` 命中且**没有** `isModelMenu`（或类似作用域守卫）= 高危。
- 运行期断言：在**非模型菜单**（会话「⋯」、右键菜单、下拉）上不得发生任何 `dispatchEvent(click)`；模型选择菜单仍应正常自动下钻。
- 验证：点左侧会话「⋯」→ 菜单正常显示、不自动执行第一项、列表不跳；打开模型菜单 → 仍能下钻到模型列、强度浮层正常（0.6.0+ 功能不回归）。

**通用病根（跨插件可复用）**：`role="menu"` 是**通用 ARIA 角色**——页面上任何弹出菜单（会话操作、右键、下拉选择）都是 `div[role=menu]`。凡给官方菜单挂增强/DOM 操作的插件，**禁止只按 `role` 抓取后无差别处理**，必须先按结构/文案强判据确认"这是我的目标菜单"；否则会误伤全站每一处弹出菜单，且症状千奇百怪（自动点击、自动关闭、列表跳动、误触发破坏性操作），极难联想回本插件。排查"莫名自动执行了某项操作/某块 UI 自己乱动"时，第一嫌疑 = 某个 DOM 增强插件在 `querySelectorAll('div[role=menu]')` 结果上无差别 dispatch 事件。

---

### 7.10.20 v1.0.0 全轮次复盘（0.6.10 → 1.0.0 · 三个"以为是自己的错"最后都不是）

> 2026-11-08 收口。本轮从 0.6.10 起，目标是三件事同时成立：7 档推理强度真正可用、探针能自证插件在页面上生效、图标状态切换即时可见。三件事各踩一次"归因归错层"，最后都靠机器判据翻案。

#### ① 起点（本轮要解决什么）

0.6.10 进 1.0.0 收口轮，三条硬指标：
1. **7 档 `reasoningEfforts` 能真正下发**——此前只要选档，宿主就回 `settings/rejected`，档位等于白设。
2. **探针（probe）必须自证**——插件在页面上到底有没有生效，不能再靠"看起来在"来判断，要能出一份机器可读结果。
3. **图标状态必须即时**——开关切换后旧图标要立刻消失，不能残留。

收口口径从"功能看起来对"升级为"**每条都有可执行的机器判据**"。

#### ② 弯路（三次错误归因，都先怪自己写的那一层）

| # | 现象 | 第一反应（错） | 反复做了几次 | 为什么一直不对 |
|---|---|---|---|---|
| 1 | 选任意档 → `settings/rejected` | 以为「档位太多 / 档位名字不合规」，反复改档位表：改名、减档位、调顺序 | 多轮 | 档位表本身一直合法；问题不在"档位长什么样"，而在"这条能力在当前协议下成不成立" |
| 2 | probe 跑完没有任何标记 | 以为「探针没执行 / 注入时机太早」，反复调注入时序、加延时 | 多轮 | 探针确实执行了，标记也确实写了——只是写在了一个没被 `ensure` 的 face 上，等于没写 |
| 3 | 图标不消失 | 以为「CSS 过渡没结束 / 节点没重绘」，反复调样式、加 `requestAnimationFrame` | 多轮 | 视图层没错，是"状态层只刷新了数据、没有重建能力集也没有触发重绘" |

**共同病根（跨插件可复用）**：三次都默认"错在我写的那层逻辑"，没有先问一句「**宿主/运行时实际给我的是什么**」。
正确顺序永远是：**先取证（宿主返回了什么）→ 再归因（哪一层不成立）→ 最后改代码**。顺序反了，改多少轮都是改错层。

#### ③ 根因（三条真因，逐条带定位法）

1. **7 档被 `settings/rejected`**：真因是当前 provider 走 **`openai-responses`** 协议，该协议下 `compat` **不支持 `compat.supportsReasoningEffort`**。档位表合法、下发路径也对，是**能力声明在这个协议下不成立**，宿主按契约拒收。
   定位法：读 `settings/rejected` 的 reason，看它指的是**档位内容**还是**协议/兼容能力**。指向 compat 就不是档位问题，别再动档位表。
2. **probe 无标记**：真因是 **`cf.describe()` 被调用了两次**，第二次拿到的是**新的 face**，而代码只对第一个 face 做了 `ensure`；**没有 `ensure` 的 face 不落标记**。
   定位法：把 `cf.describe()` 的所有调用点列出来，逐个检查返回的 face 是否都走了 `ensure`。调两次而只 ensure 一次 = 必现"跑了但没痕迹"。
3. **图标不消失**：真因是 **`runForceCapsOnce` 只做了 `refresh catalog`**，**没有重建 `caps`、也没有重绘**。状态数据换了，视图层拿到的还是旧能力集。
   定位法：状态更新函数里出现 `refresh` 却**后面没有 rebuild / redraw** = 只刷新数据不刷新视图，必然"数据变了界面不变"。

#### ④ 判据（本轮定死的五条硬门，可直接当回归断言）

| 判据 | 通过标准 | 拦的是什么 |
|---|---|---|
| `node --check` | 全部入口文件语法通过 | 低级语法错在发布前拦住 |
| 探针断言 A | **46/46** 通过 | 插件主体能力/菜单增强链路 |
| 探针断言 B | **14/14** 通过 | 档位与能力声明的下发链路 |
| 宿主 mock probe | 返回 **HTTP 200** | "本地看着对、宿主侧不认"的假绿 |
| 文档/资源可达性 | GitHub **README 200**、**旧图 raw 404** | 文档没同步 / 旧截图没真删（404 才证明删掉了，不是本地缓存假象） |

#### ⑤ 修法（三条，一一对应根因）

1. **能力声明按协议分流**：`openai-responses` 下**不再下发** `compat.supportsReasoningEffort`，改走该协议实际支持的档位表达；**不再靠删档位绕**——删档位是把问题从"报错"变成"少功能"，不是修。
2. **`cf.describe()` 只调一次**，把返回的 face **全部 `ensure`**，探针标记在 `ensure` **之后**写；绝不在两个 face 之间"用第一个的结果给第二个用"。
3. **`runForceCapsOnce` 改成三步**：`refresh catalog` → **`rebuild caps`** → **强制重绘**，缺一不可；只做第一步就会出现"图标不消失"。

#### ⑥ 验证（跑完才叫修好）

- `node --check`：全部入口通过。
- 探针：**46/46** + **14/14** 两组全绿。
- 宿主侧：mock probe 返回 **200**（证明请求在宿主契约下被接受，不只是本地跑通）。
- 仓库侧：README **200**（文档已在主干可读）。
- 资源侧：旧图 raw **404**（旧截图确已删除）。

#### ⑦ 发布（1.0.0 三处同版本 + 市场）

| 项 | 状态 |
|---|---|
| GitHub | `main` 已推、**tag `v1.0.0`** 已打、**Release** 已发 |
| npm | `latest` = **1.0.0** |
| 插件市场 | PR **#13096** 已提 |
| 文档资源 | 旧图**已删**、`screenshots.json` **已加** |

核验沿用 §7.10.18 的四维表（版本号 / 关键文件字节 / tarball 200 / 图片在不在），不新增口径。

#### ⑧ 固化（下次不用再想一遍）

1. **探针结果落盘** `~/.dsh/model-fold-probe.json`：排查先读文件，不靠回忆、不靠截图。
2. **显示开关只隐藏、不删数据**：用户关掉显示 ≠ 丢配置，重新打开即恢复原状。
3. **实装形态（2026-11-08 实测）**：`desktop` = **1.0.0**、`web` = **1.0.0**、`xiufu` = **0.6.0**（未升级）。`audit-plugin-logs.mjs` 对多 profile 分叉只报 **WARN**（形态不一致信号），**不是缺日志**——判绿以 desktop 为准。

#### 本节可复用结论

- **被宿主拒收时，先查协议兼容能力，再查自己参数**：`settings/rejected` 十有八九在说"这个协议不支持你要的这项能力"。
- **"跑了但没痕迹"先查对象是不是同一个**：`describe()` 调两次 = 两个 face；只 ensure 一个，另一个永远不留标记。
- **"数据变了界面不变"先查是不是只 refresh 没 rebuild**：刷新 catalog ≠ 重建 caps ≠ 重绘，三步任一缺失症状都一样。
- **删资源要用 404 证明**：本地看不到 ≠ 线上已删；raw 返回 404 才算删干净。




## 过程登记（from inbox · session-a22b2b1d-1816-4e89-b02d-9cf4d7f6861c · 2026-11-10）
- §pitfall **link: 装法遗留悬空 junction 误报断链** —— 旧 link: 安装指向 profiles/desktop/node_modules，该目标已不存在，且插件实际走套件内另一条有效 junction；判据：lstat=symlink, readlink 指向 ENOENT 路径；删后插件运行不变，日志仍 3 条 dsh-model-fold: started（agent: lead）

## 过程登记（from inbox · session-1c7a971a-a0c6-4f25-b329-c098450601a8 · 2026-11-11）
- §pitfall **Windows User 级删环境变量：[Environment]::SetEnvironmentVariable(name,$null,'User') 在 .NET Framework 下只写成空串，值名不消失** —— .NET Framework 版 SetEnvironmentVariable 把 null 规范化为 string.Empty，执行的是写值而不是 RegDeleteValue，所以值名被保留成空 REG_SZ；Get-ItemProperty / GetEnvironmentVariables 仍能看到该键；判据：2026-11-11 实测：改前 HKCU:\Environment 值名计数 41（含 AGENT2API_API_KEY，REG_SZ 39 字符）→ 调 SetEnvironmentVariable(...,$null,'User') 后计数仍 41、reg query exit=0 显示 AGENT2API_API_KEY REG_SZ 空值 → 改用 Remove-ItemProperty -Path 'HKCU:\Environment' -Name 'AGENT2API_API_KEY' -Force 后计数变 40、reg query exit=1「系统找不到指定的注册表项或值」、GetEnvironmentVariable 返回 $null。另注（推理，未实测）：值名真删掉后不要再调该 API，按上述 null→空串实现路径它会把值名重新创造成空 REG_SZ（agent: dsh-plugin-master/sub-env-cleanup）
- §method **删 AGENT2API_API_KEY 进程环境变量前，必须先比对 .credentials.yaml 同名键指纹，确认回落后不是同一把失效 key** —— 两条取值链并存：插件 dsh-model-fold 走 process.env[apiKeyEnv]（读到已被网关删除的旧 key，请求 401）；真实对话走 .credentials.yaml 的同名键。只删环境变量后 provider 会回落到凭据文件，若凭据文件里也是同一把旧 key，面板故障不会消失；判据：2026-11-11 实测：User scope 值 len=39 前缀 sk-a sha8=09f74bac（旧 key）；.credentials.yaml 第 20 行 AGENT2API_API_KEY len=17 前缀 beib sha8=614da379（与旧 key 不同值，故回落后不会复用旧 key）；cordis.patch.yml 第 3621 行 apiKeyEnv: AGENT2API_API_KEY 仅 1 处，属变量名声明而非硬依赖；Machine scope 与 process 环境块均无该变量（agent: dsh-plugin-master/sub-env-cleanup）
- §pitfall **model-fold 探测读 process.env 取 key，被 Windows 用户级旧环境变量覆盖，导致「全 401」假象** —— dsh-model-fold 宿主端 lib/index.js:162-163 用 `process.env[input.apiKeyEnv] || input.apiKey` 取 key，优先进程环境变量；DSH 重启（13:38:15）继承的 Windows User 级 AGENT2API_API_KEY 仍是 2026-10-30 的旧 key（39 位 sk-a…，sha256 前8 09f74bac，与 .agent2api/dsh_full_key.txt 同值），而 DSH 凭据库 .credentials.yaml 里的 AGENT2API_API_KEY 是 17 位 beib…（sha256 前8 614da379，对应网关有效 key AUTO）。两条取 key 路径不一致 → 探测层 401、对话层能过网关。；判据：E:\DSHskills-test\a2a-model-sweep\dsh-state-after-restart.md §3.3；lib/index.js:162-163 原文 `const envKey = input.apiKeyEnv ? process.env[String(input.apiKeyEnv)] : "";`；[Environment]::GetEnvironmentVariable('AGENT2API_API_KEY','User') len=39 f4=sk-a sha8=09f74bac；.credentials.yaml refs.AGENT2API_API_KEY len=17 f4=beib sha8=614da379；2026-11-11 13:49:03-13:49:05 共 276 条 401。（agent: sub@session-1c7a971a-state-forensics）

## 过程登记（from inbox · session-cbeaa10f-779b-4a23-9d67-56ceccdb9579 · 2026-11-11）
- §pitfall **git status 的 ahead N 在 origin 缓存陈旧时是假象，真实状态可能已分叉** —— ahead/behind 只按本地缓存的 origin/main 引用计算；本地缓存停在 188dddf，远端 main 已走到 6cc7c35(chore release v1.0.1)，本地 HEAD c20408b 远端不存在，两条线各自走 2/4 个提交=分叉，push 会被 non-fast-forward 拒；判据：git ls-remote --heads origin -> 6cc7c359; git log -3 origin/main -> 188dddf; gh api compare/6cc7c359...c20408b -> HTTP 404; gh api compare/188dddf...6cc7c359 -> status=ahead ahead_by=2 (01686e6 + 6cc7c35)（agent: sub-agent/prepublish-verify）
- §verdict **发布前白名单核对：把 screenshots.json 引用逐条与 npm pack 清单求交集，可 10 分钟内判死白名单缺口** —— npm pack --dry-run --json 输出的 files[] 是最终打包真相，而 screenshots.json 是自己写的引用清单，两者交集为空即缺口；本次 1.0.2 files 含 docs/images/**、locale/*.json、screenshots.json 三项，干跑 15 文件 410930B 全部命中；判据：cmd /c "npm pack --dry-run --json" -> entryCount 15, size 410930, unpackedSize 578623；4 张 png + screenshots.json + locale/en|zh.json 均在 files[]；screenshots.json 4 条路径 4/4 命中；本地 4 张 png 的 git blob sha 与远端 main blob sha 逐一相同（agent: sub-agent/prepublish-verify）
- §pitfall **本地分支从旧基线重建时，远端后加的市场双语描述块会被静默丢掉，发布即回退** —— 本地 1.0.2 的 4 个提交建在 188dddf 上，而远端的 01686e6「docs: add bilingual feature description (zh first, then en)」在另一条线上；两条线分叉导致本地 README 不含该块，一旦按本地为准 push 就把远端已修好的市场描述覆盖回退；判据：gh api contents README.md?ref=6cc7c35 下载得 4362B，含「> **功能描述**：…适配 DSH 内核 0.2.2-rc.1。」+「> **English**: … Adapts DSH kernel 0.2.2-rc.1.」；本地 README 6180B 无该块，Select-String 0.2.2 命中 0 条，仅有第 67 行「需 DSH ≥ 0.1.7-rc.1」（agent: sub-agent/prepublish-verify）
- §pitfall **远端把 README 整文件改成 CRLF 时 diff 显示全文件替换，别据此用 ours/theirs 整取** —— 远端 01686e6 提交时把 README 行尾从 LF 换成 CRLF（实测 188dddf: CRLF 0 / LF 78；6cc7c35: CRLF 83 / LF 0），git 按行比较时每一行都算变化；真实语义改动只有顶部插入双语块 3 行 + 2 空行；判据：git show <rev>:README.md 逐版本统计行尾：188dddf LF78/CRLF0、6cc7c35 CRLF83/LF0、c20408b LF82/CRLF0；tail diff 实测仅 4 hunk（agent: sub-agent/git-rebase-fork-merge）
- §verdict **rebase 解冲突后的机器判据三件套：left-right 左列=0 + diff-stat 只含预期行 + 关键文件 SHA256 对账** —— git 只报告「冲突已解决」，不做语义完整性校验；冲突解决是人工写盘，天然有覆盖整段内容的风险；判据：left-right -> 0	4；diff --stat c20408b c822fb3 -> README.md | 5 +++++, 1 file changed, 5 insertions(+)；package.json/locale/*/lib/*.js 六个文件 SHA256 与 local-plugins 完全一致，README 差异经 git diff --no-index 证实恰为插入 5 行（agent: sub-agent/git-rebase-fork-merge）
- §pitfall **测活判据只看 HTTP 状态码：2xx + 错误正文被算成可用（4 条假绿）** —— lib/index.js handleProbe 的 ok 判据是 const ok = status>=200 && status<300，2xx 时 result.body 一次都没被读过；正文解析只写在 if(!ok) 失败分支里。而 postJson 早已把 body 截断 2000 字放进返回值，信息不缺、缺的是判定分支；判据：凡「探测/健康检查」类判据必须同时校验结构化错误字段 parsed.error（及 type==="error"）与错误短语黑名单，且判据应为黑名单式而非白名单式——max_tokens:1 正常返回可能就是 content:""（finish_reason:length），按 choices 非空判会把真可用的模型判成假红；另禁止对整串 body 裸匹配 error 单词（模型回复可能含该词）。独立 code 用 OK_BODY_ERROR，出口仍 HTTP 200+code 即可让客户端零改动（agent: subagent）
- §pitfall **判据升级后旧持久化结果不会失效，用户升级后仍看到旧假绿** —— ~/.dsh/model-fold-probe.json 的结果文件由 writeResults 写入 {version:1,...}，但 readResults 只取 parsed.results，完全不校验 version，也无失效/过期判定，任何历史 ok:true 都会被原样沿用；判据：凡「磁盘持久化的判定快照 + 判据会变」的组合，必须在结果文件里带判据版本号并在读取时版本不匹配就整体作废（返回 {}），否则判据修正对老用户完全无效；核验方式=升级后首屏是否仍显示旧结论（agent: subagent）
- §pitfall **交接语里的「某门槛 8→4」若无原文出处，不可直接当结论执行** —— 数字型口径（门槛/阈值）在多次转述中最易失真：同一个 8 在产品里是「候选值整体替换的字符长度门槛」，在验证脚本里是「sk- 形态正则长度」「指纹 head 长度」，语义完全不同，转述时被压成一句「8→4」就丢失了所指；判据：遇到只给数字不给文件行号的口径变更，先分「产品侧 / 测试脚本侧 / 展示层」三栏检索并把每个数字的原句贴出来，再给标注为「推断」的最可能解释；推断未获用户确认前不得改产品安全语义（会连带使既有验证基线失效）（agent: subagent）
- §pitfall **双写副本同步 README：只有 SHA256 相等才算同步完成，字节数相等是假绿灯** —— README 是 UTF-8 文本但 PowerShell 5/7 的 Set-Content/Out-File 默认可能加 BOM 或改写换行；任何「读字符串再写回」都会改变字节序列而 byte length 未必变。Copy-Item 是文件级字节复制，不经过编码层；判据：同步类动作的验收判据固定为三件套同时成立：两侧 Length 相等 + 两侧 SHA256 完全相等 + 首 3 字节不是 239,187,191（无 BOM），且「首 3 字节」必须现场读原始字节而非读文本判断；另加一条可回滚证据——备份文件的 SHA256 必须等于「改前目标文件」的 SHA256，否则备份不可信。（agent: subagent）
- §pitfall **HTTP 200 不等于模型可用：网关用 200 回包携带错误正文会被判成绿点** —— handleProbe 判绿只写了 status>=200 && status<300，正文解析代码只放在 if(!ok) 的失败分支里，成功分支从不看 body；而中转网关会把「请求负载过高」这类错误用 HTTP 200 + {error:{message:...}} 返回；判据：判绿必须同时看状态码与正文：非 2xx 判红；2xx 时用黑名单短语（请求负载过高/负载过高/overloaded/rate limit/quota exceeded/额度不足/余额不足/service unavailable/internal server error/invalid api key 等）及 parsed.error 真值、parsed.type=='error' 判红并给 code=OK_BODY_ERROR（HTTP 仍回 200）；空 body / 非 JSON / 无 error 字段 / 空 choices 一律判绿，禁止裸匹配 error 单词以免造假红（agent: subagent）
- §pitfall **修了判定逻辑但旧落盘快照会继续显示错误结论，必须带版本号整体作废** —— 结果快照 ~/.dsh/model-fold-probe.json 只存 {version:1, results}，readResults 只校验 parsed.results 是对象、不校验版本，旧 {ok:true} 记录被原样读回；判据：凡是「已落盘的历史判定结论」被逻辑修正的场景，落盘结构必须带可判定版本号（本次 1→2），读取侧对 version !== 目标版本 一律返回 {} 整体作废、等下次探测重建；核验时必须同时 grep 新版本号存在且旧版本号残留为 0（agent: subagent）
- §pitfall **测活只看 HTTP 状态码会把上游错误的 200 当可用（假绿）** —— handleProbe 成功路径只读 status、从不读 result.body，而 postJson 早已把响应体截到 2000 字返回——证据在手上却没判；判据：2xx 之后必须继续检查正文：命中 overloaded/rate limit/quota/额度不足/invalid api key 等黑名单语汇判 OK_BODY_ERROR；黑名单式判定，不裸匹配 error 单词、不要求 choices 非空以避免假红；判据变更须升快照 version 并整体作废旧记录，不要逐条迁移（agent: subagent）
- §pitfall **双写副本与 suite/plugin-pack 内嵌目录是 Junction：三方 SHA 全等属定义性成立，不能当作独立副本证据** —— dsh-loyalchiiina-suite/node_modules/dsh-model-fold 与 profiles/desktop/node_modules/dsh-loyalchiiina-plugin-pack/node_modules/dsh-model-fold 都是 ReparsePoint(Junction)，LinkTarget=C:\Users\Administrator\.dsh\local-plugins\dsh-model-fold，与双写副本是同一物理文件；同步副本后这两处自动跟随；判据：Test-Path 之后必须再看 Get-Item -Force 的 LinkType/LinkTarget（或 cmd dir /AL 输出的 <JUNCTION> 行）；LinkType 非空即 junction/符号链接，此时 SHA256 对照只能证明是同一份文件，报告里必须标注「定义性一致」并单独给运行时 version 结论（读解析后的 package.json），不得据此建议重装（agent: subagent）
- §method **提交含 ①②③ 中文序号的多行 body：用 UTF-8 无 BOM 消息文件 + git commit -F，不要用多个 -m** —— -m 只接受单段字符串，多 -m 语义是「多段落」；PowerShell 传参重编码可能破坏非 ASCII；判据：先 [System.IO.File]::WriteAllText(path, text, UTF8Encoding($false)) 落消息文件（核前 3 字节非 239,187,191），再 git -C <repo> commit -F <file>；完成后用 git log -1 --format=%B 读回逐行核对，并以 git status --porcelain 为空 + rev-parse HEAD 作为成功判据，不看 exit code（agent: subagent）
- §verdict **回归脚本打网关的 FAIL 必须先按上游账号态/超时分流，再谈代码缺陷** —— 网关 400 正文是「CodeArts 登录授权已到期，无法继续自动续期，请重新完成网页登录」，属账号授权态；deepseek-v4.1-flash-1017 是已知限额/超时模型，脚本按设计以 status=0 + 约 12000ms 记录超时；判据：判 FAIL 前先看两处原文：HTTP 非 2xx 的错误正文是否含「授权已到期/重新登录/quota/额度」等账号态语汇；打网关用例是否 ms≈12000 且 status=0。命中任一即在报告里单列「上游账号态」，不计入代码缺陷，也不据此回滚（agent: subagent）
- §method **验证模块私有判定函数必须从落盘源码切片编译，不能手抄副本** —— 私有函数无导出，且插件随宿主加载，验证脚本不应依赖重启 DSH 才能跑；判据：用 readFileSync 读真实 index.js，以稳定锚点切片（const OK_BODY_PHRASES 到 \nasync function handleProbe）+ new Function(block + return classifyBody) 编译；脚本头打印被测文件 size 与 SHA256 及切片长度，退出码 0/1 表达全过/有失败；锚点缺失直接 EXTRACT-FAIL 退出，不回退手抄（agent: subagent）
- §verdict **结果快照加 version 闸会让旧快照整体失效，属设计但必须写进升级说明** —— 旧快照无法区分哪条是假绿，逐条迁移不可靠，代码选择整体作废等下一次探测重写；判据：升级说明必须写明「旧快照会被清空、首次探测前无颜色」；回归报告把它标为设计副作用而非回滚理由；核验时用快照文件的 version 字段与条目数作为判据（agent: subagent）
- §verdict **判定「新代码是否已生效」的基准必须是代码文件 mtime，不能是宿主进程启动时间** —— 该插件启动日志不含版本号（源码仅 ctx.logger.info("dsh-model-fold: started (client-side model-menu folding + probe routes)")），第一版判据取「日志记录时间 >= 宿主启动时间 - 5s」，而该日志本来就是宿主启动时打的，条件天然成立，等于没判。；判据：正确判据须三条同时成立：① 日志文本命中；② 记录 pid == 当前宿主 pid；③ 记录时间 >= lib\index.js 的 LastWriteTime - 5s。第 ③ 条是核心：只有发生在文件写入之后的加载才可能是新代码，早于写入的加载说明内存里仍是旧代码。阈值改用文件 mtime 后该项正确转 FAIL。（agent: subagent）
- §pitfall **PowerShell 脚本：edit 改写会掉 UTF-8 BOM；model-fold-probe.json 含大小写重复键不能 ConvertFrom-Json** —— 1) edit/write 工具按纯文本重写文件，不保留原 BOM。2) 该快照存在只差大小写的重复键（agent2api::deepseek-flash 与 agent2api::DeepSeek-Flash），PS5.1 的 ConvertFrom-Json 对键名大小写不敏感，判为重复键冲突。；判据：① 每次用 edit 改完 .ps1 必须用 [System.IO.File]::ReadAllBytes 查前三字节是否为 EF BB BF，缺失就用 [IO.File]::WriteAllText + UTF8Encoding($true) 重写，再跑 Parser::ParseFile 做 PS7/PS5.1 双版本语法检查（0 错误才算写完）；② 大 JSON 只要个别字段时不要整份 ConvertFrom-Json，改读头部 4KB 用正则 (?s)^\s*\{\s*"version"\s*:\s*(\d+) 取顶层 version，既避坑又快。（agent: subagent）
