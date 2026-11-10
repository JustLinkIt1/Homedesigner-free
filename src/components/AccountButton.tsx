import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { User, LogOut, Check, RefreshCw, WandSparkles, Crown, Sparkles, ChevronRight } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useI18n } from '../lib/i18n';
import { isModelStudioOwner, openModelStudio } from '../lib/modelStudioAccess';
import { useProStore } from '../store/proStore';
import { usePointsStore } from '../store/pointsStore';
import { aiJson, type PointsState } from '../lib/aiRender';

const AccountPointsDialog = lazy(() => import('./AccountPointsDialog'));

function GoogleMark() {
  return (
    <svg className="google-mark" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285f4" d="M21.8 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.5a4.7 4.7 0 0 1-2 3.1v2.6h3.3c1.9-1.8 3-4.4 3-7.6Z" />
      <path fill="#34a853" d="M12 22c2.7 0 5-.9 6.7-2.3l-3.3-2.6c-.9.6-2.1 1-3.4 1-2.6 0-4.8-1.8-5.6-4.2H3v2.7A10 10 0 0 0 12 22Z" />
      <path fill="#fbbc05" d="M6.4 14a6 6 0 0 1 0-3.9V7.4H3a10 10 0 0 0 0 9.1L6.4 14Z" />
      <path fill="#ea4335" d="M12 5.9c1.5 0 2.8.5 3.9 1.5l2.9-2.8A9.7 9.7 0 0 0 12 2a10 10 0 0 0-9 5.5l3.4 2.7C7.2 7.7 9.4 5.9 12 5.9Z" />
    </svg>
  );
}

/**
 * Account entry point for the home screen header: a user avatar that opens a
 * small popover. Signed out, it offers the branded Google sign-in (the same
 * `useAuthStore.signIn` the Settings panel uses); signed in, it shows the
 * profile and a sign-out action. Renders nothing when Google Sign-In isn't
 * configured in this build.
 */
