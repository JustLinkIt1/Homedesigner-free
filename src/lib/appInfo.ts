// Single source of truth for the app's identity. Everything user-visible that
// names the product (UI chrome, share sheets, export filenames, store links)
// must read from here so a rename before the store listing is a one-file edit.

export const APP_NAME = 'HomeDesigner';
export const APP_TAGLINE = 'Home design in 2D & 3D';

/** Injected by Vite `define` from package.json at build time. */
export const APP_VERSION: string =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0-dev';

export const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.nathanjoppich.homedesigner';

export const PRIVACY_URL = 'https://justlinkit1.github.io/Homedesigner-free/privacy.html';

/** Filesystem-safe slug used for export/download filenames. */
export function slugify(name: string): string {
  const s = (name || 'home')
    .trim()
    .replace(/[^\w-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return s || 'home';
}

/** Third-party content that ships with the app and requires/deserves credit. */
export const CREDITS: { name: string; license: string; url: string }[] = [
  {
    name: 'Glam Velvet Sofa 3D model — © 2021 Wayfair LLC, by Eric Chadwick',
    license: 'CC BY 4.0',
    url: 'https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/GlamVelvetSofa',
  },
  {
    name: 'Sheen Chair 3D model — Wayfair LLC, by Eric Chadwick',
    license: 'CC0 1.0',
    url: 'https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/SheenChair',
  },
];
