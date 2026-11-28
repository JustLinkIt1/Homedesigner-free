// The kitchen-layout pages (SEO S2, 28 Nov 2026): a hub and five layouts (small,
// L, galley, U, island) in English, French and German, 18 pages.
// scripts/build-seo-pages.mjs renders them and refuses to write anything while
// a body is outside 80-150 words, a meta title is over 60 characters, a text
// says something the app cannot back up, or a picture is missing.
//
// Copy: shared/drafts/hd-seo-kitchen-copy-2026-11-28.md, word for word, with
// EXEC's three edits (cycle 329): hub en "You draw the units" is "You place the
// units"; K3 en drops "dishwasher door,"; K5's free-island text depends on the
// 3D check (K5_FREE_ISLAND_OK below).
//
// The buttons open the empty kitchens in tools/kitchen-layouts/ (made by
// tools/kitchen-layouts/build-kitchen-plans.mjs) at /app/?plan=<id>, ids from
// tools/kitchen-layouts/ids.json. English pages have a metric and a feet room,
// separate rooms, never conversions; French and German pages use the metric one.
// The pictures are /assets/kitchen-layouts/<slug>-3d.webp and <slug>-plan.webp,
// rendered from tools/kitchen-layouts/render/<slug>.json; their pixel sizes are
// in tools/kitchen-layouts/image-sizes.json (set them to the real files' sizes
// when the renders land).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

/**
 * Draft build (KITCHEN_LAYOUTS_DRAFT=1): the pictures come later, so a missing
 * picture is allowed, every kitchen-layout page carries robots noindex, and none
 * of them enter the sitemap. A normal build still refuses missing pictures.
 */
export const KITCHEN_LAYOUTS_DRAFT = process.env.KITCHEN_LAYOUTS_DRAFT === '1';

/**
 * K5 (island): the free island is base cabinets back to back. The copy keeps that
 * route only if they join cleanly in the 3D view (copy note 1). true: the copy
 * file's text. false: note 1's fallback (the dedicated Kitchen Island, Pro, or a
 * free table). Flip after the 3D check.
 */
export const K5_FREE_ISLAND_OK = true;

const IDS = JSON.parse(readFileSync(resolve(root, 'tools/kitchen-layouts/ids.json'), 'utf8'));
const SIZES = JSON.parse(readFileSync(resolve(root, 'tools/kitchen-layouts/image-sizes.json'), 'utf8'));

/** Shared strings (copy B1-B4) and the picture caption (copy note 5). */
export const KITCHEN_UI = {
  en: {
    button: 'Open this kitchen size in the editor',
    under: 'Opens a room of this size. You place the units yourself.',
    proNote: 'Marked items are Pro. Everything else on this page is free.',
    back: 'All kitchen layouts',
    caption: 'Example arrangement. The editor opens the empty room.',
  },
  fr: {
    button: "Ouvrir cette taille de cuisine dans l’éditeur",
    under: 'Ouvre une pièce de cette taille. Vous placez les meubles vous-même.',
    proNote: 'Les éléments marqués sont Pro. Tout le reste de cette page est gratuit.',
    back: 'Toutes les implantations de cuisine',
    caption: "Exemple d’aménagement. L’éditeur ouvre la pièce vide.",
  },
  de: {
    button: 'Diese Küchengröße im Editor öffnen',
    under: 'Öffnet einen Raum in dieser Größe. Die Schränke stellst du selbst.',
    proNote: 'Markierte Elemente sind Pro. Alles andere auf dieser Seite ist kostenlos.',
    back: 'Alle Küchenformen',
    caption: 'Beispiel-Einrichtung. Der Editor öffnet den leeren Raum.',
  },
};

/** Picture alt texts: the caption's first sentence plus which view it is. */
export const KITCHEN_ALT = {
  en: { view3d: 'example arrangement in 3D', plan: 'example arrangement, 2D plan' },
  fr: { view3d: "exemple d’aménagement en 3D", plan: "exemple d’aménagement, plan 2D" },
  de: { view3d: 'Beispiel-Einrichtung in 3D', plan: 'Beispiel-Einrichtung, 2D-Grundriss' },
};

