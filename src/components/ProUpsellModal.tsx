import { useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Crown, Layers, FileText, Sofa, FolderOpen, Sparkles, Check } from 'lucide-react';
import { useProStore } from '../store/proStore';
import { isWebBillingConfigured, type ProFeature } from '../lib/pro';
import { useAuthStore } from '../store/authStore';
import { APP_NAME } from '../lib/appInfo';
import { useI18n } from '../lib/i18n';
import { toast } from '../lib/ui';
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
  const { upsellFeature, upsellOpen, closeUpsell, purchase, restore, busy, priceLabel, plans, isPro } = useProStore();
  const account = useAuthStore((s) => s.account);
  const authBusy = useAuthStore((s) => s.busy);
  const signIn = useAuthStore((s) => s.signIn);
  const t = useI18n();

  // Not `!!upsellFeature`: the sheet also opens straight from the /buy page
  // with no feature, and then shows the plain Pro pitch — the feature hero
  // below is already conditional on `copy`.
  const open = upsellOpen && !isPro;
  // Escape, focus handling and presence now live in <Modal>. Because the modal
  // stays mounted while it animates out, `upsellFeature` may already be null —
  // keep the last one so the closing frame still renders its copy instead of
  // blanking or crashing on the lookup below.
  const lastFeature = useRef<ProFeature | null>(upsellFeature);
  if (upsellFeature) lastFeature.current = upsellFeature;
  const feature = upsellFeature ?? lastFeature.current;

  const native = Capacitor.isNativePlatform();
  const webBilling = !native && isWebBillingConfigured();
  // Google Play and RevenueCat both support anonymous purchases. Do not put
  // Google authentication in front of Android checkout: it is a separate
  // provider with separate failure modes, and a failed sign-in otherwise means
  // Play Billing is never invoked. Link the RevenueCat customer afterward.
  const requiresAccount = webBilling;
  const needsAccount = requiresAccount && !account;
  // Deliberately NOT `busy || authBusy`. `authBusy` also covers background
  // account sync, which has nothing to do with checkout — and while it was
  // folded in here, a sync that never settled rendered this sheet's primary
  // button as a bare spinner AND disabled it. The user could not buy, and had
  // pressed nothing: the button was already spinning when the sheet opened.
  // Each flag now gates only the action it actually describes — sign-in waits
  // on auth, buying and restoring wait on the Pro store.
  const actionBusy = needsAccount ? authBusy : busy;
  // Android sells the same monthly/yearly/lifetime ladder as the web build, so
  // the choice grid is no longer web-only. Gated on more than ONE plan so a
  // store that currently offers only the lifetime unlock — a country the
  // subscriptions are not live in, or a build predating them — still gets the
  // single "Unlock Pro — <price>" button rather than a grid of one.
  const showPlanChoices = (native || (webBilling && !!account)) && plans.length > 1;
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
  const purchaseAndOfferLink = async (planID?: 'monthly' | 'yearly' | 'lifetime') => {
    await purchase(planID);
    if (native && !account && useProStore.getState().isPro) {
      toast.action(
        t('Pro is active on this device. Sign in to use it on web and other devices.'),
        { label: t('Sign in'), onClick: () => { void signIn(); } },
        'success',
      );
    }
  };
  const onPrimaryAction = needsAccount ? signIn : purchaseAndOfferLink;
  // A plan only carries `originalPriceLabel` when a discount is genuinely
  // applied to the price beside it, so the struck-through price disappears by
  // itself when the offer ends rather than needing a second edit here.
  const offerPlan = plans.find((plan) => plan.originalPriceLabel);
  // Web knows its ladder before sign-in; native only learns it from the store,
  // so fall back to the one-time claim until the plans are actually loaded.
  const benefits = [
    ...CORE_BENEFITS,
    webBilling || plans.length > 1
      ? 'Monthly, yearly or lifetime — your choice'
      : 'One-time purchase — no subscription',
  ];

  return (
    <Modal open={open} onClose={closeUpsell} className="pro-upsell" labelledBy="pro-title">
      <>
        <div className="pro-hero">
          <span className="pro-badge" id="pro-title">
            <Crown className="icon" /> {APP_NAME} Pro
          </span>
          {copy && Icon ? (
            <>
              <span className="pro-hero-icon">
                <Icon className="icon" />
              </span>
              <h2>{t(copy.title)}</h2>
              <p>{t(copy.blurb)}</p>
            </>
          ) : (
            /* Opened straight from /buy, with no feature to frame it. The
               benefits list below carries the pitch, so this only needs a
               heading — and it reuses a string every locale already has
               rather than adding two more to translate. */
            <>
              <span className="pro-hero-icon">
                <Crown className="icon" />
              </span>
              <h2>{t('Unlock Pro')}</h2>
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
        {offerPlan && (
          <p className="pro-offer">
            <span className="pro-offer-badge">{t('Limited time')}</span>
            <span className="pro-offer-was">{offerPlan.originalPriceLabel}</span>
            <strong>{offerPlan.priceLabel}</strong>
          </p>
        )}
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
                  {plan.originalPriceLabel && (
                    <span className="pro-offer-was">{plan.originalPriceLabel}</span>
                  )}
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
                onClick={() => purchaseAndOfferLink(selectedPlan.id)}
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
          {(native || (webBilling && account)) && (
            <button className="pro-restore" onClick={restore} disabled={actionBusy}>
              {t('Restore purchase')}
            </button>
          )}
          {native && !account && (
            <button
              className="pro-restore"
              onClick={() => { void signIn(); }}
              disabled={busy || authBusy}
            >
              {authBusy ? t('Signing in…') : t('Bought on web? Sign in to unlock Pro')}
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
