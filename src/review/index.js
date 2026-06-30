/**
 * Review modules — exported features inspired by open-code-review.
 */

export { SmartBundler } from './smartBundler.js';
export { PositioningModule } from './positioningModule.js';
export { ReflectionModule } from './reflectionModule.js';
export { PreviewMode } from './previewMode.js';
export { BackgroundContext } from './backgroundContext.js';

/**
 * Create a review pipeline with all enhancements.
 * Combines bundling, positioning, reflection, and context.
 */
export async function createReviewPipeline(options = {}) {
  const { SmartBundler } = await import('./smartBundler.js');
  const { PositioningModule } = await import('./positioningModule.js');
  const { ReflectionModule } = await import('./reflectionModule.js');
  const { PreviewMode } = await import('./previewMode.js');
  const { BackgroundContext } = await import('./backgroundContext.js');

  return {
    bundler: new SmartBundler(options.bundler),
    positioning: new PositioningModule(options.positioning),
    reflection: new ReflectionModule(options.reflection),
    preview: new PreviewMode(options.preview),
    background: new BackgroundContext(),
  };
}
