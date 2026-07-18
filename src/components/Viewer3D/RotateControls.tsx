import { RotateCcw, RotateCw } from 'lucide-react';
import { useDesign } from '../../store/designStore';
import { norm360 } from '../Editor2D/editHandles';
import { tapLight } from '../../lib/haptics';
import { useI18n } from '../../lib/i18n';

/**
 * 3D rotation affordance: an HTML pill with ±45° steps shown while a piece of
 * furniture is selected in the 3D view. Deliberately NOT a 3D ring gizmo — a
 * screen-constant grip is a few px on phones and competes with the move-drag,
 * OrbitControls and surface-tap raycasts. If free rotation is ever wanted,
 * drag a grip and compute atan2 from e.ray.intersectPlane(floorPlane) against
 * the item centre (same math as Furniture3D's beginDrag), 15° snapped.
 */
export default function RotateControls() {
  const t = useI18n();
  const selection = useDesign((s) => s.selection);
  const item = useDesign((s) =>
    s.selection.kind === 'furniture' ? s.furniture.find((f) => f.id === s.selection.id) : undefined,
  );
  if (selection.kind !== 'furniture' || !item) return null;

  const rot = (d: number) => {
    tapLight();
    useDesign.getState().updateFurniture(item.id, { rotation: norm360(item.rotation + d) });
  };

  return (
    <div className="rotate3d-pill" aria-label={t('Rotate object')}>
      <button onClick={() => rot(-45)} aria-label={t('Rotate left 45 degrees')}>
        <RotateCcw className="icon" />
      </button>
      <span className="val">{Math.round(norm360(item.rotation))}°</span>
      <button onClick={() => rot(45)} aria-label={t('Rotate right 45 degrees')}>
        <RotateCw className="icon" />
      </button>
    </div>
  );
}
