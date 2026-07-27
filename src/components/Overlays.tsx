import { useCallback, useRef } from 'react';
import { AnimatePresence, m } from 'framer-motion';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { useToasts, useConfirm, type ToastKind } from '../lib/ui';
import { useI18n } from '../lib/i18n';
import Modal from './Modal';

const ICON: Record<ToastKind, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  error: AlertCircle,
};

export function Toaster() {
  const { toasts, dismiss, pause, resume } = useToasts();
  return (
    <div className="toaster" aria-live="polite">
      {/*
        `dismiss` splices the toast out of the store, so before this the toast
        vanished in a single frame and every toast above it jumped down by its
        height plus the gap. `AnimatePresence` keeps it mounted long enough to
        slide out, and `layout` makes the survivors glide into their new
        positions instead of snapping. The enter keeps the spring the CSS
        `toast-in` keyframe used to provide (now removed so the two don't fight).
      */}
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const Icon = ICON[t.kind];
          return (
            <m.div
              key={t.id}
              layout
              className={`toast ${t.kind}`}
              role="status"
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.16 } }}
              transition={{ type: 'spring', stiffness: 520, damping: 34, mass: 0.7 }}
              onMouseEnter={() => pause(t.id)}
              onMouseLeave={() => resume(t.id)}
              onTouchStart={() => pause(t.id)}
              onTouchEnd={() => resume(t.id)}
            >
              <Icon className="icon" />
              <span>{t.message}</span>
              {t.action && (
                <button
                  className="toast-action"
                  onClick={() => {
                    t.action?.onClick();
                    dismiss(t.id);
                  }}
                >
                  {t.action.label}
                </button>
              )}
              <button aria-label="Dismiss" onClick={() => dismiss(t.id)}>
                <X className="icon" style={{ width: 15, height: 15 }} />
              </button>
            </m.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

export function ConfirmHost() {
  const { req, answer } = useConfirm();
  const t = useI18n();
  // The request clears as soon as it is answered, so hold on to the last one to
  // render through the exit animation instead of blanking mid-fade.
  const shown = useRef(req);
  if (req) shown.current = req;
  const body = shown.current;
  const dismiss = useCallback(() => answer(false), [answer]);
  return (
    // `.confirm` stays on the panel itself, so every `.confirm h3 / p /
    // .confirm-foot` rule keeps matching; only the surface properties it used
    // to duplicate are dropped from the stylesheet, since `.modal` supplies
    // them now.
    <Modal open={!!req} onClose={dismiss} className="confirm" role="alertdialog" labelledBy="confirm-title">
      <>
        <h3 id="confirm-title">{body?.title}</h3>
        <p>{body?.message}</p>
        <div className="confirm-foot">
          <button className="btn" onClick={dismiss}>
            {t('Cancel')}
          </button>
          <button
            className={`btn ${body?.danger ? 'danger-solid' : 'primary'}`}
            onClick={() => answer(true)}
          >
            {body?.confirmLabel}
          </button>
        </div>
      </>
    </Modal>
  );
}
