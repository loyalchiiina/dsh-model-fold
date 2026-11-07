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
		// ★ v0.6.0：第三级「思考强度」浮层常量
		var EFFORT_PANEL_ID = "dsh-mf-effort";
		var EFFORT_FORCE_KEY = "dsh-model-fold-force-caps";
		var FORCE_SCOPE_KEY = "dsh-model-fold-force-scope";
		var EFFORT_TIERS_FALLBACK = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
		var EFFORT_TIER_LABEL = { off: "关闭", minimal: "极低", low: "低", medium: "中", high: "高", xhigh: "极高", max: "最高" };
		var PLUGIN_CTX = null;
		var SVC = null;
		var effortPanelEl = null;
		var effortState = null;
		var effortRaf = 0;
		var effortParticles = [];
		var effortHideTimer = null;
		var effortModelIndex = null;
		var CASCADE_ID = "dsh-mf-cascade";
		var cascadeEl = null;
		var cascadeState = { groups: [], providerId: null, modelId: null, probeResults: {}, probeVisible: true, probeRunning: false, probeSaveTimer: 0 };
		var PROBE_STORE_KEY = "dsh-model-fold-probe-results-v1";
		var PROBE_VISIBLE_KEY = "dsh-model-fold-probe-visible";
		var PROBE_RESULTS_URL = "/plugin/dsh-model-fold/probe-results";
		function readProbeVisible() { try { var v = localStorage.getItem(PROBE_VISIBLE_KEY); return v === null ? true : v === "1"; } catch (e) { return true; } }
		function writeProbeVisible(v) { try { localStorage.setItem(PROBE_VISIBLE_KEY, v ? "1" : "0"); } catch (e) {} }
		function readLocalProbeResults() { try { var raw = localStorage.getItem(PROBE_STORE_KEY); var v = raw ? JSON.parse(raw) : null; return v && typeof v === "object" && !Array.isArray(v) ? v : null; } catch (e) { return null; } }
		function writeLocalProbeResults(v) { try { localStorage.setItem(PROBE_STORE_KEY, JSON.stringify(v)); } catch (e) {} }
		function probeKey(pid, mid) { return String(pid) + "::" + String(mid); }
		var cascadeSearchEl = null;
		var effortInlineEl = null;
		var TRIGGER_CAP_ID = "dsh-mf-trigger-cap";
		var triggerCapEl = null;
		var triggerCapTimer = 0;
		var triggerCapRaf = 0;
		var triggerCapParticles = [];
		var lastEffortSig = "";
		var capPendingLabel = "";
		var capPendingUntil = 0;
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
				var m = localStorage.getItem(MODE_KEY);
				// v0.4.9：新增 hover（悬停就地展开）为第三种模式
				// v0.4.9：hover 为默认模式（用户要"悬停就地展开"）
				if (m === "inline" || m === "hover") return m;
				// v0.6.0：老用户 localStorage 可能存着升级前的 "panel"（旧默认值，非主动选择）
				//   → 一次性迁移到 hover（新默认）；迁移标记保证只做一次。
				if (m === "panel") {
					var mig = null;
					try { mig = localStorage.getItem("dsh-model-fold-migrated-v6"); } catch (e2) { /* 忽略 */ }
					if (mig !== "1") {
						try {
							localStorage.setItem("dsh-model-fold-migrated-v6", "1");
							localStorage.setItem(MODE_KEY, "hover");
						} catch (e2) { /* 忽略 */ }
						return "hover";
					}
					return "panel";
				}
				return "hover";
			} catch (error) {
				return "hover";
			}
		}
		function setMode(mode) {
			try { localStorage.setItem(MODE_KEY, mode); } catch (error) { /* 忽略 */ }
			syncModeAttr(); // v0.4.9：模式变更后同步到 DOM
			quickHideRoot();
			resetDrillOnOpen();
		}
		// ★ v0.4.9：把当前模式写到 <html data-msc-mode>，供 hover 专用 CSS 使用。
		//   没有这一步，第三批加的 html[data-msc-mode="hover"] 规则永不生效。
		function syncModeAttr() {
			try {
				var root = document.documentElement;
				if (root) root.setAttribute("data-msc-mode", getMode());
			} catch (error) { /* 忽略 */ }
		}

		// ★ v0.4.7：子面板样式**逐项对齐官方** @deepseek-ai/dsh-client-ui-model-selection。
		//   官方规格（从官方 client.js 内联 CSS 抄录，类名前缀 Ns6z9q_）：
		//     .menu          padding:4px; border-radius 由 --dsw-* 提供; color:var(--dsw-alias-label-primary)
		//     .option        min-height:34px; gap:6px; padding:5px 7px; border-radius:var(--dsw-radius-md)
		//     .modelName     font-size:var(--mf-fs,11px); font-weight:500; line-height:18px
		//     .groupTitle    font-size:var(--mf-fs,11px); font-weight:500; line-height:16px;
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
			'section[role="group"] > [data-menu-group-heading]{'
				+ 'box-sizing:border-box;display:flex;align-items:center;'
				+ 'min-height:28px;padding:5px 8px;gap:8px;'
				+ 'border-radius:var(--dsw-radius-md,7px);'
				+ 'font-size:var(--mf-fs,11px);font-weight:600;line-height:16px;'
				+ 'color:var(--mf-fg,var(--dsw-alias-label-primary,#f0f2f5));'
				// ★ v0.4.7 第六次修正：「来源清单」与「子集清单」背景同色。
				//   两级条目都铺 --mf-bg（themeFrom 算出的不透明实色），
				//   于是上一级与下一级读起来是同一块底色，不再一深一浅。
				+ 'background:var(--mf-bg,transparent);'
				+ 'cursor:pointer;user-select:none;'
				+ '}',
			// 悬停：用 --mf-hover 半透明覆盖层，与子集条目完全同一处理
			'section[role="group"] > [data-menu-group-heading]:hover{background:var(--mf-hover,rgba(255,255,255,.10));}',
			// 选中态（「当前来源」）：与子集选中项同一套表现 —— 品牌色左条 + 淡底 + 加粗
			'section[role="group"] > [data-menu-group-heading][' + CURRENT_ATTR + ']{'
				+ 'background:var(--mf-hover,rgba(255,255,255,.12));'
				+ 'font-weight:700;opacity:1;'
				+ 'border-left:3px solid var(--dsw-alias-brand-primary,#4f7cff);'
				+ 'padding-left:7px;'
				+ '}',
			// 折叠箭头：随字号同比放大（10px → 12px），并改为内联块参与 flex 布局
			'section[role="group"] > [data-menu-group-heading]::before{content:"\\25BE";display:inline-block;flex:0 0 auto;margin-right:2px;font-size:calc(var(--mf-fs,11px) - 1px);line-height:16px;opacity:.75;transition:transform .15s ease;}',
			'section[role="group"] > [data-menu-group-heading][' + FOLD_ATTR + ']::before{content:"\\25B8";}',
			// 模型数量徽标：与正文同字号（不再 .85em 缩小），仅降透明度作次要信息
			'section[role="group"] > [data-menu-group-heading]::after{content:attr(' + BADGE_ATTR + ');margin-left:auto;flex:0 0 auto;font-size:var(--mf-fs,11px);font-weight:500;line-height:16px;opacity:.9;white-space:nowrap;}',
			// 「当前」组的徽标用品牌色高亮；箭头保持 ▸/▾（折叠状态提示优先于装饰）
			'section[role="group"] > [data-menu-group-heading][' + CURRENT_ATTR + ']::after{color:var(--dsw-alias-brand-primary,#4f7cff);opacity:1;font-weight:600;}',
			// ★ v0.4.9 新增（2026-10-09）：hover 模式的两条补充样式。
			//   折叠/展开本身复用上面那条 :has() 规则（摘/挂 FOLD_ATTR 即可），
			//   这里只补「菜单可滚动」与「标题悬停高亮」。
			//
			//   ① 可滚动：用户要求「列表过长可上下滚动」。菜单高限 70vh，超出滚动。
			//      只作用于菜单容器，不影响官方其他弹层。
			//   ② 悬停高亮：给来源标题加背景反馈，提示「此处可悬停展开」。
			//      仅在 hover 模式下生效（用 html[data-msc-mode=hover] 守卫）。
			//
			//   模式标记由 enhance() 写入 <html data-msc-mode>，样式据此分模式生效。
			'div[role="menu"]:has(section[role="group"]){'
				+ 'max-height:70vh;overflow-y:auto;'
				+ '}',
			'html[data-msc-mode="hover"] section[role="group"] > [data-menu-group-heading]:hover{'
				+ 'background:var(--mf-hover,rgba(255,255,255,.10));'
				+ '}',
			'html[data-msc-mode="hover"] section[role="group"]:not(:has(> div['
				+ FOLD_ATTR + '])) > button[role="menuitemradio"]{'
				+ 'padding-left:18px !important;'
				+ '}',
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
				+ "gap:8px;padding:5px 8px;min-height:28px;"
				+ "border-radius:var(--dsw-radius-md,7px);"
				+ "font-size:var(--mf-fs,11px);font-weight:600;line-height:16px;"
				+ "cursor:pointer;white-space:nowrap;max-width:100%;"
				+ "color:inherit;background:0 0;border:none;outline:none;"
				+ "}",
			// 悬停：用不透明一档的底色，避免"半透明看着像读不清"
			"#" + PANEL_ID + " .dsh-mf-item:hover{background:var(--mf-hover,rgba(255,255,255,.12));}",
			// 模型名：15px / 600 / 22px（用户要求加大加粗）
			"#" + PANEL_ID + " .dsh-mf-item .dsh-mf-name{"
				+ "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
				+ "font-size:var(--mf-fs,11px);font-weight:600;line-height:16px;color:inherit;"
				+ "}",
			// 勾选：加大到 16px、加粗、品牌色，选中时更醒目（解决"勾选看不清"）
			"#" + PANEL_ID + " .dsh-mf-item .dsh-mf-check{"
				+ "flex:0 0 18px;display:grid;place-items:center;"
				+ "color:var(--mf-fg,var(--dsw-alias-label-primary,#f0f2f5));"
				+ "font-size:16px;font-weight:700;line-height:16px;"
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
				+ "font-size:var(--mf-fs,11px);font-weight:600;line-height:18px;"
				+ "color:var(--mf-tertiary,var(--dsw-alias-label-tertiary,rgba(160,160,160,.95)));"
				+ "border-bottom:1px solid var(--mf-border,rgba(128,128,128,.20));"
				+ "}",
			"#" + PANEL_ID + " .dsh-mf-header .dsh-mf-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;}",
			"#" + PANEL_ID + " .dsh-mf-header .dsh-mf-count{flex-shrink:0;font-weight:500;}",
			// ★ v0.6.0：面板内「提示条」+「设置条」（自建 DOM，不碰 React 节点）
			'.dsh-mf-hintbar{display:block;padding:5px 10px 3px;font-size:10px;line-height:14px;opacity:.55;color:var(--mf-tertiary,var(--dsw-alias-label-tertiary,rgba(160,160,160,.95)));user-select:none;pointer-events:none;}'
			+ '.dsh-mf-configbar{display:flex;align-items:center;gap:3px;padding:5px 8px 7px;font-size:10px;line-height:14px;border-top:1px solid rgba(127,127,127,.18);margin-top:2px;user-select:none;position:sticky;bottom:0;background:var(--mf-bg,transparent);flex-wrap:wrap;}'
			+ '.dsh-mf-configbar .dsh-mf-cfgbtn{cursor:pointer;border:0;background:transparent;color:inherit;font:inherit;padding:2px 6px;border-radius:var(--dsw-radius-sm,4px);opacity:.8;}'
			+ '.dsh-mf-configbar .dsh-mf-cfgbtn:hover{background:var(--mf-hover,rgba(255,255,255,.10));opacity:1;}'
			+ '.dsh-mf-configbar .dsh-mf-cfgbtn[data-on]{font-weight:700;opacity:1;color:var(--dsw-alias-brand-primary,#4f7cff);}'
			+ '.dsh-mf-configbar .dsh-mf-lbl{opacity:.55;margin-left:auto;}'
			, "#" + EFFORT_PANEL_ID + "{position:fixed;z-index:2147483001;width:auto;min-width:196px;max-width:min(440px,90vw);padding:9px 11px 10px;border-radius:13px;background:var(--mf-bg,#1f2126);background-color:var(--mf-bg,#1f2126);border:1px solid var(--mf-border,rgba(128,128,128,.28));box-shadow:var(--dsw-elevation-prominent,0 12px 36px rgba(0,0,0,.4));color:var(--mf-fg,#f0f2f5);font-family:inherit;transform:translateY(4px) scale(.98);opacity:0;transition:opacity .16s,transform .16s;pointer-events:none;}"
			, "#" + EFFORT_PANEL_ID + ".dsh-mf-e-open{opacity:1;transform:none;pointer-events:auto;}"
			, "#" + EFFORT_PANEL_ID + " .dsh-mf-e-head{display:flex;flex-direction:column;align-items:center;gap:1px;margin-bottom:7px;}"
			, "#" + EFFORT_PANEL_ID + " .dsh-mf-e-level{font-size:17px;font-weight:700;line-height:20px;color:var(--mf-accent,#4f7cff);letter-spacing:.5px;}"
			, "#" + EFFORT_PANEL_ID + " .dsh-mf-e-model{font-size:10px;font-weight:500;line-height:13px;opacity:.6;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}"
			, "#" + EFFORT_PANEL_ID + " .dsh-mf-e-slider{position:relative;height:22px;margin:1px 1px 0;display:flex;align-items:center;}"
			, "#" + EFFORT_PANEL_ID + " .dsh-mf-e-track{position:absolute;left:0;right:0;height:8px;border-radius:5px;background:var(--mf-track,rgba(127,127,127,.28));overflow:hidden;}"
			, "#" + EFFORT_PANEL_ID + " .dsh-mf-e-fill{position:absolute;left:0;top:0;bottom:0;border-radius:6px;background:linear-gradient(90deg,var(--mf-accent,#4f7cff),var(--mf-accent2,#7aa2ff));}"
			, "#" + EFFORT_PANEL_ID + " .dsh-mf-e-thumb{position:absolute;top:50%;width:17px;height:17px;border-radius:50%;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.35);transform:translate(-50%,-50%);cursor:grab;}"
			, "#" + EFFORT_PANEL_ID + " .dsh-mf-e-thumb:active{cursor:grabbing;}"
			, "#" + EFFORT_PANEL_ID + " canvas.dsh-mf-e-particles{position:absolute;left:-6px;right:-6px;top:-10px;bottom:-10px;width:calc(100% + 12px);height:calc(100% + 20px);pointer-events:none;}"
			, "#" + EFFORT_PANEL_ID + " .dsh-mf-e-ticks{display:flex;justify-content:space-between;margin-top:4px;padding:0 2px;}"
			, "#" + EFFORT_PANEL_ID + " .dsh-mf-e-tick{font-size:8px;opacity:.45;}"
			, "#" + EFFORT_PANEL_ID + " .dsh-mf-e-tick[data-on]{opacity:.95;color:var(--mf-accent,#4f7cff);font-weight:700;}"
			, "#" + EFFORT_PANEL_ID + " .dsh-mf-e-note{font-size:9px;opacity:.5;text-align:center;margin-top:6px;}"
			, "@media (prefers-reduced-motion: reduce){#" + EFFORT_PANEL_ID + " .dsh-mf-e-thumb{transition:none;}}"
			, "#" + TRIGGER_CAP_ID + "{position:fixed;z-index:2147482000;display:none;align-items:center;gap:6px;padding:0 9px 0 12px;border-radius:999px;background:linear-gradient(135deg,#1b2333,#141a29);border:1px solid rgba(79,124,255,.6);box-shadow:0 0 0 1px rgba(79,124,255,.15),0 0 14px rgba(79,124,255,.4);color:#eef1f7;font-family:inherit;cursor:pointer;overflow:hidden;max-width:min(66vw,420px);transform-origin:right center;transition:transform .15s ease;animation:dsh-mf-breathe 2.6s ease-in-out infinite;}"
			, "#" + TRIGGER_CAP_ID + ":hover{transform:scale(1.03);}"
			, "@keyframes dsh-mf-breathe{0%,100%{box-shadow:0 0 0 1px rgba(79,124,255,.15),0 0 8px rgba(79,124,255,.28);}50%{box-shadow:0 0 0 1px rgba(79,124,255,.4),0 0 22px rgba(79,124,255,.65);}}"
			, "#" + TRIGGER_CAP_ID + " .dsh-mf-tc-name{font-size:11px;font-weight:600;line-height:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:min(56vw,360px);opacity:.95;position:relative;z-index:1;}"
			, "#" + TRIGGER_CAP_ID + " .dsh-mf-tc-dot{width:4px;height:4px;border-radius:50%;background:#5b86ff;opacity:.85;flex:0 0 auto;position:relative;z-index:1;}"
			, "#" + TRIGGER_CAP_ID + " .dsh-mf-tc-eff{font-size:11px;font-weight:700;line-height:1;color:#8fb0ff;white-space:nowrap;position:relative;z-index:1;}"
			, "#" + TRIGGER_CAP_ID + " .dsh-mf-tc-arrow{font-size:11px;opacity:.75;padding:0 2px;margin-left:2px;position:relative;z-index:1;}"
			, "#" + TRIGGER_CAP_ID + " canvas.dsh-mf-tc-particles{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:0;}"
			, "#" + EFFORT_PANEL_ID + ".dsh-mf-e-list{transition:none;width:auto;min-width:120px;max-width:min(280px,70vw);padding:4px;border-radius:12px;}"
			, "#" + EFFORT_PANEL_ID + ".dsh-mf-e-list .dsh-mf-e-head{margin-bottom:5px;}"
			, "#" + EFFORT_PANEL_ID + ".dsh-mf-e-list .dsh-mf-e-level{font-size:14px;line-height:17px;}"
			, "#" + EFFORT_PANEL_ID + " .dsh-mf-e-listwrap{display:flex;flex-direction:column;gap:2px;}"
			, "#" + EFFORT_PANEL_ID + " .dsh-mf-e-item{box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:5px 8px;min-height:28px;border-radius:var(--dsw-radius-md,7px);font-size:var(--mf-fs,11px);font-weight:600;line-height:16px;cursor:pointer;color:inherit;background:0 0;border:none;outline:none;}"
			, "#" + EFFORT_PANEL_ID + " .dsh-mf-e-item:hover{background:var(--mf-hover,rgba(255,255,255,.10));}"
			, "#" + EFFORT_PANEL_ID + " .dsh-mf-e-item-on{font-weight:700;color:var(--mf-accent,#4f7cff);}"
			, "#" + EFFORT_PANEL_ID + " .dsh-mf-e-itemcheck{flex:0 0 18px;display:grid;place-items:center;font-size:16px;font-weight:700;line-height:16px;color:var(--mf-accent,#4f7cff);}"
			, "#" + EFFORT_PANEL_ID + " .dsh-mf-e-name{font-size:11px;font-weight:600;line-height:15px;opacity:.9;white-space:normal;word-break:break-word;margin-bottom:3px;}"
			, "#" + EFFORT_PANEL_ID + " .dsh-mf-e-cur{font-size:13px;font-weight:700;line-height:16px;color:var(--mf-accent,#4f7cff);text-align:right;margin-bottom:3px;}"
			, ".dsh-mf-sub{margin:1px 0 5px;padding:2px 0 2px 10px;border-left:2px solid var(--mf-accent,var(--dsw-alias-brand-primary,#4f7cff));display:flex;flex-direction:column;gap:1px;}"
			, "#" + TRIGGER_CAP_ID + "{min-width:30px;width:30px;height:30px;padding:0;gap:0;justify-content:center;border-radius:50%;background:radial-gradient(circle at 32% 28%,rgba(79,124,255,.30),rgba(15,21,35,.98));}"
			, "#" + TRIGGER_CAP_ID + " .dsh-mf-tc-icon{font-size:16px;line-height:1;filter:drop-shadow(0 0 5px rgba(96,146,255,.85));position:relative;z-index:2;}"
			, "#" + TRIGGER_CAP_ID + " .dsh-mf-tc-ring{position:absolute;inset:-2px;border-radius:50%;background:conic-gradient(from 0deg,rgba(79,124,255,0),rgba(150,185,255,.95),rgba(79,124,255,0));animation:dsh-mf-spin 2.6s linear infinite;filter:blur(2px);opacity:.85;z-index:0;}"
			, "@keyframes dsh-mf-spin{to{transform:rotate(360deg);}}"
			, "#" + TRIGGER_CAP_ID + " canvas.dsh-mf-tc-particles{border-radius:50%;}"
			, "#" + EFFORT_PANEL_ID + " .dsh-mf-e-fill{background:linear-gradient(90deg,#4f7cff,#8fb0ff,#4f7cff);background-size:200% 100%;animation:dsh-mf-shimmer 2.2s linear infinite;box-shadow:0 0 8px rgba(79,124,255,.55);}"
			, "@keyframes dsh-mf-shimmer{to{background-position:-200% 0;}}"
			, "html[data-mf-model-opening] div[role=\"menu\"]{visibility:hidden !important;}"
			, "#" + CASCADE_ID + "{position:fixed;z-index:2147483002;display:flex;gap:6px;padding:6px;border-radius:14px;background:var(--mf-bg,var(--dsw-alias-bg-l2,#1f2126));border:1px solid var(--mf-border,rgba(128,128,128,.28));box-shadow:0 12px 36px rgba(0,0,0,.35);font-family:inherit;color:var(--dsw-alias-label-primary,#f0f2f5);opacity:0;transform:translateY(4px);transition:opacity .12s,transform .12s;pointer-events:none;max-height:min(62vh,440px);}"
			, "#" + CASCADE_ID + ".dsh-mf-open{opacity:1;transform:none;pointer-events:auto;}"
			, "#" + CASCADE_ID + " .dsh-mf-col{display:flex;flex-direction:column;min-width:150px;max-width:230px;max-height:min(60vh,420px);overflow:auto;}"
			, "#" + CASCADE_ID + " .dsh-mf-colhead{font-size:10px;font-weight:600;opacity:.5;padding:2px 8px 5px;position:sticky;top:0;background:var(--mf-bg,var(--dsw-alias-bg-l2,#1f2126));}"
			, "#" + CASCADE_ID + " .dsh-mf-crow{box-sizing:border-box;display:flex;align-items:center;min-height:28px;padding:5px 8px;border-radius:var(--dsw-radius-md,7px);font-size:var(--mf-fs,11px);font-weight:600;line-height:16px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}"
			, "#" + CASCADE_ID + " .dsh-mf-crow:hover{background:var(--mf-hover,rgba(255,255,255,.12));}"
			, "#" + CASCADE_ID + " .dsh-mf-crow.on{color:var(--dsw-alias-brand-primary,#4f7cff);}"
			, "#" + CASCADE_ID + "{flex-direction:column;gap:4px;}"
			, "#" + CASCADE_ID + " .dsh-mf-searchwrap{padding:2px 4px 4px;}"
			, "#" + CASCADE_ID + " .dsh-mf-search{box-sizing:border-box;width:100%;height:30px;padding:0 10px;border-radius:8px;border:1px solid rgba(127,127,127,.25);background:transparent;color:inherit;font:inherit;font-size:13px;outline:none;}"
			, "#" + CASCADE_ID + " .dsh-mf-search::placeholder{opacity:.5;}"
			, "#" + CASCADE_ID + " .dsh-mf-cols{display:flex;gap:6px;min-height:0;}"
			, "#" + CASCADE_ID + " .dsh-mf-crow{font-size:13px;font-weight:500;min-height:32px;padding:6px 9px;border-radius:8px;}"
			, "#" + CASCADE_ID + " .dsh-mf-crow.on{font-weight:700;}"
			, "#" + CASCADE_ID + " .dsh-mf-colhead{font-size:11px;font-weight:600;opacity:.55;padding:2px 9px 5px;}"
			, "#" + CASCADE_ID + " .dsh-mf-crow{display:flex;align-items:center;justify-content:space-between;gap:8px;}"
			, "#" + CASCADE_ID + " .dsh-mf-crowname{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}"
			, "#" + CASCADE_ID + " .dsh-mf-crowright{flex:0 0 auto;font-size:11px;font-weight:600;opacity:.6;}"
			, "#" + CASCADE_ID + " .dsh-mf-crow.on .dsh-mf-crowright{opacity:1;font-size:14px;color:var(--dsw-alias-brand-primary,#4f7cff);}"
			, "#" + CASCADE_ID + " .dsh-mf-col{font-size:var(--mf-fs,11px);min-width:10em;max-width:24em;}"
			, "#" + CASCADE_ID + " .dsh-mf-crow{font-size:var(--mf-fs,11px);min-height:calc(var(--mf-fs,11px) * 2.2);padding:4px 8px;}"
			, "#" + CASCADE_ID + " .dsh-mf-crowright{font-size:calc(var(--mf-fs,11px) * .9);}"
			, "#" + CASCADE_ID + " .dsh-mf-colhead{font-size:calc(var(--mf-fs,11px) * .9);}"
			, "#" + CASCADE_ID + " .dsh-mf-search{height:calc(var(--mf-fs,11px) * 2.4);font-size:var(--mf-fs,11px);}"
			, "#" + CASCADE_ID + " .dsh-mf-capcfg{display:flex;align-items:center;gap:3px;padding:5px 6px 1px;border-top:1px solid rgba(127,127,127,.18);font-size:10px;}"
			, "#" + CASCADE_ID + " .dsh-mf-capcfg-lbl{opacity:.55;margin-left:auto;}"
			, "#" + CASCADE_ID + " .dsh-mf-capcfg-btn{cursor:pointer;border:0;background:transparent;color:inherit;font:inherit;padding:2px 6px;border-radius:var(--dsw-radius-sm,4px);opacity:.8;}"
			, "#" + CASCADE_ID + " .dsh-mf-capcfg-btn:hover{background:var(--mf-hover,rgba(255,255,255,.10));opacity:1;}"
			, "#" + CASCADE_ID + " .dsh-mf-capcfg-btn[data-on]{font-weight:700;opacity:1;color:var(--dsw-alias-brand-primary,#4f7cff);}"
			, "#" + CASCADE_ID + " .dsh-mf-capcfg-cur{max-width:62%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.8;margin-right:auto;}"
			, "#" + CASCADE_ID + " .dsh-mf-capcfg-lbl{margin-left:0;}"
			, "#" + CASCADE_ID + "{font-family:inherit;}"
			, "#" + CASCADE_ID + " .dsh-mf-colhead{opacity:1 !important;color:var(--dsw-alias-label-primary,#f0f2f5) !important;font-weight:700;}"
			, "#" + CASCADE_ID + " .dsh-mf-crow:hover{background:rgba(127,127,127,.18) !important;}"
			, "#" + CASCADE_ID + " .dsh-mf-crow.on{background:rgba(79,124,255,.18);color:var(--dsw-alias-brand-primary,#4f7cff);font-weight:700;}"
			, "#" + CASCADE_ID + " .dsh-mf-capcfg-cur{opacity:1;}"
			, "#" + CASCADE_ID + " .dsh-mf-capcfg-lbl{opacity:.85;}"
			, "#" + CASCADE_ID + " .dsh-mf-capcfg-force{margin-left:6px;border:1px solid rgba(127,127,127,.3);border-radius:6px;}"
			, "#" + CASCADE_ID + " .dsh-mf-crow.path{background:rgba(127,127,127,.12);}"
			, "#" + CASCADE_ID + "{background:var(--mf-bg,#1f2126) !important;color:var(--mf-fg,#f0f2f5) !important;border:1px solid var(--mf-border,rgba(128,128,128,.3)) !important;}"
			, "#" + CASCADE_ID + " .dsh-mf-colhead{background:var(--mf-bg,#1f2126) !important;color:var(--mf-fg,#f0f2f5) !important;}"
			, "#" + CASCADE_ID + " .dsh-mf-search{background:rgba(127,127,127,.14);color:inherit;border:1px solid var(--mf-border,rgba(128,128,128,.3));}"
			, "#" + CASCADE_ID + " .dsh-mf-crow{color:inherit;}"
			, "#" + CASCADE_ID + " .dsh-mf-capcfg{border-top:1px solid var(--mf-border,rgba(128,128,128,.22));color:inherit;}"
			, "#" + CASCADE_ID + " .dsh-mf-capcfg-btn[data-on]{background:rgba(79,124,255,.20);border-radius:6px;}"
			, "#" + CASCADE_ID + " .dsh-mf-crow.unavailable{text-decoration:line-through;opacity:.45;}"
			, "#" + CASCADE_ID + " .dsh-mf-capcfg-status{font-size:10px;opacity:.8;margin-left:6px;}"
			, "#dsh-mf-toast{position:fixed;left:50%;bottom:96px;transform:translateX(-50%) translateY(6px);z-index:2147483003;max-width:70vw;padding:8px 14px;border-radius:9px;background:rgba(28,30,36,.94);color:#f5f7fa;font-size:12px;line-height:18px;box-shadow:0 8px 24px rgba(0,0,0,.35);opacity:0;pointer-events:none;transition:opacity .16s,transform .16s;}"
			, "#dsh-mf-toast.on{opacity:1;transform:translateX(-50%) translateY(0);}"
			, "#dsh-mf-cascade .dsh-mf-statusbar{box-sizing:border-box;margin:0 4px 4px;padding:4px 9px;border-radius:7px;background:rgba(127,127,127,.12);font-size:calc(var(--mf-fs,11px) - 0px);line-height:18px;opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}"
			, "#dsh-mf-cascade .dsh-mf-fsinput{box-sizing:border-box;width:44px;height:24px;margin:0 4px;padding:0 4px;border-radius:6px;border:1px solid rgba(127,127,127,.35);background:rgba(127,127,127,.14);color:inherit;font-size:12px;text-align:center;}"
			, "#dsh-mf-cascade .dsh-mf-toprow{box-sizing:border-box;display:flex;align-items:center;gap:6px;padding:2px 4px 4px;}"
			, "#dsh-mf-cascade .dsh-mf-toprow .dsh-mf-search{flex:1 1 auto;min-width:90px;width:auto;height:28px;}"
			, "#dsh-mf-cascade .dsh-mf-toprow .dsh-mf-statusbar{flex:0 1 52%;min-width:0;margin:0;}"
			, "#dsh-mf-cascade .dsh-mf-fsinput{flex:none;width:52px;}"
			, "#dsh-mf-cascade .dsh-mf-caps{display:inline-flex;align-items:center;gap:3px;margin-left:5px;vertical-align:-2px;opacity:.62;color:inherit;}"
			, "#dsh-mf-cascade .dsh-mf-cap{display:inline-flex;}"
			, "#dsh-mf-cascade .dsh-mf-cap svg{width:12px;height:12px;display:block;fill:none;stroke:currentColor;stroke-width:1.2;stroke-linecap:round;stroke-linejoin:round;}"
			, "#dsh-mf-cascade .dsh-mf-caps-note{font-size:10px;line-height:16px;opacity:.55;margin-left:6px;white-space:nowrap;}"
			, "#dsh-mf-cascade .dsh-mf-capcfg{display:flex;flex-wrap:wrap;align-items:center;gap:4px 6px;padding:3px 4px 6px;}"
			, "#dsh-mf-cascade .dsh-mf-capcfg-cur{flex:1 1 100%;font-size:10.5px;line-height:15px;opacity:.75;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}"
			, "#dsh-mf-cascade .dsh-mf-capcfg-lbl{flex:0 0 auto;font-size:10px;}"
			, "#dsh-mf-cascade .dsh-mf-capcfg-btn{flex:0 0 auto;height:22px;padding:0 7px;font-size:10.5px;white-space:nowrap;}"
			, "#dsh-mf-cascade .dsh-mf-capcfg-force{flex:1 1 0;min-width:0;height:auto;min-height:24px;padding:3px 6px;white-space:normal;line-height:14px;text-align:center;font-size:10.5px;}"
			, "#dsh-mf-cascade .dsh-mf-caps-note{flex:1 1 100%;margin-left:0;}"
			, "#dsh-mf-cascade{width:min(92vw, 740px);max-width:740px;}"
			, "#dsh-mf-cascade .dsh-mf-toprow,#dsh-mf-cascade .dsh-mf-cols,#dsh-mf-cascade .dsh-mf-capcfg{width:100%;box-sizing:border-box;}"
			, "#dsh-mf-cascade .dsh-mf-cols{flex:1 1 auto;min-width:0;}"
			, "#dsh-mf-cascade .dsh-mf-col{min-width:0;max-width:none;}"
			, "#dsh-mf-cascade .dsh-mf-col:nth-child(1){flex:0 0 31%;}"
			, "#dsh-mf-cascade .dsh-mf-col:nth-child(2){flex:1 1 48%;}"
			, "#dsh-mf-cascade .dsh-mf-col:nth-child(3){flex:0 0 21%;}"
			, "#dsh-mf-cascade{width:min(92vw,640px);max-width:640px;padding:8px;gap:6px;border-radius:12px;overflow:hidden;}"
			, "#dsh-mf-cascade .dsh-mf-toprow{display:flex;align-items:center;gap:8px;width:100%;padding:0 2px;}"
			, "#dsh-mf-cascade .dsh-mf-search{flex:1 1 auto;min-width:80px;width:auto;height:30px;border-radius:8px;font-size:12px;padding:0 10px;}"
			, "#dsh-mf-cascade .dsh-mf-statusbar{flex:0 0 auto;max-width:160px;min-width:0;margin:0;padding:3px 8px;border-radius:999px;background:rgba(127,127,127,.14);font-size:10.5px;line-height:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:.75;}"
			, "#dsh-mf-cascade .dsh-mf-statusbar-idle{display:none;}"
			, "#dsh-mf-cascade .dsh-mf-cols{display:grid;grid-template-columns:176px minmax(160px,1fr) 108px;gap:0;width:100%;flex:1 1 auto;min-height:0;}"
			, "#dsh-mf-cascade .dsh-mf-col{min-width:0;max-width:none;max-height:min(56vh,380px);overflow:auto;padding-right:4px;}"
			, "#dsh-mf-cascade .dsh-mf-col + .dsh-mf-col{border-left:1px solid rgba(127,127,127,.16);padding-left:6px;}"
			, "#dsh-mf-cascade .dsh-mf-colhead{font-size:11px;font-weight:600;opacity:.45;padding:2px 8px 5px;}"
			, "#dsh-mf-cascade .dsh-mf-crow{min-height:28px;padding:4px 8px;font-size:12px;gap:4px;}"
			, "#dsh-mf-cascade .dsh-mf-crowname{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500;}"
			, "#dsh-mf-cascade .dsh-mf-caps{flex:0 0 auto;display:inline-flex;align-items:center;gap:2px;margin-left:2px;opacity:.62;}"
			, "#dsh-mf-cascade .dsh-mf-crowright{flex:0 0 auto;margin-left:4px;min-width:15px;text-align:right;font-size:11px;opacity:.8;}"
			, "#dsh-mf-cascade .dsh-mf-capcfg{display:flex;flex-direction:column;gap:4px;width:100%;padding:0 2px;}"
			, "#dsh-mf-cascade .dsh-mf-cfgrow{display:flex;align-items:center;gap:6px;width:100%;min-width:0;}"
			, "#dsh-mf-cascade .dsh-mf-capcfg-cur{flex:1 1 auto;min-width:0;max-width:none;font-size:11px;line-height:16px;opacity:.75;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}"
			, "#dsh-mf-cascade .dsh-mf-capcfg-lbl{flex:0 0 auto;font-size:10px;opacity:.55;}"
			, "#dsh-mf-cascade .dsh-mf-fsinput{flex:0 0 44px;width:44px;height:24px;margin:0;padding:0 2px;font-size:11px;}"
			, "#dsh-mf-cascade .dsh-mf-cfgrow-actions{flex-wrap:nowrap;}"
			, "#dsh-mf-cascade .dsh-mf-capcfg-btn{flex:0 0 auto;height:26px;padding:0 8px;font-size:11px;line-height:24px;white-space:nowrap;}"
			, "#dsh-mf-cascade .dsh-mf-capcfg-force{flex:1 1 0;min-width:0;padding:0 4px;}"
			, "#dsh-mf-cascade .dsh-mf-capcfg-test{flex:0 0 auto;}"
			, "#dsh-mf-cascade .dsh-mf-probe-mark{flex:0 0 auto;margin-left:4px;font-size:13px;line-height:1;font-weight:700;}"
			, "#dsh-mf-cascade .dsh-mf-capcfg-probe{color:#16a34a;}"
			, "#dsh-mf-cascade .dsh-mf-crow[data-probe=\"bad\"] .dsh-mf-crowname{text-decoration:line-through;opacity:.55;}"
			, "#dsh-mf-cascade .dsh-mf-crow[data-probe=\"ok\"]{background:rgba(34,197,94,.10);}"
			, "#dsh-mf-cascade .dsh-mf-crow[data-probe=\"bad\"]{background:rgba(239,68,68,.12);}"
			, "#dsh-mf-cascade .dsh-mf-crow[data-probe=\"pending\"]{background:rgba(245,158,11,.08);}"
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
			//   来源清单的条目（section[role="group"] > [data-menu-group-heading]）位于**官方
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
					try {
						var __sp = realBtn.querySelector("[data-provider-id][data-model-id]");
						if (__sp) {
							item.setAttribute("data-mf-provider-id", __sp.getAttribute("data-provider-id") || "");
							item.setAttribute("data-mf-model-id", __sp.getAttribute("data-model-id") || "");
						}
						item.setAttribute("data-mf-model-name", (realBtn.textContent || "").trim());
					} catch (__e) {}
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
			// v0.4.9：hover 同为"来源优先"视图，默认全折叠（由悬停展开）
			if (getMode() === "panel" || getMode() === "hover") {
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
				if (!t) t = groups[j].querySelector(":scope > [data-menu-group-heading]");
				if (!t) continue;
				// 注意：绝不清 DONE —— 它代表"监听器已挂"；这里只重算折叠状态
				t.removeAttribute(FOLD_ATTR);
				t.removeAttribute(CURRENT_ATTR);
				applyInitialFold(groups[j], t, foldKeyOf(t, headingId));
			}
			enhance(); // 刷新徽标 / 选中标记
		}

				// ★ v0.6.0：在**模型切换面板内**渲染「提示条」与「设置条」。
		//   ① 小字提示双击可切换展开方式；② 确保默认悬浮模式；③ 切换模式按钮 + 字号设置。
		//   · 自建 DOM append 到 div[role=menu] 末尾，不移动/删除 React 节点
		//   · 设置条 sticky bottom，菜单滚动时始终可见
		//   · 字号写到 documentElement 的 --mf-fs，菜单与侧面板联动
		//   · 按钮 mousedown/click 均 stopPropagation，不触发宿主 closeOutside
		var FS_KEY = 'dsh-model-fold-fs-v1';
		var FS_MIN = 8, FS_MAX = 15;
		var MODE_CHOICES = [['hover', '悬浮'], ['panel', '面板'], ['inline', '列表']];
		var MODE_LABEL = { hover: '悬浮展开', panel: '侧边面板', inline: '列表内展开' };
		
		function readFontSize() {
			try {
				var v = parseInt(localStorage.getItem(FS_KEY), 10);
				if (v >= FS_MIN && v <= FS_MAX) return v;
			} catch (e) { /* 忽略 */ }
			return 11;
		}
		function writeFontSize(px) {
			try { localStorage.setItem(FS_KEY, String(px)); } catch (e) { /* 忽略 */ }
		}
		function applyFontSize() {
			try { document.documentElement.style.setProperty('--mf-fs', readFontSize() + 'px'); }
			catch (e) { /* 忽略 */ }
		}
		
						/** ★ v0.6.1：只更新设置条的高亮状态，绝不增删节点（避免签名抖动）。 */
		function syncConfigBar(bar) {
			try {
				var curMode = getMode();
				var curFs = readFontSize();
				var fsIn = bar.querySelector('.dsh-mf-fsinput'); if (fsIn) fsIn.value = String(curFs);
				var btns = bar.querySelectorAll('.dsh-mf-cfgbtn');
				for (var i = 0; i < btns.length; i++) {
					var b = btns[i];
					var mId = b.getAttribute('data-mode');
					var fPx = b.getAttribute('data-fs');
					var isFc = b.hasAttribute('data-forcecaps');
					var on = (mId !== null && mId === curMode)
						|| (fPx !== null && parseInt(fPx, 10) === curFs)
						|| (isFc && getForceCaps(true));
					if (on) b.setAttribute('data-on', '1');
					else b.removeAttribute('data-on');
				}
			} catch (e) { /* 忽略 */ }
		}
		function renderMenuExtras(menuEl) {
			try {
				applyFontSize();
				if (!menuEl.querySelector('section[role="group"]')) return;
				var cur = getMode();
				var hintText = '双击来源标题可切换展开方式（当前：' + (MODE_LABEL[cur] || cur) + '）';

				// —— 提示条（幂等：只更新文案）——
				var hint = menuEl.querySelector(':scope > .dsh-mf-hintbar');
				if (!hint) {
					hint = document.createElement('div');
					hint.className = 'dsh-mf-hintbar';
					menuEl.appendChild(hint);
				}
				if (hint.textContent !== hintText) hint.textContent = hintText;

				// —— 设置条（★ v0.6.1 幂等：只在首次创建按钮，之后只更新状态）——
				//   旧版每次调用都 bar.textContent='' 再重建按钮 —— 节点增删会让
				//   paneSignature 抖动（即使已排除，频繁重建也会导致点击丢失），
				//   表现为「点字号时好时坏」。现在改为：有按钮就只刷 data-on。
				var bar = menuEl.querySelector(':scope > .dsh-mf-configbar');
				if (!bar) {
					bar = document.createElement('div');
					bar.className = 'dsh-mf-configbar';
					bar.addEventListener('mousedown', function (ev) { ev.stopPropagation(); });
					menuEl.appendChild(bar);

					var mk = function (label, isActive) {
						var b = document.createElement('button');
						b.type = 'button';
						b.className = 'dsh-mf-cfgbtn';
						b.textContent = label;
						b.addEventListener('mousedown', function (ev) { ev.stopPropagation(); });
						return b;
					};

					// 三个模式按钮
					for (var a = 0; a < MODE_CHOICES.length; a++) {
						(function (id, label) {
							var b = mk(label);
							b.setAttribute('data-mode', id);
							b.addEventListener('click', function (ev) {
								ev.preventDefault();
								ev.stopPropagation();
								setMode(id);
								closePanel();
								resetMenuGroups(menuEl);
								renderMenuExtras(menuEl);
							});
							bar.appendChild(b);
						})(MODE_CHOICES[a][0], MODE_CHOICES[a][1]);
					}

					var lbl = document.createElement('span');
					lbl.className = 'dsh-mf-lbl';
					lbl.textContent = '字号';
					bar.appendChild(lbl);

					var fsIn = document.createElement('input');
					fsIn.type = 'number'; fsIn.min = String(FS_MIN); fsIn.max = String(FS_MAX); fsIn.step = '1';
					fsIn.className = 'dsh-mf-fsinput'; fsIn.value = String(readFontSize());
					fsIn.title = '字号 ' + FS_MIN + '-' + FS_MAX;
					fsIn.addEventListener('mousedown', function (ev) { ev.stopPropagation(); });
					fsIn.addEventListener('change', function () {
						var v = parseInt(fsIn.value, 10); if (!(v >= FS_MIN && v <= FS_MAX)) v = readFontSize();
						fsIn.value = String(v); writeFontSize(v); applyFontSize(); syncConfigBar(bar);
					});
					bar.appendChild(fsIn);
					// ★ v0.6.0：强制图片 + 思考强度（可关）
					var capLbl = document.createElement("span");
					capLbl.className = "dsh-mf-lbl";
					capLbl.textContent = "能力";
					bar.appendChild(capLbl);
					var capBtn = mk("一键打开思考强度/识图");
					capBtn.setAttribute("data-forcecaps", "");
					capBtn.addEventListener("click", function (ev) {
						ev.preventDefault(); ev.stopPropagation();
						setForceCaps(!getForceCaps(true));
						syncConfigBar(bar);
						if (getForceCaps(true)) runForceCapsOnce(true);
					});
					bar.appendChild(capBtn);
				}

				// 每次只刷状态（不动节点）
				syncConfigBar(bar);
			} catch (e) { /* 忽略 */ }
		}
		function processGroup(menuEl, section) {
			var headingId = section.getAttribute("aria-labelledby");
			var title = headingId ? document.getElementById(headingId) : null;
			if (!title) title = section.querySelector(":scope > [data-menu-group-heading]");
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
				title.setAttribute(BADGE_ATTR, (selName ? "当前·" + selName : "当前"))
				title.setAttribute(CURRENT_ATTR, "1")
			} else {
				title.setAttribute(BADGE_ATTR, "(" + buttons.length + ")")
				title.removeAttribute(CURRENT_ATTR)
			}

			title.setAttribute(DONE_ATTR, "1");

			var key = foldKeyOf(title, headingId);
			applyInitialFold(section, title, key);

			var _m = getMode();
			title.title = _m === "panel"
			    ? "单击：右侧展开该来源的模型子面板｜双击：切换为列表内展开"
			    : (_m === "hover"
			        ? "鼠标悬停：就地展开该来源的模型｜双击：切换模式"
			        : "点击折叠/展开该来源的全部模型｜双击：切换为右侧子面板");

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
				// v0.6.1：也要排除本插件自建的提示条/设置条 ——
				//   它们的内容变化（点字号/切模式重建按钮）会让签名抖动，
				//   被误判成 pane 切换 -> resetView -> 按钮状态丢失。
				if (kid.classList && (kid.classList.contains("dsh-mf-hintbar")
					|| kid.classList.contains("dsh-mf-configbar"))) continue;
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

		// ★ v0.6.0：官方根面板（模型 / 推理等级 两行摘要）没有存在必要 —— 菜单一打开就自动下钻到模型列表
		var lastMenuOpenState = false;
		function resetDrillOnOpen() {
			try {
				var open = document.querySelector('button[aria-haspopup="menu"][aria-expanded="true"]') !== null;
				if (open && !lastMenuOpenState) {
					var ms = document.querySelectorAll('div[role="menu"]');
					for (var i = 0; i < ms.length; i++) ms[i].removeAttribute("data-mf-drilled");
				}
				lastMenuOpenState = open;
			} catch (e) {}
		}
 		// 只认模型选择菜单：含分组（model pane）或含「模型/Model/推理/Effort」开头的 menuitem（root pane）
		function isModelMenu(menu) {
			try {
				if (!menu) return false;
				if (menu.querySelector('section[role="group"]')) return true;
				var cells = menu.querySelectorAll('button[role="menuitem"]');
				for (var i = 0; i < cells.length; i++) {
					var tx = (cells[i].textContent || "").trim();
					if (tx.indexOf("模型") === 0 || tx.indexOf("Model") === 0 || tx.indexOf("モデル") === 0 || tx.indexOf("推理") === 0 || tx.indexOf("Effort") === 0) return true;
				}
			} catch (e) {}
			return false;
		}
		function autoDrillRoot(menu) {
			try {
				if (!isModelMenu(menu)) return;
				if (!menu || menu.querySelector('section[role="group"]')) return;
				if (menu.getAttribute("data-mf-drilled") === "1") return;
				var cells = menu.querySelectorAll('button[role="menuitem"]');
				if (!cells.length) return;
				var target = null;
				for (var i = 0; i < cells.length; i++) {
					var txt = (cells[i].textContent || "").trim();
					if (txt.indexOf("模型") === 0 || txt.indexOf("Model") === 0 || txt.indexOf("モデル") === 0) { target = cells[i]; break; }
				}
				if (!target) return;
				menu.setAttribute("data-mf-drilled", "1");
				target.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
			} catch (e) {}
		}
		// ★ v0.6.0：官方根面板（模型 / 推理等级 两行摘要）在打开瞬间会闪一下 —— 在 MutationObserver
		//   回调里同步隐藏（早于 120ms 的 enhance），彻底消除闪屏；切到模型/强度 pane 后自动恢复。
		function quickHideRoot() {
			try {
				// 先恢复：之前被隐藏、但已不是“模型根面板”的菜单（切到模型/强度 pane 后 role 会变）都恢复显示
				var hiddenMs = document.querySelectorAll('[data-mf-root-hidden="1"]');
				for (var hi2 = 0; hi2 < hiddenMs.length; hi2++) {
					var hm = hiddenMs[hi2];
					if (hm.querySelector('section[role="group"]') || !hm.querySelector('button[role="menuitem"]')) { hm.style.visibility = ""; hm.removeAttribute("data-mf-root-hidden"); }
				}
				var ms = document.querySelectorAll('div[role="menu"]');
				for (var i = 0; i < ms.length; i++) {
					var m = ms[i];
					var hasGroup = m.querySelector('section[role="group"]');
					var cells = m.querySelectorAll('button[role="menuitem"]');
					var isModelRoot = false;
					if (cells.length) { for (var k = 0; k < cells.length; k++) { var tx = (cells[k].textContent || "").trim(); if (tx.indexOf("模型") === 0 || tx.indexOf("Model") === 0 || tx.indexOf("モデル") === 0 || tx.indexOf("推理") === 0 || tx.indexOf("Effort") === 0) { isModelRoot = true; break; } } }
					if (!hasGroup && cells.length && isModelRoot) {
						m.style.visibility = "hidden";
						m.setAttribute("data-mf-root-hidden", "1");
					} else if (m.getAttribute("data-mf-root-hidden") === "1") {
						m.style.visibility = "";
						m.removeAttribute("data-mf-root-hidden");
					}
				}
			} catch (e) {}
		}
		function enhance() {
			syncModeAttr(); // v0.4.9：每次增强前同步模式标记
			var menus = document.querySelectorAll('div[role="menu"]');
			var aliveMenus = 0;
			for (var i = 0; i < menus.length; i++) {
				var menu = menus[i];
				if (!isMenuAlive(menu)) continue;
				aliveMenus += 1;
				if (!isModelMenu(menu)) continue;

				// ★ v0.4.7（2026-09-27）：**先给菜单注入主题变量**，再处理分组。
				//
				//   来源清单（section[role="group"] > [data-menu-group-heading]）的配色全靠
				//   --mf-bg / --mf-fg 等变量。这些变量原先只在 openPanel()→themeFrom()
				//   里写入，意味着「必须先点开一次子面板，来源清单才有颜色」——
				//   用户看到的就是「上一级没颜色、下一级有颜色」。
				//   这里在每次扫描时就把变量写到菜单上（CSS 变量沿 DOM 继承，
				//   覆盖整棵菜单子树），来源清单一出现即为正确配色，且与子集同色。
				applyMenuTheme(menu);
			renderMenuExtras(menu); // v0.6.0

				// ── 视图签名比对：pane 切换则重挂 ──
				var sig = paneSignature(menu);
				if (menu.getAttribute(SIG_ATTR) !== sig) {
					resetView(menu);
					menu.setAttribute(SIG_ATTR, sig);
				}

				autoDrillRoot(menu);

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
				try { document.documentElement.removeAttribute("data-mf-model-opening"); } catch (e) {}
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

		// ══════════════════════════════════════════════════════════════════
		// ★ v0.6.0 第三级：思考强度浮层（Codex 风滑块 + 粒子）+ 强制能力
		// ══════════════════════════════════════════════════════════════════
		function fmtModelName(name) { name = String(name || ""); return name.length > 22 ? name.slice(0, 21) + "…" : name; }
		function getForceCaps(def) {
			try { var v = localStorage.getItem(EFFORT_FORCE_KEY); if (v === "0") return false; if (v === "1") return true; } catch (e) {}
			return def !== false;
		}
		function setForceCaps(on) { try { localStorage.setItem(EFFORT_FORCE_KEY, on ? "1" : "0"); } catch (e) {} }
		function getForceScope() { try { var v = localStorage.getItem(FORCE_SCOPE_KEY); if (v === "current" || v === "all") return v; } catch (e) {} return "all"; }
		function setForceScope(s) { try { localStorage.setItem(FORCE_SCOPE_KEY, s === "current" ? "current" : "all"); } catch (e) {} }
		// 惰性取服务：不硬依赖任何服务，缺失时对应功能降级，主功能不受影响
		function getSvc(name) {
			try { if (SVC && SVC[name]) return SVC[name]; } catch (e) {}
			try { if (PLUGIN_CTX && typeof PLUGIN_CTX.get === "function") { var s = PLUGIN_CTX.get(name); if (s) return s; } } catch (e) {}
			try { if (PLUGIN_CTX && name === "modelDirectories") return PLUGIN_CTX.modelDirectories; } catch (e) {}
			try { if (PLUGIN_CTX && name === "configForms") return PLUGIN_CTX.configForms; } catch (e) {}
			try { if (PLUGIN_CTX && name === "remote") return PLUGIN_CTX.remote; } catch (e) {}
			return null;
		}

		function buildEffortIndex() {
			effortModelIndex = {};
			try {
				var md = getSvc("modelDirectories");
				var snap = md && md.catalog && md.catalog.store && md.catalog.store.getSnapshot ? md.catalog.store.getSnapshot() : null;
				if (md && md.catalog && md.catalog.load && (!snap || !snap.value)) { try { md.catalog.load(); } catch (e) {} }
				var groups = snap && snap.value && snap.value.groups ? snap.value.groups : [];
				for (var i = 0; i < groups.length; i++) {
					var g = groups[i]; var ms = g.models || [];
					for (var j = 0; j < ms.length; j++) { var m = ms[j]; effortModelIndex[g.id + "||" + m.id] = m.reasoning || null; }
				}
			} catch (e) {}
			return effortModelIndex;
		}
		function reasoningFor(provider, model) {
			if (!effortModelIndex) buildEffortIndex();
			return effortModelIndex[provider + "||" + model] || null;
		}
		function effortListFor(provider, model) {
			var r = reasoningFor(provider, model); var list = [];
			if (r && r.efforts && r.efforts.length) {
				for (var i = 0; i < r.efforts.length; i++) { var e = r.efforts[i]; list.push({ id: e.id, label: e.name || EFFORT_TIER_LABEL[e.id] || e.id }); }
			} else if (getForceCaps(true)) {
				for (var k = 0; k < EFFORT_TIERS_FALLBACK.length; k++) list.push({ id: EFFORT_TIERS_FALLBACK[k], label: EFFORT_TIER_LABEL[EFFORT_TIERS_FALLBACK[k]] || EFFORT_TIERS_FALLBACK[k] });
			}
			return { list: list, defaultEffort: r && r.defaultEffort !== undefined ? r.defaultEffort : null, hadMeta: !!(r && r.efforts && r.efforts.length) };
		}
		function findSessionId() {
			try {
				try { var _trig = findModelTrigger(); var _host = _trig && _trig.closest ? _trig.closest("[data-conversation-session]") : null; if (_host && _host.dataset && _host.dataset.conversationSession) return _host.dataset.conversationSession; } catch (e) {}
				var comp = document.querySelector('[data-conversation-region="composer"]');
				var host = comp && comp.closest ? comp.closest("[data-conversation-session]") : null;
				if (host && host.dataset && host.dataset.conversationSession) return host.dataset.conversationSession;
				var all = document.querySelectorAll("[data-conversation-session]");
				for (var i = 0; i < all.length; i++) { var el = all[i]; if (el.offsetParent !== null && el.dataset && el.dataset.conversationSession) return el.dataset.conversationSession; }
				if (all.length && all[0].dataset && all[0].dataset.conversationSession) return all[0].dataset.conversationSession;
			} catch (e) {}
			return null;
		}
		function currentSelection() {
			try { var sid = findSessionId(); if (!sid) return null; var md = getSvc("modelDirectories"); if (!md) return null; var dir = md.directoryFor(sid); var s = dir && dir.store ? dir.store.getSnapshot() : null; return (s && s.current) || null; } catch (e) { return null; }
		}
		function ensureEffortPanel() {
			if (effortPanelEl && effortPanelEl.isConnected) return effortPanelEl;
			var p = document.createElement("div"); p.id = EFFORT_PANEL_ID;
			p.addEventListener("mousedown", function (ev) { ev.preventDefault(); ev.stopPropagation(); });
			p.addEventListener("click", function (ev) { ev.stopPropagation(); });
			document.body.appendChild(p); effortPanelEl = p; return p;
		}
		function applyEffortTheme() {
			var p = ensureEffortPanel();
			try {
				var src = (panelEl && panelEl.isConnected) ? panelEl : document.querySelector('div[role="menu"]');
				if (src) {
					var cs = window.getComputedStyle(src);
					var bg = cs.getPropertyValue("--mf-bg") || cs.backgroundColor; if (bg && bg.trim()) { p.style.setProperty("--mf-bg", bg.trim()); p.style.background = bg.trim(); p.style.backgroundColor = bg.trim(); }
					var fg = cs.getPropertyValue("--mf-fg") || cs.color; if (fg && fg.trim()) p.style.setProperty("--mf-fg", fg.trim());
					var br = cs.getPropertyValue("--dsw-alias-brand-primary"); if (br && br.trim()) p.style.setProperty("--mf-accent", br.trim());
				}
			} catch (e) {}
		}
		function stopEffortParticles() { if (effortRaf) { cancelAnimationFrame(effortRaf); effortRaf = 0; } effortParticles = []; }
		function startEffortParticles(canvas) {
			stopEffortParticles();
			var reduce = false; try { reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
			if (reduce || !canvas || !canvas.getContext) return;
			var c2 = canvas.getContext("2d"); if (!c2) return;
			function frame() {
				var W = canvas.width, H = canvas.height; c2.clearRect(0, 0, W, H);
				var lvl = effortState ? effortState.pos01 : 0.5;
				var emit = 1 + Math.round(lvl * 3);
				for (var e = 0; e < emit; e++) {
					var tx = 6 + (W - 12) * lvl;
					effortParticles.push({ x: tx, y: H / 2, vx: (Math.random() - 0.5) * 1.2 + lvl * 0.6, vy: (Math.random() - 0.5) * 1.8, age: 0, sz: 1 + Math.random() * 2.4, hue: 205 + Math.random() * 35 });
				}
				for (var i = effortParticles.length - 1; i >= 0; i--) {
					var p = effortParticles[i]; p.age += 0.02; p.x += p.vx; p.y += p.vy; p.vy += 0.01;
					if (p.age >= 1) { effortParticles.splice(i, 1); continue; }
					c2.globalAlpha = (1 - p.age) * 0.9; c2.fillStyle = "hsl(" + p.hue + ",100%,68%)";
					c2.beginPath(); c2.arc(p.x, p.y, p.sz * (1 - p.age * 0.5), 0, Math.PI * 2); c2.fill();
				}
				c2.globalAlpha = 1;
				if (effortParticles.length > 260) effortParticles.splice(0, effortParticles.length - 260);
				effortRaf = requestAnimationFrame(frame);
			}
			effortRaf = requestAnimationFrame(frame);
		}
		function closeEffortPanel() {
			stopEffortParticles();
			if (effortPanelEl) { try { if (effortPanelEl.__mfCleanup) effortPanelEl.__mfCleanup(); } catch (e) {} effortPanelEl.__mfCleanup = null; effortPanelEl.classList.remove("dsh-mf-e-open"); }
			if (effortInlineEl && effortInlineEl.parentNode) { try { effortInlineEl.parentNode.removeChild(effortInlineEl); } catch (e) {} }
			effortInlineEl = null;
			effortState = null;
		}
		function scheduleEffortHide() {
			if (effortHideTimer) clearTimeout(effortHideTimer);
			effortHideTimer = setTimeout(function () { effortHideTimer = null; closeEffortPanel(); }, 240);
		}
		function commitEffort() {
			if (!effortState) return;
			var tier = effortState.list[effortState.index]; if (!tier) return;
			try {
				capPendingLabel = tier.label; capPendingUntil = Date.now() + 4000;
				if (triggerCapEl) { var _efEl = triggerCapEl.querySelector(".dsh-mf-tc-eff"); if (_efEl) _efEl.textContent = tier.label; }
				triggerParticleBurst();
			} catch (e) {}
			var provider = effortState.provider, model = effortState.model, reasoningEffort = tier.id;
			var sid = findSessionId(); var rem = getSvc("remote"); var mdd = getSvc("modelDirectories");
			// 优先用官方目录的 directory.select —— 它内部持有正确的 session wire face，
			// 能可靠带上 reasoningEffort 并把选择写回官方触发器（避免只换模型、强度停在 Default）。
			try {
				if (mdd && sid) {
					var dir = mdd.directoryFor(sid);
					if (dir && typeof dir.select === "function") {
						var rp = dir.select({ provider: provider, model: model, reasoningEffort: reasoningEffort });
						if (rp && typeof rp.then === "function") { rp.then(function (r) { if (r && r.ok === false) { try { console.warn("[dsh-model-fold] directory.select failed", r.error); } catch (e) {} } }).catch(function () {}); }
						closeEffortPanel(); closePanel();
						try { var _tr = findModelTrigger(); if (_tr && _tr.getAttribute("aria-expanded") === "true") _tr.click(); } catch (e) {}
						return;
					}
				}
			} catch (e) {}
			try {
				if (rem && rem.session && typeof rem.session.selectModel === "function" && sid) {
					var res = rem.session.selectModel({ sessionId: sid, provider: provider, model: model, reasoningEffort: reasoningEffort });
					if (res && typeof res.then === "function") { res.then(function (r) { if (r && r.ok === false) { try { console.warn("[dsh-model-fold] selectModel failed", r.error); } catch (e) {} } }).catch(function () {}); }
					closeEffortPanel(); closePanel();
					try { var _tr2 = findModelTrigger(); if (_tr2 && _tr2.getAttribute("aria-expanded") === "true") _tr2.click(); } catch (e) {}
					return;
				}
			} catch (e) {}
			try {
				var sp = document.querySelector('button[role="menuitemradio"] [data-provider-id="' + String(provider).replace(/"/g, '\\"') + '"][data-model-id="' + String(model).replace(/"/g, '\\"') + '"]');
				if (sp) { var real = sp.closest('button[role="menuitemradio"]'); if (real) real.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, view: window })); }
			} catch (e) {}
			closeEffortPanel(); closePanel();
		}
		function openEffortPanel(anchorEl, providerId, modelId, modelName, uiMode) {
			if (!providerId || !modelId) return;
			if (effortHideTimer) { clearTimeout(effortHideTimer); effortHideTimer = null; }
			if (effortPanelEl && effortPanelEl.__mfCleanup) { try { effortPanelEl.__mfCleanup(); } catch (e) {} effortPanelEl.__mfCleanup = null; }
			stopEffortParticles();
			buildEffortIndex();
			var info = effortListFor(providerId, modelId);
			if (!info.list.length) { closeEffortPanel(); return; }
			var p = ensureEffortPanel(); applyEffortTheme(); p.innerHTML = "";
			var sel = currentSelection();
			var curEffort = (sel && sel.provider === providerId && sel.model === modelId) ? sel.reasoningEffort : null;
			var idx = -1;
			if (curEffort !== null && curEffort !== undefined) { for (var i = 0; i < info.list.length; i++) if (info.list[i].id === curEffort) { idx = i; break; } }
			if (idx < 0 && info.defaultEffort !== null) { for (var d = 0; d < info.list.length; d++) if (info.list[d].id === info.defaultEffort) { idx = d; break; } }
			if (idx < 0) idx = Math.max(0, Math.floor((info.list.length - 1) / 2));
			effortState = { provider: providerId, model: modelId, list: info.list, index: idx, hadMeta: info.hadMeta, pos01: 0.5 };
			var isTrigger = uiMode === "trigger"; var isList = uiMode === "list" || isTrigger;
			if (isList) p.classList.add("dsh-mf-e-list"); else p.classList.remove("dsh-mf-e-list");
			function placeBeside(anchor) {
				p.classList.add("dsh-mf-e-open"); p.style.visibility = "hidden"; p.style.left = "0px"; p.style.top = "0px";
				var pw = p.offsetWidth, ph = p.offsetHeight; var ar = anchor.getBoundingClientRect();
				var panelRect = null, menuRect = null;
				try { if (panelEl && panelEl.classList.contains("dsh-mf-open")) panelRect = panelEl.getBoundingClientRect(); } catch (e) {}
				try { var mEl = document.querySelector('div[role="menu"]'); if (mEl) menuRect = mEl.getBoundingClientRect(); } catch (e) {}
				var left;
				if (panelRect) {
					left = panelRect.left - pw - 8;
					if (left < 10) left = (menuRect ? menuRect.right + 8 : ar.right + 8);
				} else if (menuRect) {
					left = menuRect.left - pw - 8;
					if (left < 10) left = menuRect.right + 8;
				} else { left = ar.right + 8; }
				if (left + pw > window.innerWidth - 10) left = Math.max(10, window.innerWidth - pw - 10);
				var top = ar.top; if (top + ph > window.innerHeight - 10) top = Math.max(10, window.innerHeight - ph - 10);
				p.style.left = left + "px"; p.style.top = top + "px"; p.style.visibility = "visible";
			}
			function placeAbove(anchor) {
				p.classList.add("dsh-mf-e-open"); p.style.visibility = "hidden"; p.style.left = "0px"; p.style.top = "0px";
				var pw = p.offsetWidth, ph = p.offsetHeight; var ar = anchor.getBoundingClientRect();
				var left = ar.right - pw; if (left < 10) left = 10;
				var top = ar.top - ph - 8;
				if (top < 10) top = Math.min(window.innerHeight - ph - 10, ar.bottom + 8);
				p.style.left = left + "px"; p.style.top = top + "px"; p.style.visibility = "visible";
			}
			if (isList) {
				// 第三级：完整独立面板，只列思考强度，行格式与上两级一致
				var listWrap = document.createElement("div"); listWrap.className = "dsh-mf-e-listwrap";
				for (var li = 0; li < info.list.length; li++) {
					(function (ii) {
						var item = document.createElement("div");
						item.className = "dsh-mf-e-item" + (ii === idx ? " dsh-mf-e-item-on" : "");
						var lab = document.createElement("span"); lab.className = "dsh-mf-e-itemlabel"; lab.textContent = info.list[ii].label;
						var chk = document.createElement("span"); chk.className = "dsh-mf-e-itemcheck"; chk.textContent = ii === idx ? "✓" : "";
						item.appendChild(lab); item.appendChild(chk);
						item.addEventListener("click", function (ev) { ev.preventDefault(); ev.stopPropagation(); if (!effortState) return; effortState.index = ii; commitEffort(); });
						listWrap.appendChild(item);
					})(li);
				}
				p.appendChild(listWrap);
				if (isTrigger) placeAbove(anchorEl); else placeBeside(anchorEl);
				p.addEventListener("mouseenter", function () { if (effortHideTimer) { clearTimeout(effortHideTimer); effortHideTimer = null; } });
				p.addEventListener("mouseleave", scheduleEffortHide);
				return;
			}
			// —— 滑杆模式（仅用于已经选好的模型，如胶囊）——
			var nameEl = document.createElement("div"); nameEl.className = "dsh-mf-e-name"; nameEl.textContent = String(modelName || modelId);
			p.appendChild(nameEl);
			var curEl = document.createElement("div"); curEl.className = "dsh-mf-e-cur"; curEl.textContent = info.list[idx] ? info.list[idx].label : "";
			p.appendChild(curEl);
			var slider = document.createElement("div"); slider.className = "dsh-mf-e-slider";
			var track = document.createElement("div"); track.className = "dsh-mf-e-track";
			var fill = document.createElement("div"); fill.className = "dsh-mf-e-fill"; track.appendChild(fill);
			var thumb = document.createElement("div"); thumb.className = "dsh-mf-e-thumb";
			slider.appendChild(track); slider.appendChild(thumb);
			var canvas = document.createElement("canvas"); canvas.className = "dsh-mf-e-particles"; slider.appendChild(canvas);
			p.appendChild(slider);
			p.classList.add("dsh-mf-e-open"); p.style.visibility = "hidden"; p.style.left = "0px"; p.style.top = "0px";
			try { var rw = slider.clientWidth || (p.clientWidth - 22); canvas.width = Math.max(80, Math.round(rw + 12)); canvas.height = 52; } catch (e) {}
			placeAbove(anchorEl);
			function layout() {
				if (!effortState) return; var n = effortState.list.length; var pos = n > 1 ? effortState.index / (n - 1) : 0.5; effortState.pos01 = pos;
				fill.style.width = (pos * 100) + "%"; thumb.style.left = (pos * 100) + "%";
				curEl.textContent = effortState.list[effortState.index] ? effortState.list[effortState.index].label : "";
			}
			effortState.layout = layout; layout();
			startEffortParticles(canvas);
			var dragging = false;
			function pick(clientX) { var rect = track.getBoundingClientRect(); var ratio = rect.width > 0 ? (clientX - rect.left) / rect.width : 0; ratio = Math.max(0, Math.min(1, ratio)); var n = effortState.list.length; effortState.index = n > 1 ? Math.round(ratio * (n - 1)) : 0; layout(); }
			function onDown(ev) { ev.preventDefault(); ev.stopPropagation(); dragging = true; pick(ev.clientX); }
			function onMove(ev) { if (!dragging) return; ev.preventDefault(); pick(ev.clientX); }
			function onUp(ev) { if (!dragging) return; dragging = false; try { ev.preventDefault(); ev.stopPropagation(); } catch (e) {} commitEffort(); }
			var onDownDoc = function (ev) { if (!effortPanelEl || !slider.isConnected) return; var tg = ev.target; if (!(tg && (slider === tg || slider.contains(tg)))) return; onDown(ev); };
			document.addEventListener("mousedown", onDownDoc, true);
			document.addEventListener("mousemove", onMove, true);
			document.addEventListener("mouseup", onUp, true);
			p.__mfCleanup = function () { document.removeEventListener("mousedown", onDownDoc, true); document.removeEventListener("mousemove", onMove, true); document.removeEventListener("mouseup", onUp, true); stopEffortParticles(); };
			p.addEventListener("mouseenter", function () { if (effortHideTimer) { clearTimeout(effortHideTimer); effortHideTimer = null; } });
			p.addEventListener("mouseleave", scheduleEffortHide);
		}
		function modelTargetInfo(target) {
			if (!target || !target.closest) return null;
			if (effortPanelEl && effortPanelEl.contains(target)) return null;
			var row = target.closest("[data-mf-provider-id][data-mf-model-id]");
			if (row) return { el: row, provider: row.getAttribute("data-mf-provider-id"), model: row.getAttribute("data-mf-model-id"), name: row.getAttribute("data-mf-model-name") || row.textContent };
			var btn = target.closest('button[role="menuitemradio"]');
			if (btn) { var sp = btn.querySelector("[data-provider-id][data-model-id]"); if (sp) return { el: btn, provider: sp.getAttribute("data-provider-id"), model: sp.getAttribute("data-model-id"), name: btn.textContent }; }
			return null;
		}

		// ★ v0.6.0：composer 模型触发器 →「模型名 + 思考档位」动态胶囊（呼吸流光 + 切档粒子迸发）
		function findModelTrigger() {
			try {
				var comps = document.querySelectorAll('[data-conversation-region="composer"]');
				for (var i = 0; i < comps.length; i++) {
					var btns = comps[i].querySelectorAll('button[aria-haspopup="menu"]');
					for (var j = 0; j < btns.length; j++) if (btns[j].querySelector("[data-provider-id][data-model-id]")) return btns[j];
					if (btns.length) return btns[0];
				}
			} catch (e) {}
			return null;
		}
		function ensureTriggerCap() {
			if (triggerCapEl && triggerCapEl.isConnected) return triggerCapEl;
			var el = document.createElement("div"); el.id = TRIGGER_CAP_ID;
			var cv = document.createElement("canvas"); cv.className = "dsh-mf-tc-particles";
			var ring = document.createElement("span"); ring.className = "dsh-mf-tc-ring";
			var ic = document.createElement("span"); ic.className = "dsh-mf-tc-icon"; ic.textContent = "🧠"; ic.title = "模型 / 思考强度";
			el.appendChild(ring); el.appendChild(cv); el.appendChild(ic);
			el.addEventListener("mousedown", function (ev) { ev.stopPropagation(); });
			el.addEventListener("click", function (ev) {
				ev.preventDefault(); ev.stopPropagation();
				closeEffortPanel();
				var t = findModelTrigger();
				if (t) { try { if (typeof t.click === "function") t.click(); else t.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, view: window })); } catch (e) {} }
			});
			el.addEventListener("mouseenter", function () { var sel = currentSelection(); if (!sel) return; openEffortPanel(el, sel.provider, sel.model, sel.model, "slider"); });
			el.addEventListener("mouseleave", function () { scheduleEffortHide(); });
			document.body.appendChild(el); triggerCapEl = el; return el;
		}
		function currentEffortLabel() {
			try {
				var sel = currentSelection(); if (!sel) return "默认";
				var r = reasoningFor(sel.provider, sel.model); var e = sel.reasoningEffort;
				if (e === undefined || e === null) e = r ? r.defaultEffort : null;
				if (e === undefined || e === null) return "默认";
				if (r && r.efforts) { for (var i = 0; i < r.efforts.length; i++) if (r.efforts[i].id === e) return r.efforts[i].name || EFFORT_TIER_LABEL[e] || e; }
				return EFFORT_TIER_LABEL[e] || e;
			} catch (err) { return "默认"; }
		}
		function triggerParticleBurst() {
			var el = triggerCapEl; if (!el) return;
			var cv = el.querySelector("canvas.dsh-mf-tc-particles"); if (!cv || !cv.getContext) return;
			try { cv.width = el.clientWidth || 150; cv.height = el.clientHeight || 28; } catch (e) { return; }
			var W = cv.width, H = cv.height, cx = W / 2, cy = H / 2;
			for (var i = 0; i < 22; i++) { var ang = Math.random() * Math.PI * 2, sp = 0.6 + Math.random() * 1.8; triggerCapParticles.push({ x: cx, y: cy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, age: 0, sz: 1 + Math.random() * 2, hue: 205 + Math.random() * 40 }); }
			if (!triggerCapRaf) triggerCapRaf = requestAnimationFrame(drawTriggerParticles);
		}
		function drawTriggerParticles() {
			var el = triggerCapEl; var cv = el && el.querySelector("canvas.dsh-mf-tc-particles");
			if (!cv || !cv.getContext) { triggerCapRaf = 0; return; }
			var c2 = cv.getContext("2d"); var W = cv.width, H = cv.height; c2.clearRect(0, 0, W, H);
			for (var i = triggerCapParticles.length - 1; i >= 0; i--) {
				var p = triggerCapParticles[i]; p.age += 0.025; p.x += p.vx; p.y += p.vy; p.vy += 0.02;
				if (p.age >= 1) { triggerCapParticles.splice(i, 1); continue; }
				c2.globalAlpha = (1 - p.age) * 0.9; c2.fillStyle = "hsl(" + p.hue + ",100%,68%)";
				c2.beginPath(); c2.arc(p.x, p.y, p.sz * (1 - p.age * 0.4), 0, Math.PI * 2); c2.fill();
			}
			c2.globalAlpha = 1;
			if (triggerCapParticles.length) triggerCapRaf = requestAnimationFrame(drawTriggerParticles);
			else { triggerCapRaf = 0; c2.clearRect(0, 0, W, H); }
		}
		function updateTriggerCap() {
			try {
				var trig = findModelTrigger(); var el = ensureTriggerCap();
				if (!trig) { el.style.display = "none"; return; }
				var r = trig.getBoundingClientRect();
				if (!r || r.width < 4 || r.height < 4) { el.style.display = "none"; return; }
				el.style.display = "flex";
				var h = Math.min(Math.max(r.height, 26), 34);
				el.style.height = h + "px";
				el.style.top = (r.top + (r.height - h) / 2) + "px";
				el.style.right = Math.max(4, window.innerWidth - r.right) + "px";
				var sel2 = currentSelection();
				var label = currentEffortLabel();
				if (capPendingLabel && Date.now() < capPendingUntil) { if (label === capPendingLabel) capPendingLabel = ""; else label = capPendingLabel; }
				var sig = (sel2 && sel2.provider ? sel2.provider : "") + "|" + (sel2 && sel2.model ? sel2.model : "") + "#" + label;
				if (sig !== lastEffortSig) { if (lastEffortSig !== "") triggerParticleBurst(); lastEffortSig = sig; }
			} catch (e) {}
		}
		function startTriggerCap() {
			try { ensureTriggerCap(); updateTriggerCap(); if (!triggerCapTimer) triggerCapTimer = setInterval(updateTriggerCap, 350); } catch (e) {}
		}
		function stopTriggerCap() {
			try { if (triggerCapTimer) { clearInterval(triggerCapTimer); triggerCapTimer = 0; } } catch (e) {}
			try { if (triggerCapRaf) { cancelAnimationFrame(triggerCapRaf); triggerCapRaf = 0; } } catch (e) {}
			triggerCapParticles = [];
			try { if (triggerCapEl) { triggerCapEl.remove(); triggerCapEl = null; } } catch (e) {}
		}
		// —— 强制图片输入 + 强制思考强度（写 DSH settings，持久化）——
		var __forceCapsBusy = false;
		function normalizeInputTypes(arr) { var out = Array.isArray(arr) ? arr.slice() : []; if (out.indexOf("text") < 0) out.unshift("text"); if (out.indexOf("image") < 0) out.push("image"); return out; }
		function fullReasoningEfforts() { return { off: "off", minimal: "minimal", low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max" }; }
		function planForceCaps(ns, viewValue, only, mode) {
			var on = mode !== "off";
			var ops = [];
			if (!viewValue || typeof viewValue !== "object") return ops;
			function clone(o) { var n = {}; for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) n[k] = o[k]; return n; }
			if (ns === "llm-pi-ai") {
				var providers = viewValue.providers; if (!providers || typeof providers !== "object") return ops;
				var keys = Object.keys(providers);
				for (var i = 0; i < keys.length; i++) {
					var pk = keys[i], prov = providers[pk]; if (!prov || typeof prov !== "object") continue;
					if (only && only.provider && pk !== only.provider) continue;
					var speaks = false;
					var models = Array.isArray(prov.models) ? prov.models : null;
					if (models && models.length) {
						var nm = [], dirty = false;
						for (var j = 0; j < models.length; j++) {
							var m = models[j]; if (!m || typeof m !== "object") { nm.push(m); continue; }
							if (only && only.model && m.id !== only.model) { nm.push(m); continue; }
							var c = clone(m); var inp = normalizeInputTypes(c.input);
							if (on) {
								if (!c.input || JSON.stringify(inp) !== JSON.stringify(c.input)) { c.input = inp; dirty = true; }
								if (!c.reasoningEfforts || typeof c.reasoningEfforts !== "object") { c.reasoningEfforts = fullReasoningEfforts(); dirty = true; } else { var want = fullReasoningEfforts(), merged = clone(c.reasoningEfforts), ch = false; for (var lv in want) if (Object.prototype.hasOwnProperty.call(want, lv) && merged[lv] === undefined) { merged[lv] = want[lv]; ch = true; } if (ch) { c.reasoningEfforts = merged; dirty = true; } }
							} else {
								var offInp = []; for (var ii = 0; ii < inp.length; ii++) if (inp[ii] !== "image") offInp.push(inp[ii]); if (!offInp.length) offInp = ["text"];
								if (JSON.stringify(offInp) !== JSON.stringify(c.input)) { c.input = offInp; dirty = true; }
								if (c.reasoningEfforts !== false) { c.reasoningEfforts = false; dirty = true; }
							}
							nm.push(c);
						}
						if (dirty) ops.push({ op: "set", path: ["providers", pk, "models"], value: nm });
						for (var si = 0; si < nm.length; si++) { var sm = nm[si]; if (sm && sm.reasoningEfforts && typeof sm.reasoningEfforts === "object" && Object.keys(sm.reasoningEfforts).length) { speaks = true; break; } }
					}
					var supportsCompat = (prov.api === "openai-completions"); if (on) { if (supportsCompat && speaks && !(prov.compat && prov.compat.supportsReasoningEffort === true)) ops.push({ op: "set", path: ["providers", pk, "compat", "supportsReasoningEffort"], value: true }); } else if (supportsCompat && prov.compat && prov.compat.supportsReasoningEffort === true) ops.push({ op: "set", path: ["providers", pk, "compat", "supportsReasoningEffort"], value: false });
				}
			} else if (ns === "llm-deepseek") {
				var ms = Array.isArray(viewValue.models) ? viewValue.models : null;
				if (ms && ms.length) {
					var nm2 = [], dirty2 = false;
					for (var a = 0; a < ms.length; a++) {
						var m2 = ms[a]; if (!m2 || typeof m2 !== "object") { nm2.push(m2); continue; }
						if (only && only.model && m2.id !== only.model) { nm2.push(m2); continue; }
						var c2 = clone(m2); var inp2 = normalizeInputTypes(c2.inputModalities);
						if (on) { if (!c2.inputModalities || JSON.stringify(inp2) !== JSON.stringify(c2.inputModalities)) { c2.inputModalities = inp2; dirty2 = true; } }
						else { var off2 = []; for (var jj = 0; jj < inp2.length; jj++) if (inp2[jj] !== "image") off2.push(inp2[jj]); if (!off2.length) off2 = ["text"]; if (JSON.stringify(off2) !== JSON.stringify(c2.inputModalities)) { c2.inputModalities = off2; dirty2 = true; } }
						nm2.push(c2);
					}
					if (dirty2) ops.push({ op: "set", path: ["models"], value: nm2 });
				}
			}
			return ops;
		}
		function capToast(txt) {
			try {
				var el = document.getElementById("dsh-mf-toast");
				if (!el) { el = document.createElement("div"); el.id = "dsh-mf-toast"; document.body.appendChild(el); }
				el.textContent = String(txt).slice(0, 160); el.classList.add("on");
				clearTimeout(el.__mfT); el.__mfT = setTimeout(function () { el.classList.remove("on"); }, 2800);
			} catch (e) {}
		}
		function setCapStatus(txt) { try { var s = String(txt == null ? "" : txt); var el = cascadeEl ? cascadeEl.querySelector(".dsh-mf-statusbar") : null; if (!el) el = document.querySelector("#" + CASCADE_ID + " .dsh-mf-statusbar"); if (el) { if (!s || s === "就绪") { el.textContent = ""; el.classList.add("dsh-mf-statusbar-idle"); } else { el.textContent = s.length > 40 ? s.slice(0, 40) + "…" : s; el.title = s; el.classList.remove("dsh-mf-statusbar-idle"); } } } catch (e) {} }
		function runForceCapsOnce(manual, scope, mode) {
			mode = mode || "on";
			if (__forceCapsBusy || !getForceCaps(true)) return;
			var only = (scope === "current") ? currentSelection() : null;
			if (scope === "current" && !only) { setCapStatus("请先选模型"); return; }
			var rem = getSvc("remote"), cf = getSvc("configForms"), md = getSvc("modelDirectories");
			if (!rem || !rem.settings || typeof rem.settings.mutate !== "function" || !cf || typeof cf.describe !== "function") { setCapStatus("缺少设置服务"); return; }
			__forceCapsBusy = true; setCapStatus("准备中…");
			try {
				var face = cf.describe();
				Promise.resolve(face.ensure ? face.ensure() : null).then(function () {
					var snap = face.getSnapshot ? face.getSnapshot() : null;
					var view = snap && snap.value && snap.value.view ? snap.value.view : (snap && snap.view ? snap.view : null);
					var namespaces = (view && view.namespaces) ? view.namespaces : [];
					var jobs = [];
					["llm-pi-ai", "llm-deepseek"].forEach(function (ns) {
						var e = null; for (var i = 0; i < namespaces.length; i++) if (namespaces[i].ns === ns) { e = namespaces[i]; break; }
						if (!e) return;
						var ops = planForceCaps(ns, e.value, only, mode);
						for (var j = 0; j < ops.length; j++) jobs.push({ ns: ns, op: ops[j], rev: e.revision });
					});
					if (!jobs.length) { setCapStatus("无变化"); return; }
					var ok = 0, fail = 0, last = "", chain = Promise.resolve();
					jobs.forEach(function (job, idx) {
						chain = chain.then(function () {
							setCapStatus((mode === "off" ? "关闭中 " : "应用中 ") + (idx + 1) + "/" + jobs.length);
							return rem.settings.mutate(job.ns, [job.op], job.rev).then(function (resp) {
								if (resp && resp.ok === false && resp.error && resp.error.code === "settings/conflict") return rem.settings.mutate(job.ns, [job.op], void 0);
								return resp;
							}).then(function (resp) {
								if (resp && resp.ok === false) { fail++; last = (resp.error && resp.error.code) || "ERR"; if (resp.error && resp.error.message) last += ":" + String(resp.error.message).slice(0, 160); } else { ok++; try { applyCapsFromOp(job.op); refreshCascadeIcons(); } catch (e) {} }
							}).catch(function () { fail++; last = "NET"; });
						});
					});
					return chain.then(function () { setCapStatus(fail ? ((mode === "off" ? "已关闭 " : "完成 ") + ok + "/" + jobs.length + "，失败 " + fail + (last ? ("（" + last + "）") : "")) : ((mode === "off" ? "已关闭 " : "完成 ") + ok + "/" + jobs.length)); });
				}).catch(function () { setCapStatus("失败:EXC"); }).then(function () {
					__forceCapsBusy = false;
					try { if (md && md.catalog && typeof md.catalog.refresh === "function") md.catalog.refresh(); } catch (e) {}
					try { refreshCascadeCaps(); setTimeout(function () { refreshCascadeCaps(); }, 120); setTimeout(function () { refreshCascadeCaps(); }, 500); } catch (e) {}
				});
			} catch (e) { __forceCapsBusy = false; setCapStatus("失败:EXC"); }
		}
		function cascadeTheme(el) {
			try {
				var dark = pageIsDark();
				var fb = dark ? DARK_FALLBACK : LIGHT_FALLBACK;
				el.style.setProperty("--mf-bg", fb.bg);
				el.style.setProperty("--mf-fg", fb.fg);
				el.style.setProperty("--mf-border", dark ? "rgba(255,255,255,.18)" : "rgba(0,0,0,.14)");
			} catch (e) {}
		}
		function cascadeCurrentText() {
			try {
				var cur = currentSelection(); if (!cur) return "未选择模型";
				var g = null; for (var i = 0; i < cascadeState.groups.length; i++) if (cascadeState.groups[i].id === cur.provider) { g = cascadeState.groups[i]; break; }
				var m = null; if (g) { for (var j = 0; j < g.models.length; j++) if (g.models[j].id === cur.model) { m = g.models[j]; break; } }
				var pName = g ? (g.name || g.id) : cur.provider;
				var mName = m ? (m.name || m.id) : cur.model;
				var txt = pName + " · " + String(mName).replace(/\s*·\s*routing group\s*$/, "");
				var ef = currentEffortLabel(); if (ef) txt += " · " + ef;
				return txt;
			} catch (e) { return ""; }
		}
		function updateCascadeCurrent() { try { if (cascadeEl) { var el = cascadeEl.querySelector(".dsh-mf-capcfg-cur"); if (el) el.textContent = cascadeCurrentText(); } } catch (e) {} }
		function testProviderModels(btn) {
			try {
				var gid = cascadeState.providerId; if (!gid) { var cur0 = currentSelection(); gid = cur0 && cur0.provider; }
				if (!gid) { btn.textContent = "无来源"; return; }
				var rem = getSvc("remote"); var llm = rem && rem.llm;
				if (!llm || typeof llm.discoverModels !== "function") { btn.textContent = "不支持探测"; return; }
				var ns = (gid === "deepseek-official" || gid === "deepseek-account") ? "llm-deepseek" : "llm-pi-ai";
				btn.textContent = "比对中…"; btn.title = "";
				var run = function (prov) {
					var req = { provider: gid };
					try { if (prov && prov.baseURL) req.baseURL = prov.baseURL; if (prov && prov.api) req.api = prov.api; } catch (e) {}
					llm.discoverModels(ns, req).then(function (resp) {
						if (!resp || resp.ok === false) { var code = resp && resp.error && resp.error.code ? resp.error.code : "ERROR"; var msg = resp && resp.error && resp.error.message ? resp.error.message : ""; btn.textContent = "失败:" + code; btn.title = msg; return; }
						var arr = resp.value || []; var set = {};
						for (var i = 0; i < arr.length; i++) { var it = arr[i]; var id = (typeof it === "string") ? it : (it && it.id); if (id) set[id] = 1; }
						var rows = cascadeEl ? cascadeEl.querySelectorAll(".dsh-mf-crow[data-model-id]") : []; var bad = 0;
						for (var j = 0; j < rows.length; j++) { var mid = rows[j].getAttribute("data-model-id"); if (!set[mid]) { rows[j].classList.add("unavailable"); bad++; } else rows[j].classList.remove("unavailable"); }
						btn.textContent = "可用 " + (rows.length - bad) + "/" + rows.length; btn.title = "删除线 = 来源清单里没有该模型";
					}).catch(function (e) { btn.textContent = "失败:NETWORK"; btn.title = String(e && e.message || e); });
				};
				// 先读该来源配置（baseURL/api），再探测
				try {
					var cf = getSvc("configForms");
					if (cf && typeof cf.describe === "function") {
						var face = cf.describe();
						Promise.resolve(face.ensure ? face.ensure() : null).then(function () {
							var snap = face.getSnapshot ? face.getSnapshot() : null;
							var view = snap && snap.value && snap.value.view ? snap.value.view : (snap && snap.view ? snap.view : null);
							var nsArr = (view && view.namespaces) ? view.namespaces : []; var entry = null;
							for (var k = 0; k < nsArr.length; k++) if (nsArr[k].ns === ns) { entry = nsArr[k]; break; }
							var prov = entry && entry.value && entry.value.providers ? entry.value.providers[gid] : null;
							run(prov);
						}).catch(function () { run(null); });
						return;
					}
				} catch (e) {}
				run(null);
			} catch (e) { btn.textContent = "失败:EXC"; }
		}
		function setProbeMark(row, state, msg, at) {
			if (!row) return;
			row.setAttribute("data-probe", state);
			var mk = row.querySelector(".dsh-mf-probe-mark");
			if (!mk) { mk = document.createElement("span"); mk.className = "dsh-mf-probe-mark"; var rt = row.querySelector(".dsh-mf-crowright"); row.insertBefore(mk, rt || null); }
			mk.textContent = state === "pending" ? "…" : (state === "ok" ? "●" : "✕");
			mk.style.color = state === "pending" ? "#f59e0b" : (state === "ok" ? "#22c55e" : "#ef4444");
			var when = at ? new Date(at).toLocaleString() : "";
			mk.title = state === "pending" ? "等待测活" : (state === "ok" ? ("上次测活：可用" + (when ? " · " + when : "")) : ("上次测活：失败" + (msg ? " · " + msg : "") + (when ? " · " + when : "")));
		}
		function clearProbeMark(row) { if (!row) return; row.removeAttribute("data-probe"); var mk = row.querySelector(".dsh-mf-probe-mark"); if (mk) mk.remove(); }
		function clearProbeMarks() { if (!cascadeEl) return; var rows = cascadeEl.querySelectorAll(".dsh-mf-crow[data-model-id]"); for (var i = 0; i < rows.length; i++) clearProbeMark(rows[i]); }
		function applyProbeMarks() {
			if (!cascadeEl || cascadeState.probeRunning) return;
			var rows = cascadeEl.querySelectorAll(".dsh-mf-crow[data-model-id]");
			for (var i = 0; i < rows.length; i++) {
				var row = rows[i]; var pid = row.getAttribute("data-provider-id"); var mid = row.getAttribute("data-model-id"); if (!pid || !mid) continue;
				if (!cascadeState.probeVisible) { clearProbeMark(row); continue; }
				var rec = cascadeState.probeResults && cascadeState.probeResults[probeKey(pid, mid)];
				if (rec) setProbeMark(row, rec.ok ? "ok" : "bad", rec.message || rec.code || "", rec.at); else clearProbeMark(row);
			}
		}
		function loadProbeResults() {
			return fetch(PROBE_RESULTS_URL, { method: "GET" }).then(function (r) { return r.json(); }).then(function (v) {
				var res = v && v.ok && v.results && typeof v.results === "object" && !Array.isArray(v.results) ? v.results : null;
				if (res && Object.keys(res).length) { cascadeState.probeResults = res; writeLocalProbeResults(res); }
				else { var local = readLocalProbeResults(); if (local) cascadeState.probeResults = local; }
				applyProbeMarks();
			}).catch(function () { var local = readLocalProbeResults(); if (local) cascadeState.probeResults = local; applyProbeMarks(); });
		}
		function saveProbeResults() {
			writeLocalProbeResults(cascadeState.probeResults);
			clearTimeout(cascadeState.probeSaveTimer);
			cascadeState.probeSaveTimer = setTimeout(function () {
				try { fetch(PROBE_RESULTS_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ results: cascadeState.probeResults }) }).catch(function () {}); } catch (e) {}
			}, 500);
		}
		function probeProviderModels(btn) {
			if (btn.__mfProbeBusy) return;
			var gid = cascadeState.providerId; if (!gid) { var cur0 = currentSelection(); gid = cur0 && cur0.provider; }
			if (!gid) { setCapStatus("请先选择来源"); return; }
			var g = null; for (var i = 0; i < cascadeState.groups.length; i++) if (cascadeState.groups[i].id === gid) { g = cascadeState.groups[i]; break; }
			if (!g || !g.models || !g.models.length) { setCapStatus("该来源没有模型"); return; }
			var cf = getSvc("configForms"); if (!cf || typeof cf.describe !== "function") { setCapStatus("设置服务不可用"); return; }
			btn.__mfProbeBusy = true; cascadeState.probeRunning = true; var oldLabel = "测活"; btn.textContent = "测活中…"; setCapStatus("测活准备中…");
			var face = cf.describe();
			Promise.resolve(face && face.ensure ? face.ensure() : null).then(function () {
				var snap = face.getSnapshot ? face.getSnapshot() : null;
				var view = snap && snap.value && snap.value.view ? snap.value.view : (snap && snap.view ? snap.view : null);
				var nss = (view && view.namespaces) ? view.namespaces : []; var ns = null;
				for (var ni = 0; ni < nss.length; ni++) if (nss[ni].ns === "llm-pi-ai") { ns = nss[ni]; break; }
				var prov = ns && ns.value && ns.value.providers ? ns.value.providers[gid] : null;
				if (!prov || !prov.baseURL) { setCapStatus("该来源无 baseURL，无法测活"); btn.textContent = oldLabel; btn.__mfProbeBusy = false; return; }
				var models = g.models.slice(); var total = models.length, idx = 0, done = 0, okCount = 0, failCount = 0, active = 0, noRoute = false;
				var rows = cascadeEl ? cascadeEl.querySelectorAll(".dsh-mf-crow[data-model-id]") : [];
				for (var rj = 0; rj < rows.length; rj++) { rows[rj].removeAttribute("data-probe"); var oldMark = rows[rj].querySelector(".dsh-mf-probe-mark"); if (oldMark) oldMark.remove(); }
				for (var pi = 0; pi < models.length; pi++) setProbeMark(cascadeState.modelRows && cascadeState.modelRows[models[pi].id], "pending", "");
				setCapStatus("测活 0/" + total);
				function finishOne(m, ok, msg, code, status) {
					done++; if (ok) okCount++; else failCount++; if (code === "NO_ROUTE") noRoute = true;
					var at = Date.now();
					cascadeState.probeResults[probeKey(gid, m.id)] = { ok: !!ok, code: code || "", status: status || 0, message: msg || "", at: at };
					saveProbeResults();
					setProbeMark(cascadeState.modelRows && cascadeState.modelRows[m.id], ok ? "ok" : "bad", msg, at);
					active--;
					setCapStatus("测活 " + done + "/" + total + "（可用 " + okCount + "）");
					if (done >= total) {
						btn.__mfProbeBusy = false; cascadeState.probeRunning = false; btn.textContent = okCount === total ? "全部可用" : "测活完成";
						saveProbeResults();
						if (!cascadeState.probeVisible) clearProbeMarks(); else applyProbeMarks();
						setCapStatus(noRoute ? "测活失败：宿主 probe 未加载，需彻底重启 DSH" : ("测活完成：可用 " + okCount + "/" + total + "（失败 " + failCount + "）"));
						setTimeout(function () { if (!btn.__mfProbeBusy) btn.textContent = oldLabel; }, 2600);
					} else pump();
				}
				function requestOne(m) {
					return fetch("/plugin/dsh-model-fold/probe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: gid, model: m.id, baseURL: prov.baseURL, api: prov.api || "openai-completions", apiKeyEnv: prov.apiKeyEnv || "", apiKey: prov.apiKey || "" }) }).then(function (r) {
						if (r.status === 404) return { ok: false, code: "NO_ROUTE", message: "宿主 probe 未加载" };
						if (r.status === 403) return { ok: false, code: "NO_ROUTE", message: "宿主 probe 被拒绝（403）" };
						return r.json().catch(function () { return { ok: false, code: "HTTP_" + r.status, message: "HTTP " + r.status }; });
					});
				}
				function pump() { while (active < 4 && idx < total) { (function (m) { active++; requestOne(m).then(function (v) { finishOne(m, !!(v && v.ok), (v && (v.message || v.code)) || "", v && v.code, v && v.status); }).catch(function (e) { finishOne(m, false, String(e && e.message || e), "NETWORK"); }); })(models[idx]); idx++; } }
				pump();
			}).catch(function () { setCapStatus("测活失败：设置读取异常"); btn.textContent = oldLabel; btn.__mfProbeBusy = false; cascadeState.probeRunning = false; clearProbeMarks(); applyProbeMarks(); });
		}
		function syncCascadeCfg(cfg) {
			try { var cur = readFontSize(); var vb = cfg.querySelector(".dsh-mf-capcfg-visible"); if (vb) { if (cascadeState.probeVisible) vb.setAttribute("data-on", "1"); else vb.removeAttribute("data-on"); } var fi = cfg.querySelector(".dsh-mf-fsinput"); if (fi) fi.value = String(cur); var bs = cfg.querySelectorAll(".dsh-mf-capcfg-btn"); for (var i = 0; i < bs.length; i++) { var b = bs[i]; if (b.hasAttribute("data-forcecaps")) { if (b.getAttribute("data-force-mode") === "on" && getForceCaps(true) && b.getAttribute("data-scope") === getForceScope()) b.setAttribute("data-on", "1"); else b.removeAttribute("data-on"); continue; } if (parseInt(b.getAttribute("data-fs"), 10) === cur) b.setAttribute("data-on", "1"); else b.removeAttribute("data-on"); } } catch (e) {}
		}
		function buildCascade() {
			var p = document.createElement("div"); p.id = CASCADE_ID;
			p.addEventListener("mousedown", function (ev) { ev.stopPropagation(); });
			var topRow = document.createElement("div"); topRow.className = "dsh-mf-toprow";
			var input = document.createElement("input"); input.type = "text"; input.className = "dsh-mf-search"; input.placeholder = "搜索模型…"; input.setAttribute("aria-label", "搜索模型");
			input.addEventListener("input", function () { cascadeRenderSearch(input.value); });
			input.addEventListener("mousedown", function (ev) { ev.stopPropagation(); });
			var stBar = document.createElement("div"); stBar.className = "dsh-mf-statusbar dsh-mf-statusbar-idle"; stBar.textContent = ""; stBar.title = "状态";
			topRow.appendChild(input); topRow.appendChild(stBar); p.appendChild(topRow);
			var colsWrap = document.createElement("div"); colsWrap.className = "dsh-mf-cols";
			["来源", "模型", "强度"].forEach(function (label, ci) {
				var col = document.createElement("div"); col.className = "dsh-mf-col"; col.setAttribute("data-col", String(ci + 1));
				var hd = document.createElement("div"); hd.className = "dsh-mf-colhead"; hd.textContent = label;
				var body = document.createElement("div"); body.className = "dsh-mf-colbody";
				col.appendChild(hd); col.appendChild(body); colsWrap.appendChild(col);
			});
			p.appendChild(colsWrap);
			var cfg = document.createElement("div"); cfg.className = "dsh-mf-capcfg";
			var cfgTop = document.createElement("div"); cfgTop.className = "dsh-mf-cfgrow dsh-mf-cfgrow-main";
			var curEl = document.createElement("span"); curEl.className = "dsh-mf-capcfg-cur"; cfgTop.appendChild(curEl);
			var lbl = document.createElement("span"); lbl.className = "dsh-mf-capcfg-lbl"; lbl.textContent = "字号"; cfgTop.appendChild(lbl);
			var fsIn2 = document.createElement("input");
			fsIn2.type = "number"; fsIn2.min = String(FS_MIN); fsIn2.max = String(FS_MAX); fsIn2.step = "1";
			fsIn2.className = "dsh-mf-fsinput"; fsIn2.value = String(readFontSize()); fsIn2.title = "字号 " + FS_MIN + "-" + FS_MAX;
			fsIn2.addEventListener("mousedown", function (e) { e.stopPropagation(); });
			fsIn2.addEventListener("change", function () {
				var v = parseInt(fsIn2.value, 10); if (!(v >= FS_MIN && v <= FS_MAX)) v = readFontSize();
				fsIn2.value = String(v); writeFontSize(v); applyFontSize(); syncCascadeCfg(cfg);
			});
			cfgTop.appendChild(fsIn2);
			var cfgBot = document.createElement("div"); cfgBot.className = "dsh-mf-cfgrow dsh-mf-cfgrow-actions";
			function mkForce(scope, label, mode) {
				var b = document.createElement("button"); b.type = "button"; b.className = "dsh-mf-capcfg-btn dsh-mf-capcfg-force"; b.textContent = label; b.title = (mode === "off" ? "一键取消全部模型的识图开关与思考强度" : "一键打开全部模型的识图开关与思考强度"); b.setAttribute("data-forcecaps", ""); b.setAttribute("data-scope", scope); b.setAttribute("data-force-mode", mode);
				b.addEventListener("mousedown", function (e) { e.stopPropagation(); });
				b.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); setForceCaps(true); setForceScope(scope); syncCascadeCfg(cfg); try { runForceCapsOnce(true, scope, mode); } catch (er) {} });
				cfgBot.appendChild(b);
			}
			mkForce("all", "开启识图+思考", "on");
			mkForce("all", "关闭识图+思考", "off");
			var vbtn = document.createElement("button"); vbtn.type = "button"; vbtn.className = "dsh-mf-capcfg-btn dsh-mf-capcfg-visible"; vbtn.textContent = "显示测活"; vbtn.title = "显示/隐藏上次测活结果（结果已保存，关闭只隐藏）";
			vbtn.addEventListener("mousedown", function (e) { e.stopPropagation(); });
			vbtn.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); cascadeState.probeVisible = !cascadeState.probeVisible; writeProbeVisible(cascadeState.probeVisible); if (cascadeState.probeVisible) { applyProbeMarks(); var n = Object.keys(cascadeState.probeResults || {}).length; setCapStatus(n ? ("已显示测活结果（" + n + " 条）") : "暂无测活结果"); } else { clearProbeMarks(); setCapStatus("已隐藏测活结果"); } syncCascadeCfg(cfg); });
			cfgBot.appendChild(vbtn);
			var pbtn = document.createElement("button"); pbtn.type = "button"; pbtn.className = "dsh-mf-capcfg-btn dsh-mf-capcfg-probe"; pbtn.textContent = "测活"; pbtn.title = "逐模型真实可用性（会消耗每个模型一次极短请求）";
			pbtn.addEventListener("mousedown", function (e) { e.stopPropagation(); });
			pbtn.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); probeProviderModels(pbtn); });
			cfgBot.appendChild(pbtn);
			var tbtn = document.createElement("button"); tbtn.type = "button"; tbtn.className = "dsh-mf-capcfg-btn dsh-mf-capcfg-test"; tbtn.textContent = "比对"; tbtn.title = "清单比对（非逐模型测活）";
			tbtn.addEventListener("mousedown", function (e) { e.stopPropagation(); });
			tbtn.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); testProviderModels(tbtn); });
			cfgBot.appendChild(tbtn);
			cfg.appendChild(cfgTop); cfg.appendChild(cfgBot); p.appendChild(cfg); syncCascadeCfg(cfg);
			document.body.appendChild(p);
			cascadeEl = p; cascadeSearchEl = input; cascadeTheme(p);
			return p;
		}

		function cascadeRow(colBody, text, on, onHover, onClick, badge, caps) {
			var r = document.createElement("div"); r.className = "dsh-mf-crow" + (on ? " on" : "");
			var nm = document.createElement("span"); nm.className = "dsh-mf-crowname"; nm.textContent = text; nm.title = text;
			r.appendChild(nm);
			if (caps && (caps.image || caps.think)) r.appendChild(capIcons(caps));
			var rt = document.createElement("span"); rt.className = "dsh-mf-crowright";
			if (on) rt.textContent = "✓"; else if (badge !== undefined && badge !== null) rt.textContent = badge;
			r.appendChild(rt);
			if (onHover) r.addEventListener("mouseenter", onHover);
			if (onClick) r.addEventListener("click", function (ev) { ev.preventDefault(); ev.stopPropagation(); onClick(); });
			colBody.appendChild(r); return r;
		}

		function cascadeCols() {
			if (!cascadeEl) return [];
			return cascadeEl.querySelectorAll(".dsh-mf-colbody");
		}
		function cascadeSelect(providerId, modelId, effort) {
			try {
				var sid = findSessionId(); var md = getSvc("modelDirectories");
				if (!sid || !md) return;
				var dir = md.directoryFor(sid); if (!dir || typeof dir.select !== "function") return;
				var sel = { provider: providerId, model: modelId };
				if (effort !== undefined && effort !== null) sel.reasoningEffort = effort;
				dir.select(sel);
			} catch (e) {}
			closeCascade();
		}
		function buildCapsFromConfig(faceIn) {
			var out = { byProvider: {}, byModel: {} };
			try {
				var cf = getSvc("configForms"); if (!cf || typeof cf.describe !== "function") return out;
				var face = faceIn || (cf && cf.describe ? cf.describe() : null); var snap = face && face.getSnapshot ? face.getSnapshot() : null;
				var view = snap && snap.value && snap.value.view ? snap.value.view : (snap && snap.view ? snap.view : null);
				var nss = (view && view.namespaces) ? view.namespaces : [];
				for (var ni = 0; ni < nss.length; ni++) {
					var ns = nss[ni]; if (!ns || !ns.value) continue;
					if (ns.ns === "llm-pi-ai") {
						var provs = ns.value.providers || {};
						for (var pk in provs) { if (!Object.prototype.hasOwnProperty.call(provs, pk)) continue;
							if (!out.byProvider[pk]) out.byProvider[pk] = {};
							var ms = Array.isArray(provs[pk].models) ? provs[pk].models : [];
							for (var j = 0; j < ms.length; j++) { var m = ms[j]; if (!m || !m.id) continue;
								var caps = { image: Array.isArray(m.input) && m.input.indexOf("image") >= 0, think: !!(m.reasoningEfforts && typeof m.reasoningEfforts === "object" && Object.keys(m.reasoningEfforts).length) };
								out.byProvider[pk][m.id] = caps; out.byModel[m.id] = caps;
							}
						}
					} else if (ns.ns === "llm-deepseek") {
						var dms = Array.isArray(ns.value.models) ? ns.value.models : [];
						for (var dj = 0; dj < dms.length; dj++) { var dm = dms[dj]; if (!dm || !dm.id) continue;
							var dcaps = { image: Array.isArray(dm.inputModalities) && dm.inputModalities.indexOf("image") >= 0, think: false };
							out.byModel[dm.id] = dcaps;
							var gids = ["deepseek", "deepseek-official", "deepseek-account", "deepseek-web"];
							for (var gi = 0; gi < gids.length; gi++) { if (!out.byProvider[gids[gi]]) out.byProvider[gids[gi]] = {}; out.byProvider[gids[gi]][dm.id] = dcaps; }
						}
					}
				}
			} catch (e) {}
			return out;
		}
		function refreshCascadeIcons() {
			if (!cascadeEl) return;
			var rows = cascadeEl.querySelectorAll(".dsh-mf-crow[data-model-id]");
			for (var i = 0; i < rows.length; i++) {
				var row = rows[i]; var pid = row.getAttribute("data-provider-id"); var mid = row.getAttribute("data-model-id"); if (!pid || !mid) continue;
				var caps = modelCaps(pid, { id: mid }); var old = row.querySelector(".dsh-mf-caps"); if (old) old.remove();
				if (caps.image || caps.think) { var rt = row.querySelector(".dsh-mf-crowright"); row.insertBefore(capIcons(caps), rt || null); }
			}
		}
		function refreshCascadeCaps(cb) {
			try {
				var cf = getSvc("configForms"); if (!cf || typeof cf.describe !== "function") { if (cb) cb(); return; }
				var face = cf.describe();
				Promise.resolve(face && face.ensure ? face.ensure() : null).then(function () {
					try { cascadeState.caps = buildCapsFromConfig(face); refreshCascadeIcons(); } catch (e) {}
					if (cb) cb();
				}).catch(function () { if (cb) cb(); });
			} catch (e) { if (cb) cb(); }
		}
		function capsOfModel(m) {
			return { image: Array.isArray(m.input) && m.input.indexOf("image") >= 0, think: !!(m.reasoningEfforts && typeof m.reasoningEfforts === "object" && Object.keys(m.reasoningEfforts).length) };
		}
		function applyCapsFromOp(op) {
			if (!op || !Array.isArray(op.path) || !Array.isArray(op.value)) return;
			if (op.path[0] === "providers" && op.path[2] === "models") {
				var pk = op.path[1]; if (!cascadeState.caps.byProvider[pk]) cascadeState.caps.byProvider[pk] = {};
				for (var i = 0; i < op.value.length; i++) { var m = op.value[i]; if (m && m.id) cascadeState.caps.byProvider[pk][m.id] = capsOfModel(m); }
			} else if (op.path[0] === "models") {
				for (var j = 0; j < op.value.length; j++) { var dm = op.value[j]; if (!dm || !dm.id) continue; var dc = { image: Array.isArray(dm.inputModalities) && dm.inputModalities.indexOf("image") >= 0, think: false }; cascadeState.caps.byModel[dm.id] = dc; var gids = ["deepseek", "deepseek-official", "deepseek-account", "deepseek-web"]; for (var g = 0; g < gids.length; g++) { if (!cascadeState.caps.byProvider[gids[g]]) cascadeState.caps.byProvider[gids[g]] = {}; cascadeState.caps.byProvider[gids[g]][dm.id] = dc; } }
			}
		}
		function modelCaps(providerId, m) {
			var caps = cascadeState.caps || { byProvider: {}, byModel: {} };
			var c = (caps.byProvider && caps.byProvider[providerId] && caps.byProvider[providerId][m.id]) || (caps.byModel && caps.byModel[m.id]);
			if (c) return { image: !!c.image, think: !!c.think };
			return { image: false, think: false };
		}
		function capIcons(caps) {
			var box = document.createElement("span"); box.className = "dsh-mf-caps";
			if (caps.image) { var a = document.createElement("span"); a.className = "dsh-mf-cap"; a.title = "图片设置已打开（来自模型配置；不代表模型真实能力）"; a.setAttribute("aria-label", "图片设置已打开"); a.innerHTML = '<svg viewBox="0 0 16 16"><rect x="2" y="3" width="12" height="10" rx="2"/><circle cx="5.6" cy="6.6" r="1.1" fill="currentColor" stroke="none"/><path d="M3.2 11.6l3.2-3.2 2.4 2.4 1.9-1.9 2.1 2.7"/></svg>'; box.appendChild(a); }
			if (caps.think) { var b = document.createElement("span"); b.className = "dsh-mf-cap"; b.title = "思考强度已打开（来自模型配置；不代表模型真实能力）"; b.setAttribute("aria-label", "思考强度已打开"); b.innerHTML = '<svg viewBox="0 0 16 16"><path d="M8 3.2a2.6 2.6 0 0 0-2.6 2.6v.3A2.2 2.2 0 0 0 4.6 10a2.2 2.2 0 0 0 3.4 1.9V3.2z"/><path d="M8 3.2a2.6 2.6 0 0 1 2.6 2.6v.3A2.2 2.2 0 0 1 11.4 10a2.2 2.2 0 0 1-3.4 1.9V3.2z"/><path d="M8 3.2v8.7"/></svg>'; box.appendChild(b); }
			return box;
		}
		function cascadeRenderModels(providerId) {
			var cols = cascadeCols(); if (!cols.length) return;
			var col = cols[1]; col.innerHTML = ""; cascadeState.modelRows = {};
			cascadeState.providerId = providerId; cascadeState.modelId = null;
			cascadeSetPath((cascadeState.providerRows && cascadeState.providerRows[providerId]) || null, null);
			var g = null; for (var i = 0; i < cascadeState.groups.length; i++) if (cascadeState.groups[i].id === providerId) { g = cascadeState.groups[i]; break; }
			if (!g) return;
			var cur = currentSelection();
			for (var j = 0; j < g.models.length; j++) {
				(function (m) {
					var caps = modelCaps(g.id, m); var mr = cascadeRow(col, m.name || m.id, !!(cur && cur.provider === g.id && cur.model === m.id), function () { cascadeRenderEfforts(g, m); }, function () { cascadeSelect(g.id, m.id); }, null, caps); mr.setAttribute("data-model-id", m.id); mr.setAttribute("data-provider-id", g.id); cascadeState.modelRows[m.id] = mr;
				})(g.models[j]);
			}
			applyProbeMarks();
		}
		function cascadeRenderEfforts(g, m) {
			var cols = cascadeCols(); if (!cols.length) return;
			var col = cols[2]; col.innerHTML = "";
			cascadeState.modelId = m.id;
			cascadeSetPath((cascadeState.providerRows && cascadeState.providerRows[g.id]) || null, (cascadeState.modelRows && cascadeState.modelRows[m.id]) || null);
			var cur = currentSelection();
			var efforts = (m.reasoning && m.reasoning.efforts && m.reasoning.efforts.length) ? m.reasoning.efforts : null;
			var list = [];
			if (efforts) { for (var i = 0; i < efforts.length; i++) list.push({ id: efforts[i].id, label: efforts[i].name || EFFORT_TIER_LABEL[efforts[i].id] || efforts[i].id }); }
			else { for (var k = 0; k < EFFORT_TIERS_FALLBACK.length; k++) list.push({ id: EFFORT_TIERS_FALLBACK[k], label: EFFORT_TIER_LABEL[EFFORT_TIERS_FALLBACK[k]] || EFFORT_TIERS_FALLBACK[k] }); }
			var curEff = (cur && cur.provider === g.id && cur.model === m.id) ? (cur.reasoningEffort || (m.reasoning && m.reasoning.defaultEffort)) : (m.reasoning && m.reasoning.defaultEffort);
			for (var t = 0; t < list.length; t++) {
				(function (lv) { cascadeRow(col, lv.label, curEff === lv.id, null, function () { cascadeSelect(g.id, m.id, lv.id); }); })(list[t]);
			}
		}
		function cascadeSetPath(providerEl, modelEl) {
			try {
				if (!cascadeEl) return; var all = cascadeEl.querySelectorAll(".dsh-mf-crow");
				for (var i = 0; i < all.length; i++) all[i].classList.remove("path");
				if (providerEl) providerEl.classList.add("path");
				if (modelEl) modelEl.classList.add("path");
			} catch (e) {}
		}
		function cascadeRenderProviders() {
			var cols = cascadeCols(); if (cols.length < 3) return;
			cols[0].innerHTML = ""; cascadeState.providerRows = {};
			var cur = currentSelection();
			for (var i = 0; i < cascadeState.groups.length; i++) {
				(function (g) { var rr = cascadeRow(cols[0], g.name || g.id, !!(cur && cur.provider === g.id), function () { cascadeRenderModels(g.id); }, function () { cascadeRenderModels(g.id); }, "(" + g.models.length + ")"); cascadeState.providerRows[g.id] = rr; })(cascadeState.groups[i]);
			}
		}
		function cascadeRenderSearch(q) {
			var cols = cascadeCols(); if (cols.length < 3) return;
			q = (q || "").trim().toLowerCase();
			if (!q) { cascadeRenderProviders(); cols[1].innerHTML = ""; cols[2].innerHTML = ""; var cur = currentSelection(); var init = null; for (var i = 0; i < cascadeState.groups.length; i++) if (cur && cascadeState.groups[i].id === cur.provider) { init = cascadeState.groups[i]; break; } if (!init) init = cascadeState.groups[0]; if (init) cascadeRenderModels(init.id); return; }
			cols[0].innerHTML = ""; cols[2].innerHTML = ""; cascadeSetPath(null, null);
			var matches = [];
			for (var gi = 0; gi < cascadeState.groups.length; gi++) {
				var g = cascadeState.groups[gi]; var gn = String(g.name || g.id || "").toLowerCase();
				for (var mi = 0; mi < g.models.length; mi++) { var m = g.models[mi]; var mn = String(m.name || m.id || "").toLowerCase(); if (mn.indexOf(q) >= 0 || gn.indexOf(q) >= 0) matches.push({ g: g, m: m }); }
			}
			var hint = document.createElement("div"); hint.className = "dsh-mf-colhead"; hint.textContent = "结果 " + matches.length; cols[0].appendChild(hint);
			cols[1].innerHTML = "";
			matches.slice(0, 200).forEach(function (it) { cascadeRow(cols[1], (it.g.name ? it.g.name + " · " : "") + (it.m.name || it.m.id), false, function () { cascadeRenderEfforts(it.g, it.m); }, function () { cascadeSelect(it.g.id, it.m.id); }); });
		}
		function openCascade(trigger) {
			var groups = [];
			try { var md = getSvc("modelDirectories"); var snap = md && md.catalog && md.catalog.store.getSnapshot(); groups = (snap && snap.value && snap.value.groups) ? snap.value.groups : []; } catch (e) {}
			if (!groups.length) return;
			if (!cascadeEl) buildCascade();
			var p = cascadeEl; cascadeState.groups = groups; setCapStatus(""); try { cascadeState.caps = buildCapsFromConfig(); } catch (e) { cascadeState.caps = { byProvider: {}, byModel: {} }; }
			refreshCascadeCaps();
			cascadeTheme(p);
			if (getForceCaps(true)) { try { runForceCapsOnce(false, "all"); } catch (e) {} }
			try { if (cascadeSearchEl) cascadeSearchEl.value = ""; } catch (e) {}
			var cols = cascadeCols(); cols[0].innerHTML = ""; cols[1].innerHTML = ""; cols[2].innerHTML = "";
			cascadeRenderProviders();
			var cur = currentSelection(); var init = null;
			for (var q = 0; q < groups.length; q++) if (cur && groups[q].id === cur.provider) { init = groups[q]; break; }
			if (!init) init = groups[0];
			if (init) cascadeRenderModels(init.id);
			loadProbeResults();
			p.classList.add("dsh-mf-open");
			p.style.visibility = "hidden"; p.style.left = "0px"; p.style.top = "0px";
			var pw = p.offsetWidth, ph = p.offsetHeight, ar = trigger.getBoundingClientRect();
			var left = ar.right - pw; if (left < 8) left = 8;
			var top = ar.top - ph - 8; if (top < 8) top = Math.min(window.innerHeight - ph - 8, ar.bottom + 8);
			p.style.left = left + "px"; p.style.top = top + "px"; p.style.visibility = "visible";
			updateCascadeCurrent();
		}
		function closeCascade() { if (cascadeEl) cascadeEl.classList.remove("dsh-mf-open"); cascadeState.providerId = null; cascadeState.modelId = null; }
		function toggleCascade(trigger) { if (cascadeEl && cascadeEl.classList.contains("dsh-mf-open")) closeCascade(); else openCascade(trigger); }

		function start(ctx) {
			ensureStyle();
			cascadeState.probeVisible = readProbeVisible();
			PLUGIN_CTX = ctx || null;
			try { buildEffortIndex(); } catch (e) {}
			var timer = null;
			var observer = new MutationObserver(function () {
				try { quickHideRoot(); } catch (e) {}
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
			//   (2) 来源标题（section[role=group] > [data-menu-group-heading]）—— 只
			//       preventDefault。标题是不带 button 的 div，而官方 onMouseDown
			//       只在 `closest("button")` 时 preventDefault，所以标题必须由插件
			//       自己保焦点；否则一按下焦点就离开菜单 → 官方 rootRef onBlur
			//       （relatedTarget 不在 root/menu 内）→ close() → 菜单卸载、
			//       刚弹出的面板随之消失 = 用户看到的「闪一下」。
			//       这里 **不** stopPropagation：click 仍需正常派发到委托。
			// ★ v0.4.9 新增（2026-10-09）：hover 模式的「悬停就地展开」。
			//   需求（用户原话）：打开菜单直接看到所有来源，鼠标滑过会展开来源下的
			//   所有模型，列表过长可上下滚动，左键确定切换模型，且来源中显示当前模型。
			//
			//   实现要点：
			//     · 复用既有 FOLD_ATTR（CSS 用 :has() 隐藏组内模型项），不新增样式机制
			//     · 靠 titleContext(target) 反查归属，**不缓存节点**（React 换节点也命中）
			//     · 只在 hover 模式生效，panel/inline 完全不受影响
			//     · 离开**整组**（而非仅标题）才收起，便于鼠标从标题移入模型列表
			var HOVER_HIDE_MS = 240; // 离开后的收起延迟，避免掠过间隙时闪烁
			var hoverHideTimer = null;
			// ★ v0.5.0 修正（2026-10-09）：hover = **悬停触发侧悬浮展开**。
			//   用户澄清：「我说的悬浮展开指的是侧悬浮展开」——
			//   即鼠标悬停来源标题时，右侧滑出该来源的模型子面板（复用 openPanel），
			//   而不是先前实现的下方就地展开。
			//
			//   要点：
			//     · 悬停 -> openPanel（与 panel 模式的单击同一条代码路径）
			//     · 离开「标题 ∪ 面板」才关；进入面板本身不关（mousemove 复查）
			//     · 切换来源 -> 直接换成新来源的面板（openPanel 内部会重置）
			var HOVER_HIDE_MS = 260; // 离开后的收起延迟，避免掠过间隙时闪烁
			var hoverHideTimer = null;
			var onDocMouseOver = function (event) {
				if (getMode() !== "hover") return;
				var target = event.target;
				if (!target || !target.closest) return;
				if (panelEl && panelEl.contains(target)) {
					if (hoverHideTimer) { clearTimeout(hoverHideTimer); hoverHideTimer = null; }
					return;
				}
				var ctx = titleContext(target);
				if (!ctx) return;
				if (hoverHideTimer) { clearTimeout(hoverHideTimer); hoverHideTimer = null; }
				// 已是当前面板的来源 -> 不重复开（避免每帧重绘）
				if (panelKey === ctx.key && panelEl && panelEl.classList.contains("dsh-mf-open")) return;
				openPanel(ctx.menu, ctx.title, ctx.section);
			};
			var onDocMouseOut = function (event) {
				if (getMode() !== "hover") return;
				var target = event.target;
				if (!target || !target.closest) return;
				var related = event.relatedTarget;
				// 仍落在「标题或面板」内 -> 不收起
				if (related && panelEl && panelEl.contains(related)) return;
				if (related && effortPanelEl && effortPanelEl.contains(related)) return;
				var ctx = titleContext(target);
				if (!ctx) return;
				if (related && ctx.section.contains(related)) return;
				if (hoverHideTimer) clearTimeout(hoverHideTimer);
				hoverHideTimer = setTimeout(function () {
					hoverHideTimer = null;
					if (getMode() !== "hover") return;
					// 鼠标可能已回到标题或面板上 -> 复查后不关
					var p = panelEl;
					if (p && p.matches && p.matches(":hover")) return;
					if (ctx.section.matches && ctx.section.matches(":hover")) return;
					closePanel();
				}, HOVER_HIDE_MS);
			};

			var onDocMouseDown = function (event) {
				var target = event.target;
				if (!target) return;
				if (panelEl && panelEl.classList.contains("dsh-mf-open") && panelEl.contains(target)) {
					event.preventDefault();
					event.stopPropagation();
					return;
				}
				if (effortPanelEl && effortPanelEl.contains(target)) { event.preventDefault(); event.stopPropagation(); return; }
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
				if (!title) title = section.querySelector(":scope > [data-menu-group-heading]");
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
				// v0.4.9：hover 模式下展开/收起由悬停驱动，点击标题不改变折叠态
				//   （避免与 mouseover 打架）；双击切模式仍然有效。
				// v0.5.0：hover 模式下点击标题 = 打开/关闭该来源的面板（与悬停同效果）
				if (getMode() === "hover") {
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
				// v0.4.9：三态循环 panel -> hover -> inline -> panel
				var cur = getMode();
				var next = cur === "panel" ? "hover" : (cur === "hover" ? "inline" : "panel");
				setMode(next);
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
			// ★ v0.6.1：点模型按钮瞬间就把官方菜单预隐藏，彻底消除“官方默认面板一闪”
			var onDocModelTriggerDown = function (ev) {
				try {
					var el = ev.target; var trg = el && el.closest ? el.closest('button[aria-haspopup="menu"]') : null;
					if (!trg || !trg.querySelector || !trg.querySelector("[data-provider-id][data-model-id]")) return;
					document.documentElement.setAttribute("data-mf-model-opening", "1");
					setTimeout(function () { try { if (document.querySelector('div[role="menu"] section[role="group"]')) document.documentElement.removeAttribute("data-mf-model-opening"); } catch (e) {} }, 600);
					setTimeout(function () { try { document.documentElement.removeAttribute("data-mf-model-opening"); } catch (e) {} }, 1000);
				} catch (e) {}
			};
			document.addEventListener("mousedown", onDocModelTriggerDown, true);
			document.addEventListener("pointerdown", onDocModelTriggerDown, true);
			// ★ v0.6.4：截断官方模型菜单的打开，改为插件自绘三级级联面板（无闪屏）
			var onDocCascadeClick = function (event) {
				try {
					var el = event.target; var trg = el && el.closest ? el.closest('button[aria-haspopup="menu"]') : null;
					if (!trg || !trg.querySelector || !trg.querySelector("[data-provider-id][data-model-id]")) return;
					event.preventDefault(); event.stopPropagation();
					if (event.stopImmediatePropagation) event.stopImmediatePropagation();
					toggleCascade(trg);
				} catch (e) {}
			};
			document.addEventListener("click", onDocCascadeClick, true);
			var onDocCascadeOutside = function (event) {
				try { if (cascadeEl && cascadeEl.classList.contains("dsh-mf-open")) { var t2 = event.target; if (cascadeEl.contains(t2)) return; var tr = t2 && t2.closest ? t2.closest('button[aria-haspopup="menu"]') : null; if (tr) return; closeCascade(); } } catch (e) {}
			};
			document.addEventListener("mousedown", onDocCascadeOutside, true);
			document.addEventListener("mousedown", onDocMouseDown, true);
			// v0.4.9：hover 模式的悬停展开/收起（仅该模式下生效，内部自守卫）
			document.addEventListener("mouseover", onDocMouseOver, false);
			document.addEventListener("mouseout", onDocMouseOut, false);
			// ★ v0.6.0：第三级强度浮层的悬停委托（对自建 item 与官方 model 按钮都生效）
			var onDocModelOver = function (event) {
				var info = modelTargetInfo(event.target); if (!info) return;
				if (effortHideTimer) { clearTimeout(effortHideTimer); effortHideTimer = null; }
				if (effortState && effortState.provider === info.provider && effortState.model === info.model && effortPanelEl && effortPanelEl.classList.contains("dsh-mf-e-open")) return;
				openEffortPanel(info.el, info.provider, info.model, info.name, "list");
			};
			var onDocModelOut = function (event) {
				var info = modelTargetInfo(event.target); if (!info) return;
				var related = event.relatedTarget;
				if (related && effortPanelEl && effortPanelEl.contains(related)) return;
				if (related && info.el && (info.el === related || (info.el.contains && info.el.contains(related)))) return;
				scheduleEffortHide();
			};
			document.addEventListener("mouseover", onDocModelOver, true);
			document.addEventListener("mouseout", onDocModelOut, true);
			document.addEventListener("click", onDocTitleClick, true);
			var onDocClick = function (event) {
				if (!panelEl || !panelEl.classList.contains("dsh-mf-open")) return;
				var target = event.target;
				if (panelEl.contains(target)) return;
				if (effortPanelEl && effortPanelEl.contains(target)) return;
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
			// ★ v0.6.0：触发器点击改为“只弹三级强度面板”，不再打开官方模型列表
			var onDocCapTrigger = function (event) {
				try {
					var el = event.target;
					var trg = el && el.closest ? el.closest('button[aria-haspopup="menu"]') : null;
					if (!trg || !trg.querySelector || !trg.querySelector("[data-provider-id][data-model-id]")) return;
					event.preventDefault();
					if (event.stopImmediatePropagation) event.stopImmediatePropagation(); else event.stopPropagation();
					var cur = currentSelection(); var provider, model, name;
					if (cur) { provider = cur.provider; model = cur.model; name = model; }
					else {
						var sp = trg.querySelector("[data-provider-id][data-model-id]"); if (!sp) return;
						provider = sp.getAttribute("data-provider-id"); model = sp.getAttribute("data-model-id"); name = (trg.textContent || model || "").trim();
					}
					if (effortState && effortState.provider === provider && effortState.model === model && effortPanelEl && effortPanelEl.classList.contains("dsh-mf-e-open")) { closeEffortPanel(); return; }
					openEffortPanel(trg, provider, model, name, "trigger");
				} catch (e) {}
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
				try { document.removeEventListener("click", onDocCascadeClick, true); } catch (e) {}
				try { document.removeEventListener("mousedown", onDocCascadeOutside, true); } catch (e) {}
				try { if (cascadeEl) { cascadeEl.remove(); cascadeEl = null; } } catch (e) {}
				try { document.removeEventListener("mousedown", onDocModelTriggerDown, true); } catch (e) {}
				try { document.removeEventListener("pointerdown", onDocModelTriggerDown, true); } catch (e) {}
				try { document.removeEventListener("click", onDocCapTrigger, true); } catch (e) {}
				try { document.removeEventListener("mouseover", onDocModelOver, true); } catch (e) {}
				try { document.removeEventListener("mouseout", onDocModelOut, true); } catch (e) {}
				try { closeEffortPanel(); if (effortPanelEl) { effortPanelEl.remove(); effortPanelEl = null; } } catch (e) {}
				try { stopTriggerCap(); } catch (e) {}
				if (panelEl) { panelEl.remove(); panelEl = null; }
				var style = document.getElementById(STYLE_ID);
				if (style) style.remove();
			};
		}

		exports.inject = ["remote", "remote.settings", "remote.llm", "configForms", "modelDirectories"];
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
					var dispose = start(ctx);
					try {
						ctx.inject(["remote", "configForms", "modelDirectories"], function (scope) {
							SVC = scope;
							try { runForceCapsOnce(false, "all"); } catch (e) {}
						});
					} catch (e) {
						try { setTimeout(function () { runForceCapsOnce(false, "all"); }, 1500); } catch (e2) {}
					}
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

		// 测试探针用（仅当外部显式置位时才暴露，生产环境惰性、不影响运行）
		try {
			if (typeof window !== "undefined" && window.__DSH_MODEL_FOLD_TEST__) {
				exports.__test = {
					planForceCaps: planForceCaps,
					normalizeInputTypes: normalizeInputTypes,
					fullReasoningEfforts: fullReasoningEfforts,
					fmtModelName: fmtModelName,
					effortListFor: effortListFor,
					openEffortPanel: openEffortPanel,
					commitEffort: commitEffort,
					closeEffortPanel: closeEffortPanel,
					setCtx: function (c) { PLUGIN_CTX = c; buildEffortIndex(); },
					buildCascade: buildCascade,
					getEffort: function () { return effortState; },
					getPanel: function () { return effortPanelEl; },
					getTriggerCap: function () { return triggerCapEl; },
					autoDrillRoot: autoDrillRoot,
					isModelMenu: isModelMenu,
					startTriggerCap: startTriggerCap,
					updateTriggerCap: updateTriggerCap
				};
			}
		} catch (e) {}

		return module.exports;
	}
});