export const KITCHEN_HUB = {
  en: {
    path: '/kitchen-layouts/',
    title: 'Kitchen layout ideas: small, L, galley, U and island',
    description: 'Five kitchen layouts with example sizes in metres and feet. Open a room in the free planner and arrange the units in 2D and 3D.',
    body: 'Most kitchens are one of five shapes. A small kitchen fits everything on one or two walls. An L uses two walls that meet in a corner. A galley puts two runs face to face. A U wraps three walls. An island adds a freestanding run in the middle. Pick a layout below to see example sizes, then open a room of that size in HomeDesigner. You place the units in 2D, line them up into runs, and walk around the result in 3D, all in your browser or on Android. Base cabinets, counters, the sink, stove and fridge are free.',
  },
  fr: {
    path: '/fr/implantation-cuisine/',
    title: 'Implantation de cuisine : petite, en L, couloir, en U, îlot',
    description: 'Cinq implantations de cuisine avec des tailles d\'exemple. Ouvrez une pièce dans le planificateur gratuit et placez les meubles en 2D et 3D.',
    body: "La plupart des cuisines suivent l’une de cinq formes. Une petite cuisine tient sur un ou deux murs. Une cuisine en L occupe deux murs qui se rejoignent dans un angle. Une cuisine en couloir aligne deux rangées face à face. Une cuisine en U fait le tour de trois murs. L’îlot ajoute une rangée au centre de la pièce. Choisissez une implantation ci-dessous pour voir des tailles d’exemple, puis ouvrez une pièce de cette taille dans HomeDesigner. Vous placez les meubles en 2D et faites le tour du résultat en 3D, dans le navigateur ou sur Android. Meubles bas, plans de travail, évier, cuisinière et réfrigérateur sont gratuits.",
  },
  de: {
    path: '/de/kuechenformen/',
    title: 'Küchenformen planen: klein, L, zweizeilig, U und Insel',
    description: 'Fünf Küchenformen mit Beispielmaßen. Öffne einen Raum im kostenlosen Planer und stelle die Schränke in 2D und 3D.',
    body: 'Die meisten Küchen haben eine von fünf Formen. Eine kleine Küche passt an eine oder zwei Wände. Die L-Küche nutzt zwei Wände, die sich in einer Ecke treffen. Die zweizeilige Küche stellt zwei Zeilen gegenüber. Die U-Küche läuft über drei Wände. Eine Insel ergänzt eine freistehende Zeile in der Mitte. Wähle unten eine Form, sieh dir die Beispielmaße an und öffne einen Raum in dieser Größe in HomeDesigner. Du stellst die Schränke in 2D und gehst in 3D durch das Ergebnis, im Browser oder auf Android. Unterschränke, Arbeitsplatten, Spüle, Herd und Kühlschrank sind kostenlos.',
  },
};

