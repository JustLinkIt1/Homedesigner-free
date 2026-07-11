import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Crown, Layers, FileText, Sofa, FolderOpen, Sparkles, Check, Ticket } from 'lucide-react';
import { useProStore } from '../store/proStore';
import type { ProFeature } from '../lib/pro';
import { APP_NAME } from '../lib/appInfo';
import { useI18n } from '../lib/i18n';

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
  const { upsellFeature, closeUpsell, purchase, restore, redeemCode, busy, priceLabel, isPro } = useProStore();
  const t = useI18n();
  const [showCode, setShowCode] = useState(false);
  const [codeValue, setCodeValue] = useState('');
  const [codeError, setCodeError] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  const open = !!upsellFeature && !isPro;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeUpsell();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, closeUpsell]);

  if (!open) return null;

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
          <h2>{t(copy.title)}</h2>
          <p>{t(copy.blurb)}</p>
        </div>
        <ul className="pro-benefits">
          {BENEFITS.map((b) => (
            <li key={b}>
              <Check className="icon" /> {t(b)}
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
                {native ? `${t('Unlock Pro')}${priceLabel ? ` — ${priceLabel}` : ''}` : t('Get the Android app')}
              </>
            )}
          </button>
          {native && (
            <button className="pro-restore" onClick={restore} disabled={busy}>
              {t('Restore purchase')}
            </button>
          )}
          {showCode ? (
            <form
              className="pro-code-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (!redeemCode(codeValue)) {
                  setCodeError(true);
                  codeRef.current?.focus();
                }
              }}
            >
              <input
                ref={codeRef}
                className={`pro-code-input${codeError ? ' error' : ''}`}
                placeholder={t('Enter referral code')}
                value={codeValue}
                onChange={(e) => {
                  setCodeValue(e.target.value);
                  setCodeError(false);
                }}
                autoFocus
              />
              <button className="btn primary pro-code-go" type="submit" disabled={!codeValue.trim()}>
                {t('Redeem')}
              </button>
            </form>
          ) : (
            <button
              className="pro-restore"
              onClick={() => {
                setShowCode(true);
                setTimeout(() => codeRef.current?.focus(), 50);
              }}
            >
              <Ticket className="icon" /> {t('Have a referral code?')}
            </button>
          )}
          <button className="pro-later" onClick={closeUpsell}>
            {t('Maybe later')}
          </button>
        </div>
      </div>
    </div>
  );
}
