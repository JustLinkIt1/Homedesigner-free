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
// /assets/floor-plans/<slug>-plan.webp (2D) and <slug>-3d.webp; a two-storey
// plan also has the upper floor, <slug>-plan-2.webp and <slug>-3d-upper.webp.
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
    h1: "3-Bedroom Barndominium Floor Plan",
    title: "3-Bedroom Barndominium Floor Plan, 18 × 12 m (59 × 39 ft)",
    description: "A single-storey 3-bedroom barndominium with a built-in shop, office and open living space. 216 m² (2,325 sq ft), with room sizes in metres and feet.",
    beds: 3, baths: 2,
    body: "A one-storey barndominium under a metal gable roof, 18 × 12 m (59.1 × 39.4 ft), 216 m² (2,325 sq ft). The front third is the working half of the house: a 6.0 × 5.0 m (19.7 × 16.4 ft) garage or shop, then an 8.0 × 5.0 m (26.2 × 16.4 ft) open living space and a 4.0 × 5.0 m (13.1 × 16.4 ft) kitchen. A long hallway with a utility room and storage keeps the mud and tools away from the bedrooms. At the back sit the primary bedroom, 4.5 × 5.5 m (14.8 × 18.0 ft) with its own ensuite, two 4.0 × 5.5 m (13.1 × 18.0 ft) bedrooms, a family bathroom and a 3.0 m (9.8 ft) wide office. It suits a family who works from home or needs a real workshop.",
    invite: "Open it in 3D, walk from the shop to the kitchen, and move the walls to fit your lot.",
  },
  {
    slug: 'small-house-plan-2-bedroom-9x8m',
    h1: "Small 2-Bedroom House Plan",
    title: "Small 2-Bedroom House Plan, 9 × 8 m (30 × 26 ft)",
    description: "A compact one-storey 2-bedroom house: 72 m² (775 sq ft), open living space, two equal bedrooms. Room sizes in metres and feet.",
    beds: 2, baths: 1,
    body: "A small one-storey house with a tiled gable roof, 9 × 8 m (29.5 × 26.2 ft), 72 m² (775 sq ft). The front half is one open space: a 5.5 × 4.0 m (18.0 × 13.1 ft) living area beside a 3.5 × 4.0 m (11.5 × 13.1 ft) kitchen. Behind it, two bedrooms of the same size, 3.5 × 4.0 m (11.5 × 13.1 ft) each, sit either side of a short hall and a 2.0 × 2.5 m (6.6 × 8.2 ft) bathroom. Equal bedrooms make it work for a couple with a home office, two sharers, or downsizers who want a guest room. There's no wasted corridor, which is why it fits on a narrow plot.",
    invite: "Open it in 3D, try your own furniture, and see if 72 m² feels big enough.",
  },
  {
    slug: 'ranch-house-plan-3-bedroom-20x10m',
    h1: "3-Bed Ranch House Plan with Garage",
    title: "3-Bed Ranch House Plan with Garage, 20 × 10 m (66 × 33 ft)",
    description: "A long single-storey ranch house with an attached garage, ensuite primary bedroom and open living. 200 m² (2,153 sq ft), sizes in m and ft.",
    beds: 3, baths: 2,
    body: "A classic ranch: one long storey under a hipped shingle roof, 20 × 10 m (65.6 × 32.8 ft), 200 m² (2,153 sq ft). Along the front run a 6.0 × 5.0 m (19.7 × 16.4 ft) attached garage, a utility room, a 4.0 × 5.0 m (13.1 × 16.4 ft) kitchen and an 8.0 × 5.0 m (26.2 × 16.4 ft) open living space, so groceries go straight from the car to the kitchen. A hallway the full width of the house separates them from the bedrooms. At the back: the primary bedroom, 4.5 × 3.8 m (14.8 × 12.5 ft) with its ensuite, two 3.5 × 3.8 m (11.5 × 12.5 ft) bedrooms, a second bathroom and a storage room. No stairs anywhere, which suits families with small children and anyone planning to stay put as they get older.",
    invite: "Open it in 3D and walk the whole length, garage to primary bedroom.",
  },
  {
    slug: 'modern-house-plan-3-bedroom-10x9m',
    h1: "Modern 3-Bed House Plan",
    title: "Modern 3-Bed House Plan, Two Storeys, 10 × 9 m (33 × 30 ft)",
    description: "A compact two-storey modern house with a flat roof, open-plan ground floor, home office and 3 bedrooms upstairs. 180 m² (1,938 sq ft).",
    beds: 3, baths: 2.5,
    body: "A modern two-storey house with a flat roof on a small 10 × 9 m (32.8 × 29.5 ft) footprint, 180 m² (1,938 sq ft) over both floors. Downstairs is built for daytime: a 6.0 × 5.5 m (19.7 × 18.0 ft) open living space and a 4.0 × 5.5 m (13.1 × 18.0 ft) kitchen across the front, with the stairs, a toilet and a 4.0 × 3.5 m (13.1 × 11.5 ft) office behind. Upstairs, the largest bedroom is 4.5 × 5.5 m (14.8 × 18.0 ft), the second 3.5 × 5.5 m (11.5 × 18.0 ft) and the third 3.5 × 3.5 m (11.5 × 11.5 ft), with two bathrooms and a storage room. It suits a family on a tight urban plot where one parent works from home.",
    invite: "Open it in 3D, switch between floors, and walk up the stairs.",
  },
  {
    slug: 'tiny-house-floor-plan-7x2-6m',
    h1: "Tiny House Floor Plan",
    title: "Tiny House Floor Plan, 7.2 × 2.6 m (24 × 8.5 ft)",
    description: "A tiny house in one row: kitchen, living and sleeping space, bathroom. 18.7 m² (202 sq ft), sizes in metres and feet.",
    beds: 0, baths: 1,
    body: "A tiny house 7.2 m long and 2.6 m wide (23.6 × 8.5 ft), 18.7 m² (202 sq ft), under a single-slope metal roof. Everything sits in one row. At one end, a 2.4 m (7.9 ft) kitchen. In the middle, a 3.0 m (9.8 ft) living space that doubles as the sleeping area: a sofa bed or a fold-down bed goes here. At the far end, a 1.8 m (5.9 ft) bathroom, so it's away from the kitchen. There's no loft in this version. It suits one person or a couple who want to see what tiny living really feels like before they build or buy.",
    invite: "Open it in 3D, stand in the middle, and decide if 2.6 m wide is enough for you.",
  },
  {
    slug: '2-bedroom-house-plan-with-garage-12x10m',
    h1: "2-Bedroom House Plan with Garage",
    title: "2-Bedroom House Plan with Garage, 12 × 10 m (39 × 33 ft)",
    description: "A one-storey 2-bedroom house with an attached single garage, utility room and storage. 120 m² (1,292 sq ft), sizes in m and ft.",
    beds: 2, baths: 1,
    body: "A one-storey 2-bedroom house with a tiled gable roof, 12 × 10 m (39.4 × 32.8 ft), 120 m² (1,292 sq ft) including the garage. The front row holds a 3.5 × 5.5 m (11.5 × 18.0 ft) single garage, a 3.5 × 5.5 m (11.5 × 18.0 ft) kitchen and a 5.0 × 5.5 m (16.4 × 18.0 ft) living space. A hallway with a utility room leads to the back, where there are two bedrooms, 4.0 × 3.3 m (13.1 × 10.8 ft) and 3.5 × 3.3 m (11.5 × 10.8 ft), a 2.5 × 3.3 m (8.2 × 10.8 ft) bathroom and a storage room. It suits a couple or a small family who want a garage without the cost of a bigger house.",
    invite: "Open it in 3D and check the garage is wide enough for your car.",
  },
  {
    slug: '4-bedroom-house-plan-11x9m',
    h1: "4-Bedroom House Plan",
    title: "4-Bedroom House Plan, Two Storeys, 11 × 9 m (36 × 30 ft)",
    description: "A two-storey 4-bedroom house with one bedroom on the ground floor and two bathrooms upstairs. 198 m² (2,131 sq ft), sizes in m and ft.",
    beds: 4, baths: 2.5,
    body: "A two-storey family house with a tiled gable roof, 11 × 9 m (36.1 × 29.5 ft), 198 m² (2,131 sq ft) over both floors. The ground floor opens with a 6.0 × 5.0 m (19.7 × 16.4 ft) living space and a 5.0 × 5.0 m (16.4 × 16.4 ft) kitchen. Behind them are the stairs, a toilet, a utility room and the fourth bedroom, 3.5 × 4.0 m (11.5 × 13.1 ft), on the ground floor: useful for guests or a parent who'd rather skip the stairs. Upstairs are three bedrooms, 4.5 × 5.0 m (14.8 × 16.4 ft), 4.0 × 5.0 m (13.1 × 16.4 ft) and 4.0 × 4.0 m (13.1 × 13.1 ft), with two bathrooms. It suits a growing family on a standard plot.",
    invite: "Open it in 3D and walk both floors before you pick whose room is whose.",
  },
  {
    slug: 'adu-floor-plan-800-sq-ft',
    h1: "800 sq ft ADU Floor Plan",
    title: "800 sq ft ADU Floor Plan, 2 Bedrooms (75 m²)",
    description: "A 2-bedroom backyard unit of 807 sq ft (75 m²): open living, kitchen, laundry, one bathroom. Room sizes in feet and metres.",
    beds: 2, baths: 1,
    body: "A one-storey backyard unit of 807 sq ft (75 m²), 32.8 × 24.6 ft (10 × 7.5 m), with a single-slope metal roof. The front half is the day space: a 16.4 × 13.1 ft (5.0 × 4.0 m) living area, a 9.8 × 13.1 ft (3.0 × 4.0 m) kitchen and a small laundry room. The back half has two bedrooms, 11.5 × 11.5 ft (3.5 × 3.5 m) and 13.1 × 11.5 ft (4.0 × 3.5 m), with the bathroom between them. It suits a rental unit, an older parent who wants to live close by, or grown children. Size limits and setbacks for ADUs vary by city, so check your local rules before you plan around it.",
    invite: "Open it in 3D, then shrink or stretch it to the space in your backyard.",
  },
  {
    slug: '3-bedroom-house-plan-13x9m',
    h1: "3-Bedroom House Plan",
    title: "3-Bedroom House Plan, One Storey, 13 × 9 m (43 × 30 ft)",
    description: "A single-storey 3-bedroom house with separate dining space, a hallway and utility room. 117 m² (1,259 sq ft), sizes in metres and feet.",
    beds: 3, baths: 1,
    body: "A one-storey 3-bedroom house with a tiled gable roof, 13 × 9 m (42.7 × 29.5 ft), 117 m² (1,259 sq ft). The front row runs from a 6.0 × 4.5 m (19.7 × 14.8 ft) living space through a 3.0 × 4.5 m (9.8 × 14.8 ft) dining area to a 4.0 × 4.5 m (13.1 × 14.8 ft) kitchen, so the table sits between cooking and the sofa. A hallway with a utility room splits the house. At the back are three bedrooms, 4.0 × 3.3 m (13.1 × 10.8 ft), 3.3 × 3.3 m (10.8 × 10.8 ft) and 3.2 × 3.3 m (10.5 × 10.8 ft), and one shared bathroom. It suits a family with two children who want everything on one level.",
    invite: "Open it in 3D, furnish the dining area, and see where the table really fits.",
  },
  {
    slug: '30x40-house-plan-3-bedroom',
    h1: "30 × 40 House Plan",
    title: "30 × 40 House Plan, 3 Bedrooms (9.1 × 12.2 m)",
    description: "A 3-bedroom house on a 30 × 40 ft footprint (1,195 sq ft, 111 m²) with two bathrooms, separate dining and living. Sizes in ft and m.",
    beds: 3, baths: 2,
    body: "A 3-bedroom, single-storey house on a 30 × 40 ft footprint (9.1 × 12.2 m), 1,195 sq ft (111 m²), with a flat roof. At the front, a 16.7 × 13.8 ft (5.1 × 4.2 m) living room sits beside a 13.1 × 13.8 ft (4.0 × 4.2 m) dining room. The middle row has a 9.8 × 11.8 ft (3.0 × 3.6 m) kitchen, a short hall and the first bedroom, 16.1 × 11.8 ft (4.9 × 3.6 m). At the back are two more bedrooms, 11.8 × 14.4 ft (3.6 × 4.4 m) and 12.1 × 14.4 ft (3.7 × 4.4 m), with two bathrooms between them. It suits a family building on a 30 × 40 plot who want two bathrooms. Check the setbacks on your own plot.",
    invite: "Open it in 3D and walk from the living room to the back bedrooms.",
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
      // Upper floor of a two-storey plan. In `images` so the missing-picture check covers them.
      ...(storeys > 1 ? {
        plan2: { src: `/assets/floor-plans/${page.slug}-plan-2.webp`, w: 1200, h: 900 },
        view3dUpper: { src: `/assets/floor-plans/${page.slug}-3d-upper.webp`, w: 1600, h: 1000 },
      } : {}),
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
    if (p.description.length < 100 || p.description.length > 160) problems.push(`${at}: description is ${p.description.length} characters (100 to 160)`);
    for (const field of ['h1', 'title', 'description', 'body']) text(at, field, p[field]);
    for (const { src } of Object.values(p.images)) if (!exists(src)) problems.push(`${at}: picture ${src} is missing`);
  }
  return problems;
}
