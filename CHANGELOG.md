# Changelog

All notable changes to this project are documented in this file.

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
