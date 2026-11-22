import { useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  Crown, Layers, FileText, Sofa, FolderOpen, Sparkles, Image as ImageIcon, Camera, CalendarCheck, BadgeCheck, Mic,
} from 'lucide-react';
import { useProStore } from '../store/proStore';
import { usePointsStore } from '../store/pointsStore';
import { isWebBillingConfigured, type ProFeature, type ProTrigger } from '../lib/pro';
import { useAuthStore } from '../store/authStore';
import { APP_NAME } from '../lib/appInfo';
import { useI18n, useLang } from '../lib/i18n';
import { toast } from '../lib/ui';
import { trackEvent } from '../lib/events';
import Modal from './Modal';

const FEATURE_COPY: Record<ProFeature, { icon: typeof Crown; title: string; blurb: string }> = {
  aiRender: {
    icon: Sparkles,
    title: 'Photorealistic AI renders',
    blurb: 'Pro includes one free AI render per account. Further AI renders use AI points. Sign-in and internet required.',
  },
  voiceTour: {
    icon: Mic,
    title: 'AI voice tours of your home',
    blurb: 'Pro can turn your plan into a narrated audio tour. Each tour uses AI points. Sign-in and internet required.',
  },
  cleanExport: {
    icon: ImageIcon,
    title: 'Watermark-free renders & photos',
    blurb: 'Pro removes the watermark from every render and photo you save or share.',
  },
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

/** Per-wall headline and blurb (paywall copy spec, section 1). The icon comes
 * from the trigger's feature. A trigger with no entry, or an unset one, falls
 * back to FEATURE_COPY[feature]. Locales translate these like FEATURE_COPY:
 * English string as the key, English shown where a locale has no entry. */
export const TRIGGER_COPY: Record<ProTrigger, { title: string; blurb: string }> = {
  'projects:new': { title: 'Start a second design', blurb: 'Free keeps one project. Pro keeps every design you start on this device, and you can switch between them any time.' },
  'projects:sample': { title: 'Open this sample as its own project', blurb: 'Free keeps one project. With Pro you can open every sample and keep your own design too.' },
  'projects:duplicate': { title: 'Duplicate this design', blurb: 'Try a second layout without touching the first. Pro keeps as many copies as you like.' },
  'multiFloor:add': { title: 'Add another floor', blurb: 'Add upper floors or a basement, switch between them, and see the whole home stacked in 3D.' },
  'multiFloor:clone': { title: 'Copy this floor up or down', blurb: 'Start the next storey from this one instead of drawing it again.' },
  'multiFloor:aiPlan': { title: 'Plan a home with more than one floor', blurb: 'With Pro, the AI plan lays out every storey. Your answers so far are saved.' },
  'pdfExport:pdf': { title: 'Export this plan as a PDF', blurb: 'A titled, print-ready PDF for builders, landlords and permits. PNG export stays free.' },
  'pdfExport:dxf': { title: 'Export this plan as DXF', blurb: 'Open your plan in CAD software. PNG export stays free.' },
  'catalog:item': { title: 'Place this piece', blurb: 'It\'s one of the premium 3D models. Pro unlocks every furniture piece and fixture in the catalog.' },
  'catalog:opening': { title: 'Use this door or window style', blurb: 'Pro unlocks every door and window style, in 2D and 3D.' },
  'catalog:appliance': { title: 'Swap in this appliance', blurb: 'Pro unlocks every appliance and fixture in the catalog.' },
  'catalog:uppers': { title: 'Add wall cabinets to this kitchen', blurb: 'Wall cabinets are part of the full Pro catalog.' },
  'catalog:corner': { title: 'Add the corner unit', blurb: 'Corner units are part of the full Pro catalog.' },
  'cleanExport:saved': { title: 'Save it without the watermark', blurb: 'With Pro, every render and photo you save or share has no watermark.' },
  'cleanExport:render': { title: 'AI renders without the watermark', blurb: 'With Pro, every render and photo you save or share has no watermark.' },
};

/** Headline and blurb for a wall: the trigger's copy when it has any, else the
 * feature's. Null when there is neither (a direct open from /buy). `shown`
 * says whether a string can be shown in the current language (English, or
 * translated): a locale without the trigger copy keeps its translated feature
 * copy rather than switching to an English headline. */
export function resolveUpsellCopy(feature: ProFeature | null, trigger: ProTrigger | null, shown: (en: string) => boolean = () => true) {
  const featureCopy = feature ? FEATURE_COPY[feature] : null;
  const candidate = trigger ? TRIGGER_COPY[trigger] : undefined;
  const triggerCopy = candidate && shown(candidate.title) && shown(candidate.blurb) ? candidate : undefined;
  if (!featureCopy) return null;
  return { icon: featureCopy.icon, title: triggerCopy?.title ?? featureCopy.title, blurb: triggerCopy?.blurb ?? featureCopy.blurb };
}

// Every line here is something the code actually gates on Pro — see the
// requirePro() call sites, and PhotoMode's capture scale for the photo one.
// `legacy` is the previous English wording: locales that have not translated the
// new label yet keep showing their translation of it, not an English line.
const CORE_BENEFITS: { icon: typeof Crown; label: string; legacy?: string; feature?: ProFeature }[] = [
  { icon: Layers, label: 'Unlimited projects and floors', legacy: 'Unlimited floors & projects', feature: 'projects' },
  { icon: Sofa, label: 'Every furniture piece, door and window style', legacy: 'Full furniture catalog', feature: 'catalog' },
  { icon: ImageIcon, label: 'Watermark-free renders & photos', feature: 'cleanExport' },
  { icon: Camera, label: 'Sharper, higher-resolution photos' },
  { icon: FileText, label: 'PDF & DXF plan export', feature: 'pdfExport' },
];

/** Subline for the wall opened with no feature (/buy, header chip, account
 * menu). Looked up through t() like TRIGGER_COPY, so locales without a
 * translation show English. */
const NO_FEATURE_SUBLINE = 'Everything free stays free. Pro adds the rest.';

/** Which "Everything in Pro" bullet a feature's wall is about. */
function benefitIsFor(b: { feature?: ProFeature; label: string }, feature: ProFeature | null) {
  if (!feature) return false;
  if (feature === 'multiFloor') return b.feature === 'projects';
  if (feature === 'voiceTour') return b.label === 'AI voice tours of your home';
  return b.feature === feature;
}

/** Feature-triggered Pro purchase sheet (Play Billing on Android, Stripe-backed
 * RevenueCat Web Billing on configured desktop builds). */
export default function ProUpsellModal() {
  const { upsellFeature, upsellTrigger, upsellOpen, closeUpsell, purchase, restore, busy, priceLabel, plans, isPro } = useProStore();
  const account = useAuthStore((s) => s.account);
  const authBusy = useAuthStore((s) => s.busy);
  const signIn = useAuthStore((s) => s.signIn);
  const t = useI18n();

  // Not `!!upsellFeature`: the sheet also opens straight from the /buy page
  // with no feature, and then shows the plain Pro pitch — the feature hero
  // below is already conditional on `copy`.
  const open = upsellOpen && !isPro;
  // Funnel event: the wall was shown. Reports the trigger key, else the feature, else "direct" (/buy, header chip).
  useEffect(() => {
    if (open) trackEvent('pro_wall_shown', upsellTrigger ?? upsellFeature ?? 'direct');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire on the open transition only
  }, [open]);
  // Escape, focus handling and presence now live in <Modal>. Because the modal
  // stays mounted while it animates out, `upsellFeature` may already be null —
  // keep the last one so the closing frame still renders its copy instead of
  // blanking or crashing on the lookup below.
  const lastFeature = useRef<ProFeature | null>(upsellFeature);
  if (upsellFeature) lastFeature.current = upsellFeature;
  const feature = upsellFeature ?? lastFeature.current;
  // Same for the trigger, but only while its feature is the one still showing.
  const lastTrigger = useRef<ProTrigger | null>(upsellTrigger);
  if (upsellFeature) lastTrigger.current = upsellTrigger;
  const trigger = upsellFeature ? upsellTrigger : lastTrigger.current;

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
  // "Best value" has to be true at the prices the store actually returns.
  // Lifetime wins once it costs no more than two years of Yearly — at the
  // current Play prices (€4.99 a year, €6.99 lifetime) it pays for itself in
  // well under two years, and a badge on Yearly would mislead.
  const bestValueID = useMemo(() => {
    const yearly = plans.find((plan) => plan.id === 'yearly');
    const lifetime = plans.find((plan) => plan.id === 'lifetime');
    if (
      yearly?.priceMicros && lifetime?.priceMicros && yearly.currency &&
      yearly.currency === lifetime.currency && lifetime.priceMicros <= yearly.priceMicros * 2
    ) {
      return 'lifetime';
    }
    return yearly ? 'yearly' : null;
  }, [plans]);
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
  const lang = useLang((s) => s.lang);
  const shown = (en: string) => lang === 'en' || t(en) !== en;
  const copy = resolveUpsellCopy(feature, trigger, shown);
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
  // Only claimed once the server has said it can record one for this account.
  const voiceTours = usePointsStore((s) => s.state?.available?.voice_tour === true);
  const benefitList: { icon: typeof Crown; label: string; legacy?: string; feature?: ProFeature }[] = [
    ...CORE_BENEFITS,
    ...(voiceTours ? [{ icon: Mic, label: 'AI voice tours of your home' }] : []),
  ];
  // The bullet that matches the wall the user hit goes first.
  const matched = benefitList.filter((b) => benefitIsFor(b, feature));
  const benefits = [
    ...matched,
    ...benefitList.filter((b) => !matched.includes(b)),
    webBilling || plans.length > 1
      ? { icon: CalendarCheck, label: 'Monthly, yearly or lifetime — your choice' }
      : { icon: BadgeCheck, label: 'One-time purchase — no subscription' },
  ];
  // The new label when this locale has it, else its translation of the old one.
  const benefitText = (b: { label: string; legacy?: string }) => {
    const translated = t(b.label);
    if (translated !== b.label || !b.legacy) return translated;
    const old = t(b.legacy);
    return old !== b.legacy ? old : b.label;
  };

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
              {shown(NO_FEATURE_SUBLINE) && <p>{t(NO_FEATURE_SUBLINE)}</p>}
            </>
          )}
        </div>
        <p className="pro-benefits-title">{t('Everything in Pro')}</p>
        <ul className="pro-benefits">
          {benefits.map((b) => {
            const BenefitIcon = b.icon;
            return (
              <li key={b.label}>
                <span className="pro-benefit-ico">
                  <BenefitIcon className="icon" />
                </span>
                <span>{benefitText(b)}</span>
              </li>
            );
          })}
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
                  className={`pro-plan${plan.id === bestValueID ? ' recommended' : ''}${selectedPlanID === plan.id ? ' selected' : ''}`}
                  onClick={() => setSelectedPlanID(plan.id)}
                  disabled={actionBusy}
                  aria-label={`${plan.label} Pro plan, ${plan.priceLabel}`}
                  aria-pressed={selectedPlanID === plan.id}
                >
                  {plan.id === bestValueID && <span className="pro-plan-badge">{t('Best value')}</span>}
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
                  : `${t('Subscription renews automatically until cancelled.')} ${t('Cancel anytime.')}`}
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
