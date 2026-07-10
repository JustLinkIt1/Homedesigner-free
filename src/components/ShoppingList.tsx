import { useMemo } from 'react';
import { ClipboardList, Copy, Download } from 'lucide-react';
import { useDesign } from '../store/designStore';
import { buildBom, bomToCsv, bomToText } from '../lib/bom';
import { saveText } from '../lib/native';
import { slugify } from '../lib/appInfo';
import { formatLength } from '../lib/units';
import { toast } from '../lib/ui';
import { CATALOG_BY_TYPE } from '../data/furnitureCatalog';
import SymbolIcon from './SymbolIcon';

/** Aggregated furniture list across all storeys — a shareable shopping list. */
export default function ShoppingList({ onClose }: { onClose: () => void }) {
  const floors = useDesign((s) => s.floors);
  const floorGeom = useDesign((s) => s.floorGeom);
  const units = useDesign((s) => s.units);
  const projectName = useDesign((s) => s.projectName);
  const multiFloor = floors.length > 1;

  const rows = useMemo(() => buildBom(floors, floorGeom), [floors, floorGeom]);
  const total = rows.reduce((a, r) => a + r.count, 0);

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(bomToText(rows, projectName));
      toast.success('Shopping list copied');
    } catch {
      toast.error("Couldn't copy — try Save CSV instead");
    }
  };

  const saveCsv = async () => {
    try {
      await saveText(bomToCsv(rows), `${slugify(projectName)}-shopping-list.csv`, 'text/csv');
      toast.success('Shopping list saved as CSV');
    } catch {
      toast.error('Save failed');
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal shopping-list" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <ClipboardList className="icon" /> Shopping list
        </div>
        <div className="modal-body bom-body">
          {rows.length === 0 ? (
            <div className="empty-state" style={{ padding: '28px 20px' }}>
              <p>No furniture placed yet — furnish your home, then come back for the list.</p>
            </div>
          ) : (
            <table className="bom-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="num">Qty</th>
                  <th>Size (W×D)</th>
                  {multiFloor && <th>Floor</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td>
                      <span className="bom-item">
                        {CATALOG_BY_TYPE[r.type] && (
                          <SymbolIcon shape={CATALOG_BY_TYPE[r.type].shape} className="bom-symbol" />
                        )}
                        {r.name}
                      </span>
                    </td>
                    <td className="num">{r.count}</td>
                    <td>
                      {formatLength(r.width, units)} × {formatLength(r.depth, units)}
                    </td>
                    {multiFloor && <td className="bom-floors">{r.floors.join(', ')}</td>}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td className="num">{total}</td>
                  <td colSpan={multiFloor ? 2 : 1} />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
        <div className="modal-foot">
          {rows.length > 0 && (
            <>
              <button className="btn" onClick={copyText}>
                <Copy className="icon" /> Copy as text
              </button>
              <button className="btn" onClick={saveCsv}>
                <Download className="icon" /> Save CSV
              </button>
            </>
          )}
          <button className="btn primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
