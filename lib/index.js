// dsh-model-fold — host side
//
// The feature is entirely a client-side DOM enhancement (see ./client.js): it
// groups the DSH model picker by provider and slides a sub-panel out beside the
// menu. This module only has to DECLARE the plugin so the loader mounts it.
//
// It deliberately exports nothing but `name`, `inject` and `apply`: the plugin
// has no host-side services, no routes and no persistence. Everything the user
// sees is produced in the renderer.

export const name = "dsh-model-fold";
export const inject = [];

export function apply(ctx) {
  ctx.logger.info("dsh-model-fold: started (client-side model-menu folding)");
}
