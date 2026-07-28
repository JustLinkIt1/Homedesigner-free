import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Search, Sofa, Lock, History, Star, X, Box, Move3D, Cloud, RefreshCw } from 'lucide-react';
import { useDesign } from '../store/designStore';
import { useProStore } from '../store/proStore';
import { requirePro } from '../lib/pro';
import {
  CATALOG_BY_TYPE,
  CATALOG_GROUP_ORDER,
  catalogGroupFor,
  type CatalogEntry,
  type CatalogGroup,
} from '../data/furnitureCatalog';
import { getRecent } from '../lib/recent';
import { getFavorites, toggleFavorite } from '../lib/favorites';
import { useI18n } from '../lib/i18n';
import SymbolIcon from './SymbolIcon';
import { loadRemoteCatalog, useRemoteCatalog } from '../lib/remoteCatalog';
import { FURNITURE_SPRITES, spriteUrl } from '../data/furnitureSprites';

// Keep Three.js out of the initial 2D editor path; load it only after a user
// actually asks to inspect an object.
const CatalogPreview = lazy(() => import('./CatalogPreview'));

function CatalogItem({
  entry,
  previewed,
  favorite,
  onPreview,
  onToggleFavorite,
}: {
  entry: CatalogEntry;
  previewed: boolean;
  favorite: boolean;
  onPreview: () => void;
  onToggleFavorite: () => void;
}) {
  const pendingFurnitureType = useDesign((state) => state.pendingFurnitureType);
  const isPro = useProStore((state) => state.isPro);
  const t = useI18n();
  const locked = !!entry.pro && !isPro;
  const name = t(entry.name);

  return (
    <div
      className={`cat-item ${previewed || pendingFurnitureType === entry.type ? 'active' : ''} ${locked ? 'locked' : ''}`}
      title={locked ? `${name} — Pro` : name}
    >
      <button
        className="cat-item-select"
        onClick={onPreview}
        aria-label={name}
      >
        <CatalogVisual entry={entry} className="ci-visual" />
        <span className="label">{name}</span>
      </button>
      <button
        className={`ci-favorite ${favorite ? 'active' : ''}`}
        onClick={onToggleFavorite}
        aria-label={t(favorite ? 'Remove from favourites' : 'Add to favourites')}
        aria-pressed={favorite}
        title={t(favorite ? 'Remove from favourites' : 'Add to favourites')}
      >
        <Star className="icon" />
      </button>
      {locked && (
        <span className="ci-lock" aria-label="Pro item">
          <Lock className="icon" />
        </span>
      )}
    </div>
  );
}

function CatalogVisual({ entry, className }: { entry: CatalogEntry; className: string }) {
  return FURNITURE_SPRITES.has(entry.type) ? (
    <img
      className={`${className} ci-sprite`}
      src={spriteUrl(entry.type)}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
    />
  ) : (
    <SymbolIcon shape={entry.shape} className={`${className} ci-symbol`} />
  );
}

