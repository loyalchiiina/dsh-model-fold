# Changelog

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
