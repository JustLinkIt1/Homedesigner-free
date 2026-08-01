// Single source of truth for the app's identity. Everything user-visible that
// names the product (UI chrome, share sheets, export filenames, store links)
// must read from here so a rename before the store listing is a one-file edit.

export const APP_NAME = 'HomeDesigner';
export const APP_TAGLINE = 'Home design in 2D & 3D';

/** Injected by Vite `define` from package.json at build time. */
export const APP_VERSION: string =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0-dev';

export const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.homedesigner.app';

/** The product site. `SITE_DOMAIN` is the bare form used where a full URL would
 *  be visual noise — currently the free-tier export watermark. */
export const SITE_URL = 'https://homedesignerapp.com';
export const SITE_DOMAIN = 'homedesignerapp.com';

export const PRIVACY_URL = 'https://homedesignerapp.com/privacy.html';

export const SUPPORT_EMAIL = 'nathanjoppich@gmail.com';

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
  {
    name: 'Plus Jakarta Sans typeface — Tokotype',
    license: 'SIL OFL 1.1',
    url: 'https://github.com/tokotype/PlusJakartaSans',
  },
  {
    name: 'Furniture 3D model pack — Poly Haven contributors',
    license: 'CC0 1.0',
    url: 'https://polyhaven.com/models',
  },
  {
    name: 'Wall & floor material textures — Poly Haven contributors',
    license: 'CC0 1.0',
    url: 'https://polyhaven.com/textures',
  },
  {
    name: 'Kitchen 3D models — Kenney Furniture Kit',
    license: 'CC0 1.0',
    url: 'https://kenney.nl/assets/furniture-kit',
  },
];
