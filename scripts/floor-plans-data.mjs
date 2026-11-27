// The /floor-plans/ pages (TASKS T10b): one page per plan and a hub listing them.
// English only. scripts/build-seo-pages.mjs renders them and refuses to write
// anything while a `body` is TODO or outside 80-150 words, a meta title is over
// 60 characters, or the text says something the plans cannot back up.
//
// The plan itself is tools/floor-plans/<slug>.json (made by
// tools/floor-plans/build-blueprints.mjs from T10a §3); sizes and the room table
// are read from it, so the page and the plan people open cannot disagree.
// The "Open this plan" link is /app/?plan=<id> with the id from
// tools/floor-plans/ids.json, which is the id the shared_plans row is written
// under (tools/share-plan.mjs --id). The pictures are made from the same file:
// /assets/floor-plans/<slug>-plan.webp (2D) and <slug>-3d.webp.
//
// Text rules (T10a §4): no "AI" (these are drawn by us), no PDF download (PDF
// export is Pro), no building-code, planning or vastu claim, no build cost.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

/**
 * Draft build (FLOOR_PLANS_DRAFT=1, EXEC cycle 262): the page text comes later
 * (T10c), so a TODO body or intro is allowed and shown as a marked placeholder,
 * every floor-plan page carries robots noindex, and none of them enter the
 * sitemap. A normal build still refuses TODO text, so a draft can never be
 * regenerated into a deploy by accident.
 */
export const FLOOR_PLANS_DRAFT = process.env.FLOOR_PLANS_DRAFT === '1';
export const DRAFT_PLACEHOLDER = '[Placeholder: the text for this page is being written (T10c). Not for publishing.]';
const IDS = JSON.parse(readFileSync(resolve(root, 'tools/floor-plans/ids.json'), 'utf8'));

export const FLOOR_PLANS_PATH = '/floor-plans/';

/** Hub page words. `intro` is filled by the design manager (40-120 words). */
export const FLOOR_PLANS_HUB = {
  title: 'Free House Floor Plans to Open and Edit | HomeDesigner',
  description: 'Ten house floor plans with room sizes in metres and feet: barndominium, ranch, modern, tiny house, ADU and more. Open any of them free and edit it in 3D.',
  h1: 'House floor plans you can open and edit',
  intro: 'TODO',
};

/**
 * One entry per page. `body` (80-150 words) is the design manager's; the rest is
 * set here. `baths` counts a WC as a half bath.
 */