export default function CatalogSidebar({
  open = false,
  docked = false,
  onClose,
}: {
  /** Mobile drawer visibility (Objects tab). */
  open?: boolean;
  /** Desktop visibility: docked in only while the furniture tool is active. */
  docked?: boolean;
  /** Close the mobile bottom sheet. */
  onClose?: () => void;
}) {
  const pendingFurnitureType = useDesign((state) => state.pendingFurnitureType);
  const cloudCatalog = useRemoteCatalog();
  // Openings are placed from build mode, so they do not clutter this catalog.
  const catalog = useMemo(
    () => cloudCatalog.entries.filter((entry) => entry.category !== 'Openings'),
    [cloudCatalog.entries],
  );
  const t = useI18n();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [browseBy, setBrowseBy] = useState<'room' | 'type'>('room');
  const [previewEntry, setPreviewEntry] = useState<CatalogEntry | null>(null);
  const [interactivePreview, setInteractivePreview] = useState(false);
  const [favoriteTypes, setFavoriteTypes] = useState(() => getFavorites());
  const [desktop, setDesktop] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(min-width: 881px)').matches,
  );
  const active = open || (docked && desktop);
  const [renderContents, setRenderContents] = useState(active);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 881px)');
    const update = () => setDesktop(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  // Keep the model preview and icon grid out of the DOM while the sheet is closed.
  useEffect(() => {
    if (active) {
      setRenderContents(true);
      return;
    }
    const timer = window.setTimeout(() => setRenderContents(false), 240);
    return () => window.clearTimeout(timer);
  }, [active]);

  useEffect(() => setCategory('All'), [browseBy]);
  useEffect(() => setInteractivePreview(false), [previewEntry?.type]);

  const categories = useMemo(() => {
    const values = new Set<string>();
    catalog.forEach((entry) => values.add(browseBy === 'room' ? entry.category : catalogGroupFor(entry)));
    const ordered = browseBy === 'type'
      ? CATALOG_GROUP_ORDER.filter((group) => values.has(group))
      : [...values];
    return ['All', ...ordered];
  }, [browseBy, catalog]);

  const recent = useMemo(
    () => getRecent().map((type) => CATALOG_BY_TYPE[type]).filter((entry): entry is CatalogEntry => !!entry),
    // Arming a new object updates this value and therefore refreshes recents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pendingFurnitureType],
  );

  const favorites = useMemo(
    () => favoriteTypes
      .map((type) => catalog.find((entry) => entry.type === type))
      .filter((entry): entry is CatalogEntry => !!entry),
    [favoriteTypes, catalog],
  );

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const items = catalog.filter((entry) => {
      const group = browseBy === 'room' ? entry.category : catalogGroupFor(entry);
      return (
        (category === 'All' || group === category) &&
        (!q ||
          entry.name.toLowerCase().includes(q) ||
          t(entry.name).toLowerCase().includes(q) ||
          entry.category.toLowerCase().includes(q) ||
          t(entry.category).toLowerCase().includes(q) ||
          catalogGroupFor(entry).toLowerCase().includes(q))
      );
    });
    const map = new Map<string, CatalogEntry[]>();
    for (const entry of items) {
      const group = browseBy === 'room' ? entry.category : catalogGroupFor(entry);
      map.set(group, [...(map.get(group) ?? []), entry]);
    }
    const groups = [...map.entries()];
    if (browseBy === 'type') {
      groups.sort(
        ([a], [b]) => CATALOG_GROUP_ORDER.indexOf(a as CatalogGroup) - CATALOG_GROUP_ORDER.indexOf(b as CatalogGroup),
      );
    }
    return groups;
    // t is stable for a language; avoid rebuilding on unrelated renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, category, browseBy, catalog]);

  const placePreviewed = () => {
    if (!previewEntry) return;
    const locked = !!previewEntry.pro && !useProStore.getState().isPro;
    if (locked && !requirePro('catalog')) return;
    useDesign.getState().setPendingFurniture(previewEntry.type);
    onClose?.();
  };

  const renderItem = (entry: CatalogEntry, key = entry.type) => (
    <CatalogItem
      key={key}
      entry={entry}
      previewed={previewEntry?.type === entry.type}
      favorite={favoriteTypes.includes(entry.type)}
      onPreview={() => setPreviewEntry(entry)}
      onToggleFavorite={() => setFavoriteTypes(toggleFavorite(entry.type))}
    />
  );

  return (
    <aside
      className={`sidebar catalog ${open ? 'open' : ''} ${docked ? 'docked' : ''}`}
      aria-hidden={!active}
    >
      {renderContents && <>
        <div className="sheet-grab" onClick={onClose} />
        <div className="sidebar-head">
          <Sofa className="icon" /> {t('Objects')}
          <button className="sheet-close" onClick={onClose} aria-label={t('Close')}>
            <X className="icon" />
          </button>
        </div>
        <div className="cat-search">
          <Search className="icon" />
          <input
            placeholder={t('Search objects…')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className={`catalog-cloud-status ${cloudCatalog.status}`}>
          <Cloud className="icon" />
          <span>
            {cloudCatalog.status === 'loading'
              ? t('Loading cloud objects…')
              : cloudCatalog.status === 'ready'
                ? `${cloudCatalog.remoteCount} ${t('cloud objects')}`
                : cloudCatalog.status === 'offline'
                  ? t('Offline catalog')
                  : t('Cloud catalog')}
          </span>
          {cloudCatalog.status === 'offline' && (
            <button onClick={() => void loadRemoteCatalog(true)} title={t('Retry')} aria-label={t('Retry')}>
              <RefreshCw className="icon" />
            </button>
          )}
        </div>
        <div className="cat-browse-toggle" role="group" aria-label={t('Browse objects by')}>
          <button className={browseBy === 'room' ? 'active' : ''} onClick={() => setBrowseBy('room')}>
            <Box className="icon" /> {t('Room')}
          </button>
          <button className={browseBy === 'type' ? 'active' : ''} onClick={() => setBrowseBy('type')}>
            <Sofa className="icon" /> {t('Type')}
          </button>
        </div>
        <div className="cat-chips">
          {categories.map((value) => (
            <button
              key={value}
              className={`chip ${category === value ? 'active' : ''}`}
              onClick={() => setCategory(value)}
            >
              {t(value)}
            </button>
          ))}
        </div>
        {previewEntry && (
          <div className="catalog-preview">
            <div className="catalog-preview-visual">
              {interactivePreview ? (
                <>
                  <Suspense fallback={<div className="catalog-preview-loading">{t('Loading 3D preview…')}</div>}>
                    <CatalogPreview entry={previewEntry} />
                  </Suspense>
                  <span className="catalog-preview-hint"><Move3D className="icon" /> {t('Drag to rotate')}</span>
                </>
              ) : (
                <div className="catalog-preview-static">
                  <CatalogVisual entry={previewEntry} className="catalog-preview-image" />
                  <button className="catalog-preview-3d" onClick={() => setInteractivePreview(true)}>
                    <Move3D className="icon" /> {t('View in 3D')}
                  </button>
                </div>
              )}
            </div>
            <div className="catalog-preview-info">
              <div>
                <strong>{t(previewEntry.name)}</strong>
                <span>{previewEntry.width} × {previewEntry.depth} × {previewEntry.height} cm</span>
              </div>
              <button className="btn primary catalog-place" onClick={placePreviewed}>
                {previewEntry.pro && !useProStore.getState().isPro
                  ? <><Lock className="icon" /> {t('Unlock to place')}</>
                  : t('Place item')}
              </button>
              <button className="catalog-preview-close" onClick={() => setPreviewEntry(null)} aria-label={t('Close preview')}>
                <X className="icon" />
              </button>
            </div>
          </div>
        )}
        <div className="sidebar-scroll">
          {!query.trim() && category === 'All' && favorites.length > 0 && (
            <div className="cat-section" key="__favorites">
              <div className="cat-title">
                <Star className="icon" style={{ width: 13, height: 13, verticalAlign: -2 }} /> {t('Favourites')}
              </div>
              <div className="cat-grid">{favorites.map((entry) => renderItem(entry, `f-${entry.type}`))}</div>
            </div>
          )}
          {!query.trim() && category === 'All' && recent.length > 0 && (
            <div className="cat-section" key="__recent">
              <div className="cat-title">
                <History className="icon" style={{ width: 13, height: 13, verticalAlign: -2 }} /> {t('Recent')}
              </div>
              <div className="cat-grid">{recent.map((entry) => renderItem(entry, `r-${entry.type}`))}</div>
            </div>
          )}
          {grouped.length === 0 && (
            <div className="empty-state" style={{ padding: '28px 20px' }}>
              <p>{t('No objects match')} “{query}”.</p>
            </div>
          )}
          {grouped.map(([group, items]) => (
            <div className="cat-section" key={group}>
              {category === 'All' && <div className="cat-title">{t(group)}</div>}
              <div className="cat-grid">{items.map((entry) => renderItem(entry))}</div>
            </div>
          ))}
        </div>
      </>}
    </aside>
  );
}
