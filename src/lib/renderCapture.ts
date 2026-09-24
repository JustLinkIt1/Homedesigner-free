import type { Camera, Scene, WebGLRenderer } from 'three';

export interface CaptureComposer {
  setSize(width: number, height: number, updateStyle?: boolean): void;
  render(): void;
}

export function captureDimensions(width: number, height: number, scale: number, mobile: boolean, limit = 8192) {
  if (![width, height, scale, limit].every(Number.isFinite) || width <= 0 || height <= 0 || scale <= 0 || limit < 1) {
    throw new Error('The 3D view is not ready. Try again in a moment.');
  }
  const maxPixels = mobile ? 2_000_000 : 16_000_000;
  const maxSide = Math.min(limit, mobile ? 2048 : 8192);
  const factor = Math.min(scale, maxSide / width, maxSide / height, Math.sqrt(maxPixels / (width * height)));
  return { width: Math.max(1, Math.floor(width * factor)), height: Math.max(1, Math.floor(height * factor)) };
}

/** Bounded buffers, synchronous readback and unconditional live-view restoration.
 * Export quality must not multiply a phone's already high device-pixel ratio. */
export function captureRenderer(
  gl: WebGLRenderer, scene: Scene, camera: Camera,
  size: { width: number; height: number }, composer: CaptureComposer | null,
  scale: number, mobile: boolean, format: 'image/png' | 'image/jpeg' = 'image/png',
): string {
  const context = gl.getContext();
  if (context.isContextLost()) throw new Error('The graphics context was lost. Reopen 3D and try again.');
  const viewport = context.getParameter(context.MAX_VIEWPORT_DIMS) as Int32Array;
  const limit = Math.min(gl.capabilities.maxTextureSize, context.getParameter(context.MAX_RENDERBUFFER_SIZE), ...viewport);
  const target = captureDimensions(size.width, size.height, scale, mobile, limit);
  const dpr = gl.getPixelRatio();
  const oldTarget = gl.getRenderTarget();
  try {
    gl.setPixelRatio(1);
    gl.setSize(target.width, target.height, false);
    gl.setRenderTarget(null);
    if (composer && !mobile) {
      composer.setSize(target.width, target.height, false);
      try { composer.render(); } catch {
        if (context.isContextLost()) throw new Error('The graphics context was lost during capture.');
        gl.setRenderTarget(null);
        gl.render(scene, camera);
      }
    } else gl.render(scene, camera);
    if (context.isContextLost()) throw new Error('The graphics context was lost during capture.');
    const image = gl.domElement.toDataURL(format, 0.9);
    if (image === 'data:,' || image.length < 100) throw new Error('The graphics driver returned an empty image.');
    return image;
  } finally {
    gl.setPixelRatio(dpr);
    gl.setSize(size.width, size.height, false);
    // postprocessing's EffectComposer resizes the renderer itself, then derives
    // physical buffer sizes from its DPR. Pass CSS dimensions, never double DPR.
    composer?.setSize(size.width, size.height, false);
    gl.setRenderTarget(oldTarget);
  }
}
