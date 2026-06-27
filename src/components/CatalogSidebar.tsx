import { useMemo, useState } from 'react';
import { Search, Sofa } from 'lucide-react';
import { useDesign } from '../store/designStore';
import { FURNITURE_CATALOG } from '../data/furnitureCatalog';

export default function CatalogSidebar({ open = false }: { open?: boolean }) {
  const { pendingFurnitureType, setPendingFurniture } = useDesign();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('All');

  const categories = useMemo(() => {
    const set = new Set<string>();
    FURNITURE_CATALOG.forEach((e) => set.add(e.category));
    return ['All', ...set];
  }, []);

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const items = FURNITURE_CATALOG.filter(
      (e) =>
        (category === 'All' || e.category === category) &&
        (!q || e.name.toLowerCase().includes(q) || e.category.toLowerCase().includes(q)),
    );
    const map = new Map<string, typeof FURNITURE_CATALOG>();
    for (const e of items) {
      const arr = map.get(e.category) ?? [];
      arr.push(e);
      map.set(e.category, arr);
    }
    return [...map.entries()];
  }, [query, category]);

  return (
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <div className="sidebar-head">
        <Sofa className="icon" /> Furniture &amp; objects
      </div>
      <div className="cat-search">
        <Search className="icon" />
        <input
          placeholder="Search objects…"
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
            {c}
          </button>
        ))}
      </div>
      <div className="sidebar-scroll">
        {grouped.length === 0 && (
          <div className="empty-state" style={{ padding: '28px 20px' }}>
            <p>No objects match “{query}”.</p>
          </div>
        )}
        {grouped.map(([cat, items]) => (
          <div className="cat-section" key={cat}>
            {category === 'All' && <div className="cat-title">{cat}</div>}
            <div className="cat-grid">
              {items.map((e) => (
                <button
                  key={e.type}
                  className={`cat-item ${pendingFurnitureType === e.type ? 'active' : ''}`}
                  onClick={() => setPendingFurniture(pendingFurnitureType === e.type ? null : e.type)}
                  title={`Place ${e.name}`}
                >
                  <span className="emoji">{e.icon}</span>
                  <span className="label">{e.name}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
