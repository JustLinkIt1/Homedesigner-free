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

/** Lawn: mown tonal banding plus fine blade speckle. Deliberately procedural —
 *  a photo texture would add APK weight for something noise-based reads fine as. */
function grassTexture(ctx: CanvasRenderingContext2D, color: string) {
  const rand = rng(53);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, SIZE, SIZE);
  // Mown stripes. Keep these WIDE (2 per tile => ~2 m at the default 4 m patch):
  // narrow bands alias badly against the mip chain at grazing angles and show up
  // as coarse moiré banding across the lawn.
  const bands = 2;
  for (let i = 0; i < bands; i++) {
    ctx.fillStyle = shade(color, i % 2 ? 5 : -5);
    ctx.fillRect(0, (i * SIZE) / bands, SIZE, SIZE / bands);
  }
  // Blades: short strokes in varied greens.
  for (let i = 0; i < 9000; i++) {
    const x = rand() * SIZE;
    const y = rand() * SIZE;
    ctx.strokeStyle = shade(color, (rand() - 0.45) * 46);
    ctx.lineWidth = 0.7 + rand() * 0.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 3, y - 1.5 - rand() * 3);
    ctx.stroke();
  }
  // A few darker clumps to break up any perceived tiling.
  for (let i = 0; i < 90; i++) {
    const x = rand() * SIZE;
    const y = rand() * SIZE;
    const r = 4 + rand() * 12;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(0,0,0,${0.05 + rand() * 0.06})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Outdoor ground surfaces for the 3D site plane (not room floor materials). */
export type GroundKind = 'grass' | 'gravel' | 'paving' | 'plain';

const GROUND_GENERATORS: Record<GroundKind, (c: CanvasRenderingContext2D, col: string) => void> = {
  grass: grassTexture,
  gravel: concreteTexture,
  paving: tileTexture,
  plain: (c, col) => {
    c.fillStyle = col;
    c.fillRect(0, 0, SIZE, SIZE);
  },
};

export const GROUND_DEFAULTS: Record<GroundKind, { color: string; roughness: number }> = {
  grass: { color: '#7c9455', roughness: 0.95 },
  gravel: { color: '#b6b2a8', roughness: 0.95 },
  paving: { color: '#c9c5bd', roughness: 0.7 },
  plain: { color: '#eceae4', roughness: 1 },
};

/**
 * Texture for the big outdoor ground plane. `patchM` is the real-world size one
 * tile covers; the caller sets `repeat` from the plane size so it tiles at scale.
 */
export function getGroundTexture(kind: GroundKind, color: string, patchM = 4): THREE.CanvasTexture {
  const key = `ground:${kind}:${color}:${patchM}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  GROUND_GENERATORS[kind](ctx, color);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, tex);
  return tex;
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

const thumbCache = new Map<string, string>();

/** A small PNG data URL of the real material — for swatches in the UI. */
export function floorThumbnail(kind: FloorKind, color: string): string {
  const key = `${kind}:${color}`;
  const hit = thumbCache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  GENERATORS[kind](ctx, color);
  const url = canvas.toDataURL('image/png');
  thumbCache.set(key, url);
  return url;
}

/** Reasonable roughness per material so reflections read correctly. */
export const FLOOR_ROUGHNESS: Record<FloorKind, number> = {
  wood: 0.6,
  tile: 0.35,
  carpet: 0.95,
  concrete: 0.85,
  marble: 0.25,
};

// ---------------------------------------------------------------------------
// Custom user textures
//
// Users can upload any image as a wall paint or floor covering. We downscale
// aggressively before storing (project JSON persists to localStorage, so a
// raw 4K photo would blow past quota after a couple of walls) and cache the
// resulting THREE.Texture keyed by data URL.
// ---------------------------------------------------------------------------

/** Longest side of a resized user texture. Balances legibility vs. storage. */
const CUSTOM_MAX = 720;

/** Resize a user-supplied image to a storage-friendly JPEG data URL. */
export async function prepareTextureImage(
  file: Blob,
): Promise<{ src: string; naturalWidth: number; naturalHeight: number }> {
  const bitmap = await blobToImage(file);
  const scale = Math.min(1, CUSTOM_MAX / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  // JPEG at 0.82 balances filesize against banding on smooth gradients.
  const src = canvas.toDataURL('image/jpeg', 0.82);
  return { src, naturalWidth: bitmap.width, naturalHeight: bitmap.height };
}

function blobToImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

// Data-URL -> THREE.Texture cache. Textures live for the app's lifetime; when
// a wall/floor swaps its image the old dataURL is dropped from the design and
// its cache entry stays until page reload — that's fine, they're cheap to hold.
const customCache = new Map<string, THREE.Texture>();

/** Fetch (or build) the THREE.Texture for a user-imported image. */
export function customTexture(src: string): THREE.Texture {
  const hit = customCache.get(src);
  if (hit) return hit;
  const img = new Image();
  const tex = new THREE.Texture(img);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  img.onload = () => {
    tex.needsUpdate = true;
  };
  img.src = src;
  customCache.set(src, tex);
  return tex;
}

/**
 * Rewrite the front/back-face UVs of a BoxGeometry so a repeat-wrapped
 * texture with `repeat=1/patternMetres` tiles at real scale regardless of
 * how large or small the wall span is. Only the two large faces (front and
 * back of the wall) need scaling — the thin side edges look fine at 0..1.
 */
export function paintedBoxGeometry(
  spanWidth: number,
  spanHeight: number,
  thickness: number,
): THREE.BoxGeometry {
  const geo = new THREE.BoxGeometry(spanWidth, spanHeight, thickness);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  // BoxGeometry vertex order is +x, -x, +y, -y, +z, -z, four verts each.
  // The wall paint faces are +z (indices 16-19) and -z (indices 20-23).
  for (let f = 4; f <= 5; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * spanWidth, uv.getY(i) * spanHeight);
    }
  }
  uv.needsUpdate = true;
  return geo;
}

// ---------------------------------------------------------------------------
// Derived normal maps
// ---------------------------------------------------------------------------
// Our material library is albedo-only (public/textures/*.webp). Shipping Poly
// Haven's real _nor_gl/_rough maps alongside them would roughly triple texture
// bytes in the APK, which isn't worth it for a phone app. Instead we treat
// luminance as a height field and run a Sobel filter over it to synthesise a
// tangent-space normal map. That's not physically correct — luminance and height
// only correlate — but on the materials this app actually uses (brick, plaster,
// stone, gravel, timber, shingle) it reads convincingly and costs nothing to ship.

const normalCache = new Map<string, THREE.Texture>();

/** Flat-normal fill (128,128,255) so a texture is valid before the source loads. */
function flatNormalCanvas(size = 4): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgb(128,128,255)';
  ctx.fillRect(0, 0, size, size);
  return c;
}

/** Sobel the luminance of `img` into a tangent-space normal map, in place. */
function sobelNormals(img: HTMLImageElement, strength: number): HTMLCanvasElement {
  // Cap the working size: normal detail past ~512 is invisible at our texel
  // densities and the O(n²) pass would stall the main thread on large uploads.
  const n = Math.min(512, Math.max(16, img.naturalWidth || 256));
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, 0, 0, n, n);
  const src = ctx.getImageData(0, 0, n, n);
  const lum = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) {
    const o = i * 4;
    lum[i] = (src.data[o] * 0.299 + src.data[o + 1] * 0.587 + src.data[o + 2] * 0.114) / 255;
  }
  const out = ctx.createImageData(n, n);
  const at = (x: number, y: number) => lum[((y + n) % n) * n + ((x + n) % n)]; // wrap: textures tile
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx =
        at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1) -
        (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1));
      const dy =
        at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1) -
        (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1));
      // Normalise (dx, dy, 1/strength) into the 0..255 encoding.
      const nz = 1 / Math.max(0.05, strength);
      const len = Math.hypot(dx, dy, nz) || 1;
      const o = (y * n + x) * 4;
      out.data[o] = ((dx / len) * 0.5 + 0.5) * 255;
      out.data[o + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      out.data[o + 2] = ((nz / len) * 0.5 + 0.5) * 255;
      out.data[o + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return c;
}

/**
 * A normal map synthesised from an albedo image URL. Returns immediately with a
 * flat normal and swaps in the real one once the source decodes, so callers
 * never have to await. Cached per (src, strength).
 */
export function derivedNormalTexture(src: string, strength = 1): THREE.Texture {
  const key = `${src}|${strength}`;
  const hit = normalCache.get(key);
  if (hit) return hit;

  const tex = new THREE.CanvasTexture(flatNormalCanvas());
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  // Normal maps are data, not colour — must stay linear.
  tex.colorSpace = THREE.NoColorSpace;
  normalCache.set(key, tex);

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    try {
      tex.image = sobelNormals(img, strength);
      tex.needsUpdate = true;
    } catch {
      /* tainted canvas or decode failure — keep the flat normal */
    }
  };
  img.src = src;
  return tex;
}
