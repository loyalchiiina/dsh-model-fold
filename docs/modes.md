# Modes: hover vs panel vs inline

dsh-model-fold ships three interaction modes since v0.5.0. Double-click any
source (group) title in the model menu to cycle `hover → inline → panel`, or use
the in-menu settings bar at the bottom of the menu. The choice is persisted in
localStorage and survives restarts.

## hover (default since v0.5.0)

- The menu shows one row per source: an arrow, the source display name and the
  number of models in that group.
- Gliding the pointer over a source heading slides that source's models out in a
  side panel to the right, with no click required.
- The panel retracts when the pointer leaves, after a 260 ms delay so that
  crossing the gap between the heading and the panel does not cause flicker.
- Pick a model exactly as in panel mode — see below. The plugin never focuses the
  floating panel itself, because a focus grab inside plugin-owned DOM would trip
  the host's `onBlur` handler and close the whole menu.

## panel

- One row per source, same as hover.
- **Clicking** a source opens the slide-in side panel with that source's models.
  The panel animates in from the right (180 ms).
- Clicking a model in the panel selects it: the plugin programmatically clicks
  the corresponding real button inside the original menu, so the selection is
  performed by the model-selection component itself and all state stays
  consistent.
- The panel closes when you pick a model, press Escape, click outside, click the
  same source again, or the menu closes.
- If there is no room to the right of the menu, the panel falls back to the left
  side.
- The source containing the currently selected model shows a ✓ in its badge and
  is rendered in bold.
- `panel` was the default in v0.3.0 – v0.4.x. Users upgrading from that era are
  migrated to `hover` once (guarded by a migration flag in localStorage); a later
  explicit `panel` choice is respected.

## inline

- Clicking a source expands or collapses its models directly below the title.
- Sources you never touched start collapsed, so the menu opens as a compact
  source list; the group with the currently selected model always starts
  expanded so you can see the active choice.
- Expand/collapse decisions are remembered per source across menu opens.

## Settings bar (all modes)

Vendored into the menu at the bottom (`position: sticky; bottom: 0`), so it stays
visible while the source list scrolls:

- Three mode buttons — 悬浮 / 面板 / 列表 — with the active one highlighted.
- Four font sizes — `10 / 11 / 12 / 13` — written to `--mf-fs` on
  `document.documentElement`, so both the menu and the side panel follow.
- Every button calls `stopPropagation()` on `mousedown` **and** `click`, so
  neither the host's "click outside to close" handler nor its `onBlur` fires.
- The bar is updated idempotently: buttons are created once and afterwards only
  their `data-on` highlight is refreshed. Re-creating nodes on every pass would
  perturb `paneSignature()` and swallow clicks, which showed up as font-size
  switching working "sometimes".

## What is NOT touched

The plugin never moves, deletes or re-parents any node managed by React. It only
adds custom `data-*` attributes and click listeners on the group headings (which
React does not manage) and hides the model buttons with a CSS `:has()` rule
driven by those attributes. The hint line, the settings bar and the side panel
are plugin-owned DOM appended to the menu / `document.body`.

## Scope

The enhancement targets the composer model menu (`div[role="menu"]` with
`section[role="group"]` children, rendered by
`@deepseek-ai/dsh-client-ui-model-selection`); the relevant hook is the
`[data-menu-group-heading]` attribute the component puts on each heading. The
`/model` command popup is a different surface and is not modified by this
plugin.
