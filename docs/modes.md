# Modes: panel vs inline

dsh-model-fold ships two interaction modes. Double-click any source (group)
title in the model menu to switch between them; the choice is persisted in
localStorage and survives restarts.

## panel (default)

- The menu shows one row per source: an arrow, the source display name and the
  number of models in that group.
- Clicking a source opens a slide-in side panel to the right of the menu with
  that source's models. The panel animates in from the right (180 ms).
- Clicking a model in the panel selects it: the plugin programmatically clicks
  the corresponding real button inside the original menu, so the selection is
  performed by the model-selection component itself and all state stays
  consistent.
- The panel closes when you pick a model, press Escape, click outside, click
  the same source again, or the menu closes.
- If there is no room to the right of the menu, the panel falls back to the
  left side.
- The source containing the currently selected model shows a ✓ in its badge
  and is rendered in bold.

## inline

- Clicking a source expands or collapses its models directly below the title.
- Sources you never touched start collapsed, so the menu opens as a compact
  source list; the group with the currently selected model always starts
  expanded so you can see the active choice.
- Expand/collapse decisions are remembered per source across menu opens.

## What is NOT touched

The plugin never moves, deletes or re-parents any node managed by React. It
only adds custom `data-*` attributes and click listeners on the group titles
(which React does not manage) and hides the model buttons with a CSS `:has()`
rule driven by those attributes. The side panel is plugin-owned DOM appended
to `document.body`.

## Scope

The enhancement targets the composer model menu (`div[role="menu"]` with
`section[role="group"]` children, rendered by
`@deepseek-ai/dsh-client-ui-model-selection`). The `/model` command popup is a
different surface and is not modified by this plugin.
