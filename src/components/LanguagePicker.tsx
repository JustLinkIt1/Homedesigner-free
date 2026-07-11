import { useEffect, useRef, useState } from 'react';
import { Globe, Check, ChevronDown } from 'lucide-react';
import { useLang, useI18n, LANG_OPTIONS } from '../lib/i18n';

/**
 * Language dropdown shared by the projects screen and Settings. Reads the full
 * language list from the locale registry (src/locales/index.ts), so it grows
 * automatically as locales are added. `align` flips the menu's anchor edge.
 */
export default function LanguagePicker({
  align = 'left',
  className = '',
}: {
  align?: 'left' | 'right';
  className?: string;
}) {
  const pref = useLang((s) => s.pref);
  const setPref = useLang((s) => s.setPref);
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

  const current = LANG_OPTIONS.find((o) => o.id === pref) ?? LANG_OPTIONS[0];
  const currentLabel = current.id === 'system' ? t('System') : current.label;

  return (
    <div className={`export-wrap lang-picker ${className}`} ref={ref}>
      <button
        className="lang-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('Language')}
        onClick={() => setOpen((o) => !o)}
      >
        <Globe className="icon" />
        <span className="lang-current">{currentLabel}</span>
        <ChevronDown className="icon caret" />
      </button>
      {open && (
        <div className={`export-menu lang-menu ${align === 'right' ? 'lang-menu-right' : ''}`} role="menu">
          {LANG_OPTIONS.map((o) => (
            <button
              key={o.id}
              role="menuitemradio"
              aria-checked={pref === o.id}
              className={pref === o.id ? 'active' : ''}
              onClick={() => {
                setPref(o.id);
                setOpen(false);
              }}
            >
              <span className="lang-label">{o.id === 'system' ? t('System') : o.label}</span>
              {pref === o.id && <Check className="icon lang-check" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