const PAGES = [
  {
    slug: 'barndominium-3-bedroom-18x12m',
    h1: 'Barndominium floor plan: 3 bedrooms with a shop',
    title: 'Barndominium Floor Plan, 3 Bedrooms, 18x12 m',
    description: 'A 3 bedroom barndominium floor plan, 18 x 12 m (2,325 sq ft), with a garage shop, open living and office. Room sizes in m and ft. Open it free in 3D.',
    beds: 3, baths: 2,
    body: 'TODO',
  },
  {
    slug: 'small-house-plan-2-bedroom-9x8m',
    h1: 'Small house plan: 2 bedrooms, 9 x 8 m',
    title: 'Small House Plan, 2 Bedrooms, 9x8 m (775 sq ft)',
    description: 'A small 2 bedroom house plan, 9 x 8 m (775 sq ft), with open living, kitchen and one bathroom. Every room size in m and ft. Open it free and edit it in 3D.',
    beds: 2, baths: 1,
    body: 'TODO',
  },
  {
    slug: 'ranch-house-plan-3-bedroom-20x10m',
    h1: 'Ranch house plan: 3 bedrooms with garage',
    title: 'Ranch House Plan, 3 Bedrooms with Garage, 20x10 m',
    description: 'A single-storey ranch house plan with 3 bedrooms, 2 baths and a garage, 20 x 10 m (2,153 sq ft). Room sizes in m and ft. Open it free and walk it in 3D.',
    beds: 3, baths: 2,
    body: 'TODO',
  },
  {
    slug: 'modern-house-plan-3-bedroom-10x9m',
    h1: 'Modern house plan: 3 bedrooms on two floors',
    title: 'Modern House Plan, 3 Bedrooms, Two Storeys, 10x9 m',
    description: 'A modern two-storey house plan with 3 bedrooms, a flat roof and a home office, 10 x 9 m (1,938 sq ft in total). Room sizes in m and ft. Open it free in 3D.',
    beds: 3, baths: 2.5,
    body: 'TODO',
  },
  {
    slug: 'tiny-house-floor-plan-7x2-6m',
    h1: 'Tiny house floor plan: 7.2 x 2.6 m',
    title: 'Tiny House Floor Plan, 7.2x2.6 m (202 sq ft)',
    description: 'A tiny house floor plan, 7.2 x 2.6 m (202 sq ft): kitchen, living and sleeping space and a bathroom, with sizes in m and ft. Open it free and edit it in 3D.',
    beds: 0, baths: 1,
    body: 'TODO',
  },
  {
    slug: '2-bedroom-house-plan-with-garage-12x10m',
    h1: '2 bedroom house plan with garage',
    title: '2 Bedroom House Plan with Garage, 12x10 m',
    description: 'A 2 bedroom house plan with an attached garage, 12 x 10 m (1,292 sq ft), open living and a utility room. Room sizes in m and ft. Open it free and edit in 3D.',
    beds: 2, baths: 1,
    body: 'TODO',
  },
  {
    slug: '4-bedroom-house-plan-11x9m',
    h1: '4 bedroom house plan on two floors',
    title: '4 Bedroom House Plan, Two Storeys, 11x9 m',
    description: 'A two-storey 4 bedroom house plan, 11 x 9 m (2,131 sq ft in total), with a ground-floor bedroom and 2.5 baths. Room sizes in m and ft. Open it free in 3D.',
    beds: 4, baths: 2.5,
    body: 'TODO',
  },
  {
    slug: 'adu-floor-plan-800-sq-ft',
    h1: 'ADU floor plan: 800 sq ft, 2 bedrooms',
    title: 'ADU Floor Plan, 800 sq ft, 2 Bedrooms',
    description: 'An 800 sq ft ADU floor plan (10 x 7.5 m) with 2 bedrooms, open living, kitchen and utility. Every room size in m and ft. Open it free and edit it in 3D.',
    beds: 2, baths: 1,
    body: 'TODO',
  },
  {
    slug: '3-bedroom-house-plan-13x9m',
    h1: '3 bedroom house plan: 13 x 9 m',
    title: '3 Bedroom House Plan, 13x9 m (1,259 sq ft)',
    description: 'A single-storey 3 bedroom house plan, 13 x 9 m (1,259 sq ft), with open living, dining, kitchen and utility. Room sizes in m and ft. Open it free in 3D.',
    beds: 3, baths: 1,
    body: 'TODO',
  },
  {
    slug: '30x40-house-plan-3-bedroom',
    h1: '30x40 house plan: 3 bedrooms',
    title: '30x40 House Plan, 3 Bedrooms (1,195 sq ft)',
    description: 'A 30x40 ft (9.1 x 12.2 m) house plan with 3 bedrooms, 2 bathrooms, living, dining and kitchen. Room sizes in ft and m. Open it free and edit it in 3D.',
    beds: 3, baths: 2,
    body: 'TODO',
  },
];

const m = (cm) => (cm / 100).toFixed(2).replace(/0$/, '').replace(/\.0$/, '');
const ft = (cm) => ((cm / 100) * 3.281).toFixed(1);
const FLOOR_NAMES = ['Ground floor', 'Upper floor'];