// K5 text, both variants. The fallback (note 1) cuts "then make the island ... at
// no charge" and the ready-made sentence after it, and says "use the Kitchen Island
// (Pro)" plus "or leave a free table there instead" (Dining Table is free). The
// fallback fr/de wording and the fallback metas are the build's, for EXEC to check.
const K5 = K5_FREE_ISLAND_OK ? {
  en: {
    description: 'Plan a kitchen with an island in a 4.2 × 4 m or 14 × 13 ft room. Build a free island from base cabinets, in 2D and 3D.',
    body: "An island adds a freestanding run in the middle of the kitchen: extra worktop, extra storage, and often a place to sit. It needs a bigger room than the other layouts, because you walk all the way around it. Many planners leave about 1 m on every side. Open a room of this size, build the wall run first, then make the island from free Base Cabinets placed back to back in the middle of the floor. That's a working island at no charge. If you'd rather drop in one ready-made piece, the dedicated Kitchen Island (180 × 90 cm) is Pro. Either way, walk around it in 3D and open the oven door in your head.",
  },
  fr: {
    description: 'Planifiez une cuisine avec îlot dans une pièce de 4,2 × 4 m. Montez un îlot gratuit avec des meubles bas, en 2D et 3D.',
    body: "L’îlot ajoute une rangée indépendante au centre de la cuisine : plus de plan de travail, plus de rangement, et souvent une place pour s’asseoir. Il demande une pièce plus grande que les autres implantations, car on circule tout autour. Beaucoup de cuisinistes laissent environ 1 m de chaque côté. Ouvrez une pièce de cette taille, montez d’abord la rangée murale, puis formez l’îlot avec des Meubles bas gratuits placés dos à dos au milieu de la pièce. Vous obtenez un îlot sans rien payer. Si vous préférez une pièce toute faite, l’Îlot de cuisine dédié (180 × 90 cm) est Pro. Dans les deux cas, faites-en le tour en 3D.",
  },
  de: {
    description: 'Plane eine Küche mit Insel in einem Raum von 4,2 × 4 m. Bau eine kostenlose Insel aus Unterschränken, in 2D und 3D.',
    body: 'Eine Insel ergänzt eine freistehende Zeile mitten in der Küche: mehr Arbeitsfläche, mehr Stauraum und oft ein Platz zum Sitzen. Sie braucht mehr Raum als die anderen Formen, weil man ganz um sie herumgeht. Viele Küchenplaner lassen auf jeder Seite etwa 1 m frei. Öffne einen Raum in dieser Größe, bau zuerst die Wandzeile und dann die Insel aus kostenlosen Unterschränken, Rücken an Rücken mitten im Raum. Das ist eine Insel, die nichts kostet. Willst du lieber ein fertiges Teil, ist die Kücheninsel (180 × 90 cm) Pro. So oder so: Geh in 3D einmal um sie herum.',
  },
} : {
  en: {
    description: 'Plan a kitchen with an island in a 4.2 × 4 m or 14 × 13 ft room. Build the wall run from free base cabinets, in 2D and 3D.',
    body: 'An island adds a freestanding run in the middle of the kitchen: extra worktop, extra storage, and often a place to sit. It needs a bigger room than the other layouts, because you walk all the way around it. Many planners leave about 1 m on every side. Open a room of this size, build the wall run first, then use the Kitchen Island (180 × 90 cm, Pro). Or leave a free table there instead. Either way, walk around it in 3D and open the oven door in your head.',
  },
  fr: {
    description: 'Planifiez une cuisine avec îlot dans une pièce de 4,2 × 4 m. Montez la rangée murale avec des meubles bas gratuits, en 2D et 3D.',
    body: "L’îlot ajoute une rangée indépendante au centre de la cuisine : plus de plan de travail, plus de rangement, et souvent une place pour s’asseoir. Il demande une pièce plus grande que les autres implantations, car on circule tout autour. Beaucoup de cuisinistes laissent environ 1 m de chaque côté. Ouvrez une pièce de cette taille, montez d’abord la rangée murale, puis utilisez l’Îlot de cuisine (180 × 90 cm, Pro). Ou laissez plutôt une table gratuite à cette place. Dans les deux cas, faites-en le tour en 3D.",
  },
  de: {
    description: 'Plane eine Küche mit Insel in einem Raum von 4,2 × 4 m. Bau die Wandzeile aus kostenlosen Unterschränken, in 2D und 3D.',
    body: 'Eine Insel ergänzt eine freistehende Zeile mitten in der Küche: mehr Arbeitsfläche, mehr Stauraum und oft ein Platz zum Sitzen. Sie braucht mehr Raum als die anderen Formen, weil man ganz um sie herumgeht. Viele Küchenplaner lassen auf jeder Seite etwa 1 m frei. Öffne einen Raum in dieser Größe, bau zuerst die Wandzeile und nimm dann die Kücheninsel (180 × 90 cm, Pro). Oder stell stattdessen einen kostenlosen Tisch dorthin. So oder so: Geh in 3D einmal um sie herum.',
  },
};

