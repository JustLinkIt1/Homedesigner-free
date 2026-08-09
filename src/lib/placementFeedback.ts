import { CATALOG_BY_TYPE } from '../data/furnitureCatalog';
import { useDesign } from '../store/designStore';
import { t } from './i18n';
import { toast } from './ui';

/** Confirm a successful one-shot placement without silently re-arming it. */
export function notifyPlacementComplete(type: string): void {
  const entry = CATALOG_BY_TYPE[type];
  if (!entry) return;

  toast.actions(
    `${t('Placed')} ${t(entry.name)}`,
    [
      {
        label: t('Undo'),
        onClick: () => {
          const state = useDesign.getState();
          state.undo();
          state.clearSelection();
        },
      },
      {
        label: t('Place another'),
        onClick: () => {
          const state = useDesign.getState();
          state.clearSelection();
          state.setPendingFurniture(type);
        },
      },
    ],
    'success',
  );
}
