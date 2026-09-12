window.__ModuleLoader__.load({
	id: "dsh-model-fold",
	factory: function (require) {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		// ── dsh-model-fold v0.3.0 ──────────────────────────────────────────
		// 模型选择菜单按来源（provider 分组）展开分类，两种模式：
		//   · panel（默认）：菜单只列来源，点击来源 → 右侧滑出子面板列出该组
		//     模型；点击面板项 = 程序化点击原菜单真实按钮完成选择（React 无感）
		//   · inline：v0.2.0 行为，点击来源在下方折叠/展开模型列表
		// 双击任意来源标题在两种模式间切换；选中模型所在来源组在 panel 模式下
		// 标 ✓、inline 模式下自动展开。
		// 目标 DOM（@deepseek-ai/dsh-client-ui-model-selection，portal 到 body）：
		//   div[role="menu"] > div.groups > section[role="group"][aria-labelledby]
		//     > div（分组标题 = provider 名）+ button[role="menuitemradio"]（模型项）
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

		// \25BE = ▾（展开），\25B8 = ▸（折叠）；::before 画箭头、::after 显示组内模型数
		var CSS = [
			'section[role="group"] > div:first-child{cursor:pointer;user-select:none;}',
			'section[role="group"] > div:first-child:hover{opacity:.8;}',
			'section[role="group"] > div:first-child::before{content:"\\25BE";display:inline-block;margin-right:5px;font-size:10px;opacity:.55;transition:transform .15s ease;}',
			'section[role="group"] > div:first-child[' + FOLD_ATTR + ']::before{content:"\\25B8";}',
			'section[role="group"] > div:first-child::after{content:attr(' + BADGE_ATTR + ');margin-left:6px;font-size:.85em;opacity:.5;font-weight:400;}',
			'section[role="group"] > div:first-child[' + CURRENT_ATTR + ']{font-weight:600;opacity:1;}',
			'section[role="group"]:has(> div[' + FOLD_ATTR + ']) > button[role="menuitemradio"]{display:none !important;}',
			// ── 右侧子面板 ──
			"#" + PANEL_ID + "{position:fixed;z-index:2147483000;min-width:200px;max-width:320px;max-height:62vh;overflow-y:auto;overflow-x:hidden;padding:4px;border-radius:10px;box-shadow:0 10px 32px rgba(0,0,0,.25);transform:translateX(14px);opacity:0;transition:transform .18s ease,opacity .18s ease;pointer-events:none;visibility:hidden;}",
			"#" + PANEL_ID + ".dsh-mf-open{transform:none;opacity:1;pointer-events:auto;visibility:visible;}",
			"#" + PANEL_ID + " .dsh-mf-item{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 10px;border-radius:7px;font-size:13px;line-height:1.4;cursor:pointer;white-space:nowrap;max-width:100%;}",
			"#" + PANEL_ID + " .dsh-mf-item:hover{opacity:.85;}",
			"#" + PANEL_ID + " .dsh-mf-item .dsh-mf-name{overflow:hidden;text-overflow:ellipsis;max-width:250px;}",
			"#" + PANEL_ID + " .dsh-mf-item .dsh-mf-check{width:16px;text-align:center;flex-shrink:0;opacity:.9;}",
			"#" + PANEL_ID + " .dsh-mf-item.dsh-mf-selected{font-weight:600;}"
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

		function styleOf(el) {
			try { return window.getComputedStyle(el); } catch (error) { return null; }
		}

		function ensurePanel() {
			if (panelEl && document.body.contains(panelEl)) return panelEl;
			panelEl = document.createElement("div");
			panelEl.id = PANEL_ID;
			document.body.appendChild(panelEl);
			return panelEl;
		}

		function closePanel() {
			panelKey = null;
			panelAnchor = null;
			if (panelEl) panelEl.classList.remove("dsh-mf-open");
		}

		function themeFrom(menuEl, selectedBtn) {
			var panel = ensurePanel();
			var menuStyle = menuEl ? styleOf(menuEl) : null;
			var background = menuStyle && menuStyle.backgroundColor && menuStyle.backgroundColor !== "rgba(0, 0, 0, 0)"
				? menuStyle.backgroundColor : "#1f1f1f";
			var color = menuStyle && menuStyle.color ? menuStyle.color : "#e8e8e8";
			var radius = menuStyle && menuStyle.borderRadius ? menuStyle.borderRadius : "10px";
			panel.style.background = background;
			panel.style.color = color;
			panel.style.borderRadius = radius;
			if (selectedBtn) {
				var selStyle = styleOf(selectedBtn);
				if (selStyle && selStyle.backgroundColor && selStyle.backgroundColor !== "rgba(0, 0, 0, 0)") {
					panel.setAttribute("data-mf-selbg", selStyle.backgroundColor);
				}
			} else {
				panel.removeAttribute("data-mf-selbg");
			}
		}

		function openPanel(menuEl, title, section) {
			var buttons = section.querySelectorAll('button[role="menuitemradio"]');
			if (!buttons.length) return;
			var selectedBtn = section.querySelector('button[aria-checked="true"]');

			var panel = ensurePanel();
			themeFrom(menuEl, selectedBtn);
			panel.innerHTML = "";
			panelAnchor = [];

			var selBg = panel.getAttribute("data-mf-selbg");
			for (var i = 0; i < buttons.length; i++) {
				(function (realBtn) {
					var item = document.createElement("div");
					item.className = "dsh-mf-item" + (realBtn.getAttribute("aria-checked") === "true" ? " dsh-mf-selected" : "");
					if (item.className.indexOf("dsh-mf-selected") >= 0 && selBg) item.style.background = selBg;
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

			// 定位：菜单右侧 8px，与被点标题顶部对齐；超出视口则回收
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
		}

		function foldKeyOf(title, headingId) {
			return (title.textContent || "").trim() || headingId || "group";
		}

		// 按当前模式计算折叠初始状态：panel 模式下真实按钮始终隐藏（子面板负责展示）；
		// inline 模式下含当前选中模型的组强制展开，其余按用户记忆，无记忆默认折叠
		function applyInitialFold(section, title, key) {
			if (getMode() === "panel") {
				title.setAttribute(FOLD_ATTR, "1");
				return;
			}
			var hasSel = section.querySelector('button[aria-checked="true"]') !== null;
			var folded;
			if (hasSel) folded = false;
			else if (Object.prototype.hasOwnProperty.call(foldState, key)) folded = !!foldState[key];
			else folded = DEFAULT_FOLDED;
			if (folded) title.setAttribute(FOLD_ATTR, "1");
			else title.removeAttribute(FOLD_ATTR);
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

			// 徽标（组内模型数）每次都刷新：目录重拉后数量可能变化；含当前选中的组加 ✓
			var buttons = section.querySelectorAll('button[role="menuitemradio"]');
			var hasSelected = section.querySelector('button[aria-checked="true"]') !== null;
			title.setAttribute(BADGE_ATTR, "(" + buttons.length + (hasSelected ? " ✓" : "") + ")");
			if (hasSelected) title.setAttribute(CURRENT_ATTR, "1");
			else title.removeAttribute(CURRENT_ATTR);

			if (title.getAttribute(DONE_ATTR)) return; // 已处理过：仅刷新徽标/选中标记
			title.setAttribute(DONE_ATTR, "1");

			var key = foldKeyOf(title, headingId);
			applyInitialFold(section, title, key);

			title.title = getMode() === "panel"
				? "单击：右侧展开该来源的模型子面板｜双击：切换为列表内展开"
				: "点击折叠/展开该来源的全部模型｜双击：切换为右侧子面板";

			title.addEventListener("click", function (event) {
				event.stopPropagation();
				event.preventDefault();
				if (getMode() === "panel") {
					if (panelKey === key) { closePanel(); return; } // 再点同一来源 = 关闭
					openPanel(menuEl, title, section);
					return;
				}
				var folded = !title.hasAttribute(FOLD_ATTR);
				if (folded) title.setAttribute(FOLD_ATTR, "1");
				else title.removeAttribute(FOLD_ATTR);
				foldState[key] = folded;
				saveState(foldState);
			});

			title.addEventListener("dblclick", function (event) {
				event.stopPropagation();
				event.preventDefault();
				var next = getMode() === "panel" ? "inline" : "panel";
				setMode(next);
				closePanel();
				resetMenuGroups(menuEl); // 清 DONE/FOLD 后按新模式重算
			});
		}

		function enhance() {
			var menus = document.querySelectorAll('div[role="menu"]');
			for (var i = 0; i < menus.length; i++) {
				var menu = menus[i];
				if (!menu.querySelector('section[role="group"]')) continue;
				// 菜单已关闭而面板还开着 → 同步关闭
				if (!document.body.contains(menu) && panelEl) closePanel();
				var groups = menu.querySelectorAll('section[role="group"]');
				for (var j = 0; j < groups.length; j++) processGroup(menu, groups[j]);
			}
			// 菜单全部消失（选择完成/点击外部）而面板还开着 → 关闭
			if (!menus.length && panelEl && panelEl.classList.contains("dsh-mf-open")) closePanel();
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
			var onDocClick = function (event) {
				if (!panelEl || !panelEl.classList.contains("dsh-mf-open")) return;
				var target = event.target;
				if (panelEl.contains(target)) return;
				var menus = document.querySelectorAll('div[role="menu"]');
				for (var i = 0; i < menus.length; i++) {
					if (menus[i].contains(target)) return; // 点在菜单内（如另一来源标题）交由各自逻辑处理
				}
				closePanel();
			};
			var onKeyDown = function (event) {
				if (event.key === "Escape" && panelEl && panelEl.classList.contains("dsh-mf-open")) closePanel();
			};
			document.addEventListener("click", onDocClick, true);
			document.addEventListener("keydown", onKeyDown, true);
			enhance();
			return function dispose() {
				if (timer) clearTimeout(timer);
				observer.disconnect();
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
				if (document.readyState === "loading") {
					var onReady = function () {
						document.removeEventListener("DOMContentLoaded", onReady);
						start();
					};
					document.addEventListener("DOMContentLoaded", onReady);
					return function () {
						document.removeEventListener("DOMContentLoaded", onReady);
					};
				}
				return start();
			}, "dsh-model-fold: model-menu folding + side panel");
		};

		return module.exports;
	}
});
