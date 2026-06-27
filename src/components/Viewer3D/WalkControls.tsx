import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PointerLockControls } from '@react-three/drei';
import * as THREE from 'three';
import { useDesign } from '../../store/designStore';
import { useDesignBounds, M } from './DesignScene';

/**
 * First-person "walk through" controller for the 3D view.
 *
 * Desktop: drei <PointerLockControls> (click canvas to lock, Esc to exit) +
 *   WASD / arrow keys to move, Shift to run. Movement is delta-time smoothed
 *   and locked to the floor plane (no flying).
 * Touch:   on-screen left joystick to move + right-side drag to look.
 *
 * Movement is collision-checked against wall segments so you can't walk
 * through walls, and clamped to the building bounds as a safety net.
 */

const EYE_HEIGHT = 1.6; // m
const WALK_SPEED = 3.0; // m/s
const RUN_MULT = 2.0;
const PLAYER_RADIUS = 0.28; // m — keep this far off any wall
const LOOK_SPEED = 2.4; // rad per full-screen drag

/** A wall as a 2D segment in world (XZ) metres, with half-thickness padding. */
interface WallSeg {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  pad: number; // half thickness in metres
}

/** Closest point on segment AB to point P (all in XZ), returned as {x,z,d2}. */
function closestOnSeg(px: number, pz: number, s: WallSeg) {
  const dx = s.bx - s.ax;
  const dz = s.bz - s.az;
  const len2 = dx * dx + dz * dz || 1e-9;
  let t = ((px - s.ax) * dx + (pz - s.az) * dz) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = s.ax + dx * t;
  const cz = s.az + dz * t;
  const ddx = px - cx;
  const ddz = pz - cz;
  return { x: cx, z: cz, d2: ddx * ddx + ddz * ddz };
}