export const FLOOR_PLANS = PAGES.map((page) => {
  const bp = JSON.parse(readFileSync(resolve(root, `tools/floor-plans/${page.slug}.json`), 'utf8'));
  const storeys = bp.floors.length;
  const areaM2 = (bp.widthCm * bp.depthCm * storeys) / 10000;
  return {
    ...page,
    id: IDS[page.slug],
    storeys,
    footprint: { m: `${m(bp.widthCm)} × ${m(bp.depthCm)} m`, ft: `${ft(bp.widthCm)} × ${ft(bp.depthCm)} ft` },
    areaM2: Math.round(areaM2 * 10) / 10,
    areaSqFt: Math.round(areaM2 * 10.764),
    floors: bp.floors.map((floor, level) => ({
      name: storeys > 1 ? FLOOR_NAMES[level] : 'Rooms',
      rooms: floor.rooms.map((r) => ({
        name: r.name,
        m: `${m(r.w)} × ${m(r.h)} m`,
        ft: `${ft(r.w)} × ${ft(r.h)} ft`,
        areaM2: Math.round((r.w * r.h) / 1000) / 10,
      })),
    })),
    // Pixel sizes go in the <img> tags; set them to the real files' sizes when the renders land.
    images: {
      plan: { src: `/assets/floor-plans/${page.slug}-plan.webp`, w: 1200, h: 900 },
      view3d: { src: `/assets/floor-plans/${page.slug}-3d.webp`, w: 1600, h: 1000 },
    },
    appLink: `/app/?plan=${IDS[page.slug]}`,
  };
});

const words = (s) => s.trim().split(/\s+/).filter(Boolean).length;
// Claims the pages must not make (T10a §4, T9 §5).
const BANNED = [/\bAI\b/, /\bA\.I\./i, /artificial intelligence/i, /\bpdf\b/i, /building code/i, /\bcode[- ]compliant/i, /planning permission/i, /\bvastu\b/i, /\bcosts?\b/i, /\bprice/i, /\bbudget/i, /east[- ]facing/i];

/** Everything that would make a page thin, wrong or untrue. Empty when the pages may be written. */
export function floorPlanProblems(exists) {
  const problems = [];
  const where = (slug) => `${FLOOR_PLANS_PATH}${slug ? `${slug}/` : ''}`;
  const text = (at, field, s) => {
    for (const re of BANNED) if (re.test(s)) problems.push(`${at}: ${field} says ${re} (T10a §4)`);
  };
  const hub = FLOOR_PLANS_HUB;
  const introDraft = FLOOR_PLANS_DRAFT && hub.intro.trim() === 'TODO';
  if (!introDraft && (hub.intro.trim() === 'TODO' || words(hub.intro) < 40 || words(hub.intro) > 120)) problems.push(`${where()}: intro is ${hub.intro.trim() === 'TODO' ? 'TODO' : `${words(hub.intro)} words`} (40 to 120)`);
  for (const [field, s] of Object.entries(hub)) text(where(), field, s);
  if (hub.title.length > 60) problems.push(`${where()}: meta title is ${hub.title.length} characters (60 at most)`);
  if (hub.description.length < 120 || hub.description.length > 160) problems.push(`${where()}: description is ${hub.description.length} characters (120 to 160)`);
  const seen = new Set();
  for (const p of FLOOR_PLANS) {
    const at = where(p.slug);
    if (!/^[a-z0-9]{10,24}$/.test(p.id ?? '')) problems.push(`${at}: no valid id in tools/floor-plans/ids.json`);
    if (seen.has(p.id)) problems.push(`${at}: id ${p.id} is used twice`);
    seen.add(p.id);
    if (p.body.trim() === 'TODO' && FLOOR_PLANS_DRAFT) { /* draft: placeholder shown */ }
    else if (p.body.trim() === 'TODO') problems.push(`${at}: body is TODO (80 to 150 words)`);
    else if (words(p.body) < 80 || words(p.body) > 150) problems.push(`${at}: body is ${words(p.body)} words (80 to 150)`);
    if (p.title.length > 60) problems.push(`${at}: meta title is ${p.title.length} characters (60 at most)`);
    if (p.description.length < 120 || p.description.length > 160) problems.push(`${at}: description is ${p.description.length} characters (120 to 160)`);
    for (const field of ['h1', 'title', 'description', 'body']) text(at, field, p[field]);
    for (const { src } of Object.values(p.images)) if (!exists(src)) problems.push(`${at}: picture ${src} is missing`);
  }
  return problems;
}
