// Bridges UI buttons (outside the R3F <Canvas>) to capture functions that must
// run inside the Canvas (where gl / scene / camera live). A component inside the
// Canvas registers its callback here; toolbar buttons invoke it.

type CaptureFn = (scale?: number) => Promise<void> | void;

export const sceneCapture: { current: CaptureFn | null } = { current: null };
export const photoCapture: { current: CaptureFn | null } = { current: null };

// 2D plan export: Canvas2D registers a function returning a framed PNG data URL
// of the whole design (grid hidden), or null if there's nothing to export.
type PlanCaptureFn = () => string | null;
export const planCapture: { current: PlanCaptureFn | null } = { current: null };

// 3D zoom: a component inside the Canvas registers a dolly function so the
// on-screen +/- buttons can zoom the OrbitControls camera. `factor` < 1 zooms
// in (closer to target), > 1 zooms out.
type ZoomFn = (factor: number) => void;
export const orbitZoom: { current: ZoomFn | null } = { current: null };

// 3D focus anchor (IKEA-style): re-target the orbit camera on a world point
// (metres) so pinch/wheel zoom dives into that spot. Registered by ZoomBridge,
// invoked on double-tapping a floor.
type FocusFn = (x: number, z: number) => void;
export const orbitFocus: { current: FocusFn | null } = { current: null };