/** Slide a desired XZ position out of any wall it penetrates. */
function resolveCollisions(px: number, pz: number, segs: WallSeg[]): [number, number] {
  let x = px;
  let z = pz;
  // A couple of passes so corners (two walls at once) settle.
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const s of segs) {
      const minDist = s.pad + PLAYER_RADIUS;
      const c = closestOnSeg(x, z, s);
      const d2 = c.d2;
      if (d2 < minDist * minDist) {
        const d = Math.sqrt(d2) || 1e-4;
        let nx = (x - c.x) / d;
        let nz = (z - c.z) / d;
        if (d < 1e-4) {
          // On the wall line — push along its normal direction.
          const wdx = s.bx - s.ax;
          const wdz = s.bz - s.az;
          const wl = Math.hypot(wdx, wdz) || 1;
          nx = -wdz / wl;
          nz = wdx / wl;
        }
        const push = minDist - d;
        x += nx * push;
        z += nz * push;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return [x, z];
}

/** On-screen touch controls. Rendered as an HTML overlay (outside Canvas). */
export function WalkTouchControls({
  moveRef,
  lookRef,
}: {
  moveRef: React.MutableRefObject<{ x: number; y: number }>;
  lookRef: React.MutableRefObject<{ x: number; y: number }>;
}) {
  const joyBase = useRef<HTMLDivElement>(null);
  const joyKnob = useRef<HTMLDivElement>(null);
  const joyId = useRef<number | null>(null);
  const joyOrigin = useRef({ x: 0, y: 0 });

  const lookId = useRef<number | null>(null);
  const lookLast = useRef({ x: 0, y: 0 });

  const JOY_R = 48; // px travel radius

  const onJoyStart = (e: React.PointerEvent) => {
    if (joyId.current !== null) return;
    joyId.current = e.pointerId;
    joyOrigin.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onJoyMove = (e: React.PointerEvent) => {
    if (joyId.current !== e.pointerId) return;
    let dx = e.clientX - joyOrigin.current.x;
    let dy = e.clientY - joyOrigin.current.y;
    const len = Math.hypot(dx, dy);
    if (len > JOY_R) {
      dx = (dx / len) * JOY_R;
      dy = (dy / len) * JOY_R;
    }
    if (joyKnob.current) joyKnob.current.style.transform = `translate(${dx}px, ${dy}px)`;
    moveRef.current = { x: dx / JOY_R, y: dy / JOY_R };
  };
  const onJoyEnd = (e: React.PointerEvent) => {
    if (joyId.current !== e.pointerId) return;
    joyId.current = null;
    if (joyKnob.current) joyKnob.current.style.transform = 'translate(0px, 0px)';
    moveRef.current = { x: 0, y: 0 };
  };

  const onLookStart = (e: React.PointerEvent) => {
    if (lookId.current !== null) return;
    lookId.current = e.pointerId;
    lookLast.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onLookMove = (e: React.PointerEvent) => {
    if (lookId.current !== e.pointerId) return;
    const dx = e.clientX - lookLast.current.x;
    const dy = e.clientY - lookLast.current.y;
    lookLast.current = { x: e.clientX, y: e.clientY };
    lookRef.current = { x: lookRef.current.x + dx, y: lookRef.current.y + dy };
  };
  const onLookEnd = (e: React.PointerEvent) => {
    if (lookId.current !== e.pointerId) return;
    lookId.current = null;
  };

  return (
    <div className="walk-touch">
      <div
        ref={joyBase}
        className="walk-joystick"
        onPointerDown={onJoyStart}
        onPointerMove={onJoyMove}
        onPointerUp={onJoyEnd}
        onPointerCancel={onJoyEnd}
      >
        <div ref={joyKnob} className="walk-joystick-knob" />
      </div>
      <div
        className="walk-look"
        onPointerDown={onLookStart}
        onPointerMove={onLookMove}
        onPointerUp={onLookEnd}
        onPointerCancel={onLookEnd}
      />
    </div>
  );
}

export default function WalkControls({
  isTouch,
  moveRef,
  lookRef,
}: {
  isTouch: boolean;
  moveRef: React.MutableRefObject<{ x: number; y: number }>;
  lookRef: React.MutableRefObject<{ x: number; y: number }>;
}) {
  const { camera, gl } = useThree();
  const { center, radius } = useDesignBounds();
  const walls = useDesign((s) => s.walls);
  const setWalkMode = useDesign((s) => s.setWalkMode);

  // Build padded collision segments from the current walls.
  const segs = useMemo<WallSeg[]>(
    () =>
      walls.map((w) => ({
        ax: w.start.x * M,
        az: w.start.y * M,
        bx: w.end.x * M,
        bz: w.end.y * M,
        pad: (w.thickness * M) / 2,
      })),
    [walls],
  );

  // Keyboard state for desktop movement.
  const keys = useRef<Record<string, boolean>>({});
  // Touch look orientation (yaw/pitch) so it survives across frames.
  const euler = useRef(new THREE.Euler(0, 0, 0, 'YXZ'));

  // Place the walker near the building centre at eye height on entry.
  useEffect(() => {
    camera.position.set(center[0], EYE_HEIGHT, center[2]);
    euler.current.setFromQuaternion(camera.quaternion);
    euler.current.x = 0; // look at the horizon
    camera.quaternion.setFromEuler(euler.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Desktop keyboard listeners.
  useEffect(() => {
    if (isTouch) return;
    const down = (e: KeyboardEvent) => {
      keys.current[e.code] = true;
    };
    const up = (e: KeyboardEvent) => {
      keys.current[e.code] = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      keys.current = {};
    };
  }, [isTouch]);

  const forward = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05); // clamp to avoid tunnelling on stalls

    // --- Look (touch only; desktop look is handled by PointerLockControls) ---
    if (isTouch && (lookRef.current.x !== 0 || lookRef.current.y !== 0)) {
      const w = gl.domElement.clientWidth || 1;
      euler.current.setFromQuaternion(camera.quaternion);
      euler.current.y -= (lookRef.current.x / w) * LOOK_SPEED;
      euler.current.x -= (lookRef.current.y / w) * LOOK_SPEED;
      const lim = Math.PI / 2 - 0.05;
      euler.current.x = Math.max(-lim, Math.min(lim, euler.current.x));
      camera.quaternion.setFromEuler(euler.current);
      lookRef.current = { x: 0, y: 0 };
    }

    // --- Movement input ---
    let mf = 0; // forward (+) / back (-)
    let ms = 0; // strafe right (+) / left (-)
    if (isTouch) {
      mf = -moveRef.current.y; // joystick up = forward
      ms = moveRef.current.x;
    } else {
      const k = keys.current;
      if (k['KeyW'] || k['ArrowUp']) mf += 1;
      if (k['KeyS'] || k['ArrowDown']) mf -= 1;
      if (k['KeyD'] || k['ArrowRight']) ms += 1;
      if (k['KeyA'] || k['ArrowLeft']) ms -= 1;
    }
    const running = !isTouch && (keys.current['ShiftLeft'] || keys.current['ShiftRight']);

    if (mf !== 0 || ms !== 0) {
      // Camera-relative directions flattened onto the floor plane.
      camera.getWorldDirection(forward.current);
      forward.current.y = 0;
      forward.current.normalize();
      right.current.set(forward.current.z, 0, -forward.current.x); // right = forward × up

      let vx = forward.current.x * mf + right.current.x * ms;
      let vz = forward.current.z * mf + right.current.z * ms;
      const vl = Math.hypot(vx, vz);
      if (vl > 1) {
        vx /= vl;
        vz /= vl;
      }
      const speed = WALK_SPEED * (running ? RUN_MULT : 1) * dt;
      let nx = camera.position.x + vx * speed;
      let nz = camera.position.z + vz * speed;

      // Wall collision, then clamp to building bounds.
      [nx, nz] = resolveCollisions(nx, nz, segs);
      const margin = radius + 4;
      nx = Math.max(center[0] - margin, Math.min(center[0] + margin, nx));
      nz = Math.max(center[2] - margin, Math.min(center[2] + margin, nz));

      camera.position.x = nx;
      camera.position.z = nz;
    }

    camera.position.y = EYE_HEIGHT; // stay on the floor
  });

  // Desktop: pointer-lock look. Exiting the lock (Esc) leaves walk mode.
  if (!isTouch) {
    return (
      <PointerLockControls
        makeDefault
        onUnlock={() => {
          // Esc / lost lock → leave walk mode entirely.
          setWalkMode(false);
        }}
      />
    );
  }
  return null;
}