export default function AccountButton({ onAiDesign }: { onAiDesign?: () => void }) {
  const account = useAuthStore((s) => s.account);
  const configured = useAuthStore((s) => s.configured);
  const busy = useAuthStore((s) => s.busy);
  const signIn = useAuthStore((s) => s.signIn);
  const signOut = useAuthStore((s) => s.signOut);
  const syncNow = useAuthStore((s) => s.syncNow);
  const ready = useAuthStore(s => s.ready);
  const isPro = useProStore(s => s.isPro);
  const proBusy = useProStore(s => s.busy);
  const balance = usePointsStore(s => s.subject === account?.subject ? s.balance : null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState(false);
  const pointsOpen = usePointsStore(s => s.walletOpen);
  const t = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [nudge, setNudge] = useState(0);

  useEffect(() => {
    if (!account?.subject || !ready) return;
    if (!open && usePointsStore.getState().balance !== null) return;
    let cancelled = false;
    setBalanceLoading(true); setBalanceError(false);
    void aiJson<PointsState>('/v1/points')
      .catch(() => { if (!cancelled) setBalanceError(true); })
      .finally(() => { if (!cancelled) setBalanceLoading(false); });
    return () => { cancelled = true; };
  }, [account?.subject, ready, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  /**
   * Keep the popover on screen.
   *
   * It hangs right-aligned under the avatar, which works only while the avatar
   * is near the right edge. It is not: the language picker sits beside it, so on
   * a phone the 264px menu started roughly 37px off the LEFT edge of the screen
   * and the sign-in button and its explanatory line were both cut in half.
   *
   * Measured rather than handled with a width breakpoint, because the overflow
   * depends on how far the language picker pushes the avatar inward, and that
   * width is the NAME OF THE CURRENT LANGUAGE — "System" and "Português
   * (Brasil)" do not leave the avatar in the same place. A fixed offset tuned on
   * an English phone would be wrong in half the locales we ship.
   */
  useLayoutEffect(() => {
    if (!open) {
      setNudge(0);
      return;
    }
    const GUTTER = 10;
    const clamp = () => {
      const menu = menuRef.current;
      const anchor = ref.current;
      if (!menu || !anchor) return;
      // Derived from the anchor and the menu's own width, never from the menu's
      // current position: reading a rect we have already nudged would make each
      // resize compound the last correction.
      const anchorRight = anchor.getBoundingClientRect().right;
      const overflowLeft = GUTTER - (anchorRight - menu.offsetWidth);
      // Shifting right must not push the other edge off instead — on a viewport
      // too narrow for the menu at all, staying put is the honest outcome.
      const headroom = window.innerWidth - GUTTER - anchorRight;
      setNudge(Math.round(Math.max(0, Math.min(overflowLeft, headroom))));
    };
    clamp();
    window.addEventListener('resize', clamp);
    window.addEventListener('orientationchange', clamp);
    return () => {
      window.removeEventListener('resize', clamp);
      window.removeEventListener('orientationchange', clamp);
    };
  }, [open]);

  if (!configured) return null;

  const initial = (account?.name || account?.email || '?').trim().charAt(0).toUpperCase();
  const canOpenModelStudio = isModelStudioOwner(account?.email);

  const handleOpenModelStudio = () => {
    setOpen(false);
    void openModelStudio();
  };

  return (
    <div className="account-wrap" ref={ref}>
      <button
        className={`account-btn ${account ? 'signed-in' : ''} ${account && isPro ? 'pro-member' : account && balance !== null && balance > 0 ? 'points-member' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={account ? t('Account') : t('Sign in')}
        data-tip={account ? (account.name || account.email || t('Account')) : t('Sign in')}
      >
        {account?.imageUrl ? (
          <img src={account.imageUrl} alt="" referrerPolicy="no-referrer" />
        ) : account ? (
          <span className="account-initial">{initial}</span>
        ) : (
          <User className="icon" />
        )}
      </button>
      {account && isPro && <span className="account-crown" title="HomeDesigner Pro"><Crown aria-hidden="true" /></span>}
      {account && !isPro && balance !== null && balance > 0 && <span className="account-crown account-points-badge" title={t('AI points')}><Sparkles aria-hidden="true" /></span>}

      {open && (
        <div
          className={`account-menu ${account && isPro ? 'pro-member-menu' : ''}`}
          role="menu"
          ref={menuRef}
          style={nudge ? { right: -nudge } : undefined}
        >
          {account ? (
            <>
              <div className="account-menu-head">
                {account.imageUrl ? (
                  <img src={account.imageUrl} alt="" referrerPolicy="no-referrer" />
                ) : (
                  <span className="account-initial lg">{initial}</span>
                )}
                <div className="account-menu-id">
                  <strong>{account.name || t('Google account')}</strong>
                  {account.email ? <span>{account.email}</span> : null}
                </div>
              </div>
              <div className={`account-membership ${isPro ? 'is-pro' : ''}`}>
                {isPro ? <Crown className="icon" /> : <User className="icon" />}
                <div><strong>{isPro ? 'HomeDesigner Pro' : proBusy || busy || !ready ? t('Checking Pro access…') : t('Free plan')}</strong>
                  <span>{isPro ? t('Thanks for supporting HomeDesigner.') : t('Unlock more with Pro')}</span></div>
                {!isPro && ready && !busy && !proBusy && <button className="account-upgrade" role="menuitem" onClick={() => { setOpen(false); useProStore.getState().openUpsell(); }}>Pro <ChevronRight className="icon" /></button>}
              </div>
              <button className="account-points-card" role="menuitem" onClick={() => { setOpen(false); usePointsStore.getState().openWallet(); }}>
                <span><Sparkles className="icon" /> {t('Your creative balance')}</span>
                <strong>{balanceLoading && balance === null ? '…' : balance === null ? '—' : balance.toLocaleString()}</strong>
                <span>{t('AI points')} <ChevronRight className="icon" /></span>
                {balanceError && <small>{t('Balance unavailable')} · {t('Try again')}</small>}
              </button>
              {onAiDesign && <button className="account-menu-item account-ai-action" role="menuitem" onClick={() => { setOpen(false); onAiDesign(); }}><WandSparkles className="icon" /> {t('AI design assistant')}</button>}
              <div className="account-menu-synced">
                <Check className="icon" /> {t('Plans and Pro access sync across your signed-in devices.')}
              </div>
              <button
                className="account-menu-item"
                role="menuitem"
                onClick={() => { setOpen(false); void syncNow(); }}
                disabled={busy}
              >
                <RefreshCw className={`icon ${busy ? 'spin' : ''}`} /> {t('Sync now')}
              </button>
              {canOpenModelStudio ? (
                <button className="account-menu-item" role="menuitem" onClick={handleOpenModelStudio}>
                  <WandSparkles className="icon" /> Model Studio
                </button>
              ) : null}
              <button
                className="account-menu-item"
                role="menuitem"
                onClick={() => { setOpen(false); void signOut(); }}
                disabled={busy}
              >
                <LogOut className="icon" /> {t('Sign out')}
              </button>
            </>
          ) : (
            <>
              <button
                className="btn google-signin account-menu-google"
                onClick={() => { setOpen(false); void signIn(); }}
                disabled={busy}
              >
                <GoogleMark />
                {busy ? t('Signing in…') : t('Sign in with Google')}
              </button>
              <small className="account-menu-note">
                {t('Sync plans and Pro access across your devices.')}
              </small>
            </>
          )}
        </div>
      )}
      {pointsOpen && account && <Suspense fallback={null}><AccountPointsDialog key={account.subject} onClose={() => usePointsStore.getState().closeWallet()} /></Suspense>}
    </div>
  );
}
