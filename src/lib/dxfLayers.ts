/**
 * Layer classification for CAD imports.
 *
 * An architect's DWG is not a picture of a plan — it is a structured drawing in
 * which every entity already carries a layer name saying what it is. A real
 * ArchiCAD export from a French practice looks like this:
 *
 *   0._ _1_Structure - Murs extérieurs
 *   0._ _1_Portes Archicad
 *   0._ _1_2D - Cotations - existant ET nouveau
 *   0._ _1_Intérieur - Escaliers & ascenseurs
 *   1._ _2_Structure - Murs extérieurs
 *   2._ _3_Toits - Toitures
 *
 * Two things are encoded there and both are worth far more than anything we can
 * recover by tracing pixels:
 *
 *  - WHAT the entity is (wall / door / window / dimension / stair / roof), so
 *    dimension lines and vegetation stop arriving as walls; and
 *  - WHICH STOREY it belongs to, from the numeric prefix, so a single file
 *    imports as a stacked multi-storey building instead of every floor flattened
 *    on top of each other.
 *
 * Layer naming is a house style, not a standard, so this matches keywords in
 * several languages and always falls back to "unknown" rather than guessing.
 * The importer treats unknown layers as walls only when nothing was classified
 * as a wall, so an unrecognised naming scheme degrades to today's behaviour.
 */

export type LayerKind =
  | 'wall'
  | 'door'
  | 'window'
  | 'dimension'
  | 'stair'
  | 'roof'
  | 'zone'
  | 'furniture'
  | 'outdoor'
  | 'annotation'
  | 'unknown';

/** Keyword → kind, checked in order. Accents are stripped before matching, and
 *  DWG→DXF conversion often mangles them, so keys avoid accented letters. */
const RULES: { kind: LayerKind; words: string[] }[] = [
  // Dimensions first: "cotation" lines often sit on layers that also mention
  // the storey or the word "mur", and they must never become walls.
  { kind: 'dimension', words: ['cotation', 'dimension', 'bemassung', 'masse', 'quote', 'acotacion', 'dim-', 'a-dim', 'dims'] },
  { kind: 'annotation', words: ['texte', 'text', 'label', 'legende', 'legend', 'titre', 'title', 'marque', 'coupe', 'section', 'image', 'scan', 'nord', 'north', 'repere', 'anno'] },
  { kind: 'door', words: ['porte', 'door', 'tuer', 'puerta', 'porta'] },
  // 'glaz' is the AIA standard term (A-GLAZ), used across UK/US practice.
  { kind: 'window', words: ['fenetre', 'window', 'fenster', 'ventana', 'finestra', 'baie', 'glaz'] },
  { kind: 'stair', words: ['escalier', 'stair', 'strs', 'treppe', 'escalera', 'scala', 'ascenseur', 'elevator', 'lift'] },
  { kind: 'roof', words: ['toit', 'roof', 'dach', 'tejado', 'toiture', 'couverture'] },
  { kind: 'zone', words: ['zone', 'piece', 'room', 'raum', 'local', 'surface', 'espace', 'area'] },
  // NB: no 'exter' here — "Murs extérieurs" is an exterior WALL layer, and the
  // outdoor keywords must not swallow it.
  { kind: 'outdoor', words: ['vegetation', 'plantation', 'jardin', 'garden', 'terrasse', 'terrace', 'patio', 'landscape', 'amenagement'] },
  { kind: 'furniture', words: ['mobilier', 'furniture', 'furn', 'meuble', 'equipement', 'sanitaire', 'cuisine', 'appliance', 'objet'] },
  // Walls last: "mur" is a substring of several other words, so everything more
  // specific gets first refusal.
  { kind: 'wall', words: ['mur', 'wall', 'wand', 'muro', 'cloison', 'parete', 'structure', 'a-wall'] },
];

/** Lowercase and strip accents so "Fenêtres" and "Fenetres" match alike. */
function normalize(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    // DWG→DXF conversion frequently mojibakes accents; treat any non-ascii as a
    // wildcard letter so "Fen?tres" still matches "fenetre".
    .replace(/[^\x20-\x7e]/g, '?');
}

const isLetter = (c: string | undefined) => !!c && /[a-z0-9?]/.test(c);

/**
 * Does `hay` contain `needle` at a WORD START, allowing '?' in hay to match any
 * character (accents mangled by DWG→DXF conversion)?
 *
 * Word-start anchoring is not fussiness — plain substring matching is actively
 * wrong here. "Tür" without its umlaut is "tur", which appears inside
 * "S-t-r-u-c-**tur**-e", so an exterior wall layer called
 * "Structure - Murs extérieurs" classified as a DOOR and every wall in the
 * drawing was discarded. Suffixes still match ("mur" finds "murs"), because
 * only the start of the word is anchored.
 */
function looseIncludes(hay: string, needle: string): boolean {
  for (let i = 0; i + needle.length <= hay.length; i++) {
    if (isLetter(hay[i - 1])) continue; // not at a word start
    let ok = true;
    for (let j = 0; j < needle.length; j++) {
      const c = hay[i + j];
      if (c !== needle[j] && c !== '?') {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

export function classifyLayer(name: string): LayerKind {
  const n = normalize(name);
  for (const rule of RULES) {
    for (const w of rule.words) if (looseIncludes(n, w)) return rule.kind;
  }
  return 'unknown';
}

/** True for layers holding work that is being demolished / removed. */
export function isDemolished(name: string): boolean {
  const n = normalize(name);
  return looseIncludes(n, 'demoli') || looseIncludes(n, 'demol') || looseIncludes(n, 'abbruch') || looseIncludes(n, 'existing to be removed');
}

/**
 * Storey index from a layer name, or null when the name doesn't encode one.
 *
 * ArchiCAD writes `<index>._ _<index+1>_<layer name>` — "0._ _1_" is the ground
 * floor, "1._ _2_" the first, and so on. Also accepts the common "L02" / "ET1" /
 * "NIV2" / "FLOOR 3" prefixes other tools use.
 */
export function storeyOf(name: string): number | null {
  const n = normalize(name);
  const archicad = n.match(/^\s*(-?\d+)\.[_\s]+[_\s]*(-?\d+)_/);
  if (archicad) return Number(archicad[1]);
  const tagged = n.match(/\b(?:niv|niveau|etage|et|lvl|level|floor|storey|story|geschoss|og|l)\s*[-_]?\s*(\d{1,2})\b/);
  if (tagged) return Number(tagged[1]);
  return null;
}
