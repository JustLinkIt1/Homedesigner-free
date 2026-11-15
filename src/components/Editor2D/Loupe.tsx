import { useEffect, useRef } from 'react';

const SIZE = 128; // CSS px, diameter
const ZOOM = 2.2;
/** Gap between the finger and the loupe, so the finger never covers it. */
const LIFT = 64;

/**
 * Magnified view of the plan under a drawing finger (tester ask: "a zoomed
 * preview would be great for precise snaps"). The fingertip hides exactly the
 * corner being placed, so this shows it, magnified, just above the finger,
 * with a crosshair on the point that will be committed.
 *
 * It copies pixels from the plan's own canvas every frame while visible, so
 * it shows the snap marker, guides and rubber band exactly as drawn, and costs
 * one drawImage per frame.
 */
export default function Loupe({
  source,
  at,
  bounds,
}: {
  /** The plan layer's canvas element. */
  source: () => HTMLCanvasElement | null;
  /** The point being placed, in the canvas's CSS pixels; null hides it. */
  at: { x: number; y: number } | null;
  bounds: { w: number; h: number };
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const atRef = useRef(at);
  atRef.current = at;
  const visible = !!at;

  useEffect(() => {
    if (!visible) return;
    let frame = 0;
    const draw = () => {
      frame = requestAnimationFrame(draw);
      const out = canvasRef.current;
      const src = source();
      const p = atRef.current;
      if (!out || !src || !p) return;
      const dpr = window.devicePixelRatio || 1;
      const px = Math.round(SIZE * dpr);
      if (out.width !== px) {
        out.width = px;
        out.height = px;
      }
      const ctx = out.getContext('2d');
      if (!ctx) return;
      const bg = getComputedStyle(out).getPropertyValue('--canvas-bg').trim() || '#ffffff';
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, px, px);
      // Source canvas pixels per CSS pixel (Konva renders at devicePixelRatio).
      const ratio = src.width / Math.max(1, bounds.w);
      const span = SIZE / ZOOM;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(
        src,
        (p.x - span / 2) * ratio, (p.y - span / 2) * ratio, span * ratio, span * ratio,
        0, 0, px, px,
      );
      // Crosshair on the exact point.
      const c = px / 2;
      const arm = 10 * dpr;
      ctx.lineWidth = 1.5 * dpr;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.moveTo(c - arm, c); ctx.lineTo(c + arm, c);
      ctx.moveTo(c, c - arm); ctx.lineTo(c, c + arm);
      ctx.stroke();
      ctx.lineWidth = 0.8 * dpr;
      ctx.strokeStyle = '#e5484d';
      ctx.stroke();
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [visible, source, bounds.w]);

  if (!at) return null;
  // Above the finger; below it when the point is near the top edge.
  let left = at.x - SIZE / 2;
  let top = at.y - SIZE - LIFT;
  if (top < 8) top = at.y + LIFT;
  left = Math.max(8, Math.min(bounds.w - SIZE - 8, left));
  top = Math.max(8, Math.min(bounds.h - SIZE - 8, top));
  return (
    <canvas
      ref={canvasRef}
      className="plan-loupe"
      aria-hidden="true"
      style={{ left, top, width: SIZE, height: SIZE }}
    />
  );
}
