import { Capacitor } from '@capacitor/core';
import { Crown, Layers, FileText, Sofa, FolderOpen, Sparkles, Check } from 'lucide-react';
import { useProStore } from '../store/proStore';
import type { ProFeature } from '../lib/pro';
import { APP_NAME } from '../lib/appInfo';

const FEATURE_COPY: Record<ProFeature, { icon: typeof Crown; title: string; blurb: string }> = {
  multiFloor: {
    icon: Layers,
    title: 'Design every storey',
    blurb: 'Add upper floors and basements, switch between them, and see the whole home stacked in 3D.',
  },
  pdfExport: {
    icon: FileText,
    title: 'Export print-ready PDFs',
    blurb: 'Turn your plan into a titled PDF document — ideal for builders, landlords and permits.',
  },
  catalog: {
    icon: Sofa,
    title: 'Unlock the full catalog',
    blurb: 'Every furniture piece and fixture, including the premium 3D models.',
  },
  projects: {
    icon: FolderOpen,
    title: 'Keep every project',
    blurb: 'Save and switch between unlimited designs on this device.',
  },
};

const BENEFITS = [
  'Unlimited floors & projects',
  'Full furniture catalog',
  'Watermark-free renders & photos',
  'PDF plan export',
  'One-time purchase — no subscription',
];

/** Feature-triggered Pro purchase sheet (Play billing on Android, Play link on web). */
export default function ProUpsellModal() {
  const { upsellFeature, closeUpsell, purchase, restore, busy, priceLabel, isPro } = useProStore();
  if (!upsellFeature || isPro) return null;

  const native = Capacitor.isNativePlatform();
  const copy = FEATURE_COPY[upsellFeature];
  const Icon = copy.icon;

  return (
    <div className="modal-backdrop" onMouseDown={closeUpsell}>
      <div className="modal pro-upsell" onMouseDown={(e) => e.stopPropagation()}>
        <div className="pro-hero">
          <span className="pro-badge">
            <Crown className="icon" /> {APP_NAME} Pro
          </span>
          <span className="pro-hero-icon">
            <Icon className="icon" />
          </span>
          <h2>{copy.title}</h2>
          <p>{copy.blurb}</p>
        </div>
        <ul className="pro-benefits">
          {BENEFITS.map((b) => (
            <li key={b}>
              <Check className="icon" /> {b}
            </li>
          ))}
        </ul>
        <div className="pro-actions">
          <button className="btn primary pro-buy" onClick={purchase} disabled={busy}>
            {busy ? (
              <span className="spin" />
            ) : (
              <>
                <Sparkles className="icon" />
                {native ? `Unlock Pro${priceLabel ? ` — ${priceLabel}` : ''}` : 'Get the Android app'}
              </>
            )}
          </button>
          {native && (
            <button className="pro-restore" onClick={restore} disabled={busy}>
              Restore purchase
            </button>
          )}
          <button className="pro-later" onClick={closeUpsell}>
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
