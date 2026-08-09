import { useEffect, useMemo, useRef, useState } from 'react';
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
  // An anonymous Play purchase works on this phone, but it cannot be followed
  // reliably to another device or to the desktop app. Make identity a visible
  // first step, then let the user review the price and explicitly buy. This
  // also gives support a searchable RevenueCat customer instead of an opaque
  // anonymous install when checkout fails.
  const requiresAccount = native || webBilling;
  const needsAccount = requiresAccount && !account;
  const actionBusy = busy || authBusy;
  const showPlanChoices = webBilling && !!account && plans.length > 0;
  const [selectedPlanID, setSelectedPlanID] = useState<'monthly' | 'yearly' | 'lifetime' | null>(null);
  useEffect(() => {
    if (!showPlanChoices) return;
    setSelectedPlanID((current) => plans.some((plan) => plan.id === current)
      ? current
      : plans.find((plan) => plan.id === 'yearly')?.id ??
        plans.find((plan) => plan.id === 'lifetime')?.id ??
        plans[0]?.id ?? null);
  }, [plans, showPlanChoices]);
  const selectedPlan = plans.find((plan) => plan.id === selectedPlanID) ?? null;
  const comparison = useMemo(() => {
    const monthly = plans.find((plan) => plan.id === 'monthly');
    const yearly = plans.find((plan) => plan.id === 'yearly');
    if (!monthly?.priceMicros || !yearly?.priceMicros || !monthly.currency || monthly.currency !== yearly.currency) {
      return null;
    }
    const fullYear = monthly.priceMicros * 12;
    const saving = Math.round(((fullYear - yearly.priceMicros) / fullYear) * 100);
    if (saving <= 0) return null;
    const monthlyEquivalent = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: yearly.currency,
      maximumFractionDigits: 2,
    }).format(yearly.priceMicros / 12 / 1_000_000);
    return { saving, monthlyEquivalent };
  }, [plans]);
  const copy = feature ? FEATURE_COPY[feature] : null;
  const Icon = copy?.icon;
  const buyLabel = needsAccount
    ? t('Sign in with Google')
    : native || (webBilling && account)
    ? `${t('Unlock Pro')}${priceLabel ? ` — ${priceLabel}` : ''}`
    : webBilling
      ? t('Sign in with Google')
      : t('Get the Android app');
  const onPrimaryAction = needsAccount ? signIn : purchase;
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
                  className={`pro-plan${plan.id === 'yearly' ? ' recommended' : ''}${selectedPlanID === plan.id ? ' selected' : ''}`}
                  onClick={() => setSelectedPlanID(plan.id)}
                  disabled={actionBusy}
                  aria-label={`${plan.label} Pro plan, ${plan.priceLabel}`}
                  aria-pressed={selectedPlanID === plan.id}
                >
                  {plan.id === 'yearly' && <span className="pro-plan-badge">{t('Best value')}</span>}
                  <span className="pro-plan-name">{t(plan.label)}</span>
                  <strong>{plan.priceLabel}</strong>
                  <small>
                    {plan.id === 'monthly' ? t('per month') : plan.id === 'yearly' ? t('per year') : t('one payment')}
                  </small>
                  {plan.id === 'yearly' && comparison && (
                    <small className="pro-plan-comparison">
                      {comparison.monthlyEquivalent}/{t('month')} · {t('Save')} {comparison.saving}%
                    </small>
                  )}
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
          {showPlanChoices && selectedPlan && (
            <>
              <button
                className="btn primary pro-buy pro-continue"
                onClick={() => purchase(selectedPlan.id)}
                disabled={actionBusy}
              >
                {actionBusy ? <span className="spin" /> : <Sparkles className="icon" />}
                {actionBusy
                  ? `${t('Processing')} ${t(selectedPlan.label)}…`
                  : `${t('Continue with')} ${t(selectedPlan.label)} — ${selectedPlan.priceLabel}`}
              </button>
              <p className="pro-billing-terms">
                {selectedPlan.id === 'lifetime'
                  ? t('One-time payment. No subscription.')
                  : t('Subscription renews automatically until cancelled.')}
              </p>
            </>
          )}
          {(native || webBilling) && account && (
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
