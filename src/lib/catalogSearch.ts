import { catalogGroupFor, type CatalogEntry } from '../data/furnitureCatalog';

/** Small, reviewed alias set for language people commonly use when searching
 * for home-design objects. Cloud entries can add their own validated terms. */
const TYPE_ALIASES: Record<string, readonly string[]> = {
  sofa: ['couch', 'settee'],
  armchair: ['easy chair', 'lounge chair'],
  tv_stand: ['television', 'screen', 'wall mounted tv', 'media unit'],
  tv_media_unit: ['television', 'tv cabinet', 'media cabinet', 'entertainment unit'],
  low_media_console: ['tv cabinet', 'media cabinet', 'entertainment unit'],
  side_table: ['end table', 'occasional table'],
  nightstand: ['bedside table', 'bedside cabinet'],
  wardrobe: ['closet', 'armoire'],
  dresser: ['chest of drawers'],
  chest_of_drawers: ['dresser'],
  fridge: ['refrigerator'],
  stove: ['oven', 'cooker', 'range'],
  kitchen_sink: ['basin'],
  sink: ['basin'],
  washer: ['washing machine'],
  monitor: ['computer screen', 'display'],
  wall_art: ['picture', 'painting', 'poster'],
  curtains: ['drapes'],
  rug: ['carpet'],
  round_rug: ['carpet'],
  bbq: ['barbecue', 'grill'],
  stairs: ['staircase', 'steps'],
  patio_chair: ['outdoor chair', 'garden seat'],
  bench: ['outdoor bench', 'garden bench'],
  table_lamp: ['bedside lamp'],
};

export function normalizeCatalogText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase()
    .replace(/[_/\\-]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function singular(word: string): string {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && /(?:ses|xes|zes|ches|shes)$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s')) return word.slice(0, -1);
  return word;
}

export function catalogEntryMatches(
  entry: CatalogEntry,
  query: string,
  translate: (value: string) => string,
): boolean {
  const normalizedQuery = normalizeCatalogText(query);
  if (!normalizedQuery) return true;
  const placement = entry.placement ?? (entry.mountY != null ? 'wall' : 'floor');
  const source = [
    entry.name,
    translate(entry.name),
    entry.type,
    entry.category,
    translate(entry.category),
    catalogGroupFor(entry),
    entry.shape,
    placement,
    ...(TYPE_ALIASES[entry.type] ?? []),
    ...(entry.searchTerms ?? []),
  ].map(normalizeCatalogText).join(' ');
  return normalizedQuery
    .split(' ')
    .filter(Boolean)
    .every((token) => source.includes(token) || source.includes(singular(token)));
}
