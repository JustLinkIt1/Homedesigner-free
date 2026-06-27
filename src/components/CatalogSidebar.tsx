import { useMemo } from 'react';
import { useDesign } from '../store/designStore';
import { FURNITURE_CATALOG } from '../data/furnitureCatalog';

export default function CatalogSidebar({ open = false }: { open?: boolean }) {
  const { pendingFurnitureType, setPendingFurniture } = useDesign();

  const byCategory = useMemo(() => {
    const map = new Map<string, typeof FURNITURE_CATALOG>();
    for (const e of FURNITURE_CATALOG) {
      const arr = map.get(e.category) ?? [];
      arr.push(e);
      map.set(e.category, arr);
    }
    return [...map.entries()];
  }, []);

  return (
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <div className="sidebar-head">Furniture &amp; Objects</div>
      <div className="sidebar-scroll">
        {byCategory.map(([cat, items]) => (
          <div className="cat-section" key={cat}>
            <div className="cat-title">{cat}</div>
            <div className="cat-grid">
              {items.map((e) => (
                <button
                  key={e.type}
                  className={`cat-item ${pendingFurnitureType === e.type ? 'active' : ''}`}
                  onClick={() =>
                    setPendingFurniture(pendingFurnitureType === e.type ? null : e.type)
                  }
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
