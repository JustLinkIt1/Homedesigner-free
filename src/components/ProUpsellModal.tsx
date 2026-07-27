import { useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { Crown, Layers, FileText, Sofa, FolderOpen, Sparkles, Check } from 'lucide-react';
import { useProStore } from '../store/proStore';
import { isWebBillingConfigured, type ProFeature } from '../lib/pro';
import { useAuthStore } from '../store/authStore';
import { APP_NAME } from '../lib/appInfo';
import { useI18n } from '../lib/i18n';
import Modal from './Modal';

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

const CORE_BENEFITS = [
  'Unlimited floors & projects',
  'Full furniture catalog',
  'Watermark-free renders & photos',
  'PDF plan export',
];

/** Feature-triggered Pro purchase sheet (Play Billing on Android, Stripe-backed
 * RevenueCat Web Billing on configured desktop builds). */
export default function ProUpsellModal() {
  const { upsellFeature, closeUpsell, purchase, restore, busy, priceLabel, plans, isPro } = useProStore();
  const account = useAuthStore((s) => s.account);
  const authBusy = useAuthStore((s) => s.busy);
  const signIn = useAuthStore((s) => s.signIn);
  const t = useI18n();

  const open = !!upsellFeature && !isPro;
  // Escape, focus handling and presence now live in <Modal>. Because the modal
  // stays mounted while it animates out, `upsellFeature` may already be null —
  // keep the last one so the closing frame still renders its copy instead of
  // blanking or crashing on the lookup below.
  const lastFeature = useRef<ProFeature | null>(upsellFeature);
  if (upsellFeature) lastFeature.current = upsellFeature;
  const feature = upsellFeature ?? lastFeature.current;

  const native = Capacitor.isNativePlatform();
  const webBilling = !native && isWebBillingConfigured();
  const actionBusy = busy || authBusy;
  const showPlanChoices = webBilling && !!account && plans.length > 0;
  const copy = feature ? FEATURE_COPY[feature] : null;
  const Icon = copy?.icon;
  const buyLabel = native || (webBilling && account)
    ? `${t('Unlock Pro')}${priceLabel ? ` — ${priceLabel}` : ''}`
    : webBilling
      ? t('Sign in with Google')
      : t('Get the Android app');
  const onPrimaryAction = native || !webBilling || account ? purchase : signIn;
  const benefits = [
    ...CORE_BENEFITS,
    webBilling ? 'Monthly, yearly or lifetime — your choice' : 'One-time purchase — no subscription',
  ];

  return (
    <Modal open={open} onClose={closeUpsell} className="pro-upsell" labelledBy="pro-title">
      <>
        <div className="pro-hero">
          <span className="pro-badge" id="pro-title">
            <Crown className="icon" /> {APP_NAME} Pro
          </span>
          {copy && Icon && (
            <>
              <span className="pro-hero-icon">
                <Icon className="icon" />
              </span>
              <h2>{t(copy.title)}</h2>
              <p>{t(copy.blurb)}</p>
            </>
          )}
        </div>
        <ul className="pro-benefits">
          {benefits.map((b) => (
            <li key={b}>
              <Check className="icon" /> {t(b)}
            </li>
          ))}
        </ul>
        <div className="pro-actions">
          {showPlanChoices ? (
            <div className="pro-plan-grid" aria-label="Choose a Pro plan">
              {plans.map((plan) => (
                <button
                  key={plan.id}
                  className={`pro-plan${plan.id === 'yearly' ? ' recommended' : ''}`}
                  onClick={() => purchase(plan.id)}
                  disabled={actionBusy}
                  aria-label={`${plan.label} Pro plan, ${plan.priceLabel}`}
                >
                  {plan.id === 'yearly' && <span className="pro-plan-badge">Best value</span>}
                  <span className="pro-plan-name">{plan.label}</span>
                  <strong>{plan.priceLabel}</strong>
                  <small>
                    {plan.id === 'monthly' ? 'per month' : plan.id === 'yearly' ? 'per year' : 'one payment'}
                  </small>
                </button>
              ))}
            </div>
          ) : (
            <button className="btn primary pro-buy" onClick={() => onPrimaryAction()} disabled={actionBusy}>
              {actionBusy ? (
                <span className="spin" />
              ) : (
                <>
                  <Sparkles className="icon" />
                  {buyLabel}
                </>
              )}
            </button>
          )}
          {(native || (webBilling && account)) && (
            <button className="pro-restore" onClick={restore} disabled={actionBusy}>
              {t('Restore purchase')}
            </button>
          )}
          {/* Referral-code entry removed — the test-user campaign is closed.
              Devices that already redeemed keep Pro (see lib/referral.ts). */}
          <button className="pro-later" onClick={closeUpsell}>
            {t('Maybe later')}
          </button>
        </div>
      </>
    </Modal>
  );
}
