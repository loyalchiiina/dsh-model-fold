# dsh-model-fold v1.0 UI notes

v1.0 replaced the old hover/panel/inline menu modes with a single self-drawn
three-column cascade:

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
`/plugin/dsh-model-fold/probe-results` in `~/.dsh/model-fold-probe.json`.
`显示测活` only toggles the visibility of saved marks.
