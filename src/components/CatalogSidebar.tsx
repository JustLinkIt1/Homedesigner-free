import { useMemo, useState } from 'react';
import { Search, Sofa, Lock, History } from 'lucide-react';
import { useDesign } from '../store/designStore';
import { useProStore } from '../store/proStore';
import { requirePro } from '../lib/pro';
import { FURNITURE_CATALOG, CATALOG_BY_TYPE, type CatalogEntry } from '../data/furnitureCatalog';
import { getRecent } from '../lib/recent';
import { useI18n } from '../lib/i18n';
import SymbolIcon from './SymbolIcon';

// Openings (doors/windows) are placed from the build-mode dock flyout, so they
// no longer clutter the furniture catalog.
const CATALOG = FURNITURE_CATALOG.filter((e) => e.category !== 'Openings');

function CatalogItem({ entry }: { entry: CatalogEntry }) {
  const { pendingFurnitureType, setPendingFurniture } = useDesign();
  const isPro = useProStore((s) => s.isPro);
  const t = useI18n();
  const locked = !!entry.pro && !isPro;
  const name = t(entry.name);
  return (
    <button
      className={`cat-item ${pendingFurnitureType === entry.type ? 'active' : ''} ${locked ? 'locked' : ''}`}
      onClick={() => {
        // Locked items open the upsell instead of arming placement;
        // already-placed pro items keep rendering everywhere.
        if (locked && !requirePro('catalog')) return;
        setPendingFurniture(pendingFurnitureType === entry.type ? null : entry.type);
      }}
      title={locked ? `${name} — Pro` : `${name}`}
    >
      {locked && (
        <span className="ci-lock" aria-label="Pro item">
          <Lock className="icon" />
        </span>
      )}
      <SymbolIcon shape={entry.shape} className="ci-symbol" />
      <span className="label">{name}</span>
    </button>
  );
}

export default function CatalogSidebar({
  open = false,
  docked = false,
}: {
  /** Mobile drawer visibility (Objects tab). */
  open?: boolean;
  /** Desktop visibility: docked in only while the furniture tool is active. */
  docked?: boolean;
}) {
  const pendingFurnitureType = useDesign((s) => s.pendingFurnitureType);
  const t = useI18n();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('All');

  const categories = useMemo(() => {
    const set = new Set<string>();
    CATALOG.forEach((e) => set.add(e.category));
    return ['All', ...set];
  }, []);

  // Refreshes exactly when the user arms something new (arming always changes
  // pendingFurnitureType, which is what records a recent).
  const recent = useMemo(
    () => getRecent().map((t) => CATALOG_BY_TYPE[t]).filter((e): e is CatalogEntry => !!e),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pendingFurnitureType],
  );

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const items = CATALOG.filter(
      (e) =>
        (category === 'All' || e.category === category) &&
        (!q ||
          e.name.toLowerCase().includes(q) ||
          t(e.name).toLowerCase().includes(q) ||
          e.category.toLowerCase().includes(q) ||
          t(e.category).toLowerCase().includes(q)),
    );
    const map = new Map<string, typeof FURNITURE_CATALOG>();
    for (const e of items) {
      const arr = map.get(e.category) ?? [];
      arr.push(e);
      map.set(e.category, arr);
    }
    return [...map.entries()];
    // t is stable per language; re-grouping on every render would be wasteful.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, category]);

  return (
    <aside className={`sidebar ${open ? 'open' : ''} ${docked ? 'docked' : ''}`}>
      <div className="sidebar-head">
        <Sofa className="icon" /> {t('Objects')}
      </div>
      <div className="cat-search">
        <Search className="icon" />
        <input
          placeholder={t('Search objects…')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="cat-chips">
        {categories.map((c) => (
          <button
            key={c}
            className={`chip ${category === c ? 'active' : ''}`}
            onClick={() => setCategory(c)}
          >
            {t(c)}
          </button>
        ))}
      </div>
      <div className="sidebar-scroll">
        {!query.trim() && category === 'All' && recent.length > 0 && (
          <div className="cat-section" key="__recent">
            <div className="cat-title">
              <History className="icon" style={{ width: 13, height: 13, verticalAlign: -2 }} /> {t('Recent')}
            </div>
            <div className="cat-grid">
              {recent.map((e) => (
                <CatalogItem key={`r-${e.type}`} entry={e} />
              ))}
            </div>
          </div>
        )}
        {grouped.length === 0 && (
          <div className="empty-state" style={{ padding: '28px 20px' }}>
            <p>{t('No objects match')} “{query}”.</p>
          </div>
        )}
        {grouped.map(([cat, items]) => (
          <div className="cat-section" key={cat}>
            {category === 'All' && <div className="cat-title">{t(cat)}</div>}
            <div className="cat-grid">
              {items.map((e) => (
                <CatalogItem key={e.type} entry={e} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
