// Write the website's topic pages, language landing pages and sitemap into site/.
//
//   node scripts/build-seo-pages.mjs
//
// The home page can only rank for the brand name: one page cannot answer
// "floor plan maker", "kitchen planner" and "AI home design" at once. Each
// topic gets its own page with its own title, text, pictures and questions,
// and each topic page exists in English, German, French and Spanish, because
// nobody searching "Grundriss erstellen" is shown an English page.
//
//   English   /<slug>/            home page: site/index.html (hand-written)
//   German    /de/<slug>/         home page: /de/  (written here)
//   French    /fr/<slug>/         home page: /fr/
//   Spanish   /es/<slug>/         home page: /es/
//
// Slugs are translated too: they are the words people type in that language.
// The four versions of a page name each other with hreflang links, and
// site/index.html carries the same four links for the home pages by hand, so
// a language added here has to be added there as well.
//
// The output is committed (the Pages build only copies site/), so run this
// after editing TOPICS and commit both.
//
// Everything said here has to stay true of the app: prices in points come from
// workers/design-sync/src/points.ts, the Pro list from the Play listing. The
// translations take their vocabulary from docs/PLAY_STORE_LISTING.txt (the
// de-DE, fr-FR and es-ES blocks), so the site and the store use the same words.
// A translation never says more than the English page it translates.

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const site = resolve(root, 'site');
const ORIGIN = 'https://homedesignerapp.com';
const PLAY = 'https://play.google.com/store/apps/details?id=com.homedesigner.app';
/** Last change to the pages written here and to the home page. */
const UPDATED = '2026-11-12';
/** Last change to the pages the sitemap lists but this script does not write. */
const UPDATED_OTHER = '2026-11-11';

/**
 * The languages, English first (it is also hreflang's x-default).
 * `dir` is the URL prefix, `hl` the Play Store language, `home` the landing
 * page (English has none here: its home page is site/index.html). `play` is
 * the wording of Google's badge in that language; `playShort` is the header
 * button, where the translated wording is too wide to sit beside six links.
 */
const LANGS = {
  en: {
    name: 'English',
    dir: '',
    hl: '',
    colon: ':',
    ui: {
      play: 'Get it on Google Play',
      playShort: 'Get it on Google Play',
      playAria: 'Get HomeDesigner on Google Play',
      openApp: 'Open web app',
      tryIt: 'Try it in your browser →',
      howKicker: 'How it works',
      howTitle: 'Four steps',
      faqKicker: 'Questions',
      faqTitle: 'Good to know',
      more: 'More in HomeDesigner',
      getTitle: 'Start designing for free',
      getText: 'Get HomeDesigner on Google Play, or open the full web app in your browser. No sign-up needed to start.',
      getButton: 'Open the web app →',
      privacy: 'Privacy policy',
      terms: 'Terms',
      language: 'Language',
    },
  },
  de: {
    name: 'Deutsch',
    dir: '/de',
    hl: 'de',
    ogLocale: 'de_DE',
    colon: ':',
    ui: {
      play: 'Jetzt bei Google Play',
      playShort: 'Google Play',
      playAria: 'HomeDesigner bei Google Play laden',
      openApp: 'Web-App öffnen',
      tryIt: 'Im Browser ausprobieren →',
      howKicker: 'So funktioniert’s',
      howTitle: 'In vier Schritten',
      faqKicker: 'Fragen',
      faqTitle: 'Gut zu wissen',
      more: 'Mehr in HomeDesigner',
      getTitle: 'Jetzt kostenlos planen',
      getText: 'Lade HomeDesigner bei Google Play oder öffne die vollständige Web-App im Browser. Zum Start ist keine Anmeldung nötig.',
      getButton: 'Web-App öffnen →',
      privacy: 'Datenschutz',
      terms: 'Nutzungsbedingungen',
      language: 'Sprache',
    },
    home: {
      title: 'HomeDesigner — Grundriss-Planer & 3D-Hausplaner kostenlos',
      description:
        'Grundriss maßstabsgetreu zeichnen, jeden Raum einrichten, die Küche planen und in 3D durchs Haus gehen. Mit KI-Grundriss. Kostenlos für Android und im Browser.',
      h1: ['Plane dein Traumhaus', 'in 2D & 3D'],
      sub: 'Ein kostenloser Grundriss-Planer und 3D-Hausplaner. Zeichne in wenigen Minuten einen Plan, richte ihn ein, plane die Küche und geh durch das Ergebnis, auf dem Handy oder direkt hier im Browser.',
      kicker: 'Das kannst du damit machen',
      heading: 'Planen, einrichten, rendern',
    },
  },
  fr: {
    name: 'Français',
    dir: '/fr',
    hl: 'fr',
    ogLocale: 'fr_FR',
    colon: ' :',
    ui: {
      play: 'Disponible sur Google Play',
      playShort: 'Google Play',
      playAria: 'Télécharger HomeDesigner sur Google Play',
      openApp: 'Ouvrir l’appli web',
      tryIt: 'Essayer dans le navigateur →',
      howKicker: 'Comment ça marche',
      howTitle: 'Quatre étapes',
      faqKicker: 'Questions',
      faqTitle: 'Bon à savoir',
      more: 'À découvrir aussi dans HomeDesigner',
      getTitle: 'Commencez gratuitement',
      getText: 'Téléchargez HomeDesigner sur Google Play ou ouvrez l’appli web complète dans votre navigateur. Aucune inscription nécessaire pour commencer.',
      getButton: 'Ouvrir l’appli web →',
      privacy: 'Confidentialité',
      terms: 'Conditions d’utilisation',
      language: 'Langue',
    },
    home: {
      title: 'HomeDesigner — plan de maison gratuit et architecture 3D',
      description:
        'Dessinez vos plans à l’échelle, meublez chaque pièce, aménagez la cuisine et visitez votre maison en 3D. Plans et rendus IA. Gratuit sur Android et en ligne.',
      h1: ['Concevez la maison de vos rêves', 'en 2D et en 3D'],
      sub: 'Un créateur de plans de maison et une appli d’architecture 3D, gratuits. Dessinez un plan en quelques minutes, meublez-le, aménagez la cuisine et visitez le résultat, sur votre téléphone ou ici même dans votre navigateur.',
      kicker: 'Ce que vous pouvez faire',
      heading: 'Dessinez, meublez, visualisez',
    },
  },
  es: {
    name: 'Español',
    dir: '/es',
    hl: 'es',
    ogLocale: 'es_ES',
    colon: ':',
    ui: {
      play: 'Disponible en Google Play',
      playShort: 'Google Play',
      playAria: 'Descargar HomeDesigner en Google Play',
      openApp: 'Abrir la app web',
      tryIt: 'Pruébalo en el navegador →',
      howKicker: 'Cómo funciona',
      howTitle: 'Cuatro pasos',
      faqKicker: 'Preguntas',
      faqTitle: 'Conviene saberlo',
      more: 'Más en HomeDesigner',
      getTitle: 'Empieza a diseñar gratis',
      getText: 'Descarga HomeDesigner en Google Play o abre la app web completa en tu navegador. No hace falta registrarse para empezar.',
      getButton: 'Abrir la app web →',
      privacy: 'Política de privacidad',
      terms: 'Términos',
      language: 'Idioma',
    },
    home: {
      title: 'HomeDesigner — planos de casas gratis y diseño en 3D',
      description:
        'Dibuja planos a escala, amuebla cada habitación, planifica la cocina y recorre tu casa en 3D. Con planos y renders con IA. Gratis en Android y en tu navegador.',
      h1: ['Diseña la casa de tus sueños', 'en 2D y 3D'],
      sub: 'Un creador de planos y una app de diseño de casas en 3D, gratis. Dibuja un plano en minutos, amuéblalo, planifica la cocina y recorre el resultado, en tu teléfono o aquí mismo en el navegador.',
      kicker: 'Qué puedes hacer',
      heading: 'Dibuja, amuebla, renderiza',
    },
  },
};
const CODES = Object.keys(LANGS);

/**
 * Nav and footer order. The pictures belong to the topic, the words to the
 * language: `shots` pairs up with each language's `rows` by position. `nav` is
 * the short label; `card` is the [title, text, picture alt] of the topic's card
 * on that language's landing page (the English cards are in site/index.html).
 */
