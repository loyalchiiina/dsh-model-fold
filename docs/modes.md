# dsh-model-fold v1.0 UI notes

Since v1.0 the model capsule opens a single self-drawn three-column cascade. The
official model menu entry is intercepted (`mousedown` / `click` capture) so it no
longer opens — entry points are converged, but the legacy hover / panel / inline
modes are still live code in `lib/client.js` (`getMode` / `setMode` /
`toggleTitleMode`): they are dormant behind the intercepted menu, and
double-clicking a provider title still switches back to them.

The three columns are:

- **来源** column: provider list with model counts and the active check mark.
- **模型** column: models of the selected provider; the row shows capability
  icons (image / brain) and a probe mark when results are visible.
- **强度** column: reasoning levels of the selected model; clicking one selects
  that model and effort together.

The bottom bar has two rows:

1. current selection + font-size input (8–15);
2. `开启识图+思考` / `关闭识图+思考` / `显示测活` / `测活` / `比对`.

`测活` sends a one-token real request per model through the host route
`/plugin/dsh-model-fold/probe`; results are persisted through
`/plugin/dsh-model-fold/probe-results` in `~/.dsh/model-fold-probe.json` (the
file carries `version: 2`; a snapshot with any other version is discarded and
rebuilt). `显示测活` only toggles the visibility of saved marks.

A 2xx status is not a green mark by itself: the response body is checked too,
and an upstream error message in the body (request overloaded / rate limit /
quota exhausted / invalid api key …) is reported as `code: OK_BODY_ERROR` and
counted as unavailable.
