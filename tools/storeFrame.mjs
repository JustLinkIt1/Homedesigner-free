// Compose raw app screenshots into Play Store marketing shots.
//
// The old set was bare UI: no caption, no framing, and `phone-1-home` — the
// project gallery — sitting in the first slot. That slot is the one that shows
// in Play SEARCH RESULTS next to the icon and title, where a large share of
// people decide without ever opening the listing. Spending it on an empty-ish
// list screen is the single most expensive thing a listing can do.
//
// Format follows what the ASO community converges on:
//   - caption is VERB + BENEFIT in 3-5 words, not a feature name
//   - type large enough to survive the squint test (~96px at 1080 wide)
//   - high contrast, one idea per shot
//   - strongest shot first
//
// Captions live here rather than in src/locales because they are marketing
// copy, not product strings — they should be rewritten per test without
// touching the app. Add a locale by adding a key: the composer renders whatever
// languages are present, so localised listings (Apple reports 2-3x install
// lift) are a data edit rather than new code.

/** Play phone screenshot canvas. 9:16 is accepted everywhere and crops well. */
export const CANVAS = { width: 1080, height: 1920 };

/**
 * Ordered shots. `source` matches the raw capture name from screenshots.mjs.
 * Order IS the listing order — index 0 is the search-results slot.
 */
export const SHOTS = [
  // 3D leads: it is the difference between this and every 2D-only floor plan
  // app, and it reads in under a second at thumbnail size.
  { source: '3-view3d', key: 'walk3d' },
  { source: '2-plan2d', key: 'draw' },
  { source: '4-catalog', key: 'furnish' },
  { source: '1-home', key: 'templates' },
];

/** en is the fallback for any locale that omits a key. */
export const CAPTIONS = {
  en: {
    walk3d: 'Walk through it in 3D',
    draw: 'Draw a floor plan fast',
    furnish: 'Furnish every room',
    templates: 'Start from a real home',
  },
  de: {
    walk3d: 'In 3D hindurchgehen',
    draw: 'Grundriss schnell zeichnen',
    furnish: 'Jeden Raum einrichten',
    templates: 'Mit echtem Haus starten',
  },
  es: {
    walk3d: 'Recórrelo en 3D',
    draw: 'Dibuja un plano rápido',
    furnish: 'Amuebla cada estancia',
    templates: 'Empieza con una casa real',
  },
  fr: {
    walk3d: 'Parcourez-le en 3D',
    draw: 'Dessinez un plan vite fait',
    furnish: 'Meublez chaque pièce',
    templates: 'Partez d’une vraie maison',
  },
  pt: {
    walk3d: 'Percorra em 3D',
    draw: 'Desenhe a planta depressa',
    furnish: 'Mobile cada divisão',
    templates: 'Comece com uma casa real',
  },
};

/** The marketing frame: gradient, caption, device. Returned as a full HTML doc
 *  so the composer can just set content and screenshot it. */
export function frameHtml({ caption, imageDataUri }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${CANVAS.width}px; height: ${CANVAS.height}px;
    display: flex; flex-direction: column; align-items: center;
    /* The app's own brand gradient, darkened — the shot has to look like the
       product, not like a generic template. */
    background: linear-gradient(160deg, #0d63f8 0%, #0b3fa8 42%, #0a0d14 100%);
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    overflow: hidden;
  }
  .caption {
    /* ~96px: comfortably past the squint test at Play's thumbnail size. */
    font-size: 96px; line-height: 1.08; font-weight: 800; letter-spacing: -0.02em;
    color: #fff; text-align: center;
    padding: 88px 72px 0; max-width: 980px;
    text-wrap: balance;
    text-shadow: 0 4px 24px rgba(0, 0, 0, 0.25);
    flex: none;
  }
  /* The device fills whatever the caption leaves and no more. Sizing it by
     WIDTH instead put an 840px shot at 1820px tall, which overflowed a 1920
     canvas and sheared the phone's bottom corners off — it looked like a
     mistake rather than a deliberate bleed. Driving off height means a longer
     caption shrinks the device instead of pushing it off the canvas. */
  .device {
    flex: 1 1 auto;
    min-height: 0;
    margin: 64px 0 72px;
    display: flex;
    align-items: flex-start;
    justify-content: center;
  }
  .device img {
    display: block;
    height: 100%;
    width: auto;
    border-radius: 44px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.28), 0 48px 96px -24px rgba(0,0,0,0.55);
    border: 3px solid rgba(255,255,255,0.16);
    background: #0a0d14;
  }
  </style></head><body>
  <div class="caption">${caption}</div>
  <div class="device"><img src="${imageDataUri}" alt=""></div>
  </body></html>`;
}
