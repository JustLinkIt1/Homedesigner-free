import * as THREE from 'three';
import type { FloorKind } from '../data/furnitureCatalog';

// Procedural floor textures generated on a canvas and cached. Each texture
// represents a fixed real-world patch (PATCH_M metres square) and is tiled via
// RepeatWrapping; floor UVs are in metres, so repeat = 1 / PATCH_M.
const PATCH_M = 2;
const SIZE = 512;
const cache = new Map<string, THREE.CanvasTexture>();

export const floorRepeat = 1 / PATCH_M;

const hexToRgb = (hex: string) => {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
};
const shade = (hex: string, amt: number) => {
  const { r, g, b } = hexToRgb(hex);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v + amt)));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
};
// Deterministic pseudo-random so textures are stable across renders.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function woodTexture(ctx: CanvasRenderingContext2D, color: string) {
  const rand = rng(7);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, SIZE, SIZE);
  const planks = 6;
  const ph = SIZE / planks;
  for (let i = 0; i < planks; i++) {
    const y = i * ph;
    ctx.fillStyle = shade(color, (rand() - 0.5) * 26);
    ctx.fillRect(0, y, SIZE, ph);
    // grain streaks
    for (let g = 0; g < 22; g++) {
      const gy = y + rand() * ph;
      ctx.strokeStyle = `rgba(0,0,0,${0.04 + rand() * 0.05})`;
      ctx.lineWidth = 0.6 + rand();
      ctx.beginPath();
      ctx.moveTo(0, gy);
      for (let x = 0; x <= SIZE; x += 32) ctx.lineTo(x, gy + Math.sin(x * 0.05 + i) * 1.5);
      ctx.stroke();
    }
    // plank seam
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(0, y + ph - 2, SIZE, 2);
    // staggered end joint
    const jx = ((i % 2) * SIZE) / 2 + SIZE / 2;
    ctx.fillRect((jx % SIZE) - 1, y, 2, ph);
  }
}

function tileTexture(ctx: CanvasRenderingContext2D, color: string) {
  const rand = rng(13);
  const grout = shade(color, -55);
  ctx.fillStyle = grout;
  ctx.fillRect(0, 0, SIZE, SIZE);
  const n = 4;
  const ts = SIZE / n;
  const gap = 5;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      ctx.fillStyle = shade(color, (rand() - 0.5) * 14);
      ctx.fillRect(i * ts + gap, j * ts + gap, ts - gap * 2, ts - gap * 2);
      // subtle sheen
      const grd = ctx.createLinearGradient(i * ts, j * ts, (i + 1) * ts, (j + 1) * ts);
      grd.addColorStop(0, 'rgba(255,255,255,0.08)');
      grd.addColorStop(1, 'rgba(0,0,0,0.06)');
      ctx.fillStyle = grd;
      ctx.fillRect(i * ts + gap, j * ts + gap, ts - gap * 2, ts - gap * 2);
    }
  }
}

function carpetTexture(ctx: CanvasRenderingContext2D, color: string) {
  const rand = rng(29);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, SIZE, SIZE);
  for (let i = 0; i < 24000; i++) {
    const x = rand() * SIZE;
    const y = rand() * SIZE;
    ctx.fillStyle = `rgba(${rand() > 0.5 ? '255,255,255' : '0,0,0'},${0.03 + rand() * 0.05})`;
    ctx.fillRect(x, y, 1.5, 1.5);
  }
}

function concreteTexture(ctx: CanvasRenderingContext2D, color: string) {
  const rand = rng(41);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, SIZE, SIZE);
  for (let i = 0; i < 40; i++) {
    const x = rand() * SIZE;
    const y = rand() * SIZE;
    const r = 30 + rand() * 90;
    const grd = ctx.createRadialGradient(x, y, 0, x, y, r);
    const a = (rand() - 0.5) * 0.12;
    grd.addColorStop(0, `rgba(${a > 0 ? '255,255,255' : '0,0,0'},${Math.abs(a)})`);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, SIZE, SIZE);
  }
}

function marbleTexture(ctx: CanvasRenderingContext2D, color: string) {
  const rand = rng(53);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, SIZE, SIZE);
  for (let v = 0; v < 14; v++) {
    ctx.strokeStyle = `rgba(${shade(color, -70).slice(4, -1)},${0.12 + rand() * 0.18})`;
    ctx.lineWidth = 0.6 + rand() * 2;
    ctx.beginPath();
    let x = rand() * SIZE;
    let y = 0;
    ctx.moveTo(x, y);
    while (y < SIZE) {
      x += (rand() - 0.5) * 60;
      y += 10 + rand() * 30;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

const GENERATORS: Record<FloorKind, (ctx: CanvasRenderingContext2D, color: string) => void> = {
  wood: woodTexture,
  tile: tileTexture,
  carpet: carpetTexture,
  concrete: concreteTexture,
  marble: marbleTexture,
};

export function getFloorTexture(kind: FloorKind, color: string): THREE.CanvasTexture {
  const key = `${kind}:${color}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  GENERATORS[kind](ctx, color);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(floorRepeat, floorRepeat);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, tex);
  return tex;
}

/** Reasonable roughness per material so reflections read correctly. */
export const FLOOR_ROUGHNESS: Record<FloorKind, number> = {
  wood: 0.6,
  tile: 0.35,
  carpet: 0.95,
  concrete: 0.85,
  marble: 0.25,
};