/**
 * One entry per layout. `sizes` per language: the label shown on the page and the
 * plan it opens (`metric` or `feet`, tools/kitchen-layouts/<slug>-<plan>.json).
 * `example` is the copy's "Example rooms" / "Exemple" / "Beispiel" line.
 */
const LAYOUTS = [
  {
    slug: 'small-kitchen',
    en: {
      path: '/kitchen-layouts/small-kitchen/',
      title: 'Small kitchen layout ideas, with example sizes',
      description: 'Plan a small kitchen in a 3 × 2.4 m or 10 × 8 ft room. Free base cabinets, sink, stove and fridge, in 2D and 3D.',
      example: 'Example rooms: 3 × 2.4 m · 10 × 8 ft',
      sizes: [['3 × 2.4 m', 'metric'], ['10 × 8 ft', 'feet']],
      body: "In a small kitchen every 55 cm cabinet counts. Start with the three things you use most: sink, stove and fridge. Put the sink between the other two so you have counter space on both sides of it, and keep the fridge at the end of the run so its door opens away from the worktop. If one wall isn't enough, turn the corner and continue on a second wall. Open a room of this size, add Base Cabinets until the run fills the wall, then step into 3D and check that the doors and the walkway still feel comfortable. Move a unit, check again. That loop is quicker on screen than in a showroom.",
    },
    fr: {
      path: '/fr/implantation-cuisine/petite-cuisine/',
      title: 'Aménagement petite cuisine : idées et tailles d\'exemple',
      description: 'Planifiez une petite cuisine dans une pièce de 3 × 2,4 m. Meubles bas, évier, cuisinière et réfrigérateur gratuits, en 2D et 3D.',
      example: 'Exemple : 3 × 2,4 m',
      sizes: [['3 × 2,4 m', 'metric']],
      body: "Dans une petite cuisine, chaque meuble de 55 cm compte. Commencez par les trois éléments que vous utilisez le plus : évier, cuisinière et réfrigérateur. Placez l’évier entre les deux autres pour garder du plan de travail de chaque côté, et mettez le réfrigérateur en bout de rangée pour que sa porte s’ouvre loin du plan de travail. Si un mur ne suffit pas, tournez l’angle et continuez sur un deuxième mur. Ouvrez une pièce de cette taille, ajoutez des Meubles bas jusqu’à remplir le mur, puis passez en 3D pour vérifier les portes et le passage. Déplacez un meuble, vérifiez à nouveau.",
    },
    de: {
      path: '/de/kuechenformen/kleine-kueche/',
      title: 'Kleine Küche Grundriss: Ideen mit Beispielmaßen',
      description: 'Plane eine kleine Küche in einem Raum von 3 × 2,4 m. Unterschränke, Spüle, Herd und Kühlschrank kostenlos, in 2D und 3D.',
      example: 'Beispiel: 3 × 2,4 m',
      sizes: [['3 × 2,4 m', 'metric']],
      body: 'In einer kleinen Küche zählt jeder 55-cm-Schrank. Fang mit den drei Dingen an, die du am meisten nutzt: Spüle, Herd und Kühlschrank. Setz die Spüle zwischen die beiden anderen, damit links und rechts Arbeitsfläche bleibt, und stell den Kühlschrank ans Ende der Zeile, damit seine Tür von der Arbeitsplatte weg aufgeht. Reicht eine Wand nicht, geh um die Ecke und mach an der zweiten Wand weiter. Öffne einen Raum in dieser Größe, füll die Wand mit Unterschränken und prüf dann in 3D, ob Türen und Durchgang passen. Schrank verschieben, noch mal schauen.',
    },
  },
  {
    slug: 'l-shaped-kitchen',
    en: {
      path: '/kitchen-layouts/l-shaped-kitchen/',
      title: 'L-shaped kitchen layout ideas, with example sizes',
      description: 'Plan an L-shaped kitchen in a 3.6 × 3 m or 12 × 10 ft room. Build both runs from free base cabinets, in 2D and 3D.',
      example: 'Example rooms: 3.6 × 3 m · 12 × 10 ft',
      sizes: [['3.6 × 3 m', 'metric'], ['12 × 10 ft', 'feet']],
      body: 'An L-shaped kitchen uses two walls that meet in a corner and leaves the rest of the room open, which is why it suits kitchens that share space with a dining table. Put the sink on one leg and the stove on the other, so two people can work without bumping into each other. Open a room of this size and build each leg from free Base Cabinets: a row along the first wall, then a second row starting where the first one ends. The corner is the only tricky part. You can leave it as a plain worktop with two cabinets meeting, or use the dedicated Corner Cabinet (Pro). Check the corner in 3D before you decide.',
    },
    fr: {
      path: '/fr/implantation-cuisine/cuisine-en-l/',
      title: "Plan cuisine en L : idées et tailles d’exemple",
      description: 'Planifiez une cuisine en L dans une pièce de 3,6 × 3 m. Les deux rangées se montent avec des meubles bas gratuits, en 2D et 3D.',
      example: 'Exemple : 3,6 × 3 m',
      sizes: [['3,6 × 3 m', 'metric']],
      body: "La cuisine en L occupe deux murs qui se rejoignent dans un angle et laisse le reste de la pièce libre, ce qui la rend pratique quand la cuisine partage l’espace avec une table. Placez l’évier sur un côté et la cuisinière sur l’autre, pour que deux personnes puissent cuisiner sans se gêner. Ouvrez une pièce de cette taille et montez chaque côté avec des Meubles bas gratuits : une rangée le long du premier mur, puis une seconde qui part de sa fin. L’angle est le seul point délicat. Vous pouvez y laisser deux meubles qui se rejoignent, ou utiliser le Meuble d’angle dédié (Pro). Vérifiez l’angle en 3D avant de choisir.",
    },
    de: {
      path: '/de/kuechenformen/l-kueche/',
      title: 'L-Küche Grundriss: Ideen mit Beispielmaßen',
      description: 'Plane eine L-Küche in einem Raum von 3,6 × 3 m. Beide Schenkel aus kostenlosen Unterschränken, in 2D und 3D.',
      example: 'Beispiel: 3,6 × 3 m',
      sizes: [['3,6 × 3 m', 'metric']],
      body: 'Die L-Küche nutzt zwei Wände, die sich in einer Ecke treffen, und lässt den Rest des Raums frei. Deshalb passt sie gut, wenn Küche und Esstisch sich einen Raum teilen. Setz die Spüle auf den einen Schenkel und den Herd auf den anderen, dann kommen sich zwei Leute beim Kochen nicht in die Quere. Öffne einen Raum in dieser Größe und bau jeden Schenkel aus kostenlosen Unterschränken: eine Zeile an der ersten Wand, dann eine zweite ab ihrem Ende. Knifflig ist nur die Ecke. Du kannst dort zwei Schränke zusammenstoßen lassen oder den Eckschrank (Pro) nehmen. Schau dir die Ecke in 3D an, bevor du dich entscheidest.',
    },
  },
  {
    slug: 'galley-kitchen',
    en: {
      path: '/kitchen-layouts/galley-kitchen/',
      title: 'Galley kitchen layout ideas, with example sizes',
      description: 'Plan a galley kitchen in a 2.4 × 4 m or 8 × 13 ft room: two runs face to face, built from free units, in 2D and 3D.',
      example: 'Example rooms: 2.4 × 4 m · 8 × 13 ft',
      sizes: [['2.4 × 4 m', 'metric'], ['8 × 13 ft', 'feet']],
      body: 'A galley kitchen puts two runs of units face to face with a walkway between them. It packs a lot of worktop into a narrow room, and everything is a step or two away. The walkway is what makes or breaks it: many planners leave about 1 m, more if two people cook at once. Open a room of this size, build one run along each long wall from free Base Cabinets, and add the sink, stove and fridge. Then walk down the middle in 3D with the oven door and fridge door in mind. If it feels tight, shorten one run.',
    },
    fr: {
      path: '/fr/implantation-cuisine/cuisine-en-couloir/',
      title: "Plan cuisine en couloir : idées et tailles d’exemple",
      description: 'Planifiez une cuisine en couloir dans une pièce de 2,4 × 4 m : deux rangées face à face, en meubles gratuits, en 2D et 3D.',
      example: 'Exemple : 2,4 × 4 m',
      sizes: [['2,4 × 4 m', 'metric']],
      body: 'La cuisine en couloir place deux rangées de meubles face à face, avec un passage entre les deux. Elle offre beaucoup de plan de travail dans une pièce étroite, et tout reste à un ou deux pas. Le passage fait toute la différence : beaucoup de cuisinistes laissent environ 1 m, davantage si deux personnes cuisinent ensemble. Ouvrez une pièce de cette taille, montez une rangée de Meubles bas gratuits le long de chaque grand mur, puis ajoutez évier, cuisinière et réfrigérateur. Parcourez ensuite le passage en 3D en pensant aux portes du four et du réfrigérateur. Si c\'est trop juste, raccourcissez une rangée.',
    },
    de: {
      path: '/de/kuechenformen/zweizeilige-kueche/',
      title: 'Zweizeilige Küche Grundriss: Ideen mit Beispielmaßen',
      description: 'Plane eine zweizeilige Küche in einem Raum von 2,4 × 4 m: zwei Zeilen gegenüber, aus kostenlosen Schränken, in 2D und 3D.',
      example: 'Beispiel: 2,4 × 4 m',
      sizes: [['2,4 × 4 m', 'metric']],
      body: 'Bei der zweizeiligen Küche stehen sich zwei Schrankzeilen gegenüber, dazwischen ein Gang. Sie bringt viel Arbeitsfläche in einen schmalen Raum, und alles ist nur ein, zwei Schritte entfernt. Entscheidend ist der Gang: Viele Küchenplaner lassen etwa 1 m frei, mehr, wenn zwei Leute gleichzeitig kochen. Öffne einen Raum in dieser Größe, stell an jede lange Wand eine Zeile aus kostenlosen Unterschränken und ergänze Spüle, Herd und Kühlschrank. Geh dann in 3D durch den Gang und denk an offene Backofen- und Kühlschranktüren. Wird es eng, kürz eine Zeile.',
    },
  },
  {
    slug: 'u-shaped-kitchen',
    en: {
      path: '/kitchen-layouts/u-shaped-kitchen/',
      title: 'U-shaped kitchen layout ideas, with example sizes',
      description: 'Plan a U-shaped kitchen in a 3 × 3.3 m or 10 × 11 ft room. Three runs from free base cabinets, in 2D and 3D.',
      example: 'Example rooms: 3 × 3.3 m · 10 × 11 ft',
      sizes: [['3 × 3.3 m', 'metric'], ['10 × 11 ft', 'feet']],
      body: "A U-shaped kitchen wraps units around three walls. It gives you the most worktop and storage of any layout, and the cook stands in the middle with everything in reach. The catch is that it has two corners and one way in, so the space in the middle needs to stay open. Open a room of this size and build the three runs from free Base Cabinets, then put the sink, stove and fridge on different sides. Each corner can be two cabinets meeting, or the dedicated Corner Cabinet (Pro). Walk into the U in 3D and turn around once: if you can't, take one unit out.",
    },
    fr: {
      path: '/fr/implantation-cuisine/cuisine-en-u/',
      title: "Plan cuisine en U : idées et tailles d’exemple",
      description: 'Planifiez une cuisine en U dans une pièce de 3 × 3,3 m. Trois rangées de meubles bas gratuits, en 2D et 3D.',
      example: 'Exemple : 3 × 3,3 m',
      sizes: [['3 × 3,3 m', 'metric']],
      body: "La cuisine en U fait le tour de trois murs. C’est l’implantation qui offre le plus de plan de travail et de rangement, et la personne qui cuisine a tout à portée de main au centre. En contrepartie, elle a deux angles et une seule entrée, donc le centre doit rester dégagé. Ouvrez une pièce de cette taille, montez les trois rangées avec des Meubles bas gratuits, puis répartissez évier, cuisinière et réfrigérateur sur des côtés différents. Chaque angle peut accueillir deux meubles qui se rejoignent, ou le Meuble d’angle dédié (Pro). Entrez dans le U en 3D et faites demi-tour : si c’est impossible, retirez un meuble.",
    },
    de: {
      path: '/de/kuechenformen/u-kueche/',
      title: 'U-Küche Grundriss: Ideen mit Beispielmaßen',
      description: 'Plane eine U-Küche in einem Raum von 3 × 3,3 m. Drei Zeilen aus kostenlosen Unterschränken, in 2D und 3D.',
      example: 'Beispiel: 3 × 3,3 m',
      sizes: [['3 × 3,3 m', 'metric']],
      body: 'Die U-Küche läuft über drei Wände. Keine andere Form bietet so viel Arbeitsfläche und Stauraum, und wer kocht, steht in der Mitte und hat alles in Reichweite. Der Haken: zwei Ecken und nur ein Zugang, also muss die Mitte frei bleiben. Öffne einen Raum in dieser Größe, bau die drei Zeilen aus kostenlosen Unterschränken und verteil Spüle, Herd und Kühlschrank auf verschiedene Seiten. In jede Ecke kommen zwei Schränke, die zusammenstoßen, oder der Eckschrank (Pro). Geh in 3D ins U und dreh dich einmal um. Klappt das nicht, nimm einen Schrank raus.',
    },
  },
  {
    slug: 'kitchen-island',
    en: {
      path: '/kitchen-layouts/kitchen-island/',
      title: 'Kitchen layout with island: ideas and example sizes',
      ...K5.en,
      example: 'Example rooms: 4.2 × 4 m · 14 × 13 ft',
      sizes: [['4.2 × 4 m', 'metric'], ['14 × 13 ft', 'feet']],
    },
    fr: {
      path: '/fr/implantation-cuisine/cuisine-avec-ilot/',
      title: "Plan cuisine avec îlot : idées et tailles d’exemple",
      ...K5.fr,
      example: 'Exemple : 4,2 × 4 m',
      sizes: [['4,2 × 4 m', 'metric']],
    },
    de: {
      path: '/de/kuechenformen/kueche-mit-insel/',
      title: 'Küche mit Insel Grundriss: Ideen mit Beispielmaßen',
      ...K5.de,
      example: 'Beispiel: 4,2 × 4 m',
      sizes: [['4,2 × 4 m', 'metric']],
    },
  },
];

