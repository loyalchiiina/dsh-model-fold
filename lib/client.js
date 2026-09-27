window.__ModuleLoader__.load({
	id: "dsh-model-fold",
	factory: function (require) {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		// ══════════════════════════════════════════════════════════════════



		// ── dsh-model-fold v0.4.3 ──────────────────────────────────────────
		// 模型选择菜单按来源（provider 分组）展开分类，两种模式：
		//   · panel（默认）：菜单只列来源，点击来源 → 右侧滑出子面板列出该组
		//     模型；点击面板项 = 程序化点击原菜单真实按钮完成选择（React 无感）
		//   · inline：v0.2.0 行为，点击来源在下方折叠/展开模型列表
		// 双击任意来源标题在两种模式间切换；选中模型所在来源组标注「当前」并
		// 显示选中的模型名（总集一眼看出用的哪个集），子面板内选中项保留 ✓。
		//
		// 目标 DOM（@deepseek-ai/dsh-client-ui-model-selection，portal 到 body）：
		//   div[role="menu"] > div.groups > section[role="group"][aria-labelledby]
		//     > div（分组标题 = provider 名）+ button[role="menuitemradio"]（模型项）
		//
		// ⚠️ v0.4.3 关键修复（2026-09-26）：DSH 2.0.15-next 把 ModelSelect 改成了
		//   **两级下钻菜单**（pane: "root" → "model"）：
		//     · pane="root"（打开菜单的默认视图）：菜单里只有两个 role="menuitem"
		//       的 cell（「模型：xxx ›」「推理强度：xxx ›」），**完全没有
		//       section[role="group"] / menuitemradio**；
		//     · pane="model"（点「模型」cell 后）：才渲染原来的
		//       div.groups > section[role="group"] > button[role="menuitemradio"]。
		//   旧版 enhance() 的守卫 `if (!menu.querySelector('section[role="group"]'))
		//   continue;` 在 root pane 命中失败，且 React 是**就地复用同一个
		//   div[role="menu"] 节点**只换 children（不销毁重建），MutationObserver
		//   虽会触发但菜单已被跳过 → 表现为「打开菜单/打开后模型列表不正常、插件
		//   像坏了」。修复：pane 切换不改变 role="menu" 节点身份，因此改为
		//   **每次 enhance 全量重扫 + 用 pane 签名(children 里的 role=menuitem
		//   数量/模型 cell 文本)判断视图是否切换**，切换时清理 DONE 标记重挂。
		//   同时菜单关闭判定改为「游离出 document」而不是「没有 group」，否则
		//   面板在 root pane 下会被误关。
		//
		// 原则：组合优先，不移动/不删除 React 管理的节点——
		//   · 只在分组标题上加自定义 data-* 属性和监听（React 不管理这些）
		//   · 折叠用 CSS :has() 隐藏组内模型项；子面板是插件自建 DOM
		//   · 折叠状态存 localStorage，跨菜单开合记忆

		var STYLE_ID = "dsh-model-fold-style";
		var STORAGE_KEY = "dsh-model-fold-state-v1";
		var MODE_KEY = "dsh-model-fold-mode";
		var FOLD_ATTR = "data-msc-folded";
		var DONE_ATTR = "data-msc-done";
		var BADGE_ATTR = "data-msc-badge";
		var CURRENT_ATTR = "data-msc-current";
		// v0.4.3：记录上次增强时的菜单视图签名（root pane / model pane 切换检测）
		var SIG_ATTR = "data-msc-sig";
		// v0.4.3：分组标题的监听句柄表（Element → {mousedown,click,dblclick}）。
		// 用 WeakMap 避免持有已卸载节点。提前到常量区声明，确保任何调用点都可用。
		var handlerMap = new WeakMap();
		var PANEL_ID = "dsh-mf-panel";
		// inline 模式下，从未被用户操作过的分组默认折叠
		var DEFAULT_FOLDED = true;

		function loadState() {
			try {
				var raw = localStorage.getItem(STORAGE_KEY);
				var parsed = raw ? JSON.parse(raw) : null;
				return parsed && typeof parsed === "object" ? parsed : {};
			} catch (error) {
				return {};
			}
		}
		function saveState(state) {
			try {
				localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
			} catch (error) { /* 存储不可用时静默降级为会话内记忆 */ }
		}
		var foldState = loadState();

		function getMode() {
			try {
				return localStorage.getItem(MODE_KEY) === "inline" ? "inline" : "panel";
			} catch (error) {
				return "panel";
			}
		}
		function setMode(mode) {
			try { localStorage.setItem(MODE_KEY, mode); } catch (error) { /* 忽略 */ }
		}

		// ★ v0.4.7：子面板样式**逐项对齐官方** @deepseek-ai/dsh-client-ui-model-selection。
		//   官方规格（从官方 client.js 内联 CSS 抄录，类名前缀 Ns6z9q_）：
		//     .menu          padding:4px; border-radius 由 --dsw-* 提供; color:var(--dsw-alias-label-primary)
		//     .option        min-height:34px; gap:6px; padding:5px 7px; border-radius:var(--dsw-radius-md)
		//     .modelName     font-size:13px; font-weight:500; line-height:18px
		//     .groupTitle    font-size:11px; font-weight:500; line-height:16px;
		//                    color:var(--dsw-alias-label-tertiary); padding:4px 7px 2px
		//     .check         flex:0 0 14px; display:grid; color:var(--dsw-alias-label-primary)
		//     .selected      background:0 0  ← 官方选中态**不用背景色**
		//   一律使用官方 --dsw-* 主题变量，这样深浅主题、换肤都自动跟随，不再自算颜色。
		// \25BE = ▾（展开），\25B8 = ▸（折叠）；::before 画箭头、::after 显示组内模型数
		var CSS = [
			// ★ v0.4.7 第四次修正（2026-09-27）：**来源列表与子集清单尺寸统一**。
			//
			// 用户反馈：「上一级的模型来源要和子集展开统一」。
			// 官方原来的分工是 groupTitle(11px/500/16px) 当"小标题"、模型项
			// (13px/500/18px) 当"可选项"，字号故意拉开。但本插件把来源标题做成了
			// **可点击入口**（点它才展开子集），语义上它与子集里的模型项是同一级
			// 的"可选项"，视觉上就必须同一套尺寸，否则上一级显得又小又灰。
			//
			// 统一后的规格（与 .dsh-mf-item 完全一致）：
			//   字号 15px / 字重 600 / 行高 22px / 条目高 38px / 内距 8px 10px
			// 箭头与徽标同比放大，并保留「当前来源」的品牌色强调。
			'section[role="group"] > div:first-child{'
				+ 'box-sizing:border-box;display:flex;align-items:center;'
				+ 'min-height:38px;padding:8px 10px;gap:8px;'
				+ 'border-radius:var(--dsw-radius-md,7px);'
				+ 'font-size:15px;font-weight:600;line-height:22px;'
				+ 'color:var(--mf-fg,var(--dsw-alias-label-primary,#f0f2f5));'
				// ★ v0.4.7 第六次修正：「来源清单」与「子集清单」背景同色。
				//   两级条目都铺 --mf-bg（themeFrom 算出的不透明实色），
				//   于是上一级与下一级读起来是同一块底色，不再一深一浅。
				+ 'background:var(--mf-bg,transparent);'
				+ 'cursor:pointer;user-select:none;'
				+ '}',
			// 悬停：用 --mf-hover 半透明覆盖层，与子集条目完全同一处理
			'section[role="group"] > div:first-child:hover{background:var(--mf-hover,rgba(255,255,255,.10));}',
			// 选中态（「当前来源」）：与子集选中项同一套表现 —— 品牌色左条 + 淡底 + 加粗
			'section[role="group"] > div:first-child[' + CURRENT_ATTR + ']{'
				+ 'background:var(--mf-hover,rgba(255,255,255,.12));'
				+ 'font-weight:700;opacity:1;'
				+ 'border-left:3px solid var(--dsw-alias-brand-primary,#4f7cff);'
				+ 'padding-left:7px;'
				+ '}',
			// 折叠箭头：随字号同比放大（10px → 12px），并改为内联块参与 flex 布局
			'section[role="group"] > div:first-child::before{content:"\\25BE";display:inline-block;flex:0 0 auto;margin-right:2px;font-size:12px;line-height:22px;opacity:.75;transition:transform .15s ease;}',
			'section[role="group"] > div:first-child[' + FOLD_ATTR + ']::before{content:"\\25B8";}',
			// 模型数量徽标：与正文同字号（不再 .85em 缩小），仅降透明度作次要信息
			'section[role="group"] > div:first-child::after{content:attr(' + BADGE_ATTR + ');margin-left:auto;flex:0 0 auto;font-size:15px;font-weight:500;line-height:22px;opacity:.65;white-space:nowrap;}',
			// 「当前」组的徽标用品牌色高亮；箭头保持 ▸/▾（折叠状态提示优先于装饰）
			'section[role="group"] > div:first-child[' + CURRENT_ATTR + ']::after{color:var(--dsw-alias-brand-primary,#4f7cff);opacity:1;}',
			'section[role="group"]:has(> div[' + FOLD_ATTR + ']) > button[role="menuitemradio"]{display:none !important;}',
			// ── 右侧子面板 ──
			// v0.4.6：面板固定挂 document.body（对照灯箱插件的稳定做法），
			//   因此一律用 fixed + 视口坐标定位，不再有「相对菜单 absolute」分支。
			//   这样面板彻底脱离 React 的 portal 子树，不会被重渲染回收。
			//
			// ★ v0.4.7 第三次修正（2026-09-27，用户反馈「透明、勾选看不清、字太小不够粗」）：
			//   a) **背景绝不透明**：实测曾出现 bg=rgba(0,0,0,0)（抄菜单抄到空值）。
			//      CSS 这里不再只依赖 var()，而是把 themeFrom 计算出的不透明实色
			//      写到 --mf-bg 上并直接用作 background；var() 仅作二次兜底，
			//      其 fallback 也是**不透明实色**（深色 #1f2126），杜绝透底。
			//   b) **字号加大 + 加粗**：用户明确要求。模型名 13px/500 → 15px/600；
			//      行高 18 → 22；条目高度 34 → 38。分组标题 11 → 13px/600。
			//   c) **勾选明显**：✓ 加大到 16px、加粗、用品牌色，并给选中项加
			//      左侧色条与淡底，让「选了哪个」一眼可辨（不再靠透明底上的 ✓）。
			"#" + PANEL_ID + "{"
				+ "position:fixed;z-index:2147483000;"
				+ "min-width:min(240px,100vw - 32px);max-width:min(340px,100vw - 32px);"
				+ "max-height:min(380px,100vh - 96px);"
				+ "overflow-y:auto;overflow-x:hidden;padding:4px;"
				+ "background:var(--mf-bg,#1f2126);"
				+ "background-color:var(--mf-bg,#1f2126);"
				+ "border-radius:var(--dsw-radius-lg,10px);"
				+ "border:1px solid var(--mf-border,rgba(128,128,128,.28));"
				+ "box-shadow:var(--dsw-elevation-prominent,0 10px 32px rgba(0,0,0,.35));"
				+ "color:var(--mf-fg,var(--dsw-alias-label-primary,#f0f2f5));"
				+ "font-family:inherit;"
				+ "transform:translateX(14px);opacity:0;"
				+ "transition:transform .18s ease,opacity .18s ease;"
				+ "pointer-events:none;visibility:hidden;"
				+ "}",
			"#" + PANEL_ID + ".dsh-mf-open{transform:none;opacity:1;pointer-events:auto;visibility:visible;}",
			// 条目：加大字号与高度（用户要求「字大一点、粗一点」）
			"#" + PANEL_ID + " .dsh-mf-item{"
				+ "box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;"
				+ "gap:8px;padding:8px 10px;min-height:38px;"
				+ "border-radius:var(--dsw-radius-md,7px);"
				+ "font-size:15px;font-weight:600;line-height:22px;"
				+ "cursor:pointer;white-space:nowrap;max-width:100%;"
				+ "color:inherit;background:0 0;border:none;outline:none;"
				+ "}",
			// 悬停：用不透明一档的底色，避免"半透明看着像读不清"
			"#" + PANEL_ID + " .dsh-mf-item:hover{background:var(--mf-hover,rgba(255,255,255,.12));}",
			// 模型名：15px / 600 / 22px（用户要求加大加粗）
			"#" + PANEL_ID + " .dsh-mf-item .dsh-mf-name{"
				+ "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
				+ "font-size:15px;font-weight:600;line-height:22px;color:inherit;"
				+ "}",
			// 勾选：加大到 16px、加粗、品牌色，选中时更醒目（解决"勾选看不清"）
			"#" + PANEL_ID + " .dsh-mf-item .dsh-mf-check{"
				+ "flex:0 0 18px;display:grid;place-items:center;"
				+ "color:var(--mf-fg,var(--dsw-alias-label-primary,#f0f2f5));"
				+ "font-size:16px;font-weight:700;line-height:22px;"
				+ "}",
			// 选中项：官方 .Ns6z9q_selected 本身是 background:0 0（不铺底色）。
			//   但用户反馈「勾选看不清」，所以这里在**保持不透明**的前提下，
			//   用极淡底 + 左侧品牌色条 + 品牌色 ✓ 三重强调，任何主题都能认出选中项。
			"#" + PANEL_ID + " .dsh-mf-item.dsh-mf-selected{"
				+ "background:var(--mf-hover,rgba(255,255,255,.12));"
				+ "font-weight:700;"
				+ "color:var(--mf-fg,var(--dsw-alias-label-primary,#f0f2f5));"
				+ "border-left:3px solid var(--dsw-alias-brand-primary,#4f7cff);"
				+ "padding-left:7px;"
				+ "}",
			"#" + PANEL_ID + " .dsh-mf-item.dsh-mf-selected .dsh-mf-check{"
				+ "color:var(--dsw-alias-brand-primary,#4f7cff);"
				+ "}",
			// 标题头：加大字号（用户要求），保持官方三级标签色语义
			"#" + PANEL_ID + " .dsh-mf-header{"
				+ "display:flex;align-items:center;justify-content:space-between;gap:8px;"
				+ "padding:6px 10px 8px;margin-bottom:4px;"
				+ "font-size:13px;font-weight:600;line-height:18px;"
				+ "color:var(--mf-tertiary,var(--dsw-alias-label-tertiary,rgba(160,160,160,.95)));"
				+ "border-bottom:1px solid var(--mf-border,rgba(128,128,128,.20));"
				+ "}",
			"#" + PANEL_ID + " .dsh-mf-header .dsh-mf-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;}",
			"#" + PANEL_ID + " .dsh-mf-header .dsh-mf-count{flex-shrink:0;font-weight:500;}"
		].join("\n");

		function ensureStyle() {
			if (document.getElementById(STYLE_ID)) return;
			var style = document.createElement("style");
			style.id = STYLE_ID;
			style.textContent = CSS;
			document.head.appendChild(style);
		}

		// ── 右侧子面板（插件自建 DOM，与 React 完全隔离）──
		var panelEl = null;
		var panelAnchor = null; // 记录当前面板对应的真实按钮列表，用于镜像点击
		var panelKey = null;    // 当前面板对应的来源名（再次点击同一来源 = 关闭）
		// ★ v0.4.5：记录面板原本所属的菜单节点，用于「被 React 摘掉后精确重挂」。
		//   不记它的话，页面上若同时存在多个 div[role="menu"]，重挂可能挂错菜单。
		var panelHost = null;

		function styleOf(el) {
			try { return window.getComputedStyle(el); } catch (error) { return null; }
		}

		function ensurePanel(menuEl) {
			// ★ v0.4.6 架构修正（2026-09-27，对照同族插件 dsh-chat-image-lightbox）：
			//
			// v0.4.4 曾把面板挂进 div[role="menu"]，以便官方 closeOutside 的
			//   `menuRef.contains(target)` 放行。但官方的菜单是 **React portal 子树**：
			//     open && createPortal(<MenuSurface ref={menuRef} role="menu"/>, document.body)
			//   React 任何重渲染都会重建这棵子树，把插件 append 的非 React 子节点
			//   一并移除 ⇒ 用户看到面板「一闪而过」。这正是本插件长期症状的根因。
			//
			// 对照灯箱插件（@loyalchiiina/dsh-chat-image-lightbox，同族、弹出稳定）：
			//   · 浮层一律 appendChild 到 document.body，绝不进 React 管理的节点；
			//   · 不依赖官方 closeOutside/onBlur，也不读 menuRef/rootRef；
			//   · 外部点击关闭由自己监听 document mousedown + contains() 完成。
			//   实测灯箱源码中 closeOutside/onBlur/relatedTarget 出现次数均为 0。
			//
			// 因此这里改为同一策略：面板固定挂 body，脱离 React 的回收范围。
			// 外部点击关闭改由 start() 里的 onDocClick 负责——它已经用
			//   `menuEl.contains(target)` 放行「点在菜单内」的情况，语义等价且更稳。
			var host = document.body;
			if (panelEl && panelEl.parentNode === host && host.contains(panelEl)) return panelEl;

			if (!panelEl) {
				panelEl = document.createElement("div");
				panelEl.id = PANEL_ID;
				// v0.4.6：面板 **不** 设 tabindex、也绝不主动 focus。
				//
				// 官方 ModelSelect 在根节点上装了 onBlur：
				//   if (relatedTarget 在 rootRef|menuRef 内) return; close();
				// 面板挂在 document.body，不在 rootRef/menuRef 内。
				// 因此 **焦点一旦进入面板，就等于「焦点离开菜单」→ 官方 close()
				// → 菜单卸载、面板随之消失**（这正是长期「一闪而过」的直接成因之一）。
				//
				// v0.4.5 曾给面板/面板项加 tabindex 并主动 focus()，那是基于
				// 「面板挂在 menu 内」的旧前提（当时 contains 为真、能放行）。
				// v0.4.6 改挂 body 后该前提失效，这些焦点操作反而成了杀手，故全部移除。
				//
				// 正确做法（对照灯箱插件的非模态浮层）：让焦点 **留在菜单内** ——
				// 由 start() 里注册的捕获期 mousedown 处理器 preventDefault()，
				// 阻止默认的焦点转移。这与官方自己对按钮的处理同源
				// （官方 onMouseDown: closest("button") 时 preventDefault 保焦点）。
				panelEl.addEventListener("mousedown", function (event) {
					event.stopPropagation();
				});
				panelEl.addEventListener("click", function (event) {
					event.stopPropagation();
				});
			}
			// 挂载（或从旧宿主迁移到新宿主——React 重建菜单节点时需要）
			attachPanelTo(host);
			return panelEl;
		}

		// ★ v0.4.6：面板固定挂在 document.body 上（对照灯箱插件的稳定做法）。
		//   不再挂进 React 的 div[role="menu"]，因此不会被 React 重渲染回收，
		//   也不需要 inmenu/absolute 那套相对菜单定位。定位一律用 fixed 视口坐标。
		//   保留本函数是为了给 enhance 的兜底重挂一个统一入口。
		function attachPanelTo(host) {
			if (!panelEl) return;
			var target = host && host !== document.body && host.nodeType === 1 ? host : document.body;
			if (panelEl.parentNode !== target) target.appendChild(panelEl);
			panelHost = target;
			panelEl.removeAttribute("data-mf-inmenu");
		}

		function closePanel() {
			panelKey = null;
			panelAnchor = null;
			if (panelEl) panelEl.classList.remove("dsh-mf-open");
		}

		// 取色工具：把颜色字符串解析成 {r,g,b,a}。
		//
		// ★ 必须同时支持 rgb()/rgba() **和 8 位 hex**（#rrggbbaa）。
		//   实测（06:34:47）官方菜单专用色是 `#43454a73` —— 8 位 hex，结尾 73
		//   是 alpha(≈45%)。旧版只认 rgb()/rgba()，于是解析失败、拿不到官方
		//   菜单真色，面板只能退到祖先底色 → **比菜单暗**，这就是「背景颜色
		//   不一致」的根因。
		function parseColor(value) {
			if (!value || typeof value !== "string") return null;
			var s = value.trim();
			// ① rgb() / rgba()
			var m = s.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/);
			if (m) {
				var a1 = m[4] === undefined ? 1 : parseFloat(m[4]);
				if (!(a1 > 0.05)) return null; // 近乎全透明 = 没有可见颜色
				return { r: +m[1], g: +m[2], b: +m[3], a: a1 };
			}
			// ② #rgb / #rgba / #rrggbb / #rrggbbaa
			var h = s.match(/^#([0-9a-f]{3,8})$/i);
			if (h) {
				var hex = h[1];
				if (hex.length === 3 || hex.length === 4) {
					hex = hex.split("").map(function (ch) { return ch + ch; }).join("");
				}
				if (hex.length === 6) hex += "ff";
				if (hex.length !== 8) return null;
				var a2 = parseInt(hex.slice(6, 8), 16) / 255;
				if (!(a2 > 0.05)) return null;
				return {
					r: parseInt(hex.slice(0, 2), 16),
					g: parseInt(hex.slice(2, 4), 16),
					b: parseInt(hex.slice(4, 6), 16),
					a: a2
				};
			}
			return null;
		}

		// 感知亮度（0=黑 1=白）。用于兜底判断「该配深字还是浅字」。
		function luminance(c) {
			if (!c) return null;
			return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
		}

		// ★ v0.4.7（2026-09-27，第二次修正）：必须拿到**不透明**底色。
		//
		// 实测日志（06:27:53）暴露的问题：
		//     THEME bg=rgba(0,0,0,0)  color=rgb(15,17,21)
		//   面板背景是**全透明**，文字却是**近黑色** → 在深色页面上完全看不清，
		//   勾选标记（✓）也糊在背景里。
		//
		// 真因：官方菜单的 backgroundColor 本身就是 transparent（颜色来自
		//   `--dsw-specific-menu` 变量），而该变量在菜单节点上未必解析出值，
		//   于是「抄菜单背景」抄到了一个空值，文字色却照抄成功 → 黑字落透明底。
		//
		// 修正策略（层层兜底，最终一定得到不透明实色）：
		//   ① 官方变量 --dsw-specific-menu / --dsw-alias-bg-l2 / --dsw-alias-bg-l1
		//   ② 菜单自身 backgroundColor（若确非透明）
		//   ③ 沿祖先链向上找第一个非透明背景（浮层下面总能找到宿主底色）
		//   ④ 按「当前主题深浅」硬兜底（深色 #1f2126 / 浅色 #ffffff）—— 保证可用
		function firstOpaqueBackground(startEl) {
			var node = startEl;
			var guard = 0;
			while (node && node.nodeType === 1 && guard < 40) {
				guard++;
				var st = styleOf(node);
				var c = st ? parseColor(st.backgroundColor) : null;
				if (c) return { css: st.backgroundColor, rgb: c };
				node = node.parentElement;
			}
			return null;
		}
		// ★ v0.4.7 第五次修正（2026-09-27，用户反馈「背景颜色要一致」）：
		//
		// 实测对照（插件自报，06:34:47）：
		//     面板 bg        = rgb(21,21,23)          ← 我当时直接用的祖先底色
		//     官方菜单 bg     = rgba(0,0,0,0)          ← 透明
		//     官方变量        = --dsw-specific-menu: #43454a73
		//     祖先链背景      = rgb(21,21,23)
		//
		// 关键：`#43454a73` 结尾的 `73` 是 **alpha = 0x73/255 ≈ 45%**。
		//   官方菜单就是"45% 的 #43454a 叠在页面底色上"，看起来比底色亮一档。
		//   而面板若直接用不透明的 rgb(21,21,23)，就会比菜单**暗**，于是"颜色不一致"。
		//
		// 正解：把半透明色**按 alpha 合成到祖先底色上**，得到「看起来一模一样、
		//   但完全不透明」的等价色。这样既与菜单视觉一致，又不会透出下层内容。
		function blendOver(top, bottom) {
			if (!top) return bottom;
			if (!bottom) return { r: top.r, g: top.g, b: top.b, a: 1 };
			var a = top.a === undefined ? 1 : top.a;
			if (a >= 1) return { r: top.r, g: top.g, b: top.b, a: 1 };
			return {
				r: top.r * a + bottom.r * (1 - a),
				g: top.g * a + bottom.g * (1 - a),
				b: top.b * a + bottom.b * (1 - a),
				a: 1
			};
		}
		function rgbToCss(c) {
			if (!c) return "";
			return "rgb(" + Math.round(c.r) + "," + Math.round(c.g) + "," + Math.round(c.b) + ")";
		}
		// 把官方菜单"看到的颜色"（可能是半透明）合成成不透明等价色。
		// 顺序：官方上层色 → 叠在祖先实色上；没有任何实色时按主题兜底。
		function resolveMenuSurfaceColor(menuEl, menuStyle, fallbackRgb) {
			var layers = [];
			// ① 官方菜单专用色（实测就是它是真正的"菜单底色来源"）
			var specific = menuStyle ? parseColor(menuStyle.getPropertyValue("--dsw-specific-menu")) : null;
			if (specific) layers.push(specific);
			// ② 菜单自身可见背景
			if (menuStyle) {
				var ownBg = parseColor(menuStyle.backgroundColor);
				if (ownBg) layers.push(ownBg);
			}
			// ③ 语义背景层级（若 ①② 都没有）
			if (!layers.length && menuStyle) {
				var names = ["--dsw-alias-bg-l3", "--dsw-alias-bg-l2", "--dsw-alias-bg-l1"];
				for (var i = 0; i < names.length && !layers.length; i++) {
					var v = parseColor(menuStyle.getPropertyValue(names[i]));
					if (v) layers.push(v);
				}
			}
			// 底层：祖先链上第一个不透明背景，否则主题兜底色
			var anc = firstOpaqueBackground(menuEl ? menuEl.parentElement : null);
			var base = anc ? anc.rgb : fallbackRgb;
			if (!layers.length) return { css: rgbToCss(base), rgb: base, source: anc ? "ancestor" : "fallback" };

			// 逐层自下而上合成（layers[0] 是最上面的那层）
			var out = base;
			for (var k = layers.length - 1; k >= 0; k--) out = blendOver(layers[k], out);
			return { css: rgbToCss(out), rgb: out, source: "menu-surface" };
		}

		// 页面整体是深色还是浅色：用 body/computed 文字色或背景色判断
		function pageIsDark() {
			try {
				var el = document.body || document.documentElement;
				var st = styleOf(el);
				if (!st) return true;
				var bg = parseColor(st.backgroundColor);
				if (bg) return luminance(bg) < 0.5;
				// 背景透明时用文字色反推（浅字 → 深底）
				var fg = parseColor(st.color);
				if (fg) return luminance(fg) > 0.5;
			} catch (e) {}
			return true; // DSH 默认深色
		}
		var DARK_FALLBACK = { bg: "rgb(31,33,38)", fg: "rgb(240,242,245)", tertiary: "rgb(150,154,162)", hover: "rgba(255,255,255,0.10)" };
		var LIGHT_FALLBACK = { bg: "rgb(255,255,255)", fg: "rgb(15,17,21)", tertiary: "rgb(120,124,132)", hover: "rgba(0,0,0,0.06)" };

		// 官方 @deepseek-ai/dsh-client-ui-model-selection 用 --dsw-* 变量上色。
		// 面板挂在 body（不在菜单子树内），变量不会自动继承，需显式拷贝。
		var DS_VARS = [
			"--dsw-alias-label-primary",
			"--dsw-alias-label-secondary",
			"--dsw-alias-label-tertiary",
			"--dsw-alias-border-l1",
			"--dsw-alias-border-l2",
			"--dsw-alias-bg-l1",
			"--dsw-alias-bg-l2",
			"--dsw-alias-bg-l3",
			"--dsw-specific-menu",
			"--dsw-alias-brand-primary",
			"--dsw-radius-sm",
			"--dsw-radius-md",
			"--dsw-radius-lg",
			"--dsw-elevation-prominent",
			"--dsw-elevation-stroke-color"
		];

		function themeFrom(menuEl, selectedBtn) {
			var panel = ensurePanel(menuEl);
			var menuStyle = menuEl ? styleOf(menuEl) : null;

			// 1) 先拷贝官方变量（能拷贝多少算多少，用于字色/圆角跟随主题）
			if (menuStyle) {
				for (var i = 0; i < DS_VARS.length; i++) {
					var name = DS_VARS[i];
					var val = menuStyle.getPropertyValue(name);
					if (val && val.trim()) panel.style.setProperty(name, val.trim());
				}
			}

			// 2) 底色：取**官方菜单"看到的颜色"**，并合成成不透明等价色。
			//    这样既与菜单颜色一致（用户要求「背景颜色要一致」），
			//    又保证不透明（用户明确「不要弄透明背景」）。
			var dark = pageIsDark();
			var fb = dark ? DARK_FALLBACK : LIGHT_FALLBACK;
			var surface = resolveMenuSurfaceColor(menuEl, menuStyle, parseColor(fb.bg));
			var bgCss = surface.css || fb.bg;
			panel.style.background = bgCss;
			panel.style.backgroundColor = bgCss;
			// 同步给 CSS 变量：CSS 里的 background:var(--mf-bg,...) 以此为准。
			panel.style.setProperty("--mf-bg", bgCss);
			panel.style.setProperty("--mf-border", dark ? "rgba(255,255,255,.18)" : "rgba(0,0,0,.14)");

			// 3) 文字色：以实际底色亮度为准（不再盲抄菜单文字色）。
			//    这样即使底色来自兜底，字色也一定与之形成对比，杜绝黑字落深底。
			var bgRgb = parseColor(bgCss) || parseColor(fb.bg);
			var bgLum = luminance(bgRgb);
			var fgCss = bgLum < 0.5 ? fb.fg : (dark ? fb.fg : fb.fg);
			// 若官方提供了主标签色且与底色有足够对比，优先用官方色（视觉更统一）
			if (menuStyle) {
				var lv = menuStyle.getPropertyValue("--dsw-alias-label-primary");
				var lc = parseColor(lv);
				if (lc && Math.abs(luminance(lc) - bgLum) > 0.35) fgCss = lv.trim();
			}
			panel.style.color = fgCss;
			panel.style.setProperty("--dsw-alias-label-primary", fgCss);
			panel.style.setProperty("--mf-fg", fgCss);
			panel.style.setProperty("--mf-tertiary", dark ? DARK_FALLBACK.tertiary : LIGHT_FALLBACK.tertiary);
			panel.style.setProperty("--mf-hover", dark ? DARK_FALLBACK.hover : LIGHT_FALLBACK.hover);
			panel.setAttribute("data-mf-dark", dark ? "1" : "0");

			// ★ v0.4.7 关键：把这套主题变量**同时写到官方菜单节点**上。
			//
			//   来源清单的条目（section[role="group"] > div:first-child）位于**官方
			//   菜单子树**内，不在面板里，因此它读不到面板上的 --mf-bg / --mf-fg。
			//   要让「上一级来源清单」与「下一级子集」背景同色，必须把同一份变量
			//   也写到菜单元素上——CSS 变量沿 DOM 继承，写在菜单上即可覆盖整棵子树。
			applyMenuTheme(menuEl);

			// 圆角跟随官方菜单
			var radius = menuStyle && menuStyle.borderRadius ? menuStyle.borderRadius : "";
			if (radius) panel.style.borderRadius = radius;

			// 选中项：官方 .Ns6z9q_selected 是 background:0 0，沿用同语义（靠 ✓ 表意）。
			panel.removeAttribute("data-mf-selbg");
			void selectedBtn;
		}

		// 计算并注入菜单级主题变量（供来源清单使用）。
		// 与面板共用同一套取值逻辑，保证两级配色**完全一致**。
		function applyMenuTheme(menuEl) {
			if (!menuEl || menuEl.nodeType !== 1) return;
			try {
				var menuStyle = styleOf(menuEl);
				var dark = pageIsDark();
				var fb = dark ? DARK_FALLBACK : LIGHT_FALLBACK;
				var surface = resolveMenuSurfaceColor(menuEl, menuStyle, parseColor(fb.bg));
				var bgCss = surface.css || fb.bg;
				var bgRgb = parseColor(bgCss) || parseColor(fb.bg);
				var bgLum = luminance(bgRgb);
				var fgCss = bgLum < 0.5 ? fb.fg : (dark ? fb.fg : fb.fg);
				// 若官方主标签色与底色对比足够，优先用它（视觉更贴近官方）
				var lv = menuStyle ? menuStyle.getPropertyValue("--dsw-alias-label-primary") : "";
				var lc = parseColor(lv);
				if (lc && Math.abs(luminance(lc) - bgLum) > 0.35) fgCss = lv.trim();

				// 只在值变化时写，避免每次 enhance 都触发无谓的样式失效
				var sig = bgCss + "|" + fgCss + "|" + (dark ? 1 : 0);

				menuEl.style.setProperty("--mf-bg", bgCss);
				menuEl.style.setProperty("--mf-fg", fgCss);
				menuEl.style.setProperty("--mf-tertiary", dark ? DARK_FALLBACK.tertiary : LIGHT_FALLBACK.tertiary);
				menuEl.style.setProperty("--mf-hover", dark ? DARK_FALLBACK.hover : LIGHT_FALLBACK.hover);
				menuEl.style.setProperty("--mf-border", dark ? "rgba(255,255,255,.18)" : "rgba(0,0,0,.14)");
				menuEl.setAttribute("data-mf-themed", "1");
			} catch (e) { /* 注入失败不应阻断扫描 */ }
		}

		function openPanel(menuEl, title, section) {
			var buttons = section.querySelectorAll('button[role="menuitemradio"]');
			var selectedBtn = section.querySelector('button[aria-checked="true"]');

			var panel = ensurePanel(menuEl);
			themeFrom(menuEl, selectedBtn);
			panel.innerHTML = "";
			panelAnchor = [];

			var selBg = panel.getAttribute("data-mf-selbg");
			// v0.4.7：面板顶部加一个来源标题头，让「这块是哪个来源的子集」一目了然。
			// 之前没有标题头，用户在深色主题下看到一片深色条目，更难辨认。
			var header = document.createElement("div");
			header.className = "dsh-mf-header";
			var hTitle = document.createElement("span");
			hTitle.className = "dsh-mf-title";
			hTitle.textContent = (title.textContent || "").trim();
			hTitle.title = hTitle.textContent;
			var hCount = document.createElement("span");
			hCount.className = "dsh-mf-count";
			hCount.textContent = buttons.length + " 个模型";
			header.appendChild(hTitle);
			header.appendChild(hCount);
			panel.appendChild(header);
			for (var i = 0; i < buttons.length; i++) {
				(function (realBtn) {
					var item = document.createElement("div");
					item.className = "dsh-mf-item" + (realBtn.getAttribute("aria-checked") === "true" ? " dsh-mf-selected" : "");
					// v0.4.6：面板项 **不** 设 tabindex。
					//   官方在 ModelSelect 根节点上有 onBlur：
					//     if (relatedTarget 在 rootRef|menuRef 内) return; close();
					//   面板现已挂 document.body，不在 rootRef/menuRef 内。
					//   若让面板项可聚焦，点击时焦点会移入面板 → relatedTarget 为面板节点
					//   → 两个 contains 均为 false → 官方 close() → 菜单连同面板一起关。
					//   这与 v0.4.5 的前提（面板挂在 menu 内、contains 为真）正好相反，
					//   所以那里加的 tabindex 在本版本必须去掉。
					//   焦点问题改由「面板内 mousedown 阻止默认」解决（见 start()），
					//   它阻止焦点转移，relatedTarget 保持为菜单内的元素 → 放行。
					// v0.4.7：**不** 再给选中项铺内联背景色。
					//   旧版这里写 item.style.background = selBg（选中按钮的背景），
					//   深色主题下该值是深色，叠加在同样深色的面板上就成了黑底黑字。
					//   现在选中态完全由 CSS 品牌色描边表达（见 CSS 段），文字色
					//   继承 themeFrom 依据底色亮度推算出的可读色。
					//   selBg 仅作为「确有对比度差异」时的可选强调，这里不再使用。
					void selBg;
					var name = document.createElement("span");
					name.className = "dsh-mf-name";
					name.textContent = (realBtn.textContent || "").trim();
					name.title = name.textContent;
					var check = document.createElement("span");
					check.className = "dsh-mf-check";
					check.textContent = realBtn.getAttribute("aria-checked") === "true" ? "✓" : "";
					item.appendChild(name);
					item.appendChild(check);
					item.addEventListener("click", function (event) {
						event.stopPropagation();
						// 程序化点击真实按钮：选择仍由原组件完成，React 状态保持一致
						realBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
						closePanel();
					});
					panelAnchor.push(realBtn);
					panel.appendChild(item);
				})(buttons[i]);
			}

			// 定位（v0.4.6）：面板固定挂 body，一律用 **fixed + 视口坐标**。
			//   位置 = 菜单右侧 8px，与被点标题顶部对齐；右侧放不下则换到菜单左侧；
			//   上下越界则回收进视口。不再有「相对菜单 absolute」那条分支。
			var menuRect = menuEl.getBoundingClientRect();
			var titleRect = title.getBoundingClientRect();
			panel.classList.add("dsh-mf-open");
			panel.style.visibility = "hidden"; // 先渲染再测量，避免闪现
			panel.style.left = "0px";
			panel.style.top = "0px";
			var pw = panel.offsetWidth;
			var ph = panel.offsetHeight;
			var left = menuRect.right + 8;
			if (left + pw > window.innerWidth - 10) left = Math.max(10, menuRect.left - pw - 8); // 右侧放不下则换左侧
			var top = Math.min(titleRect.top - 4, window.innerHeight - ph - 12);
			top = Math.max(10, top);
			panel.style.left = Math.round(left) + "px";
			panel.style.top = Math.round(top) + "px";
			panel.style.visibility = "";
			var key = (title.textContent || "").trim();
			panelKey = key;
			// 触发从右侧滑入的过渡动画
			panel.classList.remove("dsh-mf-open");
			void panel.offsetWidth;
			panel.classList.add("dsh-mf-open");
			// v0.4.6：**不**把焦点移进面板。
			//   官方 onBlur：relatedTarget 不在 rootRef|menuRef 内就 close()。
			//   面板挂 body，焦点一旦进来就等于「离开菜单」→ 菜单被关、面板随之消失。
			//   正确做法是让焦点留在菜单内：由 start() 里「面板内 mousedown 阻止默认」
			//   来保持焦点不转移（等价于官方自己对按钮做的 preventDefault）。
		}

		function foldKeyOf(title, headingId) {
			return (title.textContent || "").trim() || headingId || "group";
		}

		// 按当前模式计算折叠初始状态：panel 模式下真实按钮始终隐藏（子面板负责展示）；
		// inline 模式下含当前选中模型的组强制展开，其余按用户记忆，无记忆默认折叠
		// ★ v0.4.7 关键修复（2026-09-27，「一闪而过」的真凶）：
		//   折叠靠 CSS `section:has(>div[FOLD_ATTR]) > button{display:none}` 隐藏
		//   真实模型按钮。而官方 ModelSelect 在进入模型列表后会**主动把焦点放到
		//   「当前选中」的那个模型按钮上**（paneFocus 效果）。两者一撞：
		//     官方聚焦某按钮 → 插件把该按钮 display:none → 浏览器强制失焦
		//     → 官方 rootRef 的 onBlur 收到 relatedTarget=null
		//     → `relatedTarget instanceof Node` 为 false → close() → 菜单连同
		//       模型列表一起消失。
		//   真实点击日志（2026-09-27 05:01:37）逐帧对应：
		//     37.496 焦点落到 BUTTON[role=menuitemradio]
		//     37.623 processGroup 折叠 9 个来源（把那个按钮藏了）
		//     37.691 focusout related=null activeEl=BODY   ← 强制失焦
		//     37.751 菜单关闭                              ← 官方 onBlur
		//
		//   解法：在隐藏之前，若焦点正落在将被隐藏的分组内，先把焦点移回菜单
		//   trigger。trigger 位于 rootRef 之内，onBlur 的 relatedTarget 检查
		//   会放行（`rootRef.contains(rt)` 为真 → return，不关菜单）。
		//   这样"隐藏"就不再制造任何失焦事件。
		function triggerOf(menu) {
			try {
				var id = menu && menu.getAttribute ? menu.getAttribute("id") : null;
				if (id) {
					// 官方 trigger 的 aria-controls 指向 `${id}-menu`，天然一一对应
					var byControls = document.querySelector('button[aria-controls="' + id + '"]');
					if (byControls) return byControls;
				}
				return document.querySelector('button[aria-haspopup="menu"][aria-expanded="true"]');
			} catch (error) {
				return null;
			}
		}
		function preserveFocusBeforeHide(section) {
			try {
				if (!section) return;
				var active = document.activeElement;
				if (!active || active === document.body || !section.contains(active)) return;
				var menu = section.closest ? section.closest('div[role="menu"]') : null;
				var trigger = triggerOf(menu);
				if (!trigger) return;
				trigger.focus({ preventScroll: true });
			} catch (error) { /* 保焦点失败不应阻断折叠 */ }
		}

		function applyInitialFold(section, title, key) {
			if (getMode() === "panel") {
				preserveFocusBeforeHide(section);
				title.setAttribute(FOLD_ATTR, "1");
				return;
			}
			var hasSel = section.querySelector('button[aria-checked="true"]') !== null;
			var folded;
			if (hasSel) folded = false;
			else if (Object.prototype.hasOwnProperty.call(foldState, key)) folded = !!foldState[key];
			else folded = DEFAULT_FOLDED;
			if (folded) {
				preserveFocusBeforeHide(section);
				title.setAttribute(FOLD_ATTR, "1");
			} else {
				title.removeAttribute(FOLD_ATTR);
			}
		}

		function resetMenuGroups(menuEl) {
			var groups = menuEl.querySelectorAll('section[role="group"]');
			for (var j = 0; j < groups.length; j++) {
				var headingId = groups[j].getAttribute("aria-labelledby");
				var t = headingId ? document.getElementById(headingId) : null;
				if (!t) t = groups[j].querySelector(":scope > div:first-child");
				if (!t) continue;
				// 注意：绝不清 DONE —— 它代表"监听器已挂"；这里只重算折叠状态
				t.removeAttribute(FOLD_ATTR);
				t.removeAttribute(CURRENT_ATTR);
				applyInitialFold(groups[j], t, foldKeyOf(t, headingId));
			}
			enhance(); // 刷新徽标 / 选中标记
		}

		function processGroup(menuEl, section) {
			var headingId = section.getAttribute("aria-labelledby");
			var title = headingId ? document.getElementById(headingId) : null;
			if (!title) title = section.querySelector(":scope > div:first-child");
			if (!title) return;

			// 徽标（组内模型数）每次都刷新：目录重拉后数量可能变化。
			// v0.4.0：含当前选中的组不再只标 ✓，而是「(当前) · 模型名」——
			// 总集（来源列表）一眼看出当前用的是哪个来源的哪个模型；
			// 子面板内的逐项 ✓ 保持不变。
			var buttons = section.querySelectorAll('button[role="menuitemradio"]')
			var selectedBtn = section.querySelector('button[aria-checked="true"]')
			if (selectedBtn) {
				var selName = (selectedBtn.textContent || "").trim()
				if (selName.length > 28) selName = selName.slice(0, 27) + "…"
				title.setAttribute(BADGE_ATTR, "(当前" + (buttons.length ? "·" + buttons.length : "") + ")" + (selName ? " " + selName : ""))
				title.setAttribute(CURRENT_ATTR, "1")
			} else {
				title.setAttribute(BADGE_ATTR, "(" + buttons.length + ")")
				title.removeAttribute(CURRENT_ATTR)
			}

			title.setAttribute(DONE_ATTR, "1");

			var key = foldKeyOf(title, headingId);
			applyInitialFold(section, title, key);

			title.title = getMode() === "panel"
				? "单击：右侧展开该来源的模型子面板｜双击：切换为列表内展开"
				: "点击折叠/展开该来源的全部模型｜双击：切换为右侧子面板";

			// 修复（2026-09-12）：组标题是 React 管理的不可聚焦 div。mousedown 默认
			// 会把焦点从菜单 trigger 移走，触发 ModelSelect rootRef 的 onBlur →
			// close()——菜单在 openPanel 之前就被 React 关掉，子面板永远弹不出来。
			// 只阻止默认焦点转移；click 事件照常派发，由下方 click 监听处理折叠/面板。
			//
			// v0.4.3：改为具名句柄 + attachGroupHandlers（先摘再挂），
			// 使 pane 切换重扫时不会叠加监听。
			// ★ v0.4.7 根治（2026-09-27）：**不再往来源标题节点挂监听**。
			//
			// 旧做法（v0.4.3~v0.4.6）把 mousedown/click/dblclick 直接挂在标题 div
			// 上，用 handlerMap(WeakMap) 记句柄。但标题是 **React 管理**的节点：
			// pane 切换或任何重渲染都可能换新节点，监听器留在旧节点上，用户点的是
			// 新节点 ⇒ 点击永不触发（实测日志 onTitleClick 0 次），表现为
			// 「点了没反应 / 一闪而过」。
			//
			// 新做法：由 start() 里注册的 **document 级事件委托**
			// （onDocTitleClick / onDocTitleDbl）统一处理，与官方「思考等级」pane
			// 稳定的原理同源——事件不依赖具体节点身份，React 怎么换都能命中。
			// 焦点保护同源上移到 start() 的 onDocMouseDown。
		}

		// pane 签名：DSH 2.0.15-next 的两级菜单里，root pane 与 model pane
		// 共用同一个 div[role="menu"] 节点（React 就地换 children）。用
		// 「子节点结构 + role 组合」做签名，签名变化 = 视图切换 = 需要重挂监听。
		//
		// 设计约束（务必保持稳定，否则会误判为切换 → 重复挂监听）：
		//   · 不能把「文本内容/长度」放进签名——徽标是我们自己写进 title 的
		//     data-* 属性（不影响 textContent），但 React 重渲染时文本可能变化，
		//     放进去会导致签名抖动 → 反复 resetView → 监听叠加。
		//   · 只取「结构 + role + 类名」这类 React 决定、且在同一 pane 内稳定的量。
		function paneSignature(menu) {
			var parts = [];
			var kids = menu.children;
			for (var i = 0; i < kids.length; i++) {
				var kid = kids[i];
				// ★ v0.4.4：面板现在也是 menu 的子节点（方案A：挂进菜单以便
				// closeOutside 放行）。必须把面板排除出签名，否则面板开/关会让
				// 签名变化 → 误判为 pane 切换 → 反复 resetView → 监听抖动。
				if (kid.id === PANEL_ID) continue;
				parts.push(i + ":" + (kid.tagName || "") + ":" + (kid.getAttribute("role") || "") +
					":" + (kid.className && typeof kid.className === "string" ? kid.className : "-"));
			}
			// pane 的区别标志：root pane 有 role="menuitem" 的 cell；
			// model pane 有 section[role="group"]。两者数量组合足以区分三态
			// （root / model / effort），且在同 pane 内恒定。
			var cells = menu.querySelectorAll('button[role="menuitem"]').length;
			var groups = menu.querySelectorAll('section[role="group"]').length;
			return parts.join("|") + "#" + cells + "#" + groups;
		}

		// 菜单关闭判定：统一用「是否还挂在 document 内」，而不是「有没有 group」。
		// 旧写法在 root pane（无 group）下会把仍打开的菜单误判为已关闭 → 面板被误关。
		function isMenuAlive(menu) {
			return document.body.contains(menu) || (menu.ownerDocument && menu.ownerDocument.contains(menu));
		}

		// 视图切换时清理 React 复用节点上残留的插件标记，让监听可重新挂载。
		//
		// ⚠️ 两个必须同时成立的约束：
		//   1) 必须先清 DONE —— 否则 processGroup 会因 DONE 直接 return，
		//      新视图上永远不挂监听（v0.4.0 踩过的坑）。
		//   2) 清理前必须**先摘掉旧监听** —— 因为这里既清 DONE 又让
		//      processGroup 重挂，若不摘旧监听，React 复用同一节点时
		//      click/mousedown/dblclick 会逐次叠加（第 N 次切换挂 N 个）。
		//      旧实现靠「DONE 永不清」来规避叠加，本版必须清 DONE，
		//      所以改为显式保存并移除监听句柄。
		function resetView(menu) {
			var marked = menu.querySelectorAll("[" + DONE_ATTR + "]");
			for (var i = 0; i < marked.length; i++) {
				detachGroupHandlers(marked[i]);
				marked[i].removeAttribute(DONE_ATTR);
				marked[i].removeAttribute(FOLD_ATTR);
				marked[i].removeAttribute(CURRENT_ATTR);
				marked[i].removeAttribute(BADGE_ATTR);
			}
		}

		// 监听句柄表已在常量区声明（handlerMap）。

		function detachGroupHandlers(title) {
			var h = handlerMap.get(title);
			if (!h) return;
			try {
				if (h.mousedown) title.removeEventListener("mousedown", h.mousedown);
				if (h.click) title.removeEventListener("click", h.click);
				if (h.dblclick) title.removeEventListener("dblclick", h.dblclick);
			} catch (error) { /* 节点已卸载，忽略 */ }
			handlerMap.delete(title);
		}

		function attachGroupHandlers(title, handlers) {
			detachGroupHandlers(title); // 幂等：先摘再挂，绝不会叠加
			title.addEventListener("mousedown", handlers.mousedown);
			title.addEventListener("click", handlers.click);
			title.addEventListener("dblclick", handlers.dblclick);
			handlerMap.set(title, handlers);
		}

		function enhance() {
			var menus = document.querySelectorAll('div[role="menu"]');
			var aliveMenus = 0;
			for (var i = 0; i < menus.length; i++) {
				var menu = menus[i];
				if (!isMenuAlive(menu)) continue;
				aliveMenus += 1;

				// ★ v0.4.7（2026-09-27）：**先给菜单注入主题变量**，再处理分组。
				//
				//   来源清单（section[role="group"] > div:first-child）的配色全靠
				//   --mf-bg / --mf-fg 等变量。这些变量原先只在 openPanel()→themeFrom()
				//   里写入，意味着「必须先点开一次子面板，来源清单才有颜色」——
				//   用户看到的就是「上一级没颜色、下一级有颜色」。
				//   这里在每次扫描时就把变量写到菜单上（CSS 变量沿 DOM 继承，
				//   覆盖整棵菜单子树），来源清单一出现即为正确配色，且与子集同色。
				applyMenuTheme(menu);

				// ── 视图签名比对：pane 切换则重挂 ──
				var sig = paneSignature(menu);
				if (menu.getAttribute(SIG_ATTR) !== sig) {
					resetView(menu);
					menu.setAttribute(SIG_ATTR, sig);
				}

				// ★ v0.4.5（2026-09-27）「一闪而过」根治见循环外（下方统一处理）。

				// root pane（只有 role="menuitem" 的 cell，没有分组）：
				// 这不是插件的目标视图，且此时若面板开着说明用户刚点到
				// root，保持面板不动即可，不做任何增强。
				// 注意：只取「直属 menu 的分组」，排除面板内部（面板是 div，理论
				// 不会命中 section[role=group]，这里仍显式过滤以杜绝万一）。
				var groups = [];
				var allGroups = menu.querySelectorAll('section[role="group"]');
				for (var g = 0; g < allGroups.length; g++) {
					if (panelEl && panelEl.contains(allGroups[g])) continue;
					groups.push(allGroups[g]);
				}
				if (!groups.length) continue;
				for (var j = 0; j < groups.length; j++) processGroup(menu, groups[j]);
			}

			// ★ v0.4.6：面板固定挂 document.body（对照灯箱插件的稳定做法）。
			//   面板已脱离 React 的 portal 子树，理论上不会被 React 回收；
			//   这里保留一条兜底：若因任何原因（外部脚本、宿主清理）面板掉了，
			//   只要它仍处于打开状态就补挂回 body，避免用户看到「打开后消失」。
			if (panelEl && panelEl.classList.contains("dsh-mf-open")) {
				if (panelEl.parentNode !== document.body || panelEl.isConnected !== true) {
					attachPanelTo(document.body);
				}
			}

			// 菜单全部消失（选择完成/点击外部）而面板还开着 → 关闭
			if (!aliveMenus && panelEl && panelEl.classList.contains("dsh-mf-open")) {
				closePanel();
			}
		}

		function start() {
			ensureStyle();
			var timer = null;
			var observer = new MutationObserver(function () {
				if (timer) clearTimeout(timer);
				timer = setTimeout(enhance, 120);
			});
			if (document.body) {
				observer.observe(document.body, { childList: true, subtree: true });
			}
			// ★ v0.4.6 关键：面板挂 body 后，必须拦住官方的「点在外面」判定。
			//
			// 官方 ModelSelect 在 document 上装了捕获期 mousedown：
			//     if (rootRef.contains(t) || menuRef.contains(t)) return; setOpen(false)
			// 面板挂在 body，不在 rootRef/menuRef 内 ⇒ 官方会认为「点了外面」而关掉菜单。
			//
			// 做法（对照灯箱插件）：在 **document 捕获阶段**监听 mousedown，
			// 若落点在面板内，就 stopPropagation 截断事件，使官方那段捕获监听
			// 收不到该事件。注意：必须在 document 上、且先于官方注册者执行才有效；
			// 官方在菜单 open 时才注册，本插件在启动时就注册，故顺序天然靠前。
			// 面板自身也保留 mousedown 拦截（见 ensurePanel），双保险。
			// ★ v0.4.7 关键（2026-09-27，根治「一闪而过」）：焦点/关闭防护总闸。
			//   注册在 **document 捕获期**，天然早于官方在菜单 open 时才注册的
			//   冒泡期 closeOutside。处理两类落点：
			//
			//   (1) 面板内部 —— preventDefault 保焦点 + stopPropagation 截断官方
			//       closeOutside（面板挂 body，不在 rootRef/menuRef 内）。
			//   (2) 来源标题（section[role=group] > div:first-child）—— 只
			//       preventDefault。标题是不带 button 的 div，而官方 onMouseDown
			//       只在 `closest("button")` 时 preventDefault，所以标题必须由插件
			//       自己保焦点；否则一按下焦点就离开菜单 → 官方 rootRef onBlur
			//       （relatedTarget 不在 root/menu 内）→ close() → 菜单卸载、
			//       刚弹出的面板随之消失 = 用户看到的「闪一下」。
			//       这里 **不** stopPropagation：click 仍需正常派发到委托。
			var onDocMouseDown = function (event) {
				var target = event.target;
				if (!target) return;
				if (panelEl && panelEl.classList.contains("dsh-mf-open") && panelEl.contains(target)) {
					event.preventDefault();
					event.stopPropagation();
					return;
				}
				if (titleContext(target)) event.preventDefault();
			};
			// 来源标题解析：从任意落点反查所属分组/菜单并算出折叠 key。
			// **不缓存节点** —— React 换节点后依然命中，这是本版根治的核心。
			function titleContext(target) {
				if (!target || !target.closest) return null;
				var section = target.closest('section[role="group"]');
				if (!section) return null;
				if (panelEl && panelEl.contains(section)) return null;
				var menu = section.closest('div[role="menu"]');
				if (!menu) return null;
				var headingId = section.getAttribute("aria-labelledby");
				var title = headingId ? document.getElementById(headingId) : null;
				if (!title) title = section.querySelector(":scope > div:first-child");
				if (!title) return null;
				if (title !== target && !title.contains(target)) return null;
				return { title: title, section: section, menu: menu, headingId: headingId, key: foldKeyOf(title, headingId) };
			}
			// 单击标题：panel 模式开/关子面板；inline 模式折叠/展开该来源
			function activateTitle(ctx) {
				if (getMode() === "panel") {
					if (panelKey === ctx.key) { closePanel(); return; }
					openPanel(ctx.menu, ctx.title, ctx.section);
					return;
				}
				var folded = !ctx.title.hasAttribute(FOLD_ATTR);
				if (folded) {
					preserveFocusBeforeHide(ctx.section); // 同 applyInitialFold：隐藏前保焦点
					ctx.title.setAttribute(FOLD_ATTR, "1");
				}
				else ctx.title.removeAttribute(FOLD_ATTR);
				foldState[ctx.key] = folded;
				saveState(foldState);
			}
			// 双击标题：panel ↔ inline 模式切换
			function toggleTitleMode(ctx) {
				setMode(getMode() === "panel" ? "inline" : "panel");
				closePanel();
				resetMenuGroups(ctx.menu);
			}
			// 单击/双击时序判别：不用 dblclick 事件（它必然在两次 click 之后才到，
			// 会让 panel 模式先闪开一次再切模式）。改为「220ms 内第二次 click =
			// 双击」，单击动作延迟到窗口结束才执行。
			var titleClickTimer = null;
			var onDocTitleClick = function (event) {
				var ctx = titleContext(event.target);
				if (!ctx) return;
				event.preventDefault();
				if (titleClickTimer) {
					clearTimeout(titleClickTimer);
					titleClickTimer = null;
					toggleTitleMode(ctx);
					return;
				}
				titleClickTimer = setTimeout(function () {
					titleClickTimer = null;
					activateTitle(ctx);
				}, 220);
			};
			document.addEventListener("mousedown", onDocMouseDown, true);
			document.addEventListener("click", onDocTitleClick, true);
			var onDocClick = function (event) {
				if (!panelEl || !panelEl.classList.contains("dsh-mf-open")) return;
				var target = event.target;
				if (panelEl.contains(target)) return;
				// 点在来源标题上 → 交给 onDocTitleClick 处理（它可能正是要开面板）
				if (titleContext(target)) return;
				var menus = document.querySelectorAll('div[role="menu"]');
				for (var i = 0; i < menus.length; i++) {
					if (menus[i].contains(target)) return;
				}
				closePanel();
			};
			var onKeyDown = function (event) {
				if (event.key === "Escape" && panelEl && panelEl.classList.contains("dsh-mf-open")) {
					closePanel();
				}
			};
			document.addEventListener("click", onDocClick, true);
			document.addEventListener("keydown", onKeyDown, true);
			enhance();


			return function dispose() {
				// ★ v0.4.7：必须摘净 **所有** 监听/定时器。
				//   热重载（每次保存插件文件都会重跑 apply）若不彻底 dispose，旧实例
				//   的监听器会继续活着：两份实例同时处理同一次点击，互相 open/close
				//   面板 —— 实测日志每行都打两遍就是「两个实例并存」的铁证。
				if (timer) clearTimeout(timer);
				if (titleClickTimer) { clearTimeout(titleClickTimer); titleClickTimer = null; }
				observer.disconnect();
				document.removeEventListener("mousedown", onDocMouseDown, true);
				document.removeEventListener("click", onDocTitleClick, true);
				document.removeEventListener("click", onDocClick, true);
				document.removeEventListener("keydown", onKeyDown, true);
				if (panelEl) { panelEl.remove(); panelEl = null; }
				var style = document.getElementById(STYLE_ID);
				if (style) style.remove();
			};
		}

		exports.inject = [];
		exports.apply = function apply(ctx) {
			ctx.effect(function () {
				var boot = function () {
					// ★ v0.4.7：单例守卫。热重载会反复执行 apply；若上一个实例的
					//   dispose 没跑（或没摘净监听），多个实例会同时处理同一次点击，
					//   互相 open/close 面板 → 用户看到「一闪而过」，日志每行打两遍。
					//   这里在启动新实例前，显式拆掉上一个实例。
					try {
						if (typeof window.__dshModelFoldDispose === "function") {
							window.__dshModelFoldDispose();
						}
					} catch (e) { /* 旧实例拆卸失败不应阻断新实例 */ }
					var dispose = start();
					try { window.__dshModelFoldDispose = dispose; } catch (e) {}
					return function () {
						try {
							if (window.__dshModelFoldDispose === dispose) window.__dshModelFoldDispose = null;
						} catch (e) {}
						dispose();
					};
				};
				if (document.readyState === "loading") {
					var inner = null;
					var onReady = function () {
						document.removeEventListener("DOMContentLoaded", onReady);
						inner = boot();
					};
					document.addEventListener("DOMContentLoaded", onReady);
					return function () {
						document.removeEventListener("DOMContentLoaded", onReady);
						if (typeof inner === "function") inner();
					};
				}
				return boot();
			}, "dsh-model-fold: model-menu folding + side panel");
		};

		return module.exports;
	}
});
