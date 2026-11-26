import { useLayoutEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Async shader pre-compile (1.22.49). three keys a program on the colour space
 * of the CURRENT render target: with the post-processing composer the scene is
 * drawn into a linear target, without it straight to the screen. Compiling
 * against the wrong one builds programs the first frame never uses, and the
 * real ones then compile synchronously (the freeze this exists to prevent).
 */
const composited = new WeakSet<object>();

/** Tell the helper whether this renderer draws the scene through the composer. */
export function setComposited(gl: THREE.WebGLRenderer, on: boolean): void {
  if (on) composited.add(gl); else composited.delete(gl);
}

type CompileGl = THREE.WebGLRenderer & {
  compileAsync?: (s: THREE.Object3D, c: THREE.Camera, t?: THREE.Object3D | null) => Promise<unknown>;
};

export function canCompileAsync(gl: THREE.WebGLRenderer): boolean {
  return typeof (gl as CompileGl).compileAsync === 'function';
}

/** Starts compiling `obj` (in `target`, default itself) and resolves when the GPU has linked it. */
export function compileAsync(gl: THREE.WebGLRenderer, obj: THREE.Object3D, camera: THREE.Camera, target: THREE.Object3D | null = null): Promise<unknown> {
  const prev = gl.getRenderTarget();
  const rt = composited.has(gl) && !prev ? new THREE.WebGLRenderTarget(1, 1) : null;
  if (rt) gl.setRenderTarget(rt);
  try {
    // The synchronous part (program creation) runs inside this call, under the target above.
    return (gl as CompileGl).compileAsync!(obj, camera, target);
  } finally {
    if (rt) { gl.setRenderTarget(prev); rt.dispose(); }
  }
}

/**
 * A model that arrives after the first frame stays out of the draw until its
 * shaders are compiled on the GPU process; drawn cold, they would compile
 * synchronously on the main thread (a multi-second freeze on weak GPUs).
 */
export function useCompileBeforeDraw(node: THREE.Object3D, tag: string): void {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const rootScene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  useLayoutEffect(() => {
    if (!canCompileAsync(gl)) return;
    let live = true;
    const t0 = performance.now();
    node.visible = false;
    const show = () => { node.visible = true; if (live) invalidate(); };
    try {
      compileAsync(gl, node, camera, rootScene).then(
        () => { console.warn('[3d] late model compile ms:', Math.round(performance.now() - t0), tag); },
        () => { /* shown below */ },
      ).finally(show);
    } catch { show(); }
    return () => { live = false; node.visible = true; };
  }, [node, gl, camera, rootScene, invalidate, tag]);
}