export const KITCHEN_CODES = ['en', 'fr', 'de'];

const picture = (src) => ({ src, ...(SIZES[src] ?? { w: 0, h: 0 }) });

export const KITCHEN_LAYOUTS = LAYOUTS.map((l) => ({
  ...l,
  images: {
    view3d: picture(`/assets/kitchen-layouts/${l.slug}-3d.webp`),
    plan: picture(`/assets/kitchen-layouts/${l.slug}-plan.webp`),
  },
  ...Object.fromEntries(KITCHEN_CODES.map((code) => [code, {
    ...l[code],
    // "Marked items are Pro" goes on every page whose text names a Pro item.
    proNote: /\bPro\b/.test(l[code].body),
    buttons: l[code].sizes.map(([label, plan]) => ({ label, id: IDS[`${l.slug}-${plan}`], href: `/app/?plan=${IDS[`${l.slug}-${plan}`]}` })),
  }])),
}));

const words = (s) => s.trim().split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
// Claims the pages must not make: the floor-plans list (no AI, no PDF, no
// building code, no cost or price), plus no building regulations in fr/de.
const BANNED = [/\bAI\b/, /\bA\.I\./i, /artificial intelligence/i, /intelligence artificielle/i, /\bKI\b/, /künstliche Intelligenz/i, /\bpdf\b/i, /building code/i, /\bcode[- ]compliant/i, /planning permission/i, /\bcosts?\b/i, /\bprice/i, /\bbudget/i, /\bprix\b/i, /\bPreis/i, /Bauordnung/i, /norme/i, /\bDIN\b/];
// Pro catalog items (furnitureCatalog.ts: island, corner, drawer, wall cabinet, dishwasher).
const PRO_ITEMS = [/Kitchen Island/i, /Corner Cabinet/i, /Drawer Unit/i, /Wall Cabinet/i, /Dishwasher/i, /Îlot de cuisine/i, /Meuble d['’]angle/i, /Kücheninsel/i, /Eckschrank/i];
const FREE = /\bfree\b|gratuit|kostenlos|no charge|sans rien payer|nichts kostet/i;
const sentences = (s) => s.split(/(?<=[.!?])\s+/);

/** Draft builds only: what would stop a normal build but not a draft (long titles). */
export const kitchenLayoutWarnings = [];

/** Everything that would make a page thin, wrong or untrue. Empty when the pages may be written. */
export function kitchenLayoutProblems(exists) {
  const problems = [];
  const seenPath = new Set();
  const check = (code, page) => {
    const at = page.path;
    if (seenPath.has(at)) problems.push(`${at}: path used twice`);
    seenPath.add(at);
    const n = words(page.body);
    if (n < 80 || n > 150) problems.push(`${at}: body is ${n} words (80 to 150)`);
    // A long title is the copy's to fix, not the build's to cut: a draft build
    // only warns, so the pages can be looked at; a normal build refuses.
    if (page.title.length > 60) (KITCHEN_LAYOUTS_DRAFT ? kitchenLayoutWarnings : problems).push(`${at}: meta title is ${page.title.length} characters (60 at most)`);
    if (page.description.length < 100 || page.description.length > 160) problems.push(`${at}: description is ${page.description.length} characters (100 to 160)`);
    for (const field of ['title', 'description', 'body', 'example']) {
      if (!page[field]) continue;
      for (const re of BANNED) if (re.test(page[field])) problems.push(`${at}: ${field} says ${re}`);
      // A Pro item and "free" in one sentence reads as a free Pro item.
      for (const s of sentences(page[field])) if (PRO_ITEMS.some((re) => re.test(s)) && FREE.test(s)) problems.push(`${at}: ${field} calls a Pro item free: "${s}"`);
      // fr/de: metres only.
      if (code !== 'en' && /\b(ft|feet|pieds|Fuß)\b|\bsq\b/.test(page[field])) problems.push(`${at}: ${field} uses feet (metres only)`);
    }
    // A page that names a Pro item marks it and carries the Pro note.
    if (PRO_ITEMS.some((re) => re.test(page.body)) && !page.proNote) problems.push(`${at}: names a Pro item without the Pro note`);
  };
  for (const code of KITCHEN_CODES) check(code, KITCHEN_HUB[code]);
  for (const l of KITCHEN_LAYOUTS) {
    for (const code of KITCHEN_CODES) {
      const page = l[code];
      check(code, page);
      if (page.buttons.length !== (code === 'en' ? 2 : 1)) problems.push(`${page.path}: ${page.buttons.length} size buttons`);
      for (const b of page.buttons) if (!/^[a-z0-9]{10,24}$/.test(b.id ?? '')) problems.push(`${page.path}: no valid plan id for ${b.label} in tools/kitchen-layouts/ids.json`);
    }
    for (const { src, w, h } of Object.values(l.images)) {
      if (!w || !h) problems.push(`/kitchen-layouts/${l.slug}/: no size for ${src} in tools/kitchen-layouts/image-sizes.json`);
      if (!KITCHEN_LAYOUTS_DRAFT && !exists(src)) problems.push(`/kitchen-layouts/${l.slug}/: picture ${src} is missing`);
    }
  }
  return problems;
}

/** Body word counts, for the report. */
export const kitchenWordCounts = () => [
  ...KITCHEN_CODES.map((c) => [KITCHEN_HUB[c].path, words(KITCHEN_HUB[c].body)]),
  ...KITCHEN_LAYOUTS.flatMap((l) => KITCHEN_CODES.map((c) => [l[c].path, words(l[c].body)])),
];
