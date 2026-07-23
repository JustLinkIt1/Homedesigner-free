import { useEffect, useRef, useState } from 'react';
import { User, LogOut, Check } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useI18n } from '../lib/i18n';

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
export default function AccountButton() {
  const account = useAuthStore((s) => s.account);
  const configured = useAuthStore((s) => s.configured);
  const busy = useAuthStore((s) => s.busy);
  const signIn = useAuthStore((s) => s.signIn);
  const signOut = useAuthStore((s) => s.signOut);
  const t = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (!configured) return null;

  const initial = (account?.name || account?.email || '?').trim().charAt(0).toUpperCase();

  return (
    <div className="account-wrap" ref={ref}>
      <button
        className={`account-btn ${account ? 'signed-in' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={account ? t('Account') : t('Sign in')}
        title={account ? (account.name || account.email || t('Account')) : t('Sign in')}
      >
        {account?.imageUrl ? (
          <img src={account.imageUrl} alt="" referrerPolicy="no-referrer" />
        ) : account ? (
          <span className="account-initial">{initial}</span>
        ) : (
          <User className="icon" />
        )}
      </button>

      {open && (
        <div className="account-menu" role="menu">
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
              <div className="account-menu-synced">
                <Check className="icon" /> {t('Plans and Pro access sync across your signed-in Android devices.')}
              </div>
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
                {t('Sync plans and Pro access across your Android devices.')}
              </small>
            </>
          )}
        </div>
      )}
    </div>
  );
}
