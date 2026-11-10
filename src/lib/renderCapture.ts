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
  if (mobile) {
    // Resizing an Android WebView's live drawing buffer can stall/lose the GPU
    // context even at Standard quality. Render/read the existing buffer in one
    // synchronous turn, then downsample on a 2D canvas. Never allocate another
    // WebGL framebuffer or promise detail above the device's real resolution.
    const oldTarget = gl.getRenderTarget();
    try {
      gl.setRenderTarget(null);
      gl.render(scene, camera);
      if (context.isContextLost()) throw new Error('The graphics context was lost during capture.');
      const canvas = gl.domElement;
      const factor = Math.min(1, size.width * scale / canvas.width, size.height * scale / canvas.height);
      const target = captureDimensions(canvas.width, canvas.height, factor, true);
      const copy = document.createElement('canvas');
      copy.width = target.width;
      copy.height = target.height;
      const ctx = copy.getContext('2d');
      if (!ctx) throw new Error('Could not prepare the photo. Please try again.');
      try {
        ctx.drawImage(canvas, 0, 0, target.width, target.height);
        const image = copy.toDataURL(format, 0.9);
        if (image === 'data:,' || image.length < 100) throw new Error('The graphics driver returned an empty image.');
        return image;
      } finally { copy.width = 0; copy.height = 0; }
    } finally { gl.setRenderTarget(oldTarget); }
  }
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
