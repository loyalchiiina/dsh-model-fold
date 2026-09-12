# dsh-model-fold

模型选择菜单按来源（provider）展开分类 —— 给 DeepSeek Harness 的模型选择菜单加分组导航能力。

## 功能（v0.3.0，双模式）

- **panel 模式（默认）**：菜单只列来源（▸ 箭头 + 来源名 + 模型数），点击来源从
  **右侧滑出子面板**列出该来源的全部模型；点面板里的模型即完成选择；正在使用的
  模型所在来源标 ✓。
- **inline 模式**：点击来源在下方折叠/展开该组模型（v0.2.0 行为），状态跨菜单记忆。
- **双击任意来源标题**在两种模式间切换，选择即时生效并记住。
- 子面板样式自适应主题（背景/文字/圆角/选中色均取自原菜单计算样式）。
- 只做 DOM 增强：面板是插件自建 DOM，选择通过程序化点击原菜单真实按钮完成，
  不移动、不删除任何 React 管理的节点，与其他插件兼容。

## 回滚 / 模式说明

v0.3.0 起为双模式：默认 panel（右侧子面板），双击任意来源标题可切换为 inline
（下方列表展开）模式；inline 模式下折叠状态跨菜单记忆。若需要回到 v0.2.0
（单 inline 模式）版本，可从 GitHub Releases 获取历史版本。

## 安装

在 DSH profile 中安装（依赖 `dsh.bundle` 自声明，无需手动改 cordis.patch.yml）：

```bash
dsh plugin --profile desktop add ./dsh-model-fold-<version>.tgz
```

或把目录复制到 profile 的 `node_modules` 并在 profile `package.json` 的
`dsh.profile.bundles` 中加入 `dsh-model-fold`。

## 原理

目标 DOM 是 `@deepseek-ai/dsh-client-ui-model-selection` 渲染、portal 到 `body` 的
`div[role="menu"]`：其中每个来源是一个 `section[role="group"]`，首子 `div` 为分组标题。
插件用 MutationObserver 捕获菜单出现，在标题元素上追加自定义 data 属性与点击事件
（React 不管理这些内容），用 CSS `:has()` 依据 data 属性隐藏组内模型项——不移动、
不删除任何 React 管理的节点，因此不破坏原组件的渲染与状态。

## License

MIT
