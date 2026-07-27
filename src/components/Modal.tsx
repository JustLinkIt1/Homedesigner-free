import { useEffect, useId, useRef, type ReactNode } from 'react';
import { AnimatePresence, m } from 'framer-motion';

/**
 * The shared dialog shell.
 *
 * Every dialog in the app used to hand-roll this markup — seven copies of the
 * same backdrop/panel pair — and none of them animated, closed on Escape, or
 * announced themselves to a screen reader. This centralises all of that.
 *
 * It deliberately keeps the existing `.modal-backdrop` / `.modal <variant>`
 * class contract, so the stylesheet and the Playwright selectors that target
 * `.modal` keep working untouched.
 *
 * `AnimatePresence` lives *inside* the component and the caller passes `open`,
 * rather than the caller doing `{open && <Dialog/>}`. That is what lets the exit
 * animation play at all — and it means the Android hardware back-button handler
 * in App.tsx keeps working unchanged, because it just flips the same state.
 */

/**
 * One duration/curve on the `transition` prop of BOTH elements — matching
 * `--dur`/`--ease` in index.css so dialogs move like everything else.
 *
 * Measured, not assumed: putting the timing inside the `animate`/`exit` variants
 * instead left the nested panel on framer's default spring, and the dialog stayed
 * in the DOM for ~800ms after closing — long enough that the Playwright suite
 * clicked into a backdrop that should have been gone. Mixing an element-level
 * `transition` with variant-level ones was worse still: the exit never completed
 * at all. The plain form below removes the backdrop in ~200ms.
 */
const PANEL = { duration: 0.17, ease: [0.2, 0.8, 0.2, 1] as const };

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Modal({
  open,
  onClose,
  className = '',
  role = 'dialog',
  labelledBy,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** Variant class appended to `.modal`, e.g. "settings" or "about". */
  className?: string;
  role?: 'dialog' | 'alertdialog';
  /** Id of the element naming this dialog; falls back to an auto id. */
  labelledBy?: string;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Whatever had focus when the dialog opened, so it can be handed back.
  const restoreRef = useRef<HTMLElement | null>(null);
  const autoId = useId();

  // Callers pass an inline arrow (`onClose={() => setShowX(false)}`), so
  // `onClose` has a new identity on every render of the parent. Depending on it
  // directly made the effect below tear down and re-attach on every render —
  // which detached the Escape listener often enough that key presses landed in
  // the gap, and re-ran the focus restore on each pass, yanking focus out of the
  // dialog and back again. Hold it in a ref and bind the effect to `open` alone.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;

    // Move focus into the dialog. Prefer the first control so keyboard users
    // land somewhere useful; fall back to the panel itself.
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      // Keep Tab inside the dialog — otherwise focus walks the editor behind it.
      if (e.key !== 'Tab' || !panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null,
      );
      if (!items.length) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      } else if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      }
    };
    window.addEventListener('keydown', onKey);

    // Stop the page behind the dialog from scrolling under it.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      // Only steal focus back if it is still inside the (closing) dialog —
      // otherwise we would yank it away from wherever the user moved on to.
      const active = document.activeElement;
      if (!active || active === document.body || panel?.contains(active)) {
        restoreRef.current?.focus?.({ preventScroll: true });
      }
    };
  }, [open]);

  const titleId = labelledBy ?? `${autoId}-title`;

  return (
    <AnimatePresence>
      {open && (
        <m.div
          key="backdrop"
          className="modal-backdrop"
          onMouseDown={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={PANEL}
        >
          <m.div
            ref={panelRef}
            className={`modal ${className}`.trim()}
            role={role}
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            onMouseDown={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 4 }}
            transition={PANEL}
          >
            {children}
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
