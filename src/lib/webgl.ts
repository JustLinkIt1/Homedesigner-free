// WebGL capability probe. r3f throws if a context can't be created, which
// would otherwise take down the whole app when 3D is opened on a device with
// GPU/driver issues — probe and let the UI degrade gracefully instead.
//
// IMPORTANT: only SUCCESS is cached. Context creation can fail transiently
// (WebView resuming, GPU process restarting, too many live contexts) — a
// latched `false` permanently hid the 3D view on capable devices (reported
// on a Pixel 10 Pro). Failures are retried on the next call, so the UI
// self-heals as soon as the driver recovers.

let known = false;

export function isWebGLAvailable(): boolean {
  if (known) return true;
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (gl) {
      // Release the probe context immediately — Android caps live WebGL
      // contexts, and a lingering probe can push a REAL canvas over the limit.
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      known = true;
      return true;
    }
  } catch {
    /* fall through to retry next call */
  }
  return false;
}
