import { useEffect } from 'react';
import { ArrowLeftRight, ArrowUpDown, DoorOpen, Minus, Plus, Trash2, X } from 'lucide-react';
import { useDesign } from '../../store/designStore';
import { useProStore } from '../../store/proStore';
import { FURNITURE_CATALOG } from '../../data/furnitureCatalog';
import { requirePro } from '../../lib/pro';
import { useI18n } from '../../lib/i18n';
import type { OpeningStyle } from '../../types';

// Same gate as the Properties panel: a style is Pro when its catalog entry is.
const PRO_STYLES = new Set(
  FURNITURE_CATALOG.filter((e) => e.pro && e.opening?.style).map((e) => `${e.opening!.kind}:${e.opening!.style}`),
);

const DOOR_STYLES: [OpeningStyle, string][] = [
  ['single', 'Single'],
  ['front', 'Front door (panelled)'],
  ['front_glazed', 'Front door (glazed)'],
  ['front_modern', 'Front door (modern)'],
  ['double', 'Double'],
  ['sliding', 'Sliding'],
  ['pocket', 'Pocket'],
  ['bifold', 'Bi-fold'],
  ['passage', 'Passage (no leaf)'],
  ['arch', 'Arch (no leaf)'],
];
const WINDOW_STYLES: [OpeningStyle, string][] = [
  ['standard', 'Standard'],
  ['bay', 'Bay'],
  ['french', 'French (full height)'],
  ['casement', 'Casement'],
  ['sliding', 'Sliding'],
];

/**
 * Tap a door or window in 3D and change it right there: its style, which side
 * it hinges on, whether it opens in or out, and its width. The same edits as
 * the Properties panel, at the tap point, so the change shows live in the
 * model without going back to the plan.
 */
export default function OpeningPopover({ id, x, y, onClose }: { id: string; x: number; y: number; onClose: () => void }) {
  const t = useI18n();
  const opening = useDesign((st) => st.openings.find((o) => o.id === id));
  const isPro = useProStore((st) => st.isPro);
  useEffect(() => {
    if (!opening) onClose();
  }, [opening, onClose]);
  if (!opening) return null;

  const st = useDesign.getState();
  const kind = opening.type;
  const current = opening.style ?? (kind === 'door' ? 'single' : 'standard');
  const styles = kind === 'door' ? DOOR_STYLES : WINDOW_STYLES;
  const leaf = kind === 'door' && current !== 'passage' && current !== 'arch';
  const left = Math.min(Math.max(x, 140), window.innerWidth - 140);
  const top = Math.max(86, y - 14);
  const pick = (style: OpeningStyle) => {
    if (PRO_STYLES.has(`${kind}:${style}`) && !requirePro('catalog')) return;
    st.updateOpening(id, { style, ...(kind === 'window' && style === 'french' ? { sill: 0, height: 220 } : {}) });
  };
  const resize = (by: number) => st.updateOpening(id, { width: Math.max(40, Math.min(400, opening.width + by)) });

  return (
    <div className="paint-pop opening-pop" style={{ left, top }}>
      <div className="pp-head">
        <DoorOpen className="icon" />
        {kind === 'door' ? t('Door') : t('Window')}
        <button className="pp-close" onClick={onClose} aria-label={t('Close')}>
          <X className="icon" />
        </button>
      </div>
      <div className="pp-scroll">
        {/* Swap a door for a window (or back) in place, as the Properties
            panel's Type does: same wall, same spot, sensible sizes. */}
        <div className="seg opening-kind">
          {(['door', 'window'] as const).map((k) => (
            <button
              key={k}
              className={kind === k ? 'active' : ''}
              onClick={() => kind !== k && st.updateOpening(id, {
                type: k,
                style: k === 'door' ? 'single' : 'standard',
                sill: k === 'door' ? 0 : 90,
                height: k === 'door' ? 205 : 120,
              })}
            >
              {k === 'door' ? t('Door') : t('Window')}
            </button>
          ))}
        </div>
        {leaf && (
          <div className="quick-transform opening-flips" role="group" aria-label={t('Door direction controls')}>
            <button onClick={() => st.updateOpening(id, { flipHinge: !opening.flipHinge })} aria-label={t('Flip hinge side')}>
              <ArrowLeftRight className="icon" /> <span>{t('Hinge')}</span>
            </button>
            <button onClick={() => st.updateOpening(id, { flipSwing: !opening.flipSwing })} aria-label={t('Flip swing direction')}>
              <ArrowUpDown className="icon" /> <span>{t('In / out')}</span>
            </button>
          </div>
        )}
        <div className="mat-group-title">{t('Width (cm)')}</div>
        <div className="opening-width">
          <button className="btn" onClick={() => resize(-10)} aria-label="-10"><Minus className="icon" /></button>
          <span>{Math.round(opening.width)}</span>
          <button className="btn" onClick={() => resize(10)} aria-label="+10"><Plus className="icon" /></button>
        </div>
        <div className="mat-group-title">{t('Style')}</div>
        <div className="swap-chips">
          {styles.map(([style, label]) => (
            <button key={style} className={`swap-chip${current === style ? ' on' : ''}`} onClick={() => pick(style)}>
              {t(label)}
              {!isPro && PRO_STYLES.has(`${kind}:${style}`) ? ' 👑' : ''}
            </button>
          ))}
        </div>
        <button className="btn-danger" onClick={() => { st.deleteById('opening', id); onClose(); }}>
          <Trash2 className="icon" /> {kind === 'door' ? t('Delete door') : t('Delete window')}
        </button>
      </div>
    </div>
  );
}
