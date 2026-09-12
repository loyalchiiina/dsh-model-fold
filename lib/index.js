// dsh-model-fold — host side (minimal legal cordis module)
// The feature is a client-side DOM enhancement; the host side only declares
// the plugin so the loader can mount it.
export const name = 'dsh-model-fold';
export const inject = [];

export function apply(ctx) {
  ctx.logger.info('dsh-model-fold: started (client-side model-menu folding)');
}
