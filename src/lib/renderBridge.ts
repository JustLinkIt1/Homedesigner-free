// Bridges UI buttons (outside the R3F <Canvas>) to capture functions that must
// run inside the Canvas (where gl / scene / camera live). A component inside the
// Canvas registers its callback here; toolbar buttons invoke it.

type CaptureFn = (scale?: number) => Promise<void> | void;

export const sceneCapture: { current: CaptureFn | null } = { current: null };
export const photoCapture: { current: CaptureFn | null } = { current: null };
