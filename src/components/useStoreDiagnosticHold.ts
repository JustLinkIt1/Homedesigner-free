import { useRef, useState } from 'react';
import { collectStoreDiagnostics } from '../lib/pro';
import { toast } from '../lib/ui';

/** How long the version has to be held. Comfortably past Android's own
 *  long-press so an ordinary tap or a scroll that starts on the text cannot
 *  trigger it. */
const HOLD_MS = 1200;

/**
 * Long-press the app version to copy a store diagnostic to the clipboard.
 *
 * Shared rather than written per dialog because the version is rendered in two
 * places, and only About had this — while Settings is where users actually
 * look. The owner hit exactly that: "In about? There's settings but I don't see
 * about." About opens from ONE place, the editor's More menu, so the diagnostic
 * was unreachable for anyone who had not already found that menu.
 *
 * Support-only, so it is not advertised — but deliberately SAFE TO FIND. See
 * `collectStoreDiagnostics`: it reports store configuration and no identity, no
 * tokens and no account data. Obscurity is not the protection; the contents are.
 */
export function useStoreDiagnosticHold() {
  const [busy, setBusy] = useState(false);
  const held = useRef<number | null>(null);

  const cancelHold = () => {
    if (held.current !== null) window.clearTimeout(held.current);
    held.current = null;
  };

  const startHold = () => {
    cancelHold();
    held.current = window.setTimeout(() => {
      held.current = null;
      if (busy) return;
      setBusy(true);
      void collectStoreDiagnostics()
        .then(async (report) => {
          await navigator.clipboard.writeText(report);
          toast.success('Store diagnostics copied — paste them to support.');
        })
        .catch(() => toast.error("Couldn't copy diagnostics."))
        .finally(() => setBusy(false));
    }, HOLD_MS);
  };

  /** Spread onto the element showing the version. Not a control: no role and no
   *  tab stop, so there is nothing for a screen reader to announce. */
  const holdProps = {
    onPointerDown: startHold,
    onPointerUp: cancelHold,
    onPointerLeave: cancelHold,
    onPointerCancel: cancelHold,
  };

  return { busy, holdProps };
}