const TOPICS = [
  {
    hero: { src: 'plan-2d.webp', w: 1280, h: 823 },
    shots: [
      { src: 'phone-2-plan2d.webp', w: 720, h: 1560, phone: true },
      { src: 'house-3d.webp', w: 1101, h: 782 },
    ],
    cardImg: { src: 'plan-2d.webp', w: 1280, h: 823 },
    en: {
      slug: 'floor-plan-maker',
      nav: 'Floor plans',
      title: 'Free Floor Plan Maker — Draw House Plans Online | HomeDesigner',
      description:
        'Draw a floor plan to scale in minutes. Type exact lengths, add doors and windows, import a PDF or photo, and see it in 3D. Free on Android and in your browser.',
      h1: ['Free floor plan maker', 'for house plans to scale'],
      sub: 'Sketch walls with your finger or mouse, type the exact length, and HomeDesigner works out the rooms and their areas. No drawing experience needed.',
      heroAlt: 'A furnished house floor plan with room names, areas and dimensions in the HomeDesigner editor',
      kicker: 'Floor plan creator',
      heading: 'From a rough sketch to a plan you can hand to a builder',
      lead: 'HomeDesigner is a floor plan app for homeowners, renovators and anyone arranging a room before buying furniture. The same plan opens on your phone and in the browser.',
      rows: [
        {
          alt: 'Drawing a floor plan on a phone with live dimensions',
          h: 'Draw walls that snap into place',
          p: 'Walls snap to the grid and to each other, so corners close cleanly. Rooms are detected as soon as the walls meet, with the area shown in square metres or square feet.',
          list: [
            ['Exact measurements', 'type a length or drag a corner, in metric or imperial'],
            ['Doors, windows and openings', 'in several styles, placed on any wall'],
            ['Room names and areas', 'labelled automatically as you draw'],
          ],
        },
        {
          alt: 'The same floor plan shown as a 3D house with furniture',
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
    de: {
      slug: 'grundriss-erstellen',
      nav: 'Grundriss',
      title: 'Grundriss erstellen & zeichnen — kostenlos | HomeDesigner',
      description:
        'Grundriss kostenlos und maßstabsgetreu zeichnen: exakte Längen eintippen, Türen und Fenster setzen, PDF oder Foto importieren und den Plan in 3D ansehen.',
      h1: ['Grundriss erstellen', 'kostenlos und maßstabsgetreu'],
      sub: 'Zeichne Wände mit dem Finger oder der Maus, tippe die exakte Länge ein, und HomeDesigner berechnet die Räume und ihre Flächen. Ganz ohne Vorkenntnisse.',
      heroAlt: 'Eingerichteter Grundriss eines Hauses mit Raumnamen, Flächen und Maßen im HomeDesigner-Editor',
      kicker: 'Grundriss-Planer',
      heading: 'Von der ersten Skizze zum Plan für den Handwerker',
      lead: 'HomeDesigner ist eine Grundriss-App für Hausbesitzer, für Renovierungen und für alle, die ein Zimmer planen wollen, bevor sie Möbel kaufen. Derselbe Plan lässt sich auf dem Handy und im Browser öffnen.',
      rows: [
        {
          alt: 'Grundriss zeichnen auf dem Handy mit mitlaufenden Maßen',
          h: 'Wände, die von selbst einrasten',
          p: 'Wände rasten am Raster und aneinander ein, sodass Ecken sauber schließen. Sobald sich die Wände treffen, wird der Raum erkannt und seine Fläche in Quadratmetern oder Quadratfuß angezeigt.',
          list: [
            ['Exakte Maße', 'Länge eintippen oder Ecke ziehen, metrisch oder imperial'],
            ['Türen, Fenster und Durchgänge', 'in mehreren Stilen, an jeder Wand platzierbar'],
            ['Raumnamen und Flächen', 'werden beim Zeichnen automatisch beschriftet'],
          ],
        },
        {
          alt: 'Derselbe Grundriss als 3D-Haus mit Möbeln',
          h: 'Vorhandenen Plan importieren',
          p: 'Lade ein PDF, das Foto eines Papierplans oder eine DXF-Datei, lege den Maßstab über ein bekanntes Maß fest und zeichne den Plan nach. Danach prüfst du in 3D, ob die Aufteilung funktioniert.',
          list: [
            ['PDF-, Bild- und DXF-Import', 'saubere Zeichnungen werden automatisch nachgezeichnet'],
            ['Mehrere Etagen', 'Geschosse übereinanderlegen und mit Treppen verbinden (Pro)'],
            ['Export', 'PNG kostenlos, PDF-Planmappen mit Flächen und Listen in Pro'],
          ],
        },
      ],
      steps: [
        ['Projekt starten', 'Öffne einen leeren Plan oder eines der eingerichteten Beispielhäuser.'],
        ['Wände zeichnen', 'Tippe, um Ecken zu setzen. Gib die Länge ein, wenn es exakt sein muss.'],
        ['Türen und Fenster einsetzen', 'Setze sie auf eine Wand und schiebe sie an die richtige Stelle.'],
        ['Einrichten und in 3D prüfen', 'Stelle Möbel maßstabsgetreu auf und geh dann durch das Ergebnis.'],
      ],
      faq: [
        ['Ist der Grundriss-Planer kostenlos?', 'Ja. Zeichnen, Einrichten und die 3D-Ansicht sind kostenlos, in der Android-App und in der Web-App. HomeDesigner Pro bietet zusätzlich mehrere Etagen, den kompletten Katalog, PDF-Export, Bilder ohne Wasserzeichen und unbegrenzt viele gespeicherte Projekte.'],
        ['Kann ich einen Grundriss maßstabsgetreu zeichnen?', 'Ja. Jede Wand hat eine echte Länge. Tippe das gewünschte Maß ein oder ziehe die Wand und lies das mitlaufende Maß ab. Die Fläche wird für jeden Raum berechnet.'],
        ['Kann ich den Grundriss am Computer erstellen?', 'Ja. Die Web-App läuft im Browser, ohne Installation, und ist derselbe Editor wie in der Android-App.'],
        ['Kann ich einen vorhandenen Plan bearbeitbar machen?', 'Ja. Importiere ein PDF, ein Bild oder eine DXF-Datei, lege den Maßstab über ein Maß fest und zeichne die Wände nach. Saubere Zeichnungen lassen sich automatisch nachzeichnen.'],
      ],
      card: ['Grundriss erstellen', 'Zeichne Hauspläne maßstabsgetreu, importiere ein PDF oder Foto und exportiere das Ergebnis.', 'Grundriss mit Raumnamen und Maßen'],
    },
    fr: {
      slug: 'plan-de-maison',
      nav: 'Plan de maison',
      title: 'Plan de maison gratuit — créez vos plans en ligne | HomeDesigner',
      description:
        'Dessinez un plan de maison à l’échelle en quelques minutes : longueurs exactes, portes et fenêtres, import PDF ou photo, vue 3D. Gratuit sur Android et le web.',
      h1: ['Créez votre plan de maison', 'gratuitement et à l’échelle'],
      sub: 'Tracez les murs au doigt ou à la souris, saisissez la longueur exacte, et HomeDesigner calcule les pièces et leurs surfaces. Aucune expérience du dessin n’est nécessaire.',
      heroAlt: 'Plan de maison meublé avec noms des pièces, surfaces et cotes dans l’éditeur HomeDesigner',
      kicker: 'Créateur de plans de maison',
      heading: 'Du premier croquis au plan à remettre à l’artisan',
      lead: 'HomeDesigner est une appli de plans pour les propriétaires, pour ceux qui rénovent et pour tous ceux qui veulent agencer une pièce avant d’acheter des meubles. Le même plan s’ouvre sur votre téléphone et dans le navigateur.',
      rows: [
        {
          alt: 'Dessin d’un plan sur un téléphone avec les cotes affichées en direct',
          h: 'Des murs qui s’aimantent tout seuls',
          p: 'Les murs s’aimantent à la grille et entre eux, pour des angles bien fermés. Dès que les murs se rejoignent, la pièce est détectée et sa surface s’affiche en mètres carrés ou en pieds carrés.',
          list: [
            ['Mesures exactes', 'saisissez une longueur ou faites glisser un angle, en métrique ou en impérial'],
            ['Portes, fenêtres et ouvertures', 'dans plusieurs styles, sur n’importe quel mur'],
            ['Noms des pièces et surfaces', 'indiqués automatiquement pendant le dessin'],
          ],
        },
        {
          alt: 'Le même plan affiché en maison 3D meublée',
          h: 'Importez un plan existant',
          p: 'Importez un PDF, la photo d’un plan papier ou un fichier DXF, réglez l’échelle à partir d’une mesure connue, puis décalquez-le. Passez ensuite en 3D pour vérifier que l’agencement fonctionne.',
          list: [
            ['Import PDF, image et DXF', 'avec tracé automatique des murs pour les dessins nets'],
            ['Plusieurs étages', 'superposez les niveaux et reliez-les par des escaliers (Pro)'],
            ['Export', 'PNG gratuit, dossiers de plans PDF avec surfaces et nomenclatures dans Pro'],
          ],
        },
      ],
      steps: [
        ['Créez un projet', 'Ouvrez un plan vierge ou l’une des maisons témoins meublées.'],
        ['Tracez les murs', 'Touchez pour poser les angles. Saisissez une longueur quand elle doit être exacte.'],
        ['Ajoutez portes et fenêtres', 'Posez-les sur un mur et faites-les glisser en place.'],
        ['Meublez et vérifiez en 3D', 'Placez les meubles à l’échelle, puis parcourez le résultat.'],
      ],
      faq: [
        ['Le créateur de plans est-il gratuit ?', 'Oui. Vous pouvez dessiner, meubler et voir vos plans en 3D gratuitement, sur Android et dans l’appli web. HomeDesigner Pro ajoute plusieurs étages, le catalogue complet, l’export PDF, des images sans filigrane et un nombre illimité de projets enregistrés.'],
        ['Puis-je dessiner un plan à l’échelle ?', 'Oui. Chaque mur a une longueur réelle. Saisissez la mesure voulue, ou faites glisser le mur et lisez la cote en direct. La surface de chaque pièce est calculée.'],
        ['Puis-je l’utiliser sur un ordinateur ?', 'Oui. L’appli web fonctionne dans le navigateur, sans rien installer, et c’est le même éditeur que l’appli Android.'],
        ['Puis-je rendre modifiable un plan existant ?', 'Oui. Importez un PDF, une image ou un DXF, réglez l’échelle à partir d’une mesure, puis tracez les murs. Les dessins nets peuvent être tracés automatiquement.'],
      ],
      card: ['Plan de maison', 'Dessinez vos plans à l’échelle, importez un PDF ou une photo et exportez le résultat.', 'Plan avec noms des pièces et cotes'],
    },
    es: {
      slug: 'planos-de-casas',
      nav: 'Planos de casas',
      title: 'Hacer planos de casas gratis — creador de planos | HomeDesigner',
      description:
        'Dibuja un plano a escala en minutos: medidas exactas, puertas y ventanas, importación de PDF o foto y vista 3D. Gratis en Android y en tu navegador.',
      h1: ['Creador de planos gratis', 'para planos de casas a escala'],
      sub: 'Traza las paredes con el dedo o el ratón, escribe la medida exacta y HomeDesigner calcula las habitaciones y sus superficies. No hace falta saber dibujar.',
      heroAlt: 'Plano de una casa amueblada con nombres de habitaciones, superficies y cotas en el editor de HomeDesigner',
      kicker: 'Creador de planos',
      heading: 'Del primer boceto a un plano que puedes entregar al constructor',
      lead: 'HomeDesigner es una app de planos para propietarios, para quien prepara una reforma y para cualquiera que quiera distribuir una habitación antes de comprar muebles. El mismo plano se abre en tu teléfono y en el navegador.',
      rows: [
        {
          alt: 'Dibujo de un plano en un teléfono con las cotas en tiempo real',
          h: 'Paredes que encajan solas',
          p: 'Las paredes se ajustan a la cuadrícula y entre sí, de modo que las esquinas cierran limpias. En cuanto las paredes se unen, se detecta la habitación y se muestra su superficie en metros cuadrados o pies cuadrados.',
          list: [
            ['Medidas exactas', 'escribe una longitud o arrastra una esquina, en sistema métrico o imperial'],
            ['Puertas, ventanas y huecos', 'en varios estilos, en cualquier pared'],
            ['Nombres y superficies de las habitaciones', 'se rotulan automáticamente mientras dibujas'],
          ],
        },
        {
          alt: 'El mismo plano convertido en una casa 3D con muebles',
          h: 'Importa un plano que ya tengas',
          p: 'Carga un PDF, la foto de un plano en papel o un archivo DXF, fija la escala con una medida conocida y cálcalo. Después pasa al 3D para comprobar que la distribución funciona.',
          list: [
            ['Importación de PDF, imagen y DXF', 'con trazado automático de paredes en dibujos limpios'],
            ['Varias plantas', 'apila niveles y conéctalos con escaleras (Pro)'],
            ['Exportación', 'PNG gratis; en Pro, dosieres de planos en PDF con superficies y listados'],
          ],
        },
      ],
      steps: [
        ['Crea un proyecto', 'Abre un plano en blanco o una de las casas de ejemplo amuebladas.'],
        ['Dibuja las paredes', 'Toca para colocar las esquinas. Escribe la longitud cuando tenga que ser exacta.'],
        ['Añade puertas y ventanas', 'Suéltalas sobre una pared y deslízalas hasta su sitio.'],
        ['Amuebla y revisa en 3D', 'Coloca los muebles a escala y recorre el resultado.'],
      ],
      faq: [
        ['¿El creador de planos es gratis?', 'Sí. Puedes dibujar, amueblar y ver los planos en 3D gratis, en Android y en la app web. HomeDesigner Pro añade varias plantas, el catálogo completo, la exportación en PDF, imágenes sin marca de agua y proyectos guardados ilimitados.'],
        ['¿Puedo dibujar un plano a escala?', 'Sí. Cada pared tiene una longitud real. Escribe la medida que quieras, o arrastra y lee la cota en tiempo real. La superficie se calcula para cada habitación.'],
        ['¿Puedo usarlo en un ordenador?', 'Sí. La app web funciona en el navegador sin instalar nada, y es el mismo editor que la app de Android.'],
        ['¿Puedo convertir un plano existente en uno editable?', 'Sí. Importa un PDF, una imagen o un DXF, fija la escala con una medida y traza las paredes. Los dibujos limpios se pueden trazar automáticamente.'],
      ],
      card: ['Planos de casas', 'Dibuja planos a escala, importa un PDF o una foto y exporta el resultado.', 'Plano con nombres de habitaciones y cotas'],
    },
  },
  {
    hero: { src: 'house-3d.webp', w: 1101, h: 782 },
    shots: [
      { src: 'interior-3d.webp', w: 981, h: 782 },
      { src: 'phone-3-view3d.webp', w: 720, h: 1560, phone: true },
    ],
    cardImg: { src: 'house-3d.webp', w: 1101, h: 782 },
    en: {
      slug: '3d-home-design',
      nav: '3D design',
      title: '3D Home Design App — Walk Through Your House Plan | HomeDesigner',
      description:
        'Turn a floor plan into a 3D house in one tap. Furnish every room, change floors and wall colours, set the sunlight and walk through it. Free on Android and web.',
      h1: ['3D home design', 'you can walk through'],
      sub: 'Every wall, door and piece of furniture you place in the plan appears in 3D straight away. Look at the house from above like a dollhouse, or step inside.',
      heroAlt: 'A furnished single-storey house in 3D with a deck, parasol and garden',
      kicker: 'House design in 3D',
      heading: 'See the home before you build or buy',
      lead: 'A plan tells you whether things fit. 3D tells you whether they feel right: how far the sofa is from the window, where the light falls in the afternoon, what the kitchen looks like from the dining table.',
      rows: [
        {
          alt: 'Interior 3D view of a living room with a sofa, rug and daylight through the windows',
          h: 'Furnish and decorate every room',
          p: 'Choose from living room, bedroom, kitchen, bathroom, office, lighting and garden furniture. Resize and rotate each piece, and change wall colours, floors and materials.',
          list: [
            ['Real 3D furniture', 'with more models added from the cloud'],
            ['Floors and walls', 'wood, tile, stone, concrete, paint and more'],
            ['Sunlight', 'set the time of day and see the light and shadows change'],
          ],
        },
        {
          alt: '3D view of a house on a phone',
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
    de: {
      slug: '3d-hausplaner',
      nav: '3D-Hausplaner',
      title: '3D-Hausplaner — Haus kostenlos in 3D planen | HomeDesigner',
      description:
        'Aus dem Grundriss wird mit einem Tipp ein 3D-Haus. Räume einrichten, Böden und Wandfarben ändern, Sonnenlicht einstellen und durchs Haus gehen. Kostenlos.',
      h1: ['Haus in 3D planen', 'und gleich hindurchgehen'],
      sub: 'Jede Wand, jede Tür und jedes Möbelstück aus dem Plan erscheint sofort in 3D. Betrachte das Haus von oben wie ein Puppenhaus oder geh einfach hinein.',
      heroAlt: 'Eingerichtetes eingeschossiges Haus in 3D mit Terrasse, Sonnenschirm und Garten',
      kicker: 'Hausplanung in 3D',
      heading: 'Sieh dein Zuhause, bevor du baust oder kaufst',
      lead: 'Ein Plan zeigt, ob alles passt. 3D zeigt, ob es sich richtig anfühlt: wie weit das Sofa vom Fenster entfernt steht, wohin am Nachmittag das Licht fällt, wie die Küche vom Esstisch aus wirkt.',
      rows: [
        {
          alt: 'Innenansicht eines Wohnzimmers in 3D mit Sofa, Teppich und Tageslicht durch die Fenster',
          h: 'Jeden Raum einrichten und gestalten',
          p: 'Wähle Möbel für Wohnzimmer, Schlafzimmer, Küche, Bad und Büro, dazu Leuchten und Gartenmöbel. Skaliere und drehe jedes Stück und ändere Wandfarben, Böden und Materialien.',
          list: [
            ['Echte 3D-Möbel', 'weitere Modelle kommen aus der Cloud dazu'],
            ['Böden und Wände', 'Holz, Fliesen, Stein, Beton, Farbe und mehr'],
            ['Sonnenlicht', 'Tageszeit einstellen und sehen, wie sich Licht und Schatten verändern'],
          ],
        },
        {
          alt: '3D-Ansicht eines Hauses auf dem Handy',
          h: 'Mit einem Tipp vom Plan zu 3D',
          p: 'Nichts muss umgewandelt werden, und du musst auf nichts warten. Wechsle jederzeit zwischen 2D-Plan und 3D-Ansicht, auf dem Handy, dem Tablet oder dem Computer.',
          list: [
            ['Puppenhaus und Rundgang', 'das Haus von oben betrachten oder von innen erleben'],
            ['Dächer, Treppen und mehrere Etagen', 'für die Planung ganzer Häuser'],
            ['Fotomodus', 'ein Standbild von jeder Ansicht speichern'],
          ],
        },
      ],
      steps: [
        ['Plan zeichnen oder öffnen', 'Fang neu an, importiere einen Plan oder wähle ein Beispielhaus.'],
        ['Möbel hinzufügen', 'Zieh Möbel aus dem Katalog in den Plan und stelle sie maßstabsgetreu auf.'],
        ['Zu 3D wechseln', 'Tippe auf die 3D-Schaltfläche, und das Haus steht um dich herum.'],
        ['Bild speichern', 'Mach ein Foto der Ansicht oder verwandle sie in ein KI-Rendering.'],
      ],
      faq: [
        ['Ist HomeDesigner ein kostenloser 3D-Hausplaner?', 'Ja. Zeichnen, Einrichten und die 3D-Ansicht sind kostenlos. Pro entfernt das Wasserzeichen aus gespeicherten Bildern und bringt mehrere Etagen, den kompletten Katalog und den PDF-Export.'],
        ['Läuft 3D auf meinem Handy?', 'Ja. Die Android-App wählt eine Qualitätsstufe, die zum Handy passt. In den Einstellungen kannst du sie erhöhen oder senken.'],
        ['Kann ich ein Haus mit mehreren Etagen planen?', 'Ja, mit Pro. Füge Obergeschosse und Keller hinzu, verbinde sie mit Treppen und wechsle in 3D zwischen den Etagen.'],
        ['Bekomme ich ein realistisches Bild von meinem Entwurf?', 'Ja. Der Fotomodus speichert die 3D-Ansicht als Bild, und das KI-Rendering macht aus dieser Ansicht ein fotoähnliches Bild.'],
      ],
      card: ['3D-Hausplaner', 'Sieh jeden Raum in 3D, verändere das Licht und geh durch dein Zuhause.', 'Eingerichtetes Haus in 3D'],
    },
    fr: {
      slug: 'maison-3d',
      nav: 'Maison 3D',
      title: 'Plan maison 3D gratuit — appli d’architecture 3D | HomeDesigner',
      description:
        'Transformez un plan en maison 3D d’un seul geste. Meublez chaque pièce, changez sols et couleurs de murs, réglez la lumière du soleil et visitez votre projet.',
      h1: ['Votre maison en 3D', 'à visiter comme si vous y étiez'],
      sub: 'Chaque mur, chaque porte et chaque meuble placé sur le plan apparaît aussitôt en 3D. Regardez la maison d’en haut comme une maquette, ou entrez à l’intérieur.',
      heroAlt: 'Maison de plain-pied meublée en 3D avec terrasse, parasol et jardin',
      kicker: 'Architecture 3D',
      heading: 'Voyez la maison avant de construire ou d’acheter',
      lead: 'Un plan vous dit si tout rentre. La 3D vous dit si l’ensemble vous convient : la distance entre le canapé et la fenêtre, l’endroit où tombe la lumière l’après-midi, l’allure de la cuisine vue depuis la table à manger.',
      rows: [
        {
          alt: 'Vue 3D intérieure d’un salon avec canapé, tapis et lumière du jour par les fenêtres',
          h: 'Meublez et décorez chaque pièce',
          p: 'Choisissez parmi les meubles de salon, de chambre, de cuisine, de salle de bain, de bureau et de jardin, ainsi que les luminaires. Redimensionnez et pivotez chaque objet, changez les couleurs des murs, les sols et les matériaux.',
          list: [
            ['De vrais meubles 3D', 'et de nouveaux modèles ajoutés depuis le cloud'],
            ['Sols et murs', 'bois, carrelage, pierre, béton, peinture et plus'],
            ['Lumière du soleil', 'réglez l’heure de la journée et voyez la lumière et les ombres changer'],
          ],
        },
        {
          alt: 'Vue 3D d’une maison sur un téléphone',
          h: 'Du plan à la 3D en un geste',
          p: 'Rien à convertir, rien à attendre. Passez du plan 2D à la vue 3D quand vous voulez, sur un téléphone, une tablette ou un ordinateur.',
          list: [
            ['Maison de poupée et visite virtuelle', 'regardez la maison d’en haut ou de l’intérieur'],
            ['Toits, escaliers et plusieurs étages', 'pour concevoir une maison entière'],
            ['Mode photo', 'enregistrez une image fixe de n’importe quelle vue'],
          ],
        },
      ],
      steps: [
        ['Dessinez ou ouvrez un plan', 'Partez de zéro, importez un plan ou choisissez une maison témoin.'],
        ['Ajoutez des meubles', 'Faites-les glisser depuis le catalogue et disposez-les à l’échelle.'],
        ['Passez en 3D', 'Touchez le bouton 3D pour voir la maison se dresser autour de vous.'],
        ['Enregistrez une image', 'Prenez une photo de la vue, ou transformez-la en rendu IA.'],
      ],
      faq: [
        ['HomeDesigner est-il une appli de maison 3D gratuite ?', 'Oui. Le dessin, l’ameublement et la vue 3D sont gratuits. Pro retire le filigrane des images enregistrées et ajoute plusieurs étages, le catalogue complet et l’export PDF.'],
        ['La 3D fonctionne-t-elle sur mon téléphone ?', 'Oui. L’appli Android choisit un niveau de qualité adapté au téléphone, et vous pouvez l’augmenter ou le réduire dans les réglages.'],
        ['Puis-je concevoir une maison à plusieurs niveaux ?', 'Oui, avec Pro. Ajoutez des étages et des sous-sols, reliez-les par des escaliers et passez de l’un à l’autre en 3D.'],
        ['Puis-je obtenir une image réaliste de mon projet ?', 'Oui. Le mode photo enregistre la vue 3D sous forme d’image, et le rendu IA transforme cette vue en image photoréaliste.'],
      ],
      card: ['Maison 3D', 'Voyez chaque pièce en 3D, changez la lumière et parcourez votre maison.', 'Maison meublée en 3D'],
    },
    es: {
      slug: 'diseno-de-casas-3d',
      nav: 'Casas en 3D',
      title: 'Diseño de casas en 3D gratis — recorre tu casa | HomeDesigner',
      description:
        'Convierte un plano en una casa 3D con un toque. Amuebla cada habitación, cambia suelos y colores de pared, ajusta la luz del sol y recorre tu diseño. Gratis.',
      h1: ['Diseño de casas en 3D', 'que puedes recorrer'],
      sub: 'Cada pared, cada puerta y cada mueble que colocas en el plano aparece al instante en 3D. Mira la casa desde arriba como una maqueta, o entra en ella.',
      heroAlt: 'Casa de una planta amueblada en 3D con terraza, sombrilla y jardín',
      kicker: 'Diseño de casas en 3D',
      heading: 'Ve la casa antes de construir o comprar',
      lead: 'Un plano te dice si las cosas caben. El 3D te dice si te convencen: a qué distancia queda el sofá de la ventana, dónde da la luz por la tarde, cómo se ve la cocina desde la mesa del comedor.',
      rows: [
        {
          alt: 'Vista 3D interior de un salón con sofá, alfombra y luz natural por las ventanas',
          h: 'Amuebla y decora cada habitación',
          p: 'Elige entre muebles de salón, dormitorio, cocina, baño, oficina y jardín, además de iluminación. Cambia el tamaño de cada pieza, gírala y cambia los colores de pared, los suelos y los materiales.',
          list: [
            ['Muebles 3D reales', 'con más modelos que se añaden desde la nube'],
            ['Suelos y paredes', 'madera, azulejo, piedra, hormigón, pintura y más'],
            ['Luz del sol', 'ajusta la hora del día y mira cómo cambian la luz y las sombras'],
          ],
        },
        {
          alt: 'Vista 3D de una casa en un teléfono',
          h: 'Del plano al 3D con un toque',
          p: 'No hay nada que convertir ni que esperar. Cambia entre el plano 2D y la vista 3D cuando quieras, en un teléfono, una tableta o un ordenador.',
          list: [
            ['Casa de muñecas y recorrido', 'mira la casa desde arriba o desde dentro'],
            ['Tejados, escaleras y varias plantas', 'para diseñar casas completas'],
            ['Modo foto', 'guarda una imagen fija de cualquier vista'],
          ],
        },
      ],
      steps: [
        ['Dibuja o abre un plano', 'Empieza de cero, importa un plano o elige una casa de ejemplo.'],
        ['Añade muebles', 'Arrástralos desde el catálogo y colócalos a escala.'],
        ['Pasa al 3D', 'Toca el botón 3D para ver la casa levantada a tu alrededor.'],
        ['Guarda una imagen', 'Haz una foto de la vista o conviértela en un render con IA.'],
      ],
      faq: [
        ['¿HomeDesigner es una app gratuita de diseño de casas en 3D?', 'Sí. Dibujar, amueblar y la vista 3D son gratis. Pro quita la marca de agua de las imágenes guardadas y añade varias plantas, el catálogo completo y la exportación en PDF.'],
        ['¿El 3D funciona en mi teléfono?', 'Sí. La app de Android elige un nivel de calidad adecuado para el teléfono, y puedes subirlo o bajarlo en los ajustes.'],
        ['¿Puedo diseñar una casa de más de una planta?', 'Sí, con Pro. Añade plantas superiores y sótanos, conéctalos con escaleras y muévete entre ellos en 3D.'],
        ['¿Puedo conseguir una imagen realista de mi diseño?', 'Sí. El modo foto guarda la vista 3D como imagen, y el render con IA convierte esa vista en una imagen fotorrealista.'],
      ],
      card: ['Diseño de casas en 3D', 'Mira cada habitación en 3D, cambia la luz y recorre tu casa.', 'Casa amueblada en 3D'],
    },
  },
  {
    hero: { src: 'kitchen-island.webp', w: 981, h: 782 },
    shots: [
      { src: 'kitchen-navy.webp', w: 981, h: 782 },
      { src: 'kitchen-white.webp', w: 981, h: 782 },
    ],
    cardImg: { src: 'kitchen-island.webp', w: 981, h: 782 },
    en: {
      slug: 'kitchen-planner',
      nav: 'Kitchen planner',
      title: 'Free 3D Kitchen Planner — Design Your Kitchen | HomeDesigner',
      description:
        'Plan a fitted kitchen in 3D: cabinets, drawers, built-in oven, hob, fridge, microwave, sink and hood. Choose the worktop and colours. Free on Android and web.',
      h1: ['Free 3D kitchen planner', 'with built-in appliances'],
      sub: 'Line up cabinets along the wall, drop in the oven, hob, sink and fridge, pick a worktop, and see your kitchen in 3D before you order a single unit.',
      heroAlt: 'A white fitted kitchen in 3D with an island, oven tower, built-in microwave, sink and hob',
      kicker: 'Kitchen design tool',
      heading: 'Every unit of a fitted kitchen, to scale',
      lead: 'The kitchen planner is part of HomeDesigner, so your kitchen sits inside the real room, with its doors, windows and the dining table next to it.',
      rows: [
        {
          alt: 'A navy kitchen with a black granite worktop, gas range, hood and wall cupboards',
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
          alt: 'A white handleless kitchen with a concrete worktop, induction hob and oak shelves',
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
    de: {
      slug: 'kuechenplaner',
      nav: 'Küchenplaner',
      title: 'Küchenplaner 3D kostenlos — Küche online planen | HomeDesigner',
      description:
        'Einbauküche in 3D planen: Schränke, Schubladen, Einbaubackofen, Kochfeld, Kühlschrank, Mikrowelle, Spüle und Dunstabzugshaube. Kostenlos für Android und im Web.',
      h1: ['Kostenloser 3D-Küchenplaner', 'mit Einbaugeräten'],
      sub: 'Reihe Schränke an der Wand auf, setze Backofen, Kochfeld, Spüle und Kühlschrank ein, wähle eine Arbeitsplatte und sieh deine Küche in 3D, bevor du auch nur einen Schrank bestellst.',
      heroAlt: 'Weiße Einbauküche in 3D mit Kücheninsel, Backofen-Hochschrank, Einbaumikrowelle, Spüle und Kochfeld',
      kicker: 'Küche planen',
      heading: 'Jeder Schrank der Einbauküche, maßstabsgetreu',
      lead: 'Der Küchenplaner ist Teil von HomeDesigner. Deine Küche steht deshalb im echten Raum, mit seinen Türen und Fenstern und dem Esstisch gleich daneben.',
      rows: [
        {
          alt: 'Dunkelblaue Küche mit schwarzer Granit-Arbeitsplatte, Gasherd, Dunstabzugshaube und Hängeschränken',
          h: 'Schränke, Schubladen und Einbaugeräte',
          p: 'Jeder Schrank lässt sich auf die benötigte Breite bringen und gegen einen anderen Typ tauschen, ohne seinen Platz in der Küchenzeile zu verlieren.',
          list: [
            ['Unterschränke', 'Türschränke, Schubladenschränke, Eckschränke, Spülenschrank, Geschirrspüler'],
            ['Kochen', 'Induktions- und Gaskochfeld, Einbaubackofen, Gasherd, Dunstabzugshaube'],
            ['Hochschränke', 'integrierter Kühlschrank, Backofen-Hochschrank, Vorratsschrank'],
            ['Hängeschränke', 'Schränke, Einbaumikrowelle, offene Regale und Nischen'],
            ['Kücheninsel', 'steht frei mitten im Raum'],
          ],
        },
        {
          alt: 'Weiße grifflose Küche mit Beton-Arbeitsplatte, Induktionskochfeld und Regalen aus Eiche',
          h: 'Arbeitsplatte, Farbe und Griffe wählen',
          p: 'Ändere das Aussehen der ganzen Küche auf einmal oder Schrank für Schrank.',
          list: [
            ['Arbeitsplatten', 'Quarz, Granit, Marmor, Travertin, Schiefer, Terrazzo, Beton, Eiche, Nussbaum und gebürsteter Edelstahl'],
            ['Fronten', 'jede Farbe, in einem Schritt auf alle Schränke angewendet'],
            ['Griffe', 'Stangengriffe oder grifflose Optik'],
          ],
        },
      ],
      steps: [
        ['Raum zeichnen', 'Gib die Wandlängen ein und setze Türen und Fenster.'],
        ['Schränke platzieren', 'Füge Schränke und Geräte aus der Kategorie Küche hinzu.'],
        ['Oberflächen wählen', 'Wähle Arbeitsplatte, Frontfarbe und Griffe.'],
        ['In 3D ansehen', 'Prüfe die Aufteilung und speichere ein Bild fürs Küchenstudio.'],
      ],
      faq: [
        ['Ist der Küchenplaner kostenlos?', 'Ja. Du kannst eine Küche kostenlos planen und in 3D ansehen, in der Android-App und in der Web-App. Einige Katalogartikel und Bilder ohne Wasserzeichen gehören zu HomeDesigner Pro.'],
        ['Kann ich Einbaugeräte einplanen?', 'Ja. Es gibt Schränke für Einbaubackofen, Backofen-Hochschrank, Induktions- und Gaskochfeld, integrierten Kühlschrank, Einbaumikrowelle, Geschirrspüler, Spüle und Dunstabzugshaube.'],
        ['Kann ich das Material der Arbeitsplatte ändern?', 'Ja. Wähle zwischen Arbeitsplatten aus Stein, Holz, Beton und Edelstahl und übernimm die Auswahl in einem Schritt für die ganze Küche.'],
        ['Kann ich eigene Schrankbreiten festlegen?', 'Ja. Jeder Schrank lässt sich in der Größe anpassen, passend zu den Maßen, die dein Küchenhersteller anbietet.'],
      ],
      card: ['Küchenplaner', 'Schränke, Schubladen, Einbaubackofen, Kochfeld, Kühlschrank und Spüle, mit der Arbeitsplatte deiner Wahl.', 'Einbauküche mit Kücheninsel in 3D'],
    },
    fr: {
      slug: 'plan-cuisine-3d',
      nav: 'Cuisine 3D',
      title: 'Plan de cuisine 3D gratuit — créez votre cuisine | HomeDesigner',
      description:
        'Concevez une cuisine équipée en 3D : meubles bas et hauts, tiroirs, four encastré, plaque de cuisson, réfrigérateur, micro-ondes, évier et hotte. Gratuit.',
      h1: ['Planificateur de cuisine 3D gratuit', 'avec électroménager encastré'],
      sub: 'Alignez les meubles le long du mur, intégrez le four, la plaque, l’évier et le réfrigérateur, choisissez un plan de travail et voyez votre cuisine en 3D avant de commander le moindre meuble.',
      heroAlt: 'Cuisine équipée blanche en 3D avec îlot, colonne four, micro-ondes encastré, évier et plaque de cuisson',
      kicker: 'Conception de cuisine',
      heading: 'Chaque meuble d’une cuisine équipée, à l’échelle',
      lead: 'Le planificateur de cuisine fait partie de HomeDesigner : votre cuisine prend place dans la vraie pièce, avec ses portes, ses fenêtres et la table à manger juste à côté.',
      rows: [
        {
          alt: 'Cuisine bleu marine avec plan de travail en granit noir, cuisinière à gaz, hotte et meubles hauts',
          h: 'Meubles, tiroirs et appareils encastrés',
          p: 'Chaque meuble se redimensionne à la largeur voulue et se remplace par un autre type sans perdre sa place dans l’alignement.',
          list: [
            ['Meubles bas', 'placards, meubles à tiroirs, meubles d’angle, meuble sous-évier, lave-vaisselle'],
            ['Cuisson', 'plaques à induction et à gaz, four encastré, cuisinière à gaz, hotte aspirante'],
            ['Colonnes', 'réfrigérateur intégré, colonne four, garde-manger'],
            ['Meubles hauts', 'placards, micro-ondes encastré, étagères ouvertes et niches'],
            ['Îlot', 'à poser librement au milieu de la pièce'],
          ],
        },
        {
          alt: 'Cuisine blanche sans poignées avec plan de travail en béton, plaque à induction et étagères en chêne',
          h: 'Choisissez le plan de travail, la couleur et les poignées',
          p: 'Changez le style de toute la cuisine d’un coup, ou meuble par meuble.',
          list: [
            ['Plans de travail', 'quartz, granit, marbre, travertin, ardoise, terrazzo, béton, chêne, noyer et inox brossé'],
            ['Façades', 'toutes les couleurs, appliquées à tous les meubles en une seule fois'],
            ['Poignées', 'poignées barres ou style sans poignées'],
          ],
        },
      ],
      steps: [
        ['Dessinez la pièce', 'Saisissez la longueur des murs et ajoutez les portes et les fenêtres.'],
        ['Placez les meubles', 'Ajoutez meubles et appareils depuis la catégorie Cuisine.'],
        ['Choisissez les finitions', 'Sélectionnez le plan de travail, la couleur des façades et les poignées.'],
        ['Regardez le résultat en 3D', 'Vérifiez l’agencement, puis enregistrez une image à montrer au cuisiniste.'],
      ],
      faq: [
        ['Le planificateur de cuisine est-il gratuit ?', 'Oui. Vous pouvez concevoir une cuisine et la voir en 3D gratuitement dans l’appli Android et dans l’appli web. Certains éléments du catalogue et les images sans filigrane font partie de HomeDesigner Pro.'],
        ['Puis-je prévoir des appareils encastrés ?', 'Oui. Il existe des meubles pour un four encastré, une colonne four, des plaques à induction et à gaz, un réfrigérateur intégré, un micro-ondes encastré, un lave-vaisselle, un évier et une hotte aspirante.'],
        ['Puis-je changer le matériau du plan de travail ?', 'Oui. Choisissez parmi des plans de travail en pierre, en bois, en béton et en inox, et appliquez votre choix à toute la cuisine en une seule fois.'],
        ['Puis-je définir mes propres largeurs de meubles ?', 'Oui. Chaque meuble se redimensionne, ce qui permet de reprendre les dimensions proposées par votre cuisiniste.'],
      ],
      card: ['Planificateur de cuisine', 'Meubles, tiroirs, four encastré, plaque, réfrigérateur et évier, avec le plan de travail de votre choix.', 'Cuisine équipée avec îlot en 3D'],
    },
    es: {
      slug: 'planificador-de-cocinas',
      nav: 'Cocinas',
      title: 'Planificador de cocinas 3D gratis y online | HomeDesigner',
      description:
        'Diseña una cocina en 3D: muebles bajos y altos, cajoneras, horno integrado, placa, frigorífico, microondas, fregadero y campana. Gratis en Android y en la web.',
      h1: ['Planificador de cocinas 3D gratis', 'con electrodomésticos integrados'],
      sub: 'Alinea los muebles a lo largo de la pared, coloca el horno, la placa, el fregadero y el frigorífico, elige una encimera y mira tu cocina en 3D antes de encargar un solo módulo.',
      heroAlt: 'Cocina blanca en 3D con isla, columna de horno, microondas integrado, fregadero y placa',
      kicker: 'Diseño de cocinas',
      heading: 'Cada módulo de la cocina, a escala',
      lead: 'El planificador de cocinas forma parte de HomeDesigner, así que tu cocina queda dentro de la habitación real, con sus puertas, sus ventanas y la mesa del comedor al lado.',
      rows: [
        {
          alt: 'Cocina azul marino con encimera de granito negro, cocina de gas, campana y muebles altos',
          h: 'Muebles, cajones y electrodomésticos integrados',
          p: 'Cada módulo se puede ajustar al ancho que necesites y cambiar por otro tipo sin perder su sitio en la fila.',
          list: [
            ['Muebles bajos', 'armarios, cajoneras, rinconeras, mueble de fregadero, lavavajillas'],
            ['Cocción', 'placas de inducción y de gas, horno integrado, cocina de gas, campana extractora'],
            ['Columnas', 'frigorífico integrado, columna de horno, despensa'],
            ['Muebles altos', 'armarios, microondas integrado, estantes abiertos y nichos'],
            ['Isla', 'para colocarla exenta en el centro de la habitación'],
          ],
        },
        {
          alt: 'Cocina blanca sin tiradores con encimera de hormigón, placa de inducción y estantes de roble',
          h: 'Elige la encimera, el color y los tiradores',
          p: 'Cambia el aspecto de toda la cocina de una vez, o módulo a módulo.',
          list: [
            ['Encimeras', 'cuarzo, granito, mármol, travertino, pizarra, terrazo, hormigón, roble, nogal y acero cepillado'],
            ['Frentes', 'cualquier color, aplicado a todos los módulos en un solo paso'],
            ['Tiradores', 'tiradores de barra o un diseño sin tiradores'],
          ],
        },
      ],
      steps: [
        ['Dibuja la habitación', 'Introduce la longitud de las paredes y añade las puertas y ventanas.'],
        ['Coloca los módulos', 'Añade muebles y electrodomésticos de la categoría Cocina.'],
        ['Elige los acabados', 'Escoge la encimera, el color de los frentes y los tiradores.'],
        ['Mírala en 3D', 'Revisa la distribución y guarda una imagen para llevarla a la tienda.'],
      ],
      faq: [
        ['¿El planificador de cocinas es gratis?', 'Sí. Puedes diseñar una cocina y verla en 3D gratis en la app de Android y en la app web. Algunos elementos del catálogo y las imágenes sin marca de agua forman parte de HomeDesigner Pro.'],
        ['¿Puedo incluir electrodomésticos integrados?', 'Sí. Hay módulos para horno integrado, columna de horno, placas de inducción y de gas, frigorífico integrado, microondas integrado, lavavajillas, fregadero y campana extractora.'],
        ['¿Puedo cambiar el material de la encimera?', 'Sí. Elige entre encimeras de piedra, madera, hormigón y acero, y aplica la elección a toda la cocina en un solo paso.'],
        ['¿Puedo definir el ancho de los muebles?', 'Sí. Todos los módulos se pueden redimensionar, así puedes ajustarlos a las medidas que ofrece tu proveedor de cocinas.'],
      ],
      card: ['Planificador de cocinas', 'Muebles, cajones, horno integrado, placa, frigorífico y fregadero, con la encimera que elijas.', 'Cocina con isla en 3D'],
    },
  },
  {
    hero: { src: 'interior-3d.webp', w: 981, h: 782 },
    shots: [
      { src: 'phone-4-catalog.webp', w: 720, h: 1560, phone: true },
      { src: 'open-plan.webp', w: 640, h: 640 },
    ],
    cardImg: { src: 'open-plan.webp', w: 640, h: 640 },
    en: {
      slug: 'room-planner',
      nav: 'Room planner',
      title: 'Free Room Planner — Design & Furnish a Room in 3D | HomeDesigner',
      description:
        'Plan a living room, bedroom, bathroom or office to scale. Draw the room, add furniture, pick floors and wall colours, and see it in 3D. Free on Android and web.',
      h1: ['Free room planner', 'to furnish any room to scale'],
      sub: 'Draw the room with its real measurements, move the furniture around until the layout works, and look at the result in 3D. For a living room, bedroom, bathroom or office.',
      heroAlt: 'A home in 3D seen from above with the roof off, showing a furnished living room, dining area and kitchen',
      kicker: 'Room design app',
      heading: 'Try the layout before you move a single piece',
      lead: 'HomeDesigner is a room planner as well as a floor plan maker. Plan one room or the whole home, try a furniture layout before you buy, and open the same project on your phone and in the browser.',
      rows: [
        {
          alt: 'The furniture catalog on a phone, open below a floor plan, with categories for living room, bedroom, dining and kitchen',
          h: 'Furniture for every room, placed to scale',
          p: 'Pick pieces from a large catalog and drop them into the room. Each one keeps its real size, so you can see at once whether the sofa fits along the wall and whether the bed leaves room for the wardrobe.',
          list: [
            ['Living room, bedroom, bathroom and office', 'plus kitchen, lighting and garden furniture'],
            ['Resize and rotate', 'set each piece to the size you need and turn it into place'],
            ['Floors and walls', 'wood, tile, marble, granite, concrete and wall colours'],
          ],
        },
        {
          alt: 'A furnished open-plan home seen from above: living area, dining table, kitchen, bedroom and bathroom',
          h: 'Draw the room, then see it in 3D',
          p: 'Enter the wall lengths, add the doors and windows, and the room is ready to furnish. One tap switches from the 2D plan to 3D, where you can look down into the room like a dollhouse or walk through it.',
          list: [
            ['Exact measurements', 'type a length or drag a corner, in metric or imperial'],
            ['Import a plan', 'trace over a PDF, a photo or a DXF file of your home'],
            ['Sunlight and photo mode', 'set the time of day and save a still image of the view'],
          ],
        },
      ],
      steps: [
        ['Draw the room', 'Enter the wall lengths and add the doors and windows.'],
        ['Add furniture', 'Drag pieces in from the catalog and arrange them to scale.'],
        ['Choose floors and walls', 'Pick the floor material and the wall colours.'],
        ['Look at it in 3D', 'Walk through the room and save a picture of the view.'],
      ],
      faq: [
        ['Is the room planner free?', 'Yes. You can draw a room, furnish it and view it in 3D for free, on Android and in the web app. HomeDesigner Pro adds the complete catalog, several storeys, PDF export, watermark-free images and unlimited saved projects.'],
        ['Which rooms can I plan?', 'Any room. The catalog has furniture for the living room, bedroom, bathroom, kitchen and office, as well as lighting and garden furniture.'],
        ['Is the furniture to scale?', 'Yes. The room is drawn with real measurements, and every piece of furniture has a real size that you can change, so the layout on screen matches the room.'],
        ['Do I need an account?', 'No. You can start without an account, and designs are saved on your device. Sign in with Google if you want to sync projects across devices.'],
      ],
    },
    de: {
      slug: 'raumplaner',
      nav: 'Raumplaner',
      title: 'Raumplaner kostenlos — Zimmer in 3D einrichten | HomeDesigner',
      description:
        'Wohnzimmer, Schlafzimmer, Bad oder Büro maßstabsgetreu planen: Raum zeichnen, Möbel stellen, Böden und Wandfarben wählen und alles in 3D ansehen. Kostenlos.',
      h1: ['Kostenloser Raumplaner', 'zum maßstabsgetreuen Einrichten'],
      sub: 'Zeichne das Zimmer mit seinen echten Maßen, schiebe die Möbel, bis die Aufteilung passt, und sieh dir das Ergebnis in 3D an. Für Wohnzimmer, Schlafzimmer, Bad oder Büro.',
      heroAlt: 'Ein Haus in 3D von oben ohne Dach, mit eingerichtetem Wohnzimmer, Essbereich und Küche',
      kicker: 'Zimmerplaner',
      heading: 'Teste die Aufteilung, bevor du ein Möbelstück rückst',
      lead: 'HomeDesigner ist Raumplaner und Grundriss-Planer zugleich. Plane ein einzelnes Zimmer oder das ganze Zuhause, teste die Möbelaufstellung vor dem Kauf und öffne dasselbe Projekt auf dem Handy und im Browser.',
      rows: [
        {
          alt: 'Möbelkatalog auf dem Handy, geöffnet unter einem Grundriss, mit Kategorien für Wohnen, Schlafen, Essen und Küche',
          h: 'Möbel für jedes Zimmer, maßstabsgetreu platziert',
          p: 'Wähle Möbel aus einem großen Katalog und stelle sie ins Zimmer. Jedes Stück behält seine echte Größe. So siehst du sofort, ob das Sofa an die Wand passt und ob neben dem Bett noch Platz für den Schrank bleibt.',
          list: [
            ['Wohnzimmer, Schlafzimmer, Bad und Büro', 'dazu Küche, Leuchten und Gartenmöbel'],
            ['Skalieren und drehen', 'jedes Möbelstück auf die passende Größe bringen und ausrichten'],
            ['Böden und Wände', 'Holz, Fliesen, Marmor, Granit, Beton und Wandfarben'],
          ],
        },
        {
          alt: 'Eingerichtetes offenes Zuhause von oben: Wohnbereich, Esstisch, Küche, Schlafzimmer und Bad',
          h: 'Raum zeichnen und in 3D ansehen',
          p: 'Gib die Wandlängen ein, setze Türen und Fenster, und schon lässt sich das Zimmer einrichten. Ein Tipp wechselt vom 2D-Plan zu 3D. Dort schaust du von oben hinein wie in ein Puppenhaus oder gehst durch den Raum.',
          list: [
            ['Exakte Maße', 'Länge eintippen oder Ecke ziehen, metrisch oder imperial'],
            ['Plan importieren', 'PDF, Foto oder DXF-Datei deines Zuhauses nachzeichnen'],
            ['Sonnenlicht und Fotomodus', 'Tageszeit einstellen und ein Standbild der Ansicht speichern'],
          ],
        },
      ],
      steps: [
        ['Raum zeichnen', 'Gib die Wandlängen ein und setze Türen und Fenster.'],
        ['Möbel hinzufügen', 'Zieh Möbel aus dem Katalog in den Plan und stelle sie maßstabsgetreu auf.'],
        ['Böden und Wände wählen', 'Lege den Bodenbelag und die Wandfarben fest.'],
        ['In 3D ansehen', 'Geh durch das Zimmer und speichere ein Bild der Ansicht.'],
      ],
      faq: [
        ['Ist der Raumplaner kostenlos?', 'Ja. Zimmer zeichnen, einrichten und in 3D ansehen ist kostenlos, in der Android-App und in der Web-App. HomeDesigner Pro bietet zusätzlich den kompletten Katalog, mehrere Etagen, PDF-Export, Bilder ohne Wasserzeichen und unbegrenzt viele gespeicherte Projekte.'],
        ['Welche Räume kann ich planen?', 'Jeden Raum. Der Katalog enthält Möbel für Wohnzimmer, Schlafzimmer, Bad, Küche und Büro sowie Leuchten und Gartenmöbel.'],
        ['Sind die Möbel maßstabsgetreu?', 'Ja. Der Raum wird mit echten Maßen gezeichnet, und jedes Möbelstück hat eine echte Größe, die du anpassen kannst. Die Aufteilung auf dem Bildschirm entspricht also dem Zimmer.'],
        ['Brauche ich ein Konto?', 'Nein. Du kannst ohne Konto starten, und deine Entwürfe werden auf dem Gerät gespeichert. Melde dich mit Google an, wenn du Projekte geräteübergreifend synchronisieren möchtest.'],
      ],
      card: ['Raumplaner', 'Richte Wohnzimmer, Schlafzimmer, Bad oder Büro maßstabsgetreu ein und sieh es dir in 3D an.', 'Eingerichtetes offenes Zuhause von oben'],
    },
    fr: {
      slug: 'amenagement-interieur',
      nav: 'Aménagement',
      title: 'Aménagement intérieur 3D gratuit — plan de pièce | HomeDesigner',
      description:
        'Aménagez un salon, une chambre, une salle de bain ou un bureau à l’échelle : dessinez la pièce, placez les meubles, choisissez les sols et voyez le tout en 3D.',
      h1: ['Planificateur de pièces gratuit', 'pour aménager chaque pièce à l’échelle'],
      sub: 'Dessinez la pièce avec ses vraies dimensions, déplacez les meubles jusqu’à trouver le bon agencement, puis regardez le résultat en 3D. Pour un salon, une chambre, une salle de bain ou un bureau.',
      heroAlt: 'Maison en 3D vue d’en haut, sans toit, avec un salon meublé, un coin repas et une cuisine',
      kicker: 'Aménagement intérieur',
      heading: 'Testez l’agencement avant de déplacer le moindre meuble',
      lead: 'HomeDesigner est à la fois un planificateur de pièces et un créateur de plans de maison. Aménagez une seule pièce ou tout le logement, testez un agencement avant d’acheter et ouvrez le même projet sur votre téléphone et dans le navigateur.',
      rows: [
        {
          alt: 'Catalogue de meubles sur un téléphone, ouvert sous un plan, avec les catégories salon, chambre, salle à manger et cuisine',
          h: 'Des meubles pour chaque pièce, placés à l’échelle',
          p: 'Choisissez des meubles dans un grand catalogue et posez-les dans la pièce. Chacun garde sa taille réelle : vous voyez tout de suite si le canapé tient le long du mur et si le lit laisse de la place à l’armoire.',
          list: [
            ['Salon, chambre, salle de bain et bureau', 'ainsi que cuisine, luminaires et mobilier de jardin'],
            ['Redimensionner et pivoter', 'donnez à chaque meuble la taille voulue et orientez-le'],
            ['Sols et murs', 'bois, carrelage, marbre, granit, béton et couleurs de murs'],
          ],
        },
        {
          alt: 'Logement ouvert et meublé vu d’en haut : coin salon, table à manger, cuisine, chambre et salle de bain',
          h: 'Dessinez la pièce, puis voyez-la en 3D',
          p: 'Saisissez la longueur des murs, ajoutez les portes et les fenêtres, et la pièce est prête à meubler. Un geste suffit pour passer du plan 2D à la 3D, où vous regardez la pièce d’en haut comme une maquette ou la parcourez de l’intérieur.',
          list: [
            ['Mesures exactes', 'saisissez une longueur ou faites glisser un angle, en métrique ou en impérial'],
            ['Import d’un plan', 'décalquez un PDF, une photo ou un fichier DXF de votre logement'],
            ['Lumière du soleil et mode photo', 'réglez l’heure de la journée et enregistrez une image fixe de la vue'],
          ],
        },
      ],
      steps: [
        ['Dessinez la pièce', 'Saisissez la longueur des murs et ajoutez les portes et les fenêtres.'],
        ['Ajoutez des meubles', 'Faites-les glisser depuis le catalogue et disposez-les à l’échelle.'],
        ['Choisissez sols et murs', 'Sélectionnez le revêtement de sol et les couleurs des murs.'],
        ['Regardez le résultat en 3D', 'Parcourez la pièce et enregistrez une image de la vue.'],
      ],
      faq: [
        ['Le planificateur de pièces est-il gratuit ?', 'Oui. Vous pouvez dessiner une pièce, la meubler et la voir en 3D gratuitement, sur Android et dans l’appli web. HomeDesigner Pro ajoute le catalogue complet, plusieurs étages, l’export PDF, des images sans filigrane et un nombre illimité de projets enregistrés.'],
        ['Quelles pièces puis-je aménager ?', 'Toutes. Le catalogue propose des meubles pour le salon, la chambre, la salle de bain, la cuisine et le bureau, ainsi que des luminaires et du mobilier de jardin.'],
        ['Les meubles sont-ils à l’échelle ?', 'Oui. La pièce est dessinée avec ses mesures réelles et chaque meuble a une taille réelle que vous pouvez modifier : l’agencement à l’écran correspond donc à la pièce.'],
        ['Faut-il créer un compte ?', 'Non. Vous pouvez commencer sans compte, et vos projets sont enregistrés sur l’appareil. Connectez-vous avec Google si vous voulez synchroniser vos projets entre vos appareils.'],
      ],
      card: ['Aménagement intérieur', 'Meublez un salon, une chambre, une salle de bain ou un bureau à l’échelle et voyez le résultat en 3D.', 'Logement ouvert et meublé vu d’en haut'],
    },
    es: {
      slug: 'planificador-de-habitaciones',
      nav: 'Habitaciones',
      title: 'Planificador de habitaciones 3D gratis y online | HomeDesigner',
      description:
        'Planifica un salón, un dormitorio, un baño o una oficina a escala: dibuja la habitación, coloca los muebles, elige suelos y colores de pared y mírala en 3D.',
      h1: ['Planificador de habitaciones gratis', 'para amueblar cualquier estancia a escala'],
      sub: 'Dibuja la habitación con sus medidas reales, mueve los muebles hasta que la distribución funcione y mira el resultado en 3D. Para un salón, un dormitorio, un baño o una oficina.',
      heroAlt: 'Una casa en 3D vista desde arriba y sin tejado, con el salón amueblado, el comedor y la cocina',
      kicker: 'Diseño de habitaciones',
      heading: 'Prueba la distribución antes de mover un solo mueble',
      lead: 'HomeDesigner es un planificador de habitaciones además de un creador de planos. Planifica una sola habitación o toda la casa, prueba la distribución de los muebles antes de comprar y abre el mismo proyecto en tu teléfono y en el navegador.',
      rows: [
        {
          alt: 'Catálogo de muebles en un teléfono, abierto bajo un plano, con categorías de salón, dormitorio, comedor y cocina',
          h: 'Muebles para cada habitación, colocados a escala',
          p: 'Elige piezas de un gran catálogo y colócalas en la habitación. Cada una mantiene su tamaño real, así ves enseguida si el sofá cabe en la pared y si la cama deja sitio para el armario.',
          list: [
            ['Salón, dormitorio, baño y oficina', 'además de cocina, iluminación y muebles de jardín'],
            ['Cambia el tamaño y gira', 'ajusta cada mueble a la medida que necesitas y oriéntalo'],
            ['Suelos y paredes', 'madera, azulejo, mármol, granito, hormigón y colores de pared'],
          ],
        },
        {
          alt: 'Vivienda diáfana amueblada vista desde arriba: zona de estar, mesa de comedor, cocina, dormitorio y baño',
          h: 'Dibuja la habitación y mírala en 3D',
          p: 'Introduce la longitud de las paredes, añade las puertas y ventanas y la habitación queda lista para amueblar. Con un toque pasas del plano 2D al 3D, donde puedes mirarla desde arriba como una maqueta o pasearte por ella.',
          list: [
            ['Medidas exactas', 'escribe una longitud o arrastra una esquina, en sistema métrico o imperial'],
            ['Importa un plano', 'calca un PDF, una foto o un archivo DXF de tu casa'],
            ['Luz del sol y modo foto', 'ajusta la hora del día y guarda una imagen fija de la vista'],
          ],
        },
      ],
      steps: [
        ['Dibuja la habitación', 'Introduce la longitud de las paredes y añade las puertas y ventanas.'],
        ['Añade muebles', 'Arrástralos desde el catálogo y colócalos a escala.'],
        ['Elige suelos y paredes', 'Escoge el material del suelo y los colores de pared.'],
        ['Mírala en 3D', 'Recorre la habitación y guarda una imagen de la vista.'],
      ],
      faq: [
        ['¿El planificador de habitaciones es gratis?', 'Sí. Puedes dibujar una habitación, amueblarla y verla en 3D gratis, en Android y en la app web. HomeDesigner Pro añade el catálogo completo, varias plantas, la exportación en PDF, imágenes sin marca de agua y proyectos guardados ilimitados.'],
        ['¿Qué habitaciones puedo planificar?', 'Cualquiera. El catálogo tiene muebles para el salón, el dormitorio, el baño, la cocina y la oficina, además de iluminación y muebles de jardín.'],
        ['¿Los muebles están a escala?', 'Sí. La habitación se dibuja con medidas reales y cada mueble tiene un tamaño real que puedes cambiar, así que la distribución en pantalla se corresponde con la habitación.'],
        ['¿Necesito una cuenta?', 'No. Puedes empezar sin cuenta, y los diseños se guardan en tu dispositivo. Inicia sesión con Google si quieres sincronizar tus proyectos entre dispositivos.'],
      ],
      card: ['Planificador de habitaciones', 'Amuebla un salón, un dormitorio, un baño o una oficina a escala y míralo en 3D.', 'Vivienda diáfana amueblada vista desde arriba'],
    },
  },
  {
    hero: { src: 'ai-after.webp', w: 1264, h: 848 },
    shots: [
      { src: 'ai-before.webp', w: 1230, h: 768 },
      { src: 'plan-2d.webp', w: 1280, h: 823 },
    ],
    cardImg: { src: 'ai-after.webp', w: 1264, h: 848 },
    en: {
      slug: 'ai-home-design',
      nav: 'AI design',
      title: 'AI Home Design — Floor Plan Generator & Render | HomeDesigner',
      description:
        'Describe your home and get an editable floor plan, turn your 3D view into a photo-like AI render, and ask an AI designer to review your layout. In HomeDesigner.',
      h1: ['AI home design', 'floor plans and renders'],
      sub: 'Describe the home you want in plain words and get a floor plan you can edit. Then turn the 3D view into a picture that looks like a photo.',
      heroAlt: 'An AI render of a furnished house cut open to show the living room, kitchen and bathroom',
      kicker: 'AI tools in the app',
      heading: 'AI that works on your own plan',
      lead: 'The AI tools use the plan you are working on, so the result is a real HomeDesigner project with walls and furniture you can move, not just a picture.',
      rows: [
        {
          alt: 'The 3D view of a house before the AI render',
          h: 'AI render: from 3D view to photo',
          p: 'Frame a view in 3D and send it for rendering. In about fifteen seconds you get a photo-like image that keeps your layout, with realistic materials, light and planting. The picture above is the render of the view on this side.',
          list: [
            ['Any signed-in account', 'can render, with or without the watermark'],
            ['Pro', 'renders are always watermark-free'],
            ['Privacy', 'only the preview image is sent, never your plan file or account details'],
          ],
        },
        {
          alt: 'An editable floor plan with rooms and furniture',
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
    de: {
      slug: 'ki-grundriss',
      nav: 'KI-Grundriss',
      title: 'KI-Grundriss & KI-Rendering — Haus planen mit KI | HomeDesigner',
      description:
        'Beschreibe dein Zuhause und erhalte einen bearbeitbaren Grundriss, verwandle die 3D-Ansicht in ein fotoähnliches KI-Rendering und nutze die KI-Designberatung.',
      h1: ['Haus planen mit KI', 'Grundrisse und Renderings'],
      sub: 'Beschreibe dein Wunschhaus in eigenen Worten und erhalte einen Grundriss, den du bearbeiten kannst. Verwandle danach die 3D-Ansicht in ein Bild, das wie ein Foto aussieht.',
      heroAlt: 'KI-Rendering eines eingerichteten Hauses im Aufschnitt mit Wohnzimmer, Küche und Bad',
      kicker: 'KI-Werkzeuge in der App',
      heading: 'KI, die mit deinem eigenen Plan arbeitet',
      lead: 'Die KI-Werkzeuge nutzen den Plan, an dem du gerade arbeitest. Das Ergebnis ist deshalb ein echtes HomeDesigner-Projekt mit Wänden und Möbeln, die du verschieben kannst, und nicht bloß ein Bild.',
      rows: [
        {
          alt: 'Die 3D-Ansicht eines Hauses vor dem KI-Rendering',
          h: 'KI-Rendering: von der 3D-Ansicht zum Foto',
          p: 'Wähle in 3D einen Bildausschnitt und schicke ihn zum Rendern. Nach etwa fünfzehn Sekunden erhältst du ein fotoähnliches Bild, das deine Aufteilung beibehält, mit realistischen Materialien, Licht und Bepflanzung. Das Bild oben ist das Rendering der Ansicht hier daneben.',
          list: [
            ['Jedes angemeldete Konto', 'kann rendern, mit oder ohne Wasserzeichen'],
            ['Pro', 'Renderings sind immer ohne Wasserzeichen'],
            ['Datenschutz', 'gesendet wird nur das Vorschaubild, nie deine Plandatei oder deine Kontodaten'],
          ],
        },
        {
          alt: 'Bearbeitbarer Grundriss mit Räumen und Möbeln',
          h: 'KI-Grundriss-Generator',
          p: 'Beantworte ein paar Fragen (Etagen, Schlafzimmer, Bäder, Größe, Garage) und ergänze alles Weitere in eigenen Worten. Du erhältst einen eingerichteten Grundriss, den du wie jedes andere Projekt bearbeitest, und kannst Änderungen anfordern.',
          list: [
            ['Bearbeitbares Ergebnis', 'echte Wände, Türen, Fenster und Möbel'],
            ['Überarbeiten', 'beschreibe, was sich ändern soll, und lass den Plan neu erzeugen'],
            ['Designberatung', 'hol dir eine schriftliche Einschätzung zu deinem aktuellen Grundriss'],
            ['Gesprochene Tour', 'ein vertonter Rundgang durch dein Zuhause (Pro)'],
          ],
        },
      ],
      steps: [
        ['Anmelden', 'Die KI-Werkzeuge brauchen ein kostenloses Konto mit bestätigter Google-Anmeldung.'],
        ['Zuhause beschreiben', 'Fülle das kurze Formular aus und ergänze deine Wünsche in eigenen Worten.'],
        ['Plan bearbeiten', 'Verschiebe Wände und Möbel oder lass die KI den Plan überarbeiten.'],
        ['Rendern', 'Wechsle zu 3D und verwandle die Ansicht in ein fotoähnliches Bild.'],
      ],
      faq: [
        ['Was kosten die KI-Werkzeuge?', 'Sie verbrauchen Punkte. Neue Konten erhalten einmalig Gratispunkte, genug für einen KI-Grundriss oder ein paar Renderings, und weitere Punkte lassen sich in der App kaufen. Alles andere in HomeDesigner funktioniert ohne Punkte.'],
        ['Kann ich einen KI-Grundriss bearbeiten?', 'Ja. Das Ergebnis ist ein normales HomeDesigner-Projekt. Du kannst Wände verschieben, Räume ändern, Möbel tauschen und alles in 3D ansehen.'],
        ['Wie nah ist das KI-Rendering an meinem Entwurf?', 'Es behält Aufteilung, Wände und die wichtigsten Möbel deiner 3D-Ansicht bei und ergänzt realistische Materialien und Licht. Es kann kleine dekorative Details hinzufügen. Sieh es deshalb als Eindruck, nicht als technische Zeichnung.'],
        ['Wohin gehen meine Bilder?', 'Beim Rendering wird nur das Vorschaubild an den Rendering-Dienst gesendet. Ein KI-Grundriss sendet deine Antworten, eine Designberatung ein Bild des Plans. Die Datenschutzerklärung nennt die verwendeten Dienste.'],
      ],
      card: ['KI-Grundriss und KI-Rendering', 'Beschreibe dein Zuhause und erhalte einen Grundriss. Verwandle dann die 3D-Ansicht in ein fotoähnliches Bild.', 'Fotoähnliches KI-Rendering eines Hauses'],
    },
    fr: {
      slug: 'plan-maison-ia',
      nav: 'Plans IA',
      title: 'Plan de maison IA — générateur de plans et rendus | HomeDesigner',
      description:
        'Décrivez votre maison et obtenez un plan modifiable, transformez la vue 3D en rendu IA photoréaliste et demandez l’avis d’un designer IA sur votre agencement.',
      h1: ['Plan de maison par IA', 'plans et rendus photoréalistes'],
      sub: 'Décrivez la maison que vous voulez avec vos propres mots et obtenez un plan que vous pouvez modifier. Transformez ensuite la vue 3D en une image qui ressemble à une photo.',
      heroAlt: 'Rendu IA d’une maison meublée vue en coupe, avec le salon, la cuisine et la salle de bain',
      kicker: 'Outils IA dans l’appli',
      heading: 'Une IA qui travaille sur votre propre plan',
      lead: 'Les outils IA partent du plan sur lequel vous travaillez. Le résultat est donc un vrai projet HomeDesigner, avec des murs et des meubles que vous pouvez déplacer, et pas seulement une image.',
      rows: [
        {
          alt: 'La vue 3D d’une maison avant le rendu IA',
          h: 'Rendu IA : de la vue 3D à la photo',
          p: 'Cadrez une vue en 3D et envoyez-la au rendu. En une quinzaine de secondes, vous recevez une image photoréaliste qui conserve votre agencement, avec des matériaux, une lumière et une végétation réalistes. L’image en haut de la page est le rendu de la vue ci-contre.',
          list: [
            ['Tout compte connecté', 'peut lancer un rendu, avec ou sans filigrane'],
            ['Pro', 'les rendus sont toujours sans filigrane'],
            ['Confidentialité', 'seule l’image d’aperçu est envoyée, jamais votre fichier de plan ni les informations de votre compte'],
          ],
        },
        {
          alt: 'Plan modifiable avec pièces et meubles',
          h: 'Générateur de plans IA',
          p: 'Répondez à quelques questions (niveaux, chambres, salles de bain, surface, garage) et ajoutez le reste avec vos propres mots. Vous obtenez un plan meublé, modifiable comme n’importe quel projet, et vous pouvez demander des changements.',
          list: [
            ['Résultat modifiable', 'de vrais murs, portes, fenêtres et meubles'],
            ['Révision', 'décrivez ce qu’il faut changer et relancez la génération'],
            ['Avis d’un designer', 'demandez des conseils écrits sur votre agencement actuel'],
            ['Visite commentée', 'une visite de votre maison racontée à voix haute (Pro)'],
          ],
        },
      ],
      steps: [
        ['Connectez-vous', 'Les outils IA demandent un compte gratuit avec une connexion Google vérifiée.'],
        ['Décrivez votre maison', 'Remplissez le court formulaire et ajoutez vos souhaits avec vos propres mots.'],
        ['Modifiez le plan', 'Déplacez murs et meubles, ou demandez à l’IA de le revoir.'],
        ['Lancez le rendu', 'Passez en 3D et transformez la vue en image photoréaliste.'],
      ],
      faq: [
        ['Combien coûtent les outils IA ?', 'Ils utilisent des points. Les nouveaux comptes reçoivent une seule fois des points offerts, de quoi essayer un plan IA ou quelques rendus, et il est possible d’en acheter d’autres dans l’appli. Tout le reste de HomeDesigner fonctionne sans points.'],
        ['Puis-je modifier un plan créé par l’IA ?', 'Oui. Le résultat est un projet HomeDesigner normal. Vous pouvez déplacer les murs, modifier les pièces, changer les meubles et voir le tout en 3D.'],
        ['Le rendu IA est-il fidèle à mon projet ?', 'Il conserve l’agencement, les murs et les meubles principaux de votre vue 3D et ajoute des matériaux et un éclairage réalistes. Il peut ajouter de petits détails décoratifs : voyez-le comme une impression d’ensemble, pas comme un dessin technique.'],
        ['Où vont mes images ?', 'Un rendu n’envoie que l’image d’aperçu au service de rendu. Un plan IA envoie vos réponses, et un avis de designer envoie une image du plan. La politique de confidentialité indique les services utilisés.'],
      ],
      card: ['Plans et rendus IA', 'Décrivez votre maison pour obtenir un plan, puis transformez la vue 3D en image photoréaliste.', 'Rendu IA photoréaliste d’une maison'],
    },
    es: {
      slug: 'planos-con-ia',
      nav: 'Diseño con IA',
      title: 'Planos de casas con IA — generador y renders | HomeDesigner',
      description:
        'Describe tu casa y obtén un plano editable, convierte la vista 3D en un render fotorrealista con IA y pide a un diseñador IA que revise tu distribución.',
      h1: ['Diseño de casas con IA', 'planos y renders'],
      sub: 'Describe con tus palabras la casa que quieres y obtén un plano que puedes editar. Después convierte la vista 3D en una imagen que parece una foto.',
      heroAlt: 'Render con IA de una casa amueblada vista en sección, con el salón, la cocina y el baño',
      kicker: 'Herramientas de IA en la app',
      heading: 'IA que trabaja sobre tu propio plano',
      lead: 'Las herramientas de IA parten del plano en el que estás trabajando, así que el resultado es un proyecto real de HomeDesigner, con paredes y muebles que puedes mover, y no solo una imagen.',
      rows: [
        {
          alt: 'La vista 3D de una casa antes del render con IA',
          h: 'Render con IA: de la vista 3D a la foto',
          p: 'Encuadra una vista en 3D y envíala a renderizar. En unos quince segundos recibes una imagen fotorrealista que conserva tu distribución, con materiales, luz y vegetación realistas. La imagen de arriba es el render de la vista que ves aquí al lado.',
          list: [
            ['Cualquier cuenta con sesión iniciada', 'puede renderizar, con o sin marca de agua'],
            ['Pro', 'los renders salen siempre sin marca de agua'],
            ['Privacidad', 'solo se envía la imagen de vista previa, nunca el archivo del plano ni los datos de tu cuenta'],
          ],
        },
        {
          alt: 'Plano editable con habitaciones y muebles',
          h: 'Generador de planos con IA',
          p: 'Responde a unas pocas preguntas (plantas, dormitorios, baños, superficie, garaje) y añade lo demás con tus palabras. Obtienes un plano amueblado que se edita como cualquier otro proyecto, y puedes pedir cambios.',
          list: [
            ['Resultado editable', 'paredes, puertas, ventanas y muebles reales'],
            ['Revísalo', 'describe qué cambiar y vuelve a generarlo'],
            ['Revisión de un diseñador', 'pide consejos por escrito sobre tu distribución actual'],
            ['Visita guiada con voz', 'un recorrido narrado por tu casa (Pro)'],
          ],
        },
      ],
      steps: [
        ['Inicia sesión', 'Las herramientas de IA requieren una cuenta gratuita con inicio de sesión de Google verificado.'],
        ['Describe tu casa', 'Rellena el breve formulario y añade tus deseos con tus palabras.'],
        ['Edita el plano', 'Mueve paredes y muebles, o pide a la IA que lo revise.'],
        ['Renderízalo', 'Pasa al 3D y convierte la vista en una imagen fotorrealista.'],
      ],
      faq: [
        ['¿Cuánto cuestan las herramientas de IA?', 'Usan puntos. Las cuentas nuevas reciben una sola vez puntos gratis, suficientes para probar un plano con IA o un par de renders, y se pueden comprar más en la app. Todo lo demás en HomeDesigner funciona sin puntos.'],
        ['¿Puedo editar un plano hecho por la IA?', 'Sí. El resultado es un proyecto normal de HomeDesigner. Puedes mover paredes, cambiar habitaciones, sustituir muebles y verlo en 3D.'],
        ['¿Cuánto se parece el render con IA a mi diseño?', 'Conserva la distribución, las paredes y los muebles principales de tu vista 3D y añade materiales e iluminación realistas. Puede añadir pequeños detalles decorativos, así que tómalo como una impresión, no como un dibujo técnico.'],
        ['¿Adónde van mis imágenes?', 'Un render envía solo la imagen de vista previa al servicio de renderizado. Un plano con IA envía tus respuestas, y la revisión de un diseñador envía una imagen del plano. La política de privacidad indica los servicios que se utilizan.'],
      ],
      card: ['Planos y renders con IA', 'Describe tu casa para obtener un plano y convierte la vista 3D en una imagen fotorrealista.', 'Render fotorrealista con IA de una casa'],
    },
  },
];

// French puts a space before : ; ? ! and a line must never break there, so the
// copy above is typed with ordinary spaces and they become no-break spaces here.
const NBSP = ' ';
const frenchSpacing = (v) => {
  if (typeof v === 'string') return v.replace(/ ([:;?!»])/g, `${NBSP}$1`).replace(/« /g, `«${NBSP}`);
  if (Array.isArray(v)) return v.map(frenchSpacing);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, frenchSpacing(x)]));
  return v;
};
LANGS.fr = frenchSpacing(LANGS.fr);
for (const topic of TOPICS) topic.fr = frenchSpacing(topic.fr);

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Site path of a language's landing page, and of a topic page in that language. */
const homePath = (code) => `${LANGS[code].dir}/`;
const topicPath = (topic, code) => `${LANGS[code].dir}/${topic[code].slug}/`;
const playUrl = (code) => esc(PLAY + (LANGS[code].hl ? `&hl=${LANGS[code].hl}` : ''));
/** The first sentence of a paragraph, with its full stop. */
const firstSentence = (s) => s.split(/(?<=[.!?])\s/)[0];

const ld = (objects) => objects.map((o) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join('\n  ');

const img = (i, alt, lazy = true) =>
  `<img src="/assets/${i.src}" alt="${esc(alt)}" width="${i.w}" height="${i.h}"${lazy ? ' loading="lazy"' : ''} />`;

/**
 * <head> for one page. `paths` maps each language to this page's address in
 * that language; every version lists all of them, itself included, and English
 * is x-default.
 */
function head(code, { title, description, paths, jsonLd }) {
  const lang = LANGS[code];
  const self = ORIGIN + paths[code];
  return `<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <link rel="canonical" href="${self}" />
  ${CODES.map((c) => `<link rel="alternate" hreflang="${c}" href="${ORIGIN}${paths[c]}" />`).join('\n  ')}
  <link rel="alternate" hreflang="x-default" href="${ORIGIN}${paths.en}" />
  <link rel="icon" type="image/png" href="/assets/brand-icon.png" />
  <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="HomeDesigner" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:url" content="${self}" />${lang.ogLocale ? `\n  <meta property="og:locale" content="${lang.ogLocale}" />` : ''}
  <meta property="og:image" content="${ORIGIN}/assets/og-banner.jpg" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="theme-color" content="#0a0d14" />
  <link rel="stylesheet" href="/assets/site.css" />
  ${ld(jsonLd)}
</head>`;
}

function header(code, current) {
  const { ui } = LANGS[code];
  return `  <header>
    <div class="wrap nav">
      <a class="logo" href="${homePath(code)}"><img src="/assets/brand-icon.png" alt="" width="32" height="32" />HomeDesigner</a>
      <nav class="links">
        ${TOPICS.map((t) => `<a href="${topicPath(t, code)}"${t === current ? ' aria-current="page"' : ''}>${esc(t[code].nav)}</a>`).join('\n        ')}
        <a href="/buy/">Pro</a>
      </nav>
      <span class="spacer"></span>
      <a class="btn" href="${playUrl(code)}" target="_blank" rel="noopener">${esc(ui.playShort)}</a>
      <a class="btn primary" href="/app/">${esc(ui.openApp)}</a>
    </div>
  </header>`;
}

const playBadge = (code, lazy) => {
  const { ui } = LANGS[code];
  return `<a href="${playUrl(code)}" target="_blank" rel="noopener" aria-label="${esc(ui.playAria)}"><img class="play-badge" src="/assets/google-play-badge.png" alt="${esc(ui.play)}" width="734" height="219"${lazy ? ' loading="lazy"' : ''} /></a>`;
};

function getTheApp(code) {
  const { ui } = LANGS[code];
  return `    <section class="block" style="padding-top:0">
      <div class="wrap">
        <div class="get">
          <h2>${esc(ui.getTitle)}</h2>
          <p>${esc(ui.getText)}</p>
          <div class="ctas">
            ${playBadge(code, true)}
            <a class="btn" href="/app/">${esc(ui.getButton)}</a>
          </div>
        </div>
      </div>
    </section>`;
}

/** Footer, ending with the same page in the other languages. */
function footer(code, paths) {
  const { ui } = LANGS[code];
  return `  <footer>
    <div class="wrap row">
      <span>© ${UPDATED.slice(0, 4)} HomeDesigner</span>
      <span class="spacer"></span>
      ${TOPICS.map((t) => `<a href="${topicPath(t, code)}">${esc(t[code].nav)}</a>`).join('\n      ')}
      <a href="/buy/">Pro</a>
      <a href="/privacy">${esc(ui.privacy)}</a>
      <a href="/terms/">${esc(ui.terms)}</a>
    </div>
    <nav class="wrap langs" aria-label="${esc(ui.language)}">
      ${CODES.map((c) => `<a href="${paths[c]}" hreflang="${c}" lang="${c}"${c === code ? ' aria-current="page"' : ''}>${LANGS[c].name}</a>`).join(' ·\n      ')}
    </nav>
  </footer>`;
}

function renderTopic(topic, code) {
  const { ui, colon } = LANGS[code];
  const page = topic[code];
  const paths = Object.fromEntries(CODES.map((c) => [c, topicPath(topic, c)]));
  const others = TOPICS.filter((t) => t !== topic);
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'HomeDesigner', item: ORIGIN + homePath(code) },
        { '@type': 'ListItem', position: 2, name: page.nav, item: ORIGIN + paths[code] },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      inLanguage: code,
      mainEntity: page.faq.map(([q, a]) => ({
        '@type': 'Question',
        name: q,
        acceptedAnswer: { '@type': 'Answer', text: a },
      })),
    },
  ];
  return `<!doctype html>
<html lang="${code}">
${head(code, { title: page.title, description: page.description, paths, jsonLd })}
<body>
${header(code, topic)}

  <main>
    <section class="hero">
      <div class="wrap">
        <p class="crumbs"><a href="${homePath(code)}">HomeDesigner</a> › ${esc(page.nav)}</p>
        <h1>${esc(page.h1[0])}<br /><span class="accent">${esc(page.h1[1])}</span></h1>
        <p class="sub">${esc(page.sub)}</p>
        <div class="ctas">
          ${playBadge(code, false)}
          <a class="btn primary" href="/app/">${esc(ui.tryIt)}</a>
        </div>
        <div class="hero-shot">${img(topic.hero, page.heroAlt, false)}</div>
      </div>
    </section>

    <section class="block">
      <div class="wrap">
        <span class="kicker">${esc(page.kicker)}</span>
        <h2 class="title">${esc(page.heading)}</h2>
        <p class="lead">${esc(page.lead)}</p>
${page.rows
  .map(
    (r, i) => `        <div class="split">
          <div class="pic${topic.shots[i].phone ? ' phone' : ''}">${img(topic.shots[i], r.alt)}</div>
          <div>
            <h3>${esc(r.h)}</h3>
            <p>${esc(r.p)}</p>
            <ul>
              ${r.list.map(([b, t]) => `<li><b>${esc(b + colon)}</b> ${esc(t)}</li>`).join('\n              ')}
            </ul>
          </div>
        </div>`,
  )
  .join('\n')}
      </div>
    </section>

    <section class="block band">
      <div class="wrap">
        <span class="kicker">${esc(ui.howKicker)}</span>
        <h2 class="title">${esc(ui.howTitle)}</h2>
        <div class="steps">
          ${page.steps.map(([h, p]) => `<div class="step"><h3>${esc(h)}</h3><p>${esc(p)}</p></div>`).join('\n          ')}
        </div>
      </div>
    </section>

    <section class="block">
      <div class="wrap">
        <span class="kicker">${esc(ui.faqKicker)}</span>
        <h2 class="title">${esc(ui.faqTitle)}</h2>
        <div class="faq">
          ${page.faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n          ')}
        </div>
      </div>
    </section>

    <section class="block" style="padding-top:0">
      <div class="wrap">
        <span class="kicker">${esc(ui.more)}</span>
        <div class="more">
          ${others.map((t) => `<a href="${topicPath(t, code)}"><b>${esc(t[code].h1[0])}</b><span>${esc(firstSentence(t[code].sub))}</span></a>`).join('\n          ')}
        </div>
      </div>
    </section>

${getTheApp(code)}
  </main>

${footer(code, paths)}
</body>
</html>
`;
}

/** A language's landing page: what the app is, and a card for each topic. */
function renderHome(code) {
  const { ui, home } = LANGS[code];
  const paths = Object.fromEntries(CODES.map((c) => [c, homePath(c)]));
  const self = ORIGIN + paths[code];
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      '@id': self,
      url: self,
      name: home.title,
      description: home.description,
      inLanguage: code,
      // The WebSite node is declared on the English home page.
      isPartOf: { '@id': `${ORIGIN}/#site` },
    },
  ];
  return `<!doctype html>
<html lang="${code}">
${head(code, { title: home.title, description: home.description, paths, jsonLd })}
<body>
${header(code, null)}

  <main>
    <section class="hero">
      <div class="wrap">
        <h1>${esc(home.h1[0])}<br /><span class="accent">${esc(home.h1[1])}</span></h1>
        <p class="sub">${esc(home.sub)}</p>
        <div class="ctas">
          ${playBadge(code, false)}
          <a class="btn primary" href="/app/">${esc(ui.tryIt)}</a>
        </div>
      </div>
    </section>

    <section class="block">
      <div class="wrap">
        <span class="kicker">${esc(home.kicker)}</span>
        <h2 class="title">${esc(home.heading)}</h2>
        <div class="features">
${TOPICS.map((t) => {
  const [title, text, alt] = t[code].card;
  return `          <a class="feature" href="${topicPath(t, code)}">
            <div class="shot">${img(t.cardImg, alt)}</div>
            <div class="body"><h3>${esc(title)}</h3><p>${esc(text)}</p></div>
          </a>`;
}).join('\n')}
        </div>
      </div>
    </section>

${getTheApp(code)}
  </main>

${footer(code, paths)}
</body>
</html>
`;
}

// Search results cut a title at about 65 characters and a description at about
// 160, and a description under 120 wastes the space. Refuse to write a page
// that would be cut, so a new translation cannot ship one by accident.
const problems = [];
const checkMeta = (where, { title, description }) => {
  if (title.length >= 65) problems.push(`${where}: title is ${title.length} characters (limit 64)`);
  if (description.length < 120 || description.length > 160) problems.push(`${where}: description is ${description.length} characters (120 to 160)`);
};
for (const code of CODES) {
  if (LANGS[code].home) checkMeta(homePath(code), LANGS[code].home);
  for (const topic of TOPICS) {
    const page = topic[code];
    checkMeta(topicPath(topic, code), page);
    if (page.rows.length !== topic.shots.length) problems.push(`${topicPath(topic, code)}: ${page.rows.length} rows for ${topic.shots.length} pictures`);
  }
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}

const write = async (path, html) => {
  const dir = resolve(site, `.${path}`);
  await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, 'index.html'), html);
};

const written = [];
for (const code of CODES) {
  if (LANGS[code].home) {
    await write(homePath(code), renderHome(code));
    written.push(homePath(code));
  }
  for (const topic of TOPICS) {
    await write(topicPath(topic, code), renderTopic(topic, code));
    written.push(topicPath(topic, code));
  }
}

// Only pages that should appear in search results. /app/ is listed because
// people search for an online floor planner and that is the page that is one.
const entries = [
  ['/', '1.0', UPDATED],
  ...written.map((path) => [path, '0.9', UPDATED]),
  ['/app/', '0.8', UPDATED_OTHER],
  ['/buy/', '0.6', UPDATED_OTHER],
  ['/community/', '0.5', UPDATED_OTHER],
  ['/terms/', '0.2', UPDATED_OTHER],
];
await writeFile(
  resolve(site, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map(([path, pri, date]) => `  <url><loc>${ORIGIN}${path}</loc><lastmod>${date}</lastmod><priority>${pri}</priority></url>`).join('\n')}
</urlset>
`,
);

console.log(
  `Wrote ${written.length} pages (${TOPICS.length} topics in ${CODES.length} languages, ${CODES.length - 1} landing pages) and sitemap.xml (${entries.length} URLs) into site/`,
);
