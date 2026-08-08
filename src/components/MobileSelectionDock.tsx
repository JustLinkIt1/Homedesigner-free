import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeftRight,
  ArrowUpDown,
  Copy,
  MoreHorizontal,
  RotateCw,
  Trash2,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { tapLight } from '../lib/haptics';
import { useI18n } from '../lib/i18n';
import { useDesign } from '../store/designStore';

function DockAction({
  icon: Icon,
  label,
  onClick,
  danger = false,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      className={danger ? 'danger' : undefined}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      <Icon className="icon" />
      <span>{label}</span>
    </button>
  );
}

/** Reachable, selection-specific actions for phones. Exact dimensions,
 * materials and less-common edits stay in the existing Properties sheet. */
export default function MobileSelectionDock({ onMore }: { onMore: () => void }) {
  const s = useDesign(useShallow((state) => ({
    selection: state.selection,
    selectedIds: state.selectedIds,
    furniture: state.furniture,
    openings: state.openings,
    updateFurniture: state.updateFurniture,
    updateOpening: state.updateOpening,
    duplicateSelection: state.duplicateSelection,
    deleteSelected: state.deleteSelected,
  })));
  const t = useI18n();
  const multi = s.selectedIds.length > 1;
  const item = !multi && s.selection.kind === 'furniture'
    ? s.furniture.find((entry) => entry.id === s.selection.id)
    : undefined;
  const opening = !multi && s.selection.kind === 'opening'
    ? s.openings.find((entry) => entry.id === s.selection.id)
    : undefined;
  const flippableDoor = opening?.type === 'door' && opening.style !== 'passage' && opening.style !== 'arch';

  const act = (action: () => void) => () => {
    tapLight();
    action();
  };

  return (
    <nav className="mobile-selection-dock" aria-label={t('Selected object actions')}>
      {multi ? (
        <DockAction icon={Copy} label={t('Duplicate')} onClick={act(s.duplicateSelection)} />
      ) : item ? (
        <>
          <DockAction
            icon={item.type === 'stairs' ? ArrowUpDown : RotateCw}
            label={item.type === 'stairs' ? t('Reverse') : t('Rotate')}
            onClick={act(() => s.updateFurniture(item.id, {
              rotation: (item.rotation + (item.type === 'stairs' ? 180 : 90)) % 360,
            }))}
          />
          <DockAction icon={Copy} label={t('Duplicate')} onClick={act(s.duplicateSelection)} />
        </>
      ) : flippableDoor ? (
        <>
          <DockAction
            icon={ArrowLeftRight}
            label={t('Hinge')}
            onClick={act(() => s.updateOpening(opening.id, { flipHinge: !opening.flipHinge }))}
          />
          <DockAction
            icon={ArrowUpDown}
            label={t('In / out')}
            onClick={act(() => s.updateOpening(opening.id, { flipSwing: !opening.flipSwing }))}
          />
        </>
      ) : s.selection.kind === 'opening' || s.selection.kind === 'wall' ? (
        <DockAction icon={Copy} label={t('Duplicate')} onClick={act(s.duplicateSelection)} />
      ) : null}
      <DockAction icon={Trash2} label={t('Delete')} onClick={s.deleteSelected} danger />
      <DockAction icon={MoreHorizontal} label={t('More')} onClick={act(onMore)} />
    </nav>
  );
}
