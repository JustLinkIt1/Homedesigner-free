// Write the website's topic pages and sitemap into site/.
//
//   node scripts/build-seo-pages.mjs
//
// The home page can only rank for the brand name: one page cannot answer
// "floor plan maker", "kitchen planner" and "AI home design" at once. Each
// topic gets its own page with its own title, text, pictures and questions.
// The output is committed (the Pages build only copies site/), so run this
// after editing PAGES and commit both.
//
// Everything said here has to stay true of the app: prices in points come from
// workers/design-sync/src/points.ts, the Pro list from the Play listing.

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const site = resolve(root, 'site');
const ORIGIN = 'https://homedesignerapp.com';
const PLAY = 'https://play.google.com/store/apps/details?id=com.homedesigner.app';
const UPDATED = '2026-11-11';

/** Nav and footer order. `nav` is the short label. */
const PAGES = [
  {
    slug: 'floor-plan-maker',
    nav: 'Floor plans',
    title: 'Free Floor Plan Maker — Draw House Plans Online | HomeDesigner',
    description:
      'Draw a floor plan to scale in minutes. Snap walls, type exact lengths, add doors and windows, import a PDF or photo, and see the plan in 3D. Free on Android and in your browser.',
    h1: ['Free floor plan maker', 'for house plans to scale'],
    sub: 'Sketch walls with your finger or mouse, type the exact length, and HomeDesigner works out the rooms and their areas. No drawing experience needed.',
    hero: { src: 'plan-2d.webp', w: 1280, h: 823, alt: 'A furnished house floor plan with room names, areas and dimensions in the HomeDesigner editor' },
    kicker: 'Floor plan creator',
    heading: 'From a rough sketch to a plan you can hand to a builder',
    lead: 'HomeDesigner is a floor plan app for homeowners, renovators and anyone arranging a room before buying furniture. The same plan opens on your phone and in the browser.',
    rows: [
      {
        img: { src: 'phone-2-plan2d.webp', w: 720, h: 1560, phone: true, alt: 'Drawing a floor plan on a phone with live dimensions' },
        h: 'Draw walls that snap into place',
        p: 'Walls snap to the grid and to each other, so corners close cleanly. Rooms are detected as soon as the walls meet, with the area shown in square metres or square feet.',
        list: [
          ['Exact measurements', 'type a length or drag a corner, in metric or imperial'],
          ['Doors, windows and openings', 'in several styles, placed on any wall'],
          ['Room names and areas', 'labelled automatically as you draw'],
        ],
      },
      {
        img: { src: 'house-3d.webp', w: 1101, h: 782, alt: 'The same floor plan shown as a 3D house with furniture' },
        h: 'Import a plan you already have',
        p: 'Bring in a PDF, a photo of a paper plan or a DXF file, set the scale with one known measurement, and trace over it. Then switch to 3D to check that the layout works.',
        list: [
          ['PDF, image and DXF import', 'with automatic wall tracing for clean drawings'],
          ['Several storeys', 'stack floors and connect them with stairs (Pro)'],
          ['Export', 'PNG for free, PDF plan packs with areas and schedules in Pro'],
        ],
      },
    ],
    steps: [
      ['Start a project', 'Open a blank plan or one of the furnished sample homes.'],
      ['Draw the walls', 'Tap to place corners. Type a length when it has to be exact.'],
      ['Add doors and windows', 'Drop them on a wall and slide them into position.'],
      ['Furnish and check in 3D', 'Place furniture to scale, then walk through the result.'],
    ],
    faq: [
      ['Is the floor plan maker free?', 'Yes. You can draw, furnish and view plans in 3D for free, on Android and in the web app. HomeDesigner Pro adds several storeys, the complete catalog, PDF export, watermark-free images and unlimited saved projects.'],
      ['Can I draw a floor plan to scale?', 'Yes. Every wall has a real length. Type the measurement you want, or drag and read the live dimension. Areas are calculated for each room.'],
      ['Can I use it on a computer?', 'Yes. The web app runs in the browser with nothing to install, and it is the same editor as the Android app.'],
      ['Can I turn an existing plan into an editable one?', 'Yes. Import a PDF, image or DXF, set the scale from one measurement, and trace the walls. Clean drawings can be traced automatically.'],
    ],
  },
  {
    slug: '3d-home-design',
    nav: '3D design',
    title: '3D Home Design App — Walk Through Your House Plan | HomeDesigner',
    description:
      'Turn a floor plan into a 3D house in one tap. Furnish every room, change floors and wall colours, set the sunlight, and walk through your home design. Free on Android and the web.',
    h1: ['3D home design', 'you can walk through'],
    sub: 'Every wall, door and piece of furniture you place in the plan appears in 3D straight away. Look at the house from above like a dollhouse, or step inside.',
    hero: { src: 'house-3d.webp', w: 1101, h: 782, alt: 'A furnished single-storey house in 3D with a deck, parasol and garden' },
    kicker: 'House design in 3D',
    heading: 'See the home before you build or buy',
    lead: 'A plan tells you whether things fit. 3D tells you whether they feel right: how far the sofa is from the window, where the light falls in the afternoon, what the kitchen looks like from the dining table.',
    rows: [
      {
        img: { src: 'interior-3d.webp', w: 981, h: 782, alt: 'Interior 3D view of a living room with a sofa, rug and daylight through the windows' },
        h: 'Furnish and decorate every room',
        p: 'Choose from living room, bedroom, kitchen, bathroom, office, lighting and garden furniture. Resize and rotate each piece, and change wall colours, floors and materials.',
        list: [
          ['Real 3D furniture', 'with more models added from the cloud'],
          ['Floors and walls', 'wood, tile, stone, concrete, paint and more'],
          ['Sunlight', 'set the time of day and see the light and shadows change'],
        ],
      },
      {
        img: { src: 'phone-3-view3d.webp', w: 720, h: 1560, phone: true, alt: '3D view of a house on a phone' },
        h: 'One tap from plan to 3D',
        p: 'There is nothing to convert or wait for. Switch between the 2D plan and the 3D view whenever you like, on a phone, a tablet or a computer.',
        list: [
          ['Dollhouse and walk-through views', 'see it from above or from inside'],
          ['Roofs, stairs and several storeys', 'for whole-house designs'],
          ['Photo mode', 'save a still image of any view'],
        ],
      },
    ],
    steps: [
      ['Draw or open a plan', 'Start from scratch, import a plan or pick a sample home.'],
      ['Add furniture', 'Drag pieces in from the catalog and arrange them to scale.'],
      ['Switch to 3D', 'Tap the 3D button to see the house built around you.'],
      ['Save a picture', 'Take a photo of the view, or turn it into an AI render.'],
    ],
    faq: [
      ['Is HomeDesigner a free 3D home design app?', 'Yes. Drawing, furnishing and the 3D view are free. Pro removes the watermark from saved images and adds several storeys, the full catalog and PDF export.'],
      ['Does 3D work on my phone?', 'Yes. The Android app picks a quality level that suits the phone, and you can raise or lower it in the settings.'],
      ['Can I design a house with more than one floor?', 'Yes, with Pro. Add upper floors and basements, connect them with stairs, and move between them in 3D.'],
      ['Can I get a realistic picture of my design?', 'Yes. Photo mode saves the 3D view as an image, and the AI render turns that view into a photo-like picture.'],
    ],
  },
  {
    slug: 'kitchen-planner',
    nav: 'Kitchen planner',
    title: 'Free 3D Kitchen Planner — Design Your Kitchen Online | HomeDesigner',
    description:
      'Plan a fitted kitchen in 3D: base and wall cabinets, drawers, built-in oven, hob, fridge, microwave, sink and hood. Choose the worktop and colours. Free on Android and in your browser.',
    h1: ['Free 3D kitchen planner', 'with built-in appliances'],
    sub: 'Line up cabinets along the wall, drop in the oven, hob, sink and fridge, pick a worktop, and see your kitchen in 3D before you order a single unit.',
    hero: { src: 'kitchen-island.webp', w: 981, h: 782, alt: 'A white fitted kitchen in 3D with an island, oven tower, built-in microwave, sink and hob' },
    kicker: 'Kitchen design tool',
    heading: 'Every unit of a fitted kitchen, to scale',
    lead: 'The kitchen planner is part of HomeDesigner, so your kitchen sits inside the real room, with its doors, windows and the dining table next to it.',
    rows: [
      {
        img: { src: 'kitchen-navy.webp', w: 981, h: 782, alt: 'A navy kitchen with a black granite worktop, gas range, hood and wall cupboards' },
        h: 'Cabinets, drawers and built-in appliances',
        p: 'Each unit can be resized to the width you need, and swapped for another type without losing its place in the run.',
        list: [
          ['Base units', 'cupboards, drawer units, corner units, sink unit, dishwasher'],
          ['Cooking', 'induction and gas hobs, built-in oven, gas range, extractor hood'],
          ['Tall units', 'integrated fridge, oven tower, larder'],
          ['Wall units', 'cupboards, built-in microwave, open shelves and niches'],
          ['Island', 'to stand free in the middle of the room'],
        ],
      },
      {
        img: { src: 'kitchen-white.webp', w: 981, h: 782, alt: 'A white handleless kitchen with a concrete worktop, induction hob and oak shelves' },
        h: 'Choose the worktop, colour and handles',
        p: 'Change the look of the whole kitchen at once, or one unit at a time.',
        list: [
          ['Worktops', 'quartz, granite, marble, travertine, slate, terrazzo, concrete, oak, walnut and brushed steel'],
          ['Fronts', 'any colour, applied to every unit in one step'],
          ['Handles', 'bar handles or a handleless look'],
        ],
      },
    ],
    steps: [
      ['Draw the room', 'Enter the wall lengths and add the doors and windows.'],
      ['Place the units', 'Add cabinets and appliances from the Kitchen category.'],
      ['Pick the finishes', 'Choose the worktop, front colour and handles.'],
      ['Look at it in 3D', 'Check the layout, then save a picture to take to the showroom.'],
    ],
    faq: [
      ['Is the kitchen planner free?', 'Yes. You can plan a kitchen and view it in 3D for free in the Android app and the web app. Some catalog items and watermark-free images are part of HomeDesigner Pro.'],
      ['Can I plan built-in appliances?', 'Yes. There are units for a built-in oven, an oven tower, induction and gas hobs, an integrated fridge, a built-in microwave, a dishwasher, a sink and an extractor hood.'],
      ['Can I change the worktop material?', 'Yes. Pick from stone, wood, concrete and steel worktops, and apply the choice to the whole kitchen in one step.'],
      ['Can I set my own cabinet widths?', 'Yes. Every unit can be resized, so you can match the sizes your kitchen supplier offers.'],
    ],
  },
  {
    slug: 'ai-home-design',
    nav: 'AI design',
    title: 'AI Home Design — AI Floor Plan Generator & Room Render | HomeDesigner',
    description:
      'Describe your home and get an editable floor plan, turn your 3D view into a photo-like AI render, and ask an AI designer to review your layout. Built into the HomeDesigner app.',
    h1: ['AI home design', 'floor plans and renders'],
    sub: 'Describe the home you want in plain words and get a floor plan you can edit. Then turn the 3D view into a picture that looks like a photo.',
    hero: { src: 'ai-after.webp', w: 1264, h: 848, alt: 'An AI render of a furnished house cut open to show the living room, kitchen and bathroom' },
    kicker: 'AI tools in the app',
    heading: 'AI that works on your own plan',
    lead: 'The AI tools use the plan you are working on, so the result is a real HomeDesigner project with walls and furniture you can move, not just a picture.',
    rows: [
      {
        img: { src: 'ai-before.webp', w: 1230, h: 768, alt: 'The 3D view of a house before the AI render' },
        h: 'AI render: from 3D view to photo',
        p: 'Frame a view in 3D and send it for rendering. In about fifteen seconds you get a photo-like image that keeps your layout, with realistic materials, light and planting. The picture above is the render of the view on this side.',
        list: [
          ['Any signed-in account', 'can render, with or without the watermark'],
          ['Pro', 'renders are always watermark-free'],
          ['Privacy', 'only the preview image is sent, never your plan file or account details'],
        ],
      },
      {
        img: { src: 'plan-2d.webp', w: 1280, h: 823, alt: 'An editable floor plan with rooms and furniture' },
        h: 'AI floor plan generator',
        p: 'Answer a few questions (storeys, bedrooms, bathrooms, size, garage) and add anything else in your own words. You get a furnished floor plan to edit like any other project, and you can ask for changes.',
        list: [
          ['Editable result', 'real walls, doors, windows and furniture'],
          ['Revise it', 'describe what to change and generate again'],
          ['Designer review', 'ask for written advice on your current layout'],
          ['Voice tour', 'a narrated walk through your home (Pro)'],
        ],
      },
    ],
    steps: [
      ['Sign in', 'AI tools need a free account with a verified Google sign-in.'],
      ['Describe your home', 'Fill in the short form and add your wishes in plain words.'],
      ['Edit the plan', 'Move walls and furniture, or ask the AI to revise it.'],
      ['Render it', 'Switch to 3D and turn the view into a photo-like picture.'],
    ],
    faq: [
      ['What do the AI tools cost?', 'They use points. New accounts get a one-time set of free points, enough to try an AI plan or a couple of renders, and more can be bought in the app. Everything else in HomeDesigner works without points.'],
      ['Can I edit a plan the AI made?', 'Yes. The result is a normal HomeDesigner project. You can move walls, change rooms, swap furniture and view it in 3D.'],
      ['How close is the AI render to my design?', 'It keeps the layout, walls and main furniture of your 3D view and adds realistic materials and lighting. It can add small decorative details, so treat it as an impression, not a technical drawing.'],
      ['Where do my images go?', 'A render sends only the preview image to the rendering service. An AI plan sends your answers, and a designer review sends a picture of the plan. The privacy policy lists the services used.'],
    ],
  },
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const url = (page) => `${ORIGIN}/${page.slug}/`;

function jsonLd(page) {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'HomeDesigner', item: `${ORIGIN}/` },
        { '@type': 'ListItem', position: 2, name: page.nav, item: url(page) },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: page.faq.map(([q, a]) => ({
        '@type': 'Question',
        name: q,
        acceptedAnswer: { '@type': 'Answer', text: a },
      })),
    },
  ]
    .map((o) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`)
    .join('\n  ');
}

const img = (i, lazy = true) =>
  `<img src="/assets/${i.src}" alt="${esc(i.alt)}" width="${i.w}" height="${i.h}"${lazy ? ' loading="lazy"' : ''} />`;

function render(page) {
  const others = PAGES.filter((p) => p !== page);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(page.title)}</title>
  <meta name="description" content="${esc(page.description)}" />
  <link rel="canonical" href="${url(page)}" />
  <link rel="icon" type="image/png" href="/assets/brand-icon.png" />
  <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="HomeDesigner" />
  <meta property="og:title" content="${esc(page.title)}" />
  <meta property="og:description" content="${esc(page.description)}" />
  <meta property="og:url" content="${url(page)}" />
  <meta property="og:image" content="${ORIGIN}/assets/og-banner.jpg" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="theme-color" content="#0a0d14" />
  <link rel="stylesheet" href="/assets/site.css" />
  ${jsonLd(page)}
</head>
<body>
  <header>
    <div class="wrap nav">
      <a class="logo" href="/"><img src="/assets/brand-icon.png" alt="" width="32" height="32" />HomeDesigner</a>
      <nav class="links">
        ${PAGES.map((p) => `<a href="/${p.slug}/"${p === page ? ' aria-current="page"' : ''}>${p.nav}</a>`).join('\n        ')}
        <a href="/buy/">Pro</a>
      </nav>
      <span class="spacer"></span>
      <a class="btn" href="${PLAY}" target="_blank" rel="noopener">Get it on Google Play</a>
      <a class="btn primary" href="/app/">Open web app</a>
    </div>
  </header>

  <main>
    <section class="hero">
      <div class="wrap">
        <p class="crumbs"><a href="/">HomeDesigner</a> › ${page.nav}</p>
        <h1>${esc(page.h1[0])}<br /><span class="accent">${esc(page.h1[1])}</span></h1>
        <p class="sub">${esc(page.sub)}</p>
        <div class="ctas">
          <a href="${PLAY}" target="_blank" rel="noopener" aria-label="Get HomeDesigner on Google Play"><img class="play-badge" src="/assets/google-play-badge.png" alt="Get it on Google Play" width="734" height="219" /></a>
          <a class="btn primary" href="/app/">Try it in your browser →</a>
        </div>
        <div class="hero-shot">${img(page.hero, false)}</div>
      </div>
    </section>

    <section class="block">
      <div class="wrap">
        <span class="kicker">${esc(page.kicker)}</span>
        <h2 class="title">${esc(page.heading)}</h2>
        <p class="lead">${esc(page.lead)}</p>
${page.rows
  .map(
    (r) => `        <div class="split">
          <div class="pic${r.img.phone ? ' phone' : ''}">${img(r.img)}</div>
          <div>
            <h3>${esc(r.h)}</h3>
            <p>${esc(r.p)}</p>
            <ul>
              ${r.list.map(([b, t]) => `<li><b>${esc(b)}:</b> ${esc(t)}</li>`).join('\n              ')}
            </ul>
          </div>
        </div>`,
  )
  .join('\n')}
      </div>
    </section>

    <section class="block band">
      <div class="wrap">
        <span class="kicker">How it works</span>
        <h2 class="title">Four steps</h2>
        <div class="steps">
          ${page.steps.map(([h, p]) => `<div class="step"><h3>${esc(h)}</h3><p>${esc(p)}</p></div>`).join('\n          ')}
        </div>
      </div>
    </section>

    <section class="block">
      <div class="wrap">
        <span class="kicker">Questions</span>
        <h2 class="title">Good to know</h2>
        <div class="faq">
          ${page.faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n          ')}
        </div>
      </div>
    </section>

    <section class="block" style="padding-top:0">
      <div class="wrap">
        <span class="kicker">More in HomeDesigner</span>
        <div class="more">
          ${others.map((p) => `<a href="/${p.slug}/"><b>${esc(p.h1[0])}</b><span>${esc(p.sub.split('. ')[0])}.</span></a>`).join('\n          ')}
        </div>
      </div>
    </section>

    <section class="block" style="padding-top:0">
      <div class="wrap">
        <div class="get">
          <h2>Start designing for free</h2>
          <p>Get HomeDesigner on Google Play, or open the full web app in your browser. No sign-up needed to start.</p>
          <div class="ctas">
            <a href="${PLAY}" target="_blank" rel="noopener" aria-label="Get HomeDesigner on Google Play"><img class="play-badge" src="/assets/google-play-badge.png" alt="Get it on Google Play" width="734" height="219" loading="lazy" /></a>
            <a class="btn" href="/app/">Open the web app →</a>
          </div>
        </div>
      </div>
    </section>
  </main>

  <footer>
    <div class="wrap row">
      <span>© ${UPDATED.slice(0, 4)} HomeDesigner</span>
      <span class="spacer"></span>
      ${PAGES.map((p) => `<a href="/${p.slug}/">${p.nav}</a>`).join('\n      ')}
      <a href="/buy/">Pro</a>
      <a href="/privacy">Privacy policy</a>
      <a href="/terms/">Terms</a>
    </div>
  </footer>
</body>
</html>
`;
}

for (const page of PAGES) {
  const dir = resolve(site, page.slug);
  await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, 'index.html'), render(page));
}

// Only pages that should appear in search results. /app/ is listed because
// people search for an online floor planner and that is the page that is one.
const entries = [
  ['/', '1.0'],
  ...PAGES.map((p) => [`/${p.slug}/`, '0.9']),
  ['/app/', '0.8'],
  ['/buy/', '0.6'],
  ['/community/', '0.5'],
  ['/terms/', '0.2'],
];
await writeFile(
  resolve(site, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map(([path, pri]) => `  <url><loc>${ORIGIN}${path}</loc><lastmod>${UPDATED}</lastmod><priority>${pri}</priority></url>`).join('\n')}
</urlset>
`,
);

console.log(`Wrote ${PAGES.length} topic pages and sitemap.xml (${entries.length} URLs) into site/`);
