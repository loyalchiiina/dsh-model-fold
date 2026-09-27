# Changelog

All notable changes to this project are documented in this file.

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
