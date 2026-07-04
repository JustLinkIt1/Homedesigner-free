// WebGL capability probe. r3f throws if a context can't be created, which
// would otherwise take down the whole app when 3D is opened on a device with
// GPU/driver issues — probe once and let the UI degrade gracefully instead.

let cached: boolean | null = null;

export function isWebGLAvailable(): boolean {
  if (cached !== null) return cached;
  try {
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl');
    cached = !!gl;
  } catch {
    cached = false;
  }
  return cached;
}
