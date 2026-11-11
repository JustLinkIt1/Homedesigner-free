import { t } from './i18n';
import { toast } from './ui';
import { useProStore } from '../store/proStore';

/**
 * A free export carries the corner ribbon, and until now nothing said so: the
 * buyer found out when they looked at the saved file, long after the app could
 * offer to remove it. Saving a render is also the moment someone has made a
 * thing they want to keep or show, which is when Pro is worth the most to them.
 *
 * A toast, not a sheet. The save already succeeded and must feel like it did.
 */
export function nudgeWatermarkedExport(): void {
  if (useProStore.getState().isPro) return;
  toast.action(t('Saved with a watermark.'), {
    label: t('Remove watermark'),
    tone: 'pro',
    onClick: () => useProStore.getState().openUpsell('cleanExport'),
  });
}
